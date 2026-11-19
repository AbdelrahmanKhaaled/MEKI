import { BadRequestException, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { Prisma } from '../../generated/prisma/client';
import type { PaymentWebhookEvent, ProviderPayment } from '../../generated/prisma/client';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { ActorContext } from '../../common/types/auth-request';
import { Paginated } from '../../common/utils';
import { D } from '../donations/money';
import type { NormalizedWebhookEvent } from '../donations/payments/payment-provider';
import { BookingPaymentsService } from '../gala/booking-payments.service';
import { generateBookingAttemptReference } from '../gala/gala.rules';
import { ZeffyApiError, ZeffyClient } from './zeffy.client';
import { classify, decideGala, findReferences, refundedCents, type Decision } from './zeffy-correlation';
import { splitSecrets, verifyZeffySignature } from './zeffy-signature';
import { centsToDecimal, decimalToCents, parseZeffyPayment, ZeffyResponseError, type ZeffyPayment } from './zeffy.types';

export const ZEFFY = 'zeffy';
const MAX_BODY = 256 * 1024;
const PAYMENT_EVENTS = ['payment.completed', 'payment.created', 'payment.updated', 'payment.deleted'] as const;

/** Webhook payload as stored: no buyer name / e-mail / address / free-text answers — only the references found in them. */
type StoredEvent = { source: 'zeffy-webhook' | 'zeffy-api'; type: string; version: number | null; dispatchedAt: string | null; paymentId: string | null; payment: (Omit<ZeffyPayment, 'buyer_answers' | 'items'> & { items: Omit<ZeffyPayment['items'][number], 'answers'>[]; refs: string[] }) | null };

class ReviewRequired extends Error {}

/**
 * Phase 8A Zeffy integration (SDI's account). Read-only towards Zeffy; writes to MEKI only through:
 *  - PaymentWebhookEvent (durable, unique per Zeffy event id) — the existing webhook event store,
 *  - ProviderPayment (read model + review queue),
 *  - the ESTABLISHED Gala confirmation/refund pipeline (BookingPaymentsService), only when ZEFFY_GALA_AUTO_CONFIRM is on and
 *    every correlation rule holds. Donations are matched for visibility only (application is Phase 8B, pending SDI).
 */
@Injectable()
export class ZeffyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ZeffyService.name);
  private timer: NodeJS.Timeout | null = null;
  private reconciling = false;
  private health: { state: 'ok' | 'error'; checkedAt: Date; code?: string } | null = null;
  private clientOverride: ZeffyClient | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly bookings: BookingPaymentsService,
  ) {}

  onModuleInit() {
    const minutes = this.config.get('ZEFFY_RECONCILIATION_INTERVAL_MINUTES');
    if (this.config.get('ZEFFY_RECONCILIATION_ENABLED') && this.config.get('NODE_ENV') !== 'test') {
      this.timer = setInterval(() => void this.reconcile(null, 3).catch((e) => this.logger.error(`scheduled reconciliation failed: ${(e as Error).message}`)), minutes * 60_000);
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Test seam: inject a client backed by documented fixtures (never a live call in tests). */
  useClient(client: ZeffyClient | null) {
    this.clientOverride = client;
  }

  client(): ZeffyClient | null {
    if (this.clientOverride) return this.clientOverride;
    const key = this.config.get('ZEFFY_API_KEY');
    return key ? new ZeffyClient({ baseUrl: this.config.get('ZEFFY_API_BASE_URL'), apiKey: key }) : null;
  }

  // ───────────────────────── webhook ─────────────────────────

  /**
   * Verify (raw body) → store durably (unique event id) → process. Returns only after the event is stored, so a 2xx is never
   * sent for an event that could be lost. Processing failures that can recover later leave the stored event FAILED/TRANSIENT and
   * are picked up by the retry action or the API reconciliation.
   */
  async ingestWebhook(rawBody: Buffer | undefined, headers: IncomingHttpHeaders) {
    if (!rawBody?.length || rawBody.length > MAX_BODY) throw new BadRequestException({ message: 'Invalid webhook', code: 'INVALID_WEBHOOK' });
    const secrets = splitSecrets(this.config.get('ZEFFY_WEBHOOK_SECRET'));
    // Not configured: 503 so Zeffy keeps retrying (up to 3 days) instead of the delivery being acknowledged and lost.
    if (!secrets.length) throw new ServiceUnavailableException({ message: 'Zeffy webhooks are not configured', code: 'ZEFFY_NOT_CONFIGURED' });
    const sig = verifyZeffySignature(rawBody, headers['zeffy-signature'], secrets, this.config.get('ZEFFY_WEBHOOK_TOLERANCE_SECONDS'));
    if (!sig.ok) {
      this.logger.warn(`zeffy webhook rejected: ${sig.reason}`); // no body, no header value
      throw new BadRequestException({ message: 'Invalid webhook signature', code: 'INVALID_SIGNATURE' });
    }
    let body: { id?: unknown; type?: unknown; version?: unknown; dispatchedAt?: unknown; data?: unknown };
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException({ message: 'Invalid webhook payload', code: 'INVALID_WEBHOOK' });
    }
    if (typeof body.id !== 'string' || !body.id || body.id.length > 80 || typeof body.type !== 'string' || body.type.length > 80) {
      throw new BadRequestException({ message: 'Invalid webhook payload', code: 'INVALID_WEBHOOK' });
    }
    const stored = this.toStored(body.type, body);
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    let row: PaymentWebhookEvent;
    try {
      row = await this.prisma.paymentWebhookEvent.create({
        data: { provider: ZEFFY, providerEventId: body.id, eventType: body.type, signatureVerified: true, payloadHash, payload: stored as unknown as Prisma.InputJsonValue },
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      // Duplicate delivery of the same event (Zeffy re-signs retries; the event id stays the same).
      const existing = await this.prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { provider_providerEventId: { provider: ZEFFY, providerEventId: body.id } } });
      // A RECEIVED event younger than a minute is still being processed by the first delivery: acknowledge, don't race it.
      // Older RECEIVED rows (process crashed) and FAILED/TRANSIENT rows are processed again.
      const stuck = existing.status === 'RECEIVED' && Date.now() - existing.receivedAt.getTime() > 60_000;
      const retryable = stuck || (existing.status === 'FAILED' && existing.lastError?.startsWith('TRANSIENT'));
      if (retryable) return this.processEvent(existing.id);
      return { received: true, duplicate: true, status: existing.status };
    }
    return this.processEvent(row.id);
  }

  private toStored(type: string, body: { version?: unknown; dispatchedAt?: unknown; data?: unknown }): StoredEvent {
    const base = { source: 'zeffy-webhook' as const, type, version: typeof body.version === 'number' ? body.version : null, dispatchedAt: typeof body.dispatchedAt === 'string' ? body.dispatchedAt : null };
    const data = body.data as { id?: unknown } | undefined;
    if (type === 'payment.completed' || type === 'payment.created') {
      try {
        const p = parseZeffyPayment(data);
        return { ...base, paymentId: p.id, payment: this.sanitize(p) };
      } catch (e) {
        if (e instanceof ZeffyResponseError) throw new BadRequestException({ message: 'Invalid payment object in webhook', code: 'INVALID_WEBHOOK' });
        throw e;
      }
    }
    return { ...base, paymentId: typeof data?.id === 'string' ? data.id.slice(0, 64) : null, payment: null };
  }

  private sanitize(p: ZeffyPayment): NonNullable<StoredEvent['payment']> {
    const { buyer_answers: _b, items, ...rest } = p;
    void _b;
    return { ...rest, items: items.map(({ answers: _a, ...i }) => (void _a, i)), refs: findReferences(p) };
  }

  private restore(s: NonNullable<StoredEvent['payment']>): ZeffyPayment & { refs: string[] } {
    return { ...s, items: s.items.map((i) => ({ ...i, answers: [] })), buyer_answers: [], refs: s.refs };
  }

  /** Idempotent: PROCESSED / IGNORED events are never applied twice. */
  async processEvent(rowId: string) {
    const row = await this.prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { id: rowId } });
    if (row.status === 'PROCESSED' || row.status === 'IGNORED') return { received: true, duplicate: true, status: row.status };
    const ev = row.payload as unknown as StoredEvent;
    let status: 'PROCESSED' | 'IGNORED' | 'FAILED' = 'PROCESSED';
    let note: string | null = null;
    try {
      if (!(PAYMENT_EVENTS as readonly string[]).includes(row.eventType) || !ev.paymentId) {
        status = 'IGNORED';
        note = 'event type not used by MEKI';
      } else if (row.eventType === 'payment.deleted') {
        await this.markDeleted(ev.paymentId, row.providerEventId);
      } else {
        // completed/created carry the full payment; updated carries an id only → read the authoritative current state
        let payment: (ZeffyPayment & { refs: string[] }) | null = ev.payment ? this.restore(ev.payment) : null;
        let syncedAt = ev.dispatchedAt ? new Date(ev.dispatchedAt) : row.receivedAt;
        if (!payment || row.eventType === 'payment.updated') {
          const client = this.client();
          if (!client) throw new Error('TRANSIENT: ZEFFY_API_KEY not configured — the payment will be read by reconciliation');
          const fresh = await client.getPayment(ev.paymentId);
          if (!fresh) {
            await this.markDeleted(ev.paymentId, row.providerEventId);
            payment = null;
          } else {
            payment = { ...fresh, refs: findReferences(fresh) };
            syncedAt = new Date();
          }
        }
        if (payment) {
          const rec = await this.upsert(payment, payment.refs, syncedAt, row.providerEventId);
          const r = await this.evaluate(rec.id, payment, payment.refs, row);
          note = r.reason;
        }
      }
    } catch (e) {
      const transient = e instanceof ZeffyApiError ? e.retryable || e.code === 'network_error' : !(e instanceof ReviewRequired);
      status = 'FAILED';
      note = `${transient ? 'TRANSIENT' : 'REJECTED'}: ${(e as Error).message.replace(/^TRANSIENT: /, '')}`.slice(0, 1000);
      this.logger.warn(`zeffy event ${row.id} (${row.eventType}) ${note}`);
    }
    await this.prisma.paymentWebhookEvent.update({ where: { id: row.id }, data: { status, lastError: note, processedAt: new Date(), attempts: { increment: 1 } } });
    return { received: true, status };
  }

  // ───────────────────────── read model ─────────────────────────

  /**
   * Insert or refresh the provider record. Out-of-order deliveries cannot regress it: an older snapshot never overwrites a newer
   * one (lastSyncedAt). The match decision is recalculated separately.
   */
  async upsert(p: ZeffyPayment, refs: string[], syncedAt: Date, eventId?: string): Promise<ProviderPayment> {
    const data = {
      status: p.status.slice(0, 40),
      type: p.type.slice(0, 20),
      amount: centsToDecimal(p.amount),
      eligibleAmount: centsToDecimal(p.eligible_amount),
      refundedAmount: centsToDecimal(refundedCents(p)),
      refundStatus: p.refund_status.slice(0, 20),
      disputeStatus: p.dispute?.status.slice(0, 30) ?? null,
      currency: p.currency.toUpperCase().slice(0, 3),
      campaignId: p.campaign_id?.slice(0, 64) ?? null,
      campaignCategory: p.campaign_category?.slice(0, 30) ?? null,
      occurrenceId: p.occurrence_id?.slice(0, 64) ?? null,
      recurringSubscriptionId: p.recurring?.subscription_id?.slice(0, 64) ?? null,
      recurringInterval: p.recurring?.interval?.slice(0, 20) ?? null,
      classification: classify(p),
      items: p.items.map((i) => ({ type: i.type, amount: centsToDecimal(i.amount), currency: i.currency.toUpperCase(), rateId: i.rate_id, rateTitle: i.rate_title, recurrenceInterval: i.recurrence_interval })) as Prisma.InputJsonValue,
      correlationRef: refs.length === 1 ? refs[0] : null,
      providerCreatedAt: new Date(p.created * 1000),
      deletedAtProvider: null,
      lastSyncedAt: syncedAt,
      ...(eventId ? { lastEventId: eventId.slice(0, 80) } : {}),
    };
    const existing = await this.prisma.providerPayment.findUnique({ where: { provider_providerPaymentId: { provider: ZEFFY, providerPaymentId: p.id } } });
    if (!existing) {
      try {
        return await this.prisma.providerPayment.create({ data: { provider: ZEFFY, providerPaymentId: p.id.slice(0, 64), ...data } });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e; // concurrent first sighting
        return this.upsert(p, refs, syncedAt, eventId);
      }
    }
    if (existing.lastSyncedAt > syncedAt) return existing; // older snapshot (out-of-order delivery)
    return this.prisma.providerPayment.update({ where: { id: existing.id }, data });
  }

  private async markDeleted(paymentId: string, eventId: string) {
    const rec = await this.prisma.providerPayment.findUnique({ where: { provider_providerPaymentId: { provider: ZEFFY, providerPaymentId: paymentId.slice(0, 64) } } });
    if (!rec) return;
    // Never reverse accounting from a deletion notice: flag for review (MEKI ledgers keep the verified history).
    await this.prisma.providerPayment.update({
      where: { id: rec.id },
      data: {
        deletedAtProvider: new Date(),
        lastEventId: eventId.slice(0, 80),
        ...(rec.matchStatus === 'CONFIRMED' || rec.matchStatus === 'MATCHED' ? { matchStatus: 'NEEDS_REVIEW', matchReason: 'payment deleted at the provider after it was matched — review the booking' } : {}),
      },
    });
    await this.audit.record(null, 'zeffy.payment.deleted', 'ProviderPayment', rec.id, { matchStatus: rec.matchStatus });
  }

  // ───────────────────────── correlation ─────────────────────────

  private async decide(rec: ProviderPayment, p: ZeffyPayment, refs: string[]): Promise<Decision> {
    const galaCampaign = this.config.get('ZEFFY_GALA_TICKET_CAMPAIGN_ID');
    const donationCampaigns = splitSecrets(this.config.get('ZEFFY_DONATION_CAMPAIGN_IDS'));
    if (galaCampaign && p.campaign_id === galaCampaign) {
      const ref = refs.filter((r) => r.startsWith('EB-'));
      const event = await this.prisma.event.findFirst({ where: { code: this.config.get('ZEFFY_GALA_EVENT_CODE'), deletedAt: null }, select: { id: true } });
      const booking = ref.length === 1 ? await this.prisma.eventBooking.findUnique({ where: { publicReference: ref[0] } }) : null;
      const claimed = booking
        ? await this.prisma.providerPayment.findFirst({ where: { provider: ZEFFY, matchedEntityType: 'EventBooking', matchedEntityId: booking.id, NOT: { id: rec.id } }, select: { id: true } })
        : null;
      return decideGala({ ...p, deleted: rec.deletedAtProvider !== null }, refs, {
        galaCampaignId: galaCampaign,
        galaEventId: event?.id ?? null,
        bookingClaimedByOther: !!claimed,
        booking: booking ? { id: booking.id, eventId: booking.eventId, bookingStatus: booking.bookingStatus, paymentStatus: booking.paymentStatus, totalCents: decimalToCents(D(booking.totalAmount).toFixed(2)), currency: booking.currency, guestCount: booking.guestCount } : null,
      });
    }
    if (donationCampaigns.includes(p.campaign_id ?? '')) {
      // Donations made on SDI's hosted forms: visible and classified; applied to MEKI donation records only in Phase 8B.
      const dn = refs.filter((r) => r.startsWith('DN-'));
      if (dn.length === 0) return { status: 'UNMATCHED', reason: 'donation without a MEKI reference (direct gift on SDI form)' };
      if (dn.length > 1) return { status: 'NEEDS_REVIEW', reason: 'ambiguous: several donation references' };
      const d = await this.prisma.donation.findUnique({ where: { reference: dn[0] }, select: { amount: true, currency: true } });
      if (!d) return { status: 'NEEDS_REVIEW', reason: `donation ${dn[0]} not found` };
      if (d.currency !== p.currency.toUpperCase() || decimalToCents(D(d.amount).toFixed(2)) !== p.amount) return { status: 'NEEDS_REVIEW', reason: 'donation amount or currency differs' };
      return { status: 'NEEDS_REVIEW', reason: 'donation reference matches; applying Zeffy donations awaits SDI (Phase 8B)' };
    }
    return { status: 'IGNORED', reason: 'campaign not configured for MEKI' };
  }

  /**
   * Decide and (only when allowed) apply. Already CONFIRMED records are re-checked for refunds/disputes; nothing is applied twice.
   * `row` is the stored event that carries the evidence (a webhook, or the API-sync record of a reconciliation).
   */
  async evaluate(recordId: string, p: ZeffyPayment, refs: string[], row?: PaymentWebhookEvent): Promise<{ status: string; reason: string }> {
    const rec = await this.prisma.providerPayment.findUniqueOrThrow({ where: { id: recordId } });
    if (rec.matchStatus === 'CONFIRMED' || (rec.matchedEntityType === 'EventBooking' && rec.matchedEntityId)) return this.afterConfirmation(rec, p, row);
    const d = await this.decide(rec, p, refs);
    const autoConfirm = this.config.get('ZEFFY_GALA_AUTO_CONFIRM');
    if (d.status === 'MATCHED' && autoConfirm) {
      try {
        await this.applyBooking(rec, p, d.bookingId, row);
        return { status: 'CONFIRMED', reason: 'confirmed through the established booking pipeline' };
      } catch (e) {
        // A concurrent run may have applied this very payment (the unique attempt/claim indexes made this run fail):
        // never downgrade a record that is already CONFIRMED.
        const reason = `not applied: ${(e as Error).message}`.slice(0, 200);
        const moved = await this.prisma.providerPayment.updateMany({ where: { id: rec.id, matchStatus: { not: 'CONFIRMED' } }, data: { matchStatus: 'NEEDS_REVIEW', matchReason: reason } });
        return moved.count ? { status: 'NEEDS_REVIEW', reason } : { status: 'CONFIRMED', reason: 'already confirmed by a concurrent run' };
      }
    }
    const reason = d.status === 'MATCHED' ? 'all correlation rules passed — automatic confirmation is disabled (awaiting SDI)' : d.reason;
    await this.prisma.providerPayment.updateMany({ where: { id: rec.id, matchStatus: { not: 'CONFIRMED' } }, data: { matchStatus: d.status, matchReason: reason.slice(0, 200) } });
    return { status: d.status, reason };
  }

  private async evidenceRow(p: ZeffyPayment, row?: PaymentWebhookEvent): Promise<PaymentWebhookEvent> {
    if (row) return row;
    // Reconciliation evidence: the authenticated API read (Bearer key over TLS) — stored once per payment.
    const stored: StoredEvent = { source: 'zeffy-api', type: 'payment.reconciled', version: null, dispatchedAt: null, paymentId: p.id, payment: this.sanitize(p) };
    return this.prisma.paymentWebhookEvent.upsert({
      where: { provider_providerEventId: { provider: ZEFFY, providerEventId: `api-sync:${p.id}` } },
      update: {},
      create: { provider: ZEFFY, providerEventId: `api-sync:${p.id}`, eventType: 'payment.reconciled', signatureVerified: false, payloadHash: createHash('sha256').update(JSON.stringify(stored)).digest('hex'), payload: stored as unknown as Prisma.InputJsonValue, status: 'PROCESSED', processedAt: new Date() },
    });
  }

  /** The established pipeline: attempt bound to this Zeffy payment → BookingPaymentsService.handle('payment.succeeded'). */
  private async applyBooking(rec: ProviderPayment, p: ZeffyPayment, bookingId: string, row?: PaymentWebhookEvent) {
    const evidence = await this.evidenceRow(p, row);
    let after: (() => Promise<void>) | undefined;
    await this.prisma.$transaction(
      async (tx) => {
        const booking = await tx.eventBooking.findUniqueOrThrow({ where: { id: bookingId } });
        // claim first: the unique (provider, matchedEntityType, matchedEntityId) index makes a second payment for the same booking fail
        await tx.providerPayment.update({ where: { id: rec.id }, data: { matchedEntityType: 'EventBooking', matchedEntityId: booking.id } });
        const attempt = await tx.eventBookingPaymentAttempt.create({
          data: { reference: generateBookingAttemptReference(), bookingId: booking.id, provider: ZEFFY, providerSessionRef: `zeffy:${p.id}`, amount: booking.totalAmount, currency: booking.currency, status: 'CREATED', isTest: false },
        });
        const event: NormalizedWebhookEvent = {
          eventId: evidence.providerEventId,
          type: 'payment.succeeded',
          occurredAt: new Date(p.created * 1000),
          attemptReference: attempt.reference,
          sessionRef: attempt.providerSessionRef ?? undefined,
          paymentRef: p.id,
          amount: centsToDecimal(p.amount),
          currency: p.currency.toUpperCase(),
        };
        const outcome = await this.bookings.handle(tx, evidence, event);
        if (outcome.status !== 'PROCESSED') throw new ReviewRequired(outcome.note ?? 'booking pipeline did not confirm');
        await tx.providerPayment.update({ where: { id: rec.id }, data: { matchStatus: 'CONFIRMED', matchReason: 'confirmed through the established booking pipeline' } });
        await this.audit.record(null, 'zeffy.booking.confirmed', 'EventBooking', booking.id, { providerPaymentId: p.id, evidence: evidence.eventType }, tx);
        after = outcome.afterCommit;
      },
      { timeout: 20_000 },
    );
    if (after) await after().catch((e) => this.logger.error(`post-confirmation jobs failed: ${(e as Error).message}`));
  }

  /** Refunds / disputes / deletion on an applied payment. Full refunds reuse the established refund pipeline (when enabled). */
  private async afterConfirmation(rec: ProviderPayment, p: ZeffyPayment, row?: PaymentWebhookEvent) {
    const flag = async (reason: string) => {
      await this.prisma.providerPayment.update({ where: { id: rec.id }, data: { matchStatus: 'NEEDS_REVIEW', matchReason: reason.slice(0, 200) } });
      return { status: 'NEEDS_REVIEW', reason };
    };
    if (p.dispute) return flag(`dispute ${p.dispute.status} reported by the provider — review`);
    const refunded = refundedCents(p);
    if (refunded === 0) return { status: rec.matchStatus, reason: rec.matchReason ?? '' };
    if (refunded < p.amount) return flag(`partial refund of ${centsToDecimal(refunded)} reported — review (only full refunds are applied)`);
    if (!this.config.get('ZEFFY_GALA_AUTO_CONFIRM')) return flag('full refund reported by the provider — apply after review');
    const attempt = await this.prisma.eventBookingPaymentAttempt.findFirst({ where: { provider: ZEFFY, providerPaymentRef: p.id } });
    if (!attempt) return flag('full refund reported but no MEKI payment attempt is bound to this payment');
    const evidence = await this.evidenceRow(p, row);
    const ids = p.refunds.filter((r) => r.status === 'succeeded').map((r) => r.id);
    let after: (() => Promise<void>) | undefined;
    try {
      await this.prisma.$transaction(async (tx) => {
        const outcome = await this.bookings.handle(tx, evidence, {
          eventId: evidence.providerEventId,
          type: 'refund.succeeded',
          occurredAt: new Date(),
          attemptReference: attempt.reference,
          providerRefundRef: (ids.length === 1 ? ids[0] : `zeffy-refunds:${p.id}`).slice(0, 191),
          amount: centsToDecimal(refunded),
          currency: p.currency.toUpperCase(),
        });
        if (outcome.status === 'IGNORED') return;
        if (outcome.status !== 'PROCESSED') throw new ReviewRequired(outcome.note ?? 'refund not applied');
        after = outcome.afterCommit;
      });
    } catch (e) {
      return flag(`full refund not applied: ${(e as Error).message}`);
    }
    if (after) await after().catch((e) => this.logger.error(`post-refund jobs failed: ${(e as Error).message}`));
    await this.prisma.providerPayment.update({ where: { id: rec.id }, data: { matchReason: 'full refund applied through the established booking pipeline' } });
    return { status: 'CONFIRMED', reason: 'full refund applied' };
  }

  // ───────────────────────── reconciliation ─────────────────────────

  /** Idempotent pull of recent payments (read-only). Single run at a time per instance; every run is audited with its counts. */
  async reconcile(actor: ActorContext | null, days = 30) {
    const client = this.client();
    if (!client) throw new UnprocessableEntityException({ message: 'Zeffy API key is not configured', code: 'ZEFFY_NOT_CONFIGURED' });
    if (this.reconciling) throw new UnprocessableEntityException({ message: 'A reconciliation is already running', code: 'ZEFFY_RECONCILE_RUNNING' });
    this.reconciling = true;
    const counts = { payments: 0, matched: 0, review: 0, unmatched: 0, ignored: 0, confirmed: 0, failed: 0 };
    const since = Math.floor(Date.now() / 1000) - Math.min(Math.max(days, 1), 400) * 86_400;
    try {
      for await (const p of client.iteratePayments({ createdGte: since })) {
        counts.payments++;
        try {
          const refs = findReferences(p);
          const rec = await this.upsert(p, refs, new Date());
          const r = await this.evaluate(rec.id, p, refs);
          const k = r.status === 'MATCHED' ? 'matched' : r.status === 'NEEDS_REVIEW' ? 'review' : r.status === 'UNMATCHED' ? 'unmatched' : r.status === 'IGNORED' ? 'ignored' : 'confirmed';
          counts[k]++;
        } catch (e) {
          counts.failed++;
          this.logger.warn(`reconcile payment failed: ${(e as Error).message}`);
        }
      }
      this.health = { state: 'ok', checkedAt: new Date() };
      await this.audit.record(actor, 'zeffy.reconcile.run', 'ProviderPayment', null, { ok: true, days, ...counts });
      return { ok: true, days, ...counts };
    } catch (e) {
      const code = e instanceof ZeffyApiError ? e.code : 'error';
      this.health = { state: 'error', checkedAt: new Date(), code };
      await this.audit.record(actor, 'zeffy.reconcile.run', 'ProviderPayment', null, { ok: false, days, code, ...counts });
      throw new UnprocessableEntityException({ message: 'Zeffy reconciliation failed', code: 'ZEFFY_RECONCILE_FAILED', details: { providerCode: code } });
    } finally {
      this.reconciling = false;
    }
  }

  /** Re-read one payment from Zeffy and re-evaluate it (same rules, same gate — never a manual "mark paid"). */
  async recheck(id: string, actor: ActorContext) {
    const rec = await this.prisma.providerPayment.findUnique({ where: { id } });
    if (!rec) throw new NotFoundException('Provider payment not found');
    const client = this.client();
    if (!client) throw new UnprocessableEntityException({ message: 'Zeffy API key is not configured', code: 'ZEFFY_NOT_CONFIGURED' });
    const p = await client.getPayment(rec.providerPaymentId);
    if (!p) {
      await this.markDeleted(rec.providerPaymentId, `recheck:${Date.now()}`);
      await this.audit.record(actor, 'zeffy.payment.recheck', 'ProviderPayment', rec.id, { result: 'deleted' });
      return this.prisma.providerPayment.findUniqueOrThrow({ where: { id } });
    }
    const refs = findReferences(p);
    await this.upsert(p, refs, new Date());
    const r = await this.evaluate(rec.id, p, refs);
    await this.audit.record(actor, 'zeffy.payment.recheck', 'ProviderPayment', rec.id, { result: r.status });
    return this.prisma.providerPayment.findUniqueOrThrow({ where: { id } });
  }

  // ───────────────────────── admin views ─────────────────────────

  async list(q: { page: number; pageSize: number; matchStatus?: string; classification?: string; search?: string }) {
    const where: Prisma.ProviderPaymentWhereInput = {
      provider: ZEFFY,
      ...(q.matchStatus ? { matchStatus: q.matchStatus as ProviderPayment['matchStatus'] } : {}),
      ...(q.classification ? { classification: q.classification as NonNullable<ProviderPayment['classification']> } : {}),
      ...(q.search ? { OR: [{ providerPaymentId: { contains: q.search } }, { correlationRef: { contains: q.search.toUpperCase() } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.providerPayment.findMany({ where, orderBy: [{ providerCreatedAt: 'desc' }, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.providerPayment.count({ where }),
    ]);
    return Paginated.of(items.map((r) => ({ ...r, amount: D(r.amount).toFixed(2), eligibleAmount: D(r.eligibleAmount).toFixed(2), refundedAmount: D(r.refundedAmount).toFixed(2) })), total, q.page, q.pageSize);
  }

  /**
   * Truthful runtime status: configuration flags (booleans only — never values), a LIVE API check when a key exists (cached 60 s),
   * webhook deliveries actually received and verified, the last reconciliation run, and the review queue.
   */
  async status(live = true) {
    const key = !!this.config.get('ZEFFY_API_KEY');
    if (live && key && (!this.health || Date.now() - this.health.checkedAt.getTime() > 60_000)) {
      try {
        await this.client()!.ping();
        this.health = { state: 'ok', checkedAt: new Date() };
      } catch (e) {
        this.health = { state: 'error', checkedAt: new Date(), code: e instanceof ZeffyApiError ? e.code : 'error' };
      }
    }
    const [lastVerified, failedEvents, lastRun, byStatus] = await Promise.all([
      this.prisma.paymentWebhookEvent.findFirst({ where: { provider: ZEFFY, signatureVerified: true }, orderBy: { receivedAt: 'desc' }, select: { receivedAt: true, eventType: true, status: true } }),
      this.prisma.paymentWebhookEvent.count({ where: { provider: ZEFFY, status: 'FAILED' } }),
      this.prisma.auditLog.findFirst({ where: { action: 'zeffy.reconcile.run' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, metadata: true } }),
      this.prisma.providerPayment.groupBy({ by: ['matchStatus'], where: { provider: ZEFFY }, orderBy: { matchStatus: 'asc' }, _count: { _all: true } }),
    ]);
    return {
      provider: ZEFFY,
      configured: {
        apiKey: key,
        webhookSecret: splitSecrets(this.config.get('ZEFFY_WEBHOOK_SECRET')).length > 0,
        galaTicketCampaign: !!this.config.get('ZEFFY_GALA_TICKET_CAMPAIGN_ID'),
        donationCampaigns: splitSecrets(this.config.get('ZEFFY_DONATION_CAMPAIGN_IDS')).length,
        forms: { donation: !!this.config.get('ZEFFY_DONATION_FORM_URL'), galaTicket: !!this.config.get('ZEFFY_GALA_TICKET_FORM_URL'), galaGiving: !!this.config.get('ZEFFY_GALA_GIVING_FORM_URL') },
      },
      reconciliationEnabled: this.config.get('ZEFFY_RECONCILIATION_ENABLED'),
      autoConfirm: this.config.get('ZEFFY_GALA_AUTO_CONFIRM'),
      /** Zeffy offers no checkout-creation API: MEKI cannot open a booking-specific checkout (docs/31). */
      hostedCheckout: { available: false, reason: 'no documented checkout-creation endpoint; booking-reference mapping pending SDI' },
      api: key ? (this.health ? { state: this.health.state, checkedAt: this.health.checkedAt, code: this.health.code ?? null } : { state: 'unchecked' as const }) : { state: 'not_configured' as const },
      webhook: { lastVerifiedAt: lastVerified?.receivedAt ?? null, lastEventType: lastVerified?.eventType ?? null, failedEvents },
      lastReconciliation: lastRun ? { at: lastRun.createdAt, result: lastRun.metadata } : null,
      queue: Object.fromEntries(byStatus.map((b) => [b.matchStatus, (b._count as { _all: number })._all])),
    };
  }
}
