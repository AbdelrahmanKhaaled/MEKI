import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { PaymentWebhookEvent } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { D, AMOUNT_PATTERN } from '../donations/money';
import type { NormalizedWebhookEvent } from '../donations/payments/payment-provider';
import { WebhookRejection, type ExternalWebhookHandler, type Outcome } from '../donations/webhooks.service';
import { BOOKING_ATTEMPT_PREFIX } from './gala.rules';
import { emailKey, GalaJobsService, type JobSpec } from './gala-jobs.service';
import { TicketsService } from './tickets.service';

type Tx = Prisma.TransactionClient;

/**
 * Trusted payment confirmation for ticket bookings. It runs INSIDE the shared webhook pipeline (signature verified on
 * the raw body, event stored under UNIQUE(provider,eventId), processed in one DB transaction), so repeated delivery
 * can never issue a second set of tickets. It is the ONLY code path that moves a booking to PAID/CONFIRMED and the only
 * one that issues tickets. Browser return URLs never reach it.
 *
 * Checks before any state change: our attempt reference, the provider session we stored, exact amount + currency
 * (= server-calculated booking total). Ledger rows (append-only) are unique per (provider, ref, type).
 * Only FULL-booking refunds are supported in this phase; any other amount is rejected for manual review.
 */
@Injectable()
export class BookingPaymentsService implements ExternalWebhookHandler {
  readonly prefix = BOOKING_ATTEMPT_PREFIX;
  private readonly logger = new Logger(BookingPaymentsService.name);

  constructor(
    private readonly audit: AuditService,
    private readonly tickets: TicketsService,
    private readonly jobs: GalaJobsService,
  ) {}

  handle(tx: Tx, row: PaymentWebhookEvent, e: NormalizedWebhookEvent): Promise<Outcome> {
    switch (e.type) {
      case 'payment.succeeded':
        return this.succeeded(tx, row, e);
      case 'payment.authorized':
        return this.authorized(tx, row, e);
      case 'payment.failed':
      case 'payment.cancelled':
        return this.failedOrCancelled(tx, row, e);
      case 'refund.succeeded':
      case 'refund.failed':
        return this.refund(tx, row, e);
      default:
        return Promise.resolve({ status: 'IGNORED', note: 'Unsupported event type for ticket bookings' });
    }
  }

  private requireMoney(e: NormalizedWebhookEvent, amount: Prisma.Decimal, currency: string) {
    if (!e.amount || !AMOUNT_PATTERN.test(e.amount) || !e.currency) throw new WebhookRejection('amount/currency missing');
    if (e.currency !== currency || !D(e.amount).eq(amount)) {
      throw new WebhookRejection(`amount mismatch: expected ${amount.toString()} ${currency}, got ${e.amount} ${e.currency}`);
    }
  }

  private async findAttempt(tx: Tx, row: PaymentWebhookEvent, e: NormalizedWebhookEvent, requireSession = true) {
    if (!e.attemptReference) throw new WebhookRejection('attempt reference missing');
    const attempt = await tx.eventBookingPaymentAttempt.findUnique({ where: { reference: e.attemptReference }, include: { booking: true } });
    if (!attempt || attempt.provider !== row.provider) throw new WebhookRejection('unknown payment attempt');
    if (requireSession && (!attempt.providerSessionRef || e.sessionRef !== attempt.providerSessionRef)) throw new WebhookRejection('provider session mismatch');
    return attempt;
  }

  // ───────────────────────── payment.succeeded ─────────────────────────

  private async succeeded(tx: Tx, row: PaymentWebhookEvent, e: NormalizedWebhookEvent): Promise<Outcome> {
    const attempt = await this.findAttempt(tx, row, e);
    const booking = attempt.booking;
    this.requireMoney(e, attempt.amount, attempt.currency);
    this.requireMoney(e, booking.totalAmount, booking.currency); // attempt amount must also equal the server-calculated total
    if (!e.paymentRef) throw new WebhookRejection('provider payment reference missing');
    if (attempt.status === 'SUCCEEDED') return { status: 'IGNORED', note: 'attempt already succeeded' };

    const ledger = {
      bookingId: booking.id,
      attemptId: attempt.id,
      webhookEventId: row.id,
      provider: row.provider,
      providerTransactionRef: e.paymentRef,
      type: 'CAPTURE' as const,
      status: 'SUCCEEDED' as const,
      amount: attempt.amount,
      currency: attempt.currency,
      isTest: attempt.isTest,
      occurredAt: e.occurredAt,
    };
    const closeAttempt = () =>
      tx.eventBookingPaymentAttempt.update({ where: { id: attempt.id }, data: { status: 'SUCCEEDED', providerPaymentRef: e.paymentRef, completedAt: new Date(), failureCode: null, failureReason: null } });

    // Money captured twice: record it, never issue again, flag for refund review.
    if (booking.paymentStatus === 'PAID' || booking.paymentStatus === 'REFUNDED') {
      await tx.eventBookingTransaction.create({ data: ledger });
      await closeAttempt();
      return { status: 'FAILED', note: 'REVIEW: duplicate payment captured for an already-paid booking — refund required' };
    }

    // Money arrived for a booking MEKI had already cancelled: keep the record, issue nothing, flag the refund.
    if (booking.bookingStatus !== 'PENDING') {
      await tx.eventBookingTransaction.create({ data: ledger });
      await closeAttempt();
      await tx.eventBooking.updateMany({
        where: { id: booking.id, paymentStatus: { in: ['UNPAID', 'PENDING', 'FAILED'] } },
        data: { paymentStatus: 'PAID', paidAt: e.occurredAt, ...(booking.bookingStatus === 'CANCELLED' ? { bookingStatus: 'REFUND_PENDING' as const } : {}) },
      });
      await this.audit.record(null, 'gala.booking.payment_after_cancellation', 'EventBooking', booking.id, { provider: row.provider, bookingStatus: booking.bookingStatus }, tx);
      return { status: 'FAILED', note: `REVIEW: payment captured for a ${booking.bookingStatus} booking — refund required` };
    }

    await tx.eventBookingTransaction.create({ data: ledger });
    await closeAttempt();
    const moved = await tx.eventBooking.updateMany({
      where: { id: booking.id, bookingStatus: 'PENDING', paymentStatus: { in: ['UNPAID', 'PENDING', 'FAILED'] } },
      data: { paymentStatus: 'PAID', bookingStatus: 'CONFIRMED', paidAt: e.occurredAt, paymentProvider: row.provider, providerReference: e.paymentRef },
    });
    if (moved.count !== 1) throw new Error('booking state changed concurrently');

    const issued = await this.tickets.issueInTx(tx, booking.id, e.occurredAt);
    await this.audit.record(null, 'gala.booking.confirmed', 'EventBooking', booking.id, { source: 'verified-payment', provider: row.provider, ticketsIssued: issued.length, webhookEventId: row.id }, tx);

    // Outbox: the follow-up work is recorded in the SAME transaction as the confirmation, so it can never be forgotten, and a
    // later failure (PDF render, storage, e-mail provider) can only delay it — never undo the verified payment.
    const specs: JobSpec[] = [{ type: 'EMAIL', template: 'booking.confirmed', dedupeKey: emailKey('booking.confirmed', booking.id) }];
    for (const i of issued) {
      specs.push({ type: 'TICKET_PDF', ticketId: i.ticketId, dedupeKey: `pdf:${i.ticketId}` });
      specs.push({ type: 'EMAIL', template: 'ticket.delivery', ticketId: i.ticketId, dedupeKey: emailKey('ticket.delivery', booking.id, i.ticketId) });
    }
    await this.jobs.enqueueInTx(tx, booking.id, specs);

    return { status: 'PROCESSED', afterCommit: () => this.jobs.processBooking(booking.id, issued).then(() => undefined) };
  }

  // ───────────────────────── payment.authorized ─────────────────────────

  private async authorized(tx: Tx, row: PaymentWebhookEvent, e: NormalizedWebhookEvent): Promise<Outcome> {
    const attempt = await this.findAttempt(tx, row, e);
    this.requireMoney(e, attempt.amount, attempt.currency);
    if (!e.paymentRef) throw new WebhookRejection('provider payment reference missing');
    if (!['CREATED', 'REQUIRES_ACTION'].includes(attempt.status)) return { status: 'IGNORED', note: `attempt is ${attempt.status}` };
    await tx.eventBookingTransaction.create({
      data: {
        bookingId: attempt.bookingId, attemptId: attempt.id, webhookEventId: row.id, provider: row.provider, providerTransactionRef: e.paymentRef,
        type: 'AUTHORIZATION', status: 'SUCCEEDED', amount: attempt.amount, currency: attempt.currency, isTest: attempt.isTest, occurredAt: e.occurredAt,
      },
    });
    await tx.eventBookingPaymentAttempt.update({ where: { id: attempt.id }, data: { status: 'AUTHORIZED', providerPaymentRef: e.paymentRef } });
    await tx.eventBooking.updateMany({ where: { id: attempt.bookingId, bookingStatus: 'PENDING', paymentStatus: 'UNPAID' }, data: { paymentStatus: 'PENDING' } });
    return { status: 'PROCESSED' };
  }

  // ───────────────────────── failed / cancelled ─────────────────────────

  private async failedOrCancelled(tx: Tx, row: PaymentWebhookEvent, e: NormalizedWebhookEvent): Promise<Outcome> {
    const attempt = await this.findAttempt(tx, row, e);
    const cancelled = e.type === 'payment.cancelled';
    if (attempt.status === 'SUCCEEDED') return { status: 'IGNORED', note: 'late failure after success ignored' };
    if (attempt.status === 'FAILED' || attempt.status === 'CANCELLED') return { status: 'IGNORED', note: 'attempt already closed' };
    const booking = attempt.booking;
    await tx.eventBookingTransaction.create({
      data: {
        bookingId: booking.id, attemptId: attempt.id, webhookEventId: row.id, provider: row.provider,
        providerTransactionRef: e.paymentRef ?? `event:${e.eventId}`, type: cancelled ? 'CANCELLATION' : 'FAILURE', status: 'FAILED',
        amount: attempt.amount, currency: attempt.currency, failureCode: e.failureCode?.slice(0, 80), isTest: attempt.isTest, occurredAt: e.occurredAt,
      },
    });
    await tx.eventBookingPaymentAttempt.update({
      where: { id: attempt.id },
      data: { status: cancelled ? 'CANCELLED' : 'FAILED', failureCode: e.failureCode?.slice(0, 80), failureReason: e.failureReason?.slice(0, 500), completedAt: new Date() },
    });
    if (!cancelled) {
      await tx.eventBooking.updateMany({ where: { id: booking.id, bookingStatus: 'PENDING', paymentStatus: { in: ['UNPAID', 'PENDING'] } }, data: { paymentStatus: 'FAILED' } });
    } else {
      // A cancelled checkout is not a failed payment: back to UNPAID unless another checkout is still open.
      const stillOpen = await tx.eventBookingPaymentAttempt.count({ where: { bookingId: booking.id, id: { not: attempt.id }, status: { in: ['CREATED', 'REQUIRES_ACTION', 'AUTHORIZED'] } } });
      if (!stillOpen) await tx.eventBooking.updateMany({ where: { id: booking.id, bookingStatus: 'PENDING', paymentStatus: 'PENDING' }, data: { paymentStatus: 'UNPAID' } });
    }
    if (!cancelled) await this.jobs.enqueueInTx(tx, booking.id, [{ type: 'EMAIL', template: 'payment.failed', dedupeKey: emailKey('payment.failed', booking.id, attempt.id) }]);
    return { status: 'PROCESSED', afterCommit: cancelled ? undefined : () => this.jobs.processBooking(booking.id, []).then(() => undefined) };
  }

  // ───────────────────────── refunds ─────────────────────────

  private async refund(tx: Tx, row: PaymentWebhookEvent, e: NormalizedWebhookEvent): Promise<Outcome> {
    const attempt = await this.findAttempt(tx, row, e, false);
    const booking = attempt.booking;
    if (!e.providerRefundRef) throw new WebhookRejection('provider refund reference missing');
    if (booking.paymentStatus === 'REFUNDED') return { status: 'IGNORED', note: 'booking already refunded' };
    if (booking.paymentStatus !== 'PAID') throw new WebhookRejection(`booking payment is ${booking.paymentStatus}, not PAID`);

    if (e.type === 'refund.failed') {
      await tx.eventBookingTransaction.create({
        data: {
          bookingId: booking.id, attemptId: attempt.id, webhookEventId: row.id, provider: row.provider, providerTransactionRef: e.providerRefundRef,
          type: 'REFUND', status: 'FAILED', amount: booking.totalAmount, currency: booking.currency, failureCode: e.failureCode?.slice(0, 80), isTest: attempt.isTest, occurredAt: e.occurredAt,
        },
      });
      return { status: 'PROCESSED' };
    }

    this.requireMoney(e, booking.totalAmount, booking.currency); // full refunds only
    await tx.eventBookingTransaction.create({
      data: {
        bookingId: booking.id, attemptId: attempt.id, webhookEventId: row.id, provider: row.provider, providerTransactionRef: e.providerRefundRef,
        type: 'REFUND', status: 'SUCCEEDED', amount: booking.totalAmount, currency: booking.currency, isTest: attempt.isTest, occurredAt: e.occurredAt,
      },
    });
    const moved = await tx.eventBooking.updateMany({
      where: { id: booking.id, paymentStatus: 'PAID' },
      data: { paymentStatus: 'REFUNDED', bookingStatus: 'REFUNDED', refundedAmount: booking.totalAmount },
    });
    if (moved.count !== 1) throw new Error('booking state changed concurrently');
    // Refunded tickets can never be checked in; checkedInAt history is preserved.
    const revoked = await tx.eventTicket.updateMany({ where: { bookingId: booking.id, status: { not: 'REFUNDED' } }, data: { status: 'REFUNDED' } });
    await this.audit.record(null, 'gala.booking.refunded', 'EventBooking', booking.id, { source: 'verified-refund', provider: row.provider, ticketsRefunded: revoked.count, webhookEventId: row.id }, tx);
    await this.jobs.enqueueInTx(tx, booking.id, [{ type: 'EMAIL', template: 'ticket.refunded', dedupeKey: emailKey('ticket.refunded', booking.id) }]);
    return { status: 'PROCESSED', afterCommit: () => this.jobs.processBooking(booking.id, []).then(() => undefined) };
  }
}
