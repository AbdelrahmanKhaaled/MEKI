import { ConflictException, Inject, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { ActorContext } from '../../common/types/auth-request';
import { Paginated, parseSort } from '../../common/utils';
import { sanitizeError } from './gala-support';
import { canTransitionTicket, generateQrToken, hashQrToken } from './gala.rules';
import type { TicketQueryDto } from './gala.dto';
import { newTicketPdfKey, PRIVATE_STORAGE, type PrivateStoragePort } from './ticket-storage';
import { TicketPdfService } from './ticket-pdf.service';

type Tx = Prisma.TransactionClient;

export interface IssuedTicket {
  ticketId: string;
  token: string;
}

const adminTicketSelect = {
  id: true,
  ticketNumber: true,
  status: true,
  issuedAt: true,
  checkedInAt: true,
  checkedInById: true,
  revokedAt: true,
  revokeReason: true,
  pdfGeneratedAt: true,
  tokenVersion: true,
  createdAt: true,
  eventId: true,
  guest: { select: { id: true, fullName: true, email: true, phone: true, dietaryRequirements: true } },
  booking: { select: { id: true, publicReference: true, bookingStatus: true, paymentStatus: true } },
} satisfies Prisma.EventTicketSelect;

/**
 * Ticket lifecycle: PENDING → ISSUED (only inside the verified-payment transaction) → CHECKED_IN | REVOKED | REFUNDED.
 * The QR token exists only in memory at issue time and inside the PDF; the database keeps its SHA-256.
 */
@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly pdf: TicketPdfService,
    @Inject(PRIVATE_STORAGE) private readonly storage: PrivateStoragePort,
  ) {}

  /**
   * Issues one ticket per PENDING guest ticket of a booking. MUST be called only from the payment-confirmation
   * transaction. Idempotent: tickets that are not PENDING are left untouched, so a repeated call issues nothing new.
   */
  async issueInTx(tx: Tx, bookingId: string, at: Date): Promise<IssuedTicket[]> {
    const pending = await tx.eventTicket.findMany({ where: { bookingId, status: 'PENDING' }, select: { id: true } });
    const issued: IssuedTicket[] = [];
    for (const t of pending) {
      const token = generateQrToken();
      const moved = await tx.eventTicket.updateMany({
        where: { id: t.id, status: 'PENDING' },
        data: { status: 'ISSUED', issuedAt: at, qrTokenHash: hashQrToken(token) },
      });
      if (moved.count === 1) issued.push({ ticketId: t.id, token });
    }
    return issued;
  }

  private async loadForPdf(ticketId: string) {
    return this.prisma.eventTicket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { guest: true, booking: true, event: { include: { ticketConfig: true } } },
    });
  }

  /** Renders + stores the PDF for a ticket whose token is known. Returns false on failure (never throws). */
  async storePdf(ticketId: string, token: string, expectedHash: string): Promise<boolean> {
    try {
      const t = await this.loadForPdf(ticketId);
      const cfg = t.event.ticketConfig;
      if (!cfg) throw new Error('ticket config missing');
      const buf = await this.pdf.render({
        ticketNumber: t.ticketNumber,
        guestName: t.guest.fullName,
        bookingReference: t.booking.publicReference,
        eventName: cfg.displayNameEn,
        eventDateLabel: cfg.eventDateLabelEn,
        venueLabel: cfg.venueLabelEn,
        checkInNote: cfg.checkInNoteEn,
        qrToken: token,
      });
      const key = newTicketPdfKey(t.eventId, t.id);
      await this.storage.put(key, buf);
      const done = await this.prisma.eventTicket.updateMany({
        where: { id: t.id, qrTokenHash: expectedHash, status: { in: ['ISSUED', 'CHECKED_IN'] } },
        data: { pdfStorageKey: key, pdfGeneratedAt: new Date(), pdfSha256: createHash('sha256').update(buf).digest('hex') },
      });
      if (done.count !== 1) {
        await this.storage.remove(key); // ticket changed meanwhile (revoked/re-issued)
        return false;
      }
      if (t.pdfStorageKey) await this.storage.remove(t.pdfStorageKey);
      return true;
    } catch (e) {
      this.logger.error(`ticket pdf generation failed ticket=${ticketId}: ${sanitizeError((e as Error).message)}`);
      return false;
    }
  }

  /**
   * Rotates the QR token and regenerates the PDF (lost PDF, changed guest name, failed generation). The previous
   * token stops validating the moment the new hash is written. Only ISSUED tickets can be re-issued.
   */
  async reissue(ticketId: string, actor: ActorContext | null, reason: string, eventId?: string) {
    const t = await this.prisma.eventTicket.findFirst({ where: { id: ticketId, ...(eventId ? { eventId } : {}) } });
    if (!t) throw new NotFoundException('Ticket not found');
    if (t.status !== 'ISSUED') throw new UnprocessableEntityException({ message: `A ${t.status} ticket cannot be re-issued`, code: 'TICKET_NOT_REISSUABLE' });
    const token = generateQrToken();
    const newHash = hashQrToken(token);
    // Write the new hash first (atomic guard on the old state), then render; on render failure the ticket simply has no PDF
    // and can be re-issued again — the old token is already dead, which is the safe failure direction.
    const rotated = await this.prisma.eventTicket.updateMany({
      where: { id: t.id, status: 'ISSUED', qrTokenHash: t.qrTokenHash },
      data: { qrTokenHash: newHash, tokenVersion: { increment: 1 }, pdfGeneratedAt: null },
    });
    if (rotated.count !== 1) throw new ConflictException({ message: 'Ticket changed concurrently', code: 'TICKET_CONFLICT' });
    const ok = await this.storePdf(t.id, token, newHash);
    await this.audit.record(actor, 'gala.ticket.reissue', 'EventTicket', t.id, { reason, pdfGenerated: ok, tokenVersion: t.tokenVersion + 1 });
    return { ticketNumber: t.ticketNumber, pdfGenerated: ok };
  }

  /** Re-issues every ISSUED ticket of a booking that has no PDF (failed generation after payment). */
  async regenerateMissing(bookingId: string, actor: ActorContext | null) {
    const missing = await this.prisma.eventTicket.findMany({ where: { bookingId, status: 'ISSUED', pdfStorageKey: null }, select: { id: true } });
    const results = [];
    for (const m of missing) results.push(await this.reissue(m.id, actor, 'regenerate-missing-pdf'));
    return { regenerated: results.filter((r) => r.pdfGenerated).length, failed: results.filter((r) => !r.pdfGenerated).length };
  }

  // ───────── admin ─────────

  async revoke(eventId: string, ticketId: string, reason: string, actor: ActorContext) {
    const t = await this.prisma.eventTicket.findFirst({ where: { id: ticketId, eventId } });
    if (!t) throw new NotFoundException('Ticket not found');
    if (t.status === 'CHECKED_IN') throw new UnprocessableEntityException({ message: 'A checked-in ticket cannot be revoked; undo the check-in first', code: 'TICKET_CHECKED_IN' });
    if (!canTransitionTicket(t.status, 'REVOKED')) throw new ConflictException({ message: `Ticket is already ${t.status}`, code: 'TICKET_NOT_REVOCABLE' });
    const moved = await this.prisma.eventTicket.updateMany({
      where: { id: t.id, status: t.status },
      data: { status: 'REVOKED', revokedAt: new Date(), revokedById: actor.userId, revokeReason: reason },
    });
    if (moved.count !== 1) throw new ConflictException({ message: 'Ticket changed concurrently', code: 'TICKET_CONFLICT' });
    await this.audit.record(actor, 'gala.ticket.revoke', 'EventTicket', t.id, { from: t.status, reason });
    return this.get(eventId, t.id);
  }

  async list(eventId: string, q: TicketQueryDto) {
    const where: Prisma.EventTicketWhereInput = {
      eventId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? { OR: [{ ticketNumber: { contains: q.search } }, { booking: { publicReference: { contains: q.search } } }, { guest: { fullName: { contains: q.search } } }, { guest: { email: { contains: q.search } } }] }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.eventTicket.findMany({
        where,
        select: adminTicketSelect,
        orderBy: parseSort(q.sort, ['createdAt', 'ticketNumber', 'status', 'issuedAt', 'checkedInAt'], { createdAt: 'desc' }),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.eventTicket.count({ where }),
    ]);
    return Paginated.of(items.map((t) => this.view(t)), total, q.page, q.pageSize);
  }

  async get(eventId: string, ticketId: string) {
    const t = await this.prisma.eventTicket.findFirst({ where: { id: ticketId, eventId }, select: adminTicketSelect });
    if (!t) throw new NotFoundException('Ticket not found');
    return this.view(t);
  }

  private view<T extends { pdfGeneratedAt: Date | null }>(t: T) {
    const { pdfGeneratedAt, ...rest } = t;
    return { ...rest, hasPdf: pdfGeneratedAt !== null };
  }

  /** PDF bytes for an already-authorised caller (admin ticket scope or purchaser token). Storage keys never leave the service. */
  async pdfFor(where: Prisma.EventTicketWhereInput) {
    const t = await this.prisma.eventTicket.findFirst({ where, select: { id: true, ticketNumber: true, status: true, pdfStorageKey: true, booking: { select: { bookingStatus: true, paymentStatus: true } } } });
    if (!t) throw new NotFoundException('Ticket not found');
    if (!t.pdfStorageKey) throw new NotFoundException({ message: 'The ticket PDF is not available', code: 'TICKET_PDF_UNAVAILABLE' });
    const body = await this.storage.get(t.pdfStorageKey);
    if (!body) throw new NotFoundException({ message: 'The ticket PDF is not available', code: 'TICKET_PDF_UNAVAILABLE' });
    return { ticketId: t.id, ticketNumber: t.ticketNumber, status: t.status, body };
  }
}
