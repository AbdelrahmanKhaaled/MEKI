import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { EventBookingJob } from '../../generated/prisma/client';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { ActorContext } from '../../common/types/auth-request';
import { AuditService } from '../audit/audit.service';
import { GalaEmailComposer } from './gala-email.composer';
import type { MailTemplate } from './gala-email.templates';
import { GALA_NOTIFIER, sanitizeError, type GalaNotificationInput, type GalaNotifier } from './gala-support';

export { sanitizeError };
import { hashQrToken } from './gala.rules';
import { MAIL_TRANSPORT, MailNotConfiguredError, type MailTransport } from './mail-transport';
import { TicketsService, type IssuedTicket } from './tickets.service';

type Tx = Prisma.TransactionClient;

export interface JobSpec {
  type: 'TICKET_PDF' | 'EMAIL';
  template?: MailTemplate;
  ticketId?: string;
  dedupeKey: string;
}

const LEASE_MS = 2 * 60_000;
const PDF_KEY = (ticketId: string) => `pdf:${ticketId}`;
export const emailKey = (template: string, bookingId: string, ticketId?: string) => `email:${template}:${bookingId}:${ticketId ?? ''}`;

class PermanentJobError extends Error {}
class DeferJob extends Error {}

/**
 * Transactional-outbox runner for ticket bookings. Jobs are created inside the payment-confirmation transaction; this
 * service executes them AFTER commit (fast path with the in-memory QR tokens) and retries failures with exponential back-off.
 *
 *  - A failing PDF render, storage outage or e-mail provider never touches booking/payment/ticket state.
 *  - Each job is claimed with a conditional UPDATE and a lease, so concurrent runners/instances never double-send.
 *  - It is also the GalaNotifier: notify() enqueues an e-mail job (idempotent per template/booking/ticket).
 * Not a distributed queue: it polls the database (GALA_JOBS_INTERVAL_SECONDS) which is enough for the expected volume.
 */
@Injectable()
export class GalaJobsService implements GalaNotifier, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GalaJobsService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly tickets: TicketsService,
    private readonly composer: GalaEmailComposer,
    private readonly audit: AuditService,
    @Inject(MAIL_TRANSPORT) private readonly mail: MailTransport,
  ) {}

  onModuleInit() {
    const every = this.config.get('GALA_JOBS_INTERVAL_SECONDS');
    if (every > 0) {
      this.timer = setInterval(() => void this.runDue().catch((e) => this.logger.error(`job poll failed: ${sanitizeError((e as Error).message)}`)), every * 1000);
      this.timer.unref();
    }
    if (!this.mail.delivers) this.logger.warn('No e-mail provider configured: booking e-mails are parked (SKIPPED), nothing is sent');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ───────── enqueue ─────────

  /** Idempotent (UNIQUE dedupeKey): safe to call from a webhook that may be delivered twice. */
  async enqueueInTx(tx: Tx, bookingId: string, specs: JobSpec[]) {
    if (!specs.length) return;
    await tx.eventBookingJob.createMany({
      data: specs.map((s) => ({ bookingId, type: s.type, template: s.template ?? null, ticketId: s.ticketId ?? null, dedupeKey: s.dedupeKey })),
      skipDuplicates: true,
    });
  }

  /** GalaNotifier: enqueue an e-mail and try to deliver it right away (failures stay retryable). */
  async notify(input: GalaNotificationInput) {
    await this.enqueueInTx(this.prisma, input.bookingId, [{ type: 'EMAIL', template: input.type, ticketId: input.ticketId, dedupeKey: emailKey(input.type, input.bookingId, input.ticketId) }]);
    await this.runDue({ bookingId: input.bookingId });
  }

  // ───────── fast path after commit ─────────

  /**
   * After the payment transaction commits: render the PDFs with the tokens that only exist in memory right now, then run the
   * booking's due jobs (e-mails). Whatever fails here is simply left for the retry loop.
   */
  async processBooking(bookingId: string, issued: IssuedTicket[]) {
    for (const i of issued) {
      const ok = await this.tickets.storePdf(i.ticketId, i.token, hashQrToken(i.token));
      if (ok) {
        await this.prisma.eventBookingJob.updateMany({ where: { dedupeKey: PDF_KEY(i.ticketId), status: 'PENDING' }, data: { status: 'DONE', attempts: 1, completedAt: new Date(), lastError: null } });
      } else {
        await this.prisma.eventBookingJob.updateMany({
          where: { dedupeKey: PDF_KEY(i.ticketId), status: 'PENDING' },
          data: { attempts: 1, lastError: 'PDF_GENERATION_FAILED', nextRunAt: new Date(Date.now() + 30_000) },
        });
      }
    }
    return this.runDue({ bookingId });
  }

  // ───────── runner ─────────

  async runDue(opts: { bookingId?: string; limit?: number } = {}) {
    const now = new Date();
    const due = await this.prisma.eventBookingJob.findMany({
      where: {
        ...(opts.bookingId ? { bookingId: opts.bookingId } : {}),
        OR: [{ status: 'PENDING', nextRunAt: { lte: now } }, { status: 'RUNNING', lockedUntil: { lt: now } }],
      },
      orderBy: [{ nextRunAt: 'asc' }, { createdAt: 'asc' }],
      take: opts.limit ?? 25,
    });
    const result = { claimed: 0, done: 0, retried: 0, failed: 0, skipped: 0 };
    // Photo-finish ordering: PDFs first so e-mails in the same batch can attach them.
    due.sort((a, b) => (a.type === b.type ? 0 : a.type === 'TICKET_PDF' ? -1 : 1));
    for (const job of due) {
      if (job.type === 'EMAIL' && !this.mail.delivers) {
        const parked = await this.prisma.eventBookingJob.updateMany({ where: { id: job.id, status: job.status }, data: { status: 'SKIPPED', lastError: 'NO_MAIL_TRANSPORT' } });
        result.skipped += parked.count;
        continue;
      }
      const claimed = await this.prisma.eventBookingJob.updateMany({
        where: { id: job.id, status: job.status, attempts: job.attempts },
        data: { status: 'RUNNING', attempts: { increment: 1 }, lockedUntil: new Date(Date.now() + LEASE_MS) },
      });
      if (claimed.count !== 1) continue; // another runner took it
      result.claimed++;
      const outcome = await this.execute({ ...job, attempts: job.attempts + 1 });
      result[outcome]++;
    }
    return result;
  }

  private async execute(job: EventBookingJob): Promise<'done' | 'retried' | 'failed' | 'skipped'> {
    try {
      const note = job.type === 'TICKET_PDF' ? await this.runPdf(job) : await this.runEmail(job);
      await this.prisma.eventBookingJob.update({ where: { id: job.id }, data: { status: 'DONE', completedAt: new Date(), lockedUntil: null, lastError: note ?? null } });
      this.logger.log(`job ${job.type}${job.template ? `:${job.template}` : ''} done${note ? ` (${note})` : ''}`);
      return 'done';
    } catch (e) {
      const message = sanitizeError((e as Error).message);
      if (e instanceof MailNotConfiguredError) {
        await this.prisma.eventBookingJob.update({ where: { id: job.id }, data: { status: 'SKIPPED', lockedUntil: null, attempts: job.attempts - 1, lastError: 'NO_MAIL_TRANSPORT' } });
        return 'skipped';
      }
      if (e instanceof DeferJob) {
        await this.prisma.eventBookingJob.update({ where: { id: job.id }, data: { status: 'PENDING', lockedUntil: null, attempts: job.attempts - 1, nextRunAt: new Date(Date.now() + 30_000), lastError: message } });
        return 'retried';
      }
      const dead = e instanceof PermanentJobError || job.attempts >= this.config.get('GALA_JOB_MAX_ATTEMPTS');
      const backoffMs = Math.min(2 ** job.attempts * 30_000, 3_600_000);
      await this.prisma.eventBookingJob.update({
        where: { id: job.id },
        data: dead ? { status: 'FAILED', lockedUntil: null, lastError: message } : { status: 'PENDING', lockedUntil: null, nextRunAt: new Date(Date.now() + backoffMs), lastError: message },
      });
      this.logger.warn(`job ${job.type}${job.template ? `:${job.template}` : ''} ${dead ? 'FAILED' : 'will retry'} (attempt ${job.attempts}): ${message}`);
      return dead ? 'failed' : 'retried';
    }
  }

  /** Regenerates a missing ticket PDF (rotates the QR: the lost token was never delivered). */
  private async runPdf(job: EventBookingJob): Promise<string | undefined> {
    const t = await this.prisma.eventTicket.findUnique({ where: { id: job.ticketId! }, select: { status: true, pdfStorageKey: true } });
    if (!t) throw new PermanentJobError('ticket not found');
    if (t.status !== 'ISSUED' && t.status !== 'CHECKED_IN') return 'NOT_APPLICABLE';
    if (t.pdfStorageKey) return 'ALREADY_GENERATED';
    const r = await this.tickets.reissue(job.ticketId!, null, 'job-retry-missing-pdf');
    if (!r.pdfGenerated) throw new Error('PDF_GENERATION_FAILED');
    return undefined;
  }

  private async runEmail(job: EventBookingJob): Promise<string | undefined> {
    const booking = await this.prisma.eventBooking.findUnique({ where: { id: job.bookingId }, select: { publicReference: true } });
    if (!booking) throw new PermanentJobError('booking not found');
    const input: GalaNotificationInput = { type: job.template as MailTemplate, bookingId: job.bookingId, bookingReference: booking.publicReference, ticketId: job.ticketId ?? undefined };

    if (job.template === 'ticket.delivery' && job.ticketId) {
      const t = await this.prisma.eventTicket.findUnique({ where: { id: job.ticketId }, select: { status: true, pdfStorageKey: true } });
      if (t?.status === 'ISSUED' && !t.pdfStorageKey) {
        const pdfJob = await this.prisma.eventBookingJob.findUnique({ where: { dedupeKey: PDF_KEY(job.ticketId) }, select: { status: true } });
        if (pdfJob?.status === 'FAILED') throw new PermanentJobError('ticket PDF could not be generated');
        throw new DeferJob('PDF_NOT_READY'); // wait for the PDF job without burning an attempt
      }
    }
    const composed = await this.composer.compose(input);
    if (!composed) {
      if (job.template === 'ticket.delivery' && job.ticketId) {
        const t = await this.prisma.eventTicket.findUnique({ where: { id: job.ticketId }, select: { status: true, pdfStorageKey: true } });
        if (t?.status === 'ISSUED' && t.pdfStorageKey) throw new Error('PDF_FILE_MISSING'); // key present but file unreadable
      }
      return 'NOT_APPLICABLE'; // e.g. booking refunded/cancelled meanwhile: never send a stale "confirmed" message
    }
    await this.mail.send(composed);
    return undefined;
  }

  // ───────── admin ─────────

  async jobsFor(bookingId: string) {
    const jobs = await this.prisma.eventBookingJob.findMany({ where: { bookingId }, orderBy: { createdAt: 'asc' } });
    return jobs.map((j) => ({ id: j.id, type: j.type, template: j.template, status: j.status, attempts: j.attempts, nextRunAt: j.nextRunAt, lastError: j.lastError, completedAt: j.completedAt }));
  }

  /** Re-queues FAILED/SKIPPED (or missing) jobs of a confirmed booking: tickets' PDFs and confirmation/ticket e-mails. */
  async requeue(bookingId: string, actor: ActorContext) {
    const b = await this.prisma.eventBooking.findUniqueOrThrow({ where: { id: bookingId }, include: { tickets: true } });
    const specs: JobSpec[] = [];
    if (b.bookingStatus === 'CONFIRMED' && b.paymentStatus === 'PAID') {
      specs.push({ type: 'EMAIL', template: 'booking.confirmed', dedupeKey: emailKey('booking.confirmed', b.id) });
      for (const t of b.tickets.filter((x) => x.status === 'ISSUED')) {
        specs.push({ type: 'TICKET_PDF', ticketId: t.id, dedupeKey: PDF_KEY(t.id) });
        specs.push({ type: 'EMAIL', template: 'ticket.delivery', ticketId: t.id, dedupeKey: emailKey('ticket.delivery', b.id, t.id) });
      }
    }
    await this.enqueueInTx(this.prisma, b.id, specs);
    const reset = await this.prisma.eventBookingJob.updateMany({
      where: { bookingId: b.id, status: { in: ['FAILED', 'SKIPPED'] } },
      data: { status: 'PENDING', attempts: 0, nextRunAt: new Date(), lockedUntil: null, lastError: null },
    });
    await this.audit.record(actor, 'gala.booking.requeue_jobs', 'EventBooking', b.id, { requeued: reset.count });
    const run = await this.runDue({ bookingId: b.id });
    return { requeued: reset.count, ...run };
  }
}

export const GALA_NOTIFIER_PROVIDER = { provide: GALA_NOTIFIER, useExisting: GalaJobsService };
