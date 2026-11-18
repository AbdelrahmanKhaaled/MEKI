import { BadRequestException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { Prisma } from '../../generated/prisma/client';
import type { PaymentWebhookEvent } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { AuditService } from '../audit/audit.service';
import type { ActorContext } from '../../common/types/auth-request';
import { Paginated, parseSort } from '../../common/utils';
import { addMonths, AMOUNT_PATTERN, D, generateReference } from './money';
import { PaymentProviderRegistry } from './payments/payment-provider.registry';
import type { NormalizedWebhookEvent } from './payments/payment-provider';
import { ReceiptsService } from './receipts.service';
import { DONATION_NOTIFIER, type DonationNotificationInput, type DonationNotifier } from './donation-notifier';
import type { WebhookEventQueryDto } from './donations.dto';

type Tx = Prisma.TransactionClient;

/** Permanent rejection: the event is stored as FAILED (for review) and acknowledged so the provider stops retrying. */
export class WebhookRejection extends Error {}

export interface Outcome {
  status: 'PROCESSED' | 'IGNORED' | 'FAILED';
  note?: string;
  notify?: DonationNotificationInput[];
  afterCommit?: () => Promise<void>;
}

/**
 * Extension point for payment types that are NOT donations (e.g. event tickets). A handler owns events whose
 * `attemptReference` starts with its prefix; it runs inside the same verified/stored/transactional pipeline.
 */
export interface ExternalWebhookHandler {
  prefix: string;
  handle(tx: Prisma.TransactionClient, row: PaymentWebhookEvent, event: NormalizedWebhookEvent): Promise<Outcome>;
}

const CONFIRMED = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;

/**
 * Webhook pipeline:  verify signature (raw body) → parse → store under UNIQUE(provider, eventId) → process in a
 * DB transaction with explicit state guards → mark PROCESSED/IGNORED/FAILED → side effects after commit.
 *
 * Never trusted because it "says succeeded": the event must match OUR attempt reference, the provider session/agreement
 * we stored, and the exact amount + currency. Ledger rows have unique (provider, ref, type), so even a duplicate that
 * slips past the event-id check cannot create a second capture. `process()` is the unit a future queue worker calls.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly external: ExternalWebhookHandler[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PaymentProviderRegistry,
    private readonly receipts: ReceiptsService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    @Inject(DONATION_NOTIFIER) private readonly notifier: DonationNotifier,
  ) {}

  registerExternalHandler(handler: ExternalWebhookHandler) {
    if (!this.external.some((h) => h.prefix === handler.prefix)) this.external.push(handler);
  }

  async ingest(providerCode: string, rawBody: Buffer | undefined, headers: IncomingHttpHeaders) {
    const adapter = this.registry.get(providerCode);
    if (!rawBody?.length || rawBody.length > 256 * 1024) throw new BadRequestException('Invalid webhook');
    if (!adapter.verifyWebhookSignature(rawBody, headers)) {
      this.logger.warn(`webhook signature rejected provider=${providerCode}`);
      throw new BadRequestException({ message: 'Invalid webhook signature', code: 'INVALID_SIGNATURE' });
    }
    let event: NormalizedWebhookEvent;
    try {
      event = adapter.parseWebhook(rawBody);
    } catch {
      throw new BadRequestException('Invalid webhook payload');
    }
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    try {
      const row = await this.prisma.paymentWebhookEvent.create({
        data: {
          provider: adapter.code,
          providerEventId: event.eventId,
          eventType: event.type,
          signatureVerified: true,
          payloadHash,
          payload: { ...event, occurredAt: event.occurredAt.toISOString() } as unknown as Prisma.InputJsonValue,
        },
      });
      return this.process(row.id);
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      const existing = await this.prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { provider_providerEventId: { provider: adapter.code, providerEventId: event.eventId } } });
      if (existing.payloadHash !== payloadHash) this.logger.warn(`webhook ${existing.id} re-delivered with a different payload; original kept`);
      const retryable = existing.status === 'RECEIVED' || (existing.status === 'FAILED' && existing.lastError?.startsWith('TRANSIENT'));
      if (retryable && existing.payloadHash === payloadHash) return this.process(existing.id);
      return { received: true, duplicate: true, status: existing.status };
    }
  }

  /** Idempotent: PROCESSED/IGNORED events are never applied twice. */
  async process(eventId: string) {
    const row = await this.prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { id: eventId } });
    if (row.status === 'PROCESSED' || row.status === 'IGNORED') return { received: true, duplicate: true, status: row.status };
    const event = { ...(row.payload as unknown as NormalizedWebhookEvent) };
    event.occurredAt = new Date(row.payload && (row.payload as { occurredAt?: string }).occurredAt ? (row.payload as { occurredAt: string }).occurredAt : row.receivedAt);

    let outcome: Outcome;
    try {
      outcome = await this.prisma.$transaction((tx) => this.handle(tx, row, event), { timeout: 15_000 });
    } catch (e) {
      const rejected = e instanceof WebhookRejection;
      const message = `${rejected ? 'REJECTED' : 'TRANSIENT'}: ${(e as Error).message}`.slice(0, 1000);
      await this.prisma.paymentWebhookEvent.update({ where: { id: row.id }, data: { status: 'FAILED', lastError: message, attempts: { increment: 1 } } });
      this.logger.warn(`webhook ${row.id} (${row.eventType}) ${message}`);
      if (rejected) return { received: true, status: 'FAILED' as const };
      throw new ServiceUnavailableException('Webhook processing failed; it will be retried');
    }
    await this.prisma.paymentWebhookEvent.update({
      where: { id: row.id },
      data: { status: outcome.status, lastError: outcome.note ?? null, processedAt: new Date(), attempts: { increment: 1 } },
    });
    for (const n of outcome.notify ?? []) await this.notifier.notify(n).catch((e) => this.logger.error(`notify failed: ${(e as Error).message}`));
    if (outcome.afterCommit) await outcome.afterCommit().catch((e) => this.logger.error(`post-commit action failed: ${(e as Error).message}`));
    return { received: true, status: outcome.status };
  }

  async retry(id: string, actor: ActorContext) {
    const row = await this.prisma.paymentWebhookEvent.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Webhook event not found');
    if (row.status !== 'FAILED') throw new UnprocessableEntityException('Only FAILED events can be retried');
    await this.prisma.paymentWebhookEvent.update({ where: { id }, data: { status: 'RECEIVED' } });
    await this.audit.record(actor, 'webhook.retry', 'PaymentWebhookEvent', id, { eventType: row.eventType });
    return this.process(id);
  }

  async list(q: WebhookEventQueryDto) {
    const where: Prisma.PaymentWebhookEventWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.provider ? { provider: q.provider } : {}),
      ...(q.search ? { OR: [{ providerEventId: { contains: q.search } }, { eventType: { contains: q.search } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.paymentWebhookEvent.findMany({
        where,
        select: { id: true, provider: true, providerEventId: true, eventType: true, signatureVerified: true, status: true, attempts: true, lastError: true, receivedAt: true, processedAt: true },
        orderBy: parseSort(q.sort, ['receivedAt', 'status'], { receivedAt: 'desc' }),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.paymentWebhookEvent.count({ where }),
    ]);
    return Paginated.of(items, total, q.page, q.pageSize);
  }

  // ───────────────────────── handlers ─────────────────────────

  private handle(tx: Tx, row: PaymentWebhookEvent, e: NormalizedWebhookEvent): Promise<Outcome> {
    const external = e.attemptReference ? this.external.find((h) => e.attemptReference!.startsWith(h.prefix)) : undefined;
    if (external) return external.handle(tx, row, e);
    switch (e.type) {
      case 'payment.succeeded':
        return this.paymentSucceeded(tx, row, e);
      case 'payment.authorized':
        return this.paymentAuthorized(tx, row, e);
      case 'payment.failed':
      case 'payment.cancelled':
        return this.paymentFailedOrCancelled(tx, row, e);
      case 'refund.succeeded':
      case 'refund.failed':
        return this.refundResult(tx, row, e);
      case 'subscription.charge.succeeded':
        return this.subscriptionCharge(tx, row, e);
      case 'subscription.charge.failed':
        return this.subscriptionChargeFailed(tx, row, e);
      case 'subscription.cancelled':
        return this.subscriptionCancelled(tx, row, e);
      default:
        return Promise.resolve({ status: 'IGNORED', note: 'Unsupported event type' });
    }
  }

  private requireMoney(e: NormalizedWebhookEvent, amount: Prisma.Decimal, currency: string) {
    if (!e.amount || !AMOUNT_PATTERN.test(e.amount) || !e.currency) throw new WebhookRejection('amount/currency missing');
    if (e.currency !== currency || !D(e.amount).eq(amount)) {
      throw new WebhookRejection(`amount mismatch: expected ${amount.toString()} ${currency}, got ${e.amount} ${e.currency}`);
    }
  }

  private settlement(e: NormalizedWebhookEvent) {
    const s = e.settlement;
    const ok = (v?: string) => (v && /^\d{1,12}(\.\d{1,8})?$/.test(v) ? v : undefined);
    return {
      settlementAmount: ok(s?.amount),
      settlementCurrency: s?.currency && /^[A-Z]{3}$/.test(s.currency) ? s.currency : undefined,
      exchangeRate: ok(s?.exchangeRate),
      feeAmount: ok(s?.fee),
    };
  }

  private async findAttempt(tx: Tx, row: PaymentWebhookEvent, e: NormalizedWebhookEvent) {
    if (!e.attemptReference) throw new WebhookRejection('attempt reference missing');
    const attempt = await tx.paymentAttempt.findUnique({ where: { reference: e.attemptReference }, include: { donation: true } });
    if (!attempt || attempt.provider !== row.provider) throw new WebhookRejection('unknown payment attempt');
    if (!attempt.providerSessionRef || e.sessionRef !== attempt.providerSessionRef) throw new WebhookRejection('provider session mismatch');
    return attempt;
  }

  private async paymentSucceeded(tx: Tx, row: PaymentWebhookEvent, e: NormalizedWebhookEvent): Promise<Outcome> {
    const attempt = await this.findAttempt(tx, row, e);
    this.requireMoney(e, attempt.amount, attempt.currency);
    if (!e.paymentRef) throw new WebhookRejection('provider payment reference missing');
    if (attempt.status === 'SUCCEEDED') return { status: 'IGNORED', note: 'attempt already succeeded' };
    const donation = attempt.donation;

    const ledger = {
      donationId: donation.id,
      paymentAttemptId: attempt.id,
      webhookEventId: row.id,
      provider: row.provider,
      providerTransactionRef: e.paymentRef,
      type: 'CAPTURE' as const,
      status: 'SUCCEEDED' as const,
      amount: attempt.amount,
      currency: attempt.currency,
      isTest: attempt.isTest,
      occurredAt: e.occurredAt,
      ...this.settlement(e),
    };

    if ((CONFIRMED as readonly string[]).includes(donation.paymentStatus)) {
      // Real money captured twice (another attempt already paid): record it, never count it, flag for refund review.
      await tx.paymentTransaction.create({ data: ledger });
      await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'SUCCEEDED', providerPaymentRef: e.paymentRef, completedAt: new Date() } });
      return { status: 'FAILED', note: 'REVIEW: duplicate payment captured for an already-paid donation — refund required' };
    }

    await tx.paymentTransaction.create({ data: ledger });
    await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'SUCCEEDED', providerPaymentRef: e.paymentRef, completedAt: new Date(), failureCode: null, failureReason: null } });
    const moved = await tx.donation.updateMany({
      where: { id: donation.id, paymentStatus: { in: ['UNPAID', 'AUTHORIZED', 'FAILED'] } },
      data: { status: 'COMPLETED', paymentStatus: 'PAID', confirmedAt: e.occurredAt },
    });
    if (moved.count !== 1) throw new Error('donation state changed concurrently');

    if (donation.recurringDonationId) {
      const rec = await tx.recurringDonation.findUniqueOrThrow({ where: { id: donation.recurringDonationId } });
      if (rec.providerAgreementRef && e.agreementRef !== rec.providerAgreementRef) throw new WebhookRejection('recurring agreement mismatch');
      await tx.recurringDonation.updateMany({
        where: { id: rec.id, status: { in: ['PENDING_ACTIVATION', 'FAILED'] } },
        data: {
          status: 'ACTIVE',
          providerAgreementRef: rec.providerAgreementRef ?? e.agreementRef,
          startDate: e.occurredAt,
          lastChargedAt: e.occurredAt,
          nextBillingDate: addMonths(e.occurredAt, rec.intervalCount),
          failedAttemptCount: 0,
        },
      });
    }
    const receipt = await this.maybeIssueReceipt(tx, donation.id);
    const n = { reference: donation.reference, donorId: donation.donorId, locale: donation.locale };
    return {
      status: 'PROCESSED',
      notify: [{ type: 'donation.confirmed', ...n }, ...(receipt ? [{ type: 'receipt.available' as const, ...n, data: { receiptNumber: receipt.receiptNumber } }] : [])],
    };
  }

  private async maybeIssueReceipt(tx: Tx, donationId: string) {
    if (!this.config.get('RECEIPTS_AUTO_ISSUE')) return null;
    if (await tx.donationReceipt.count({ where: { donationId, status: 'ISSUED' } })) return null;
    return this.receipts.issueInTx(tx, donationId);
  }

  private async paymentAuthorized(tx: Tx, row: PaymentWebhookEvent, e: NormalizedWebhookEvent): Promise<Outcome> {
    const attempt = await this.findAttempt(tx, row, e);
    this.requireMoney(e, attempt.amount, attempt.currency);
    if (!e.paymentRef) throw new WebhookRejection('provider payment reference missing');
    if (!['CREATED', 'REQUIRES_ACTION'].includes(attempt.status)) return { status: 'IGNORED', note: `attempt is ${attempt.status}` };
    await tx.paymentTransaction.create({
      data: {
        donationId: attempt.donationId, paymentAttemptId: attempt.id, webhookEventId: row.id, provider: row.provider,
        providerTransactionRef: e.paymentRef, type: 'AUTHORIZATION', status: 'SUCCEEDED', amount: attempt.amount,
        currency: attempt.currency, isTest: attempt.isTest, occurredAt: e.occurredAt,
      },
    });
    await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'AUTHORIZED', providerPaymentRef: e.paymentRef } });
    await tx.donation.updateMany({ where: { id: attempt.donationId, paymentStatus: 'UNPAID' }, data: { paymentStatus: 'AUTHORIZED' } });
    return { status: 'PROCESSED' };
  }

  private async paymentFailedOrCancelled(tx: Tx, row: PaymentWebhookEvent, e: NormalizedWebhookEvent): Promise<Outcome> {
    const attempt = await this.findAttempt(tx, row, e);
    const cancelled = e.type === 'payment.cancelled';
    if (attempt.status === 'SUCCEEDED') return { status: 'IGNORED', note: 'late failure after success ignored' };
    if (attempt.status === 'FAILED' || attempt.status === 'CANCELLED') return { status: 'IGNORED', note: 'attempt already closed' };
    await tx.paymentTransaction.create({
      data: {
        donationId: attempt.donationId, paymentAttemptId: attempt.id, webhookEventId: row.id, provider: row.provider,
        providerTransactionRef: e.paymentRef ?? `event:${e.eventId}`, type: cancelled ? 'CANCELLATION' : 'FAILURE', status: 'FAILED',
        amount: attempt.amount, currency: attempt.currency, failureCode: e.failureCode?.slice(0, 80), isTest: attempt.isTest, occurredAt: e.occurredAt,
      },
    });
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: cancelled ? 'CANCELLED' : 'FAILED', failureCode: e.failureCode?.slice(0, 80), failureReason: e.failureReason?.slice(0, 500), completedAt: new Date() },
    });
    const donation = attempt.donation;
    if (!cancelled) {
      await tx.donation.updateMany({ where: { id: donation.id, paymentStatus: { in: ['UNPAID', 'AUTHORIZED'] } }, data: { status: 'FAILED', paymentStatus: 'FAILED' } });
      if (donation.recurringDonationId) {
        await tx.recurringDonation.updateMany({ where: { id: donation.recurringDonationId, status: 'PENDING_ACTIVATION' }, data: { status: 'FAILED' } });
      }
    }
    return {
      status: 'PROCESSED',
      notify: cancelled ? [] : [{ type: 'payment.failed', reference: donation.reference, donorId: donation.donorId, locale: donation.locale }],
    };
  }

  private async refundResult(tx: Tx, row: PaymentWebhookEvent, e: NormalizedWebhookEvent): Promise<Outcome> {
    if (!e.refundReference) throw new WebhookRejection('refund reference missing');
    const refund = await tx.refund.findUnique({ where: { reference: e.refundReference }, include: { donation: true } });
    if (!refund || refund.provider !== row.provider) throw new WebhookRejection('unknown refund');
    if (!refund.providerRefundRef || e.providerRefundRef !== refund.providerRefundRef) throw new WebhookRejection('provider refund reference mismatch');
    if (refund.status === 'SUCCEEDED' || refund.status === 'FAILED') return { status: 'IGNORED', note: `refund already ${refund.status}` };
    if (refund.status !== 'PROCESSING') throw new WebhookRejection(`refund is ${refund.status}, not PROCESSING`);
    const donation = refund.donation;
    const n = { type: 'refund.status' as const, reference: refund.reference, donorId: donation.donorId, locale: donation.locale };

    if (e.type === 'refund.failed') {
      await tx.paymentTransaction.create({
        data: {
          donationId: donation.id, refundId: refund.id, webhookEventId: row.id, provider: row.provider, providerTransactionRef: refund.providerRefundRef,
          type: 'REFUND', status: 'FAILED', amount: refund.amount, currency: refund.currency, failureCode: e.failureCode?.slice(0, 80), isTest: donation.isTest, occurredAt: e.occurredAt,
        },
      });
      await tx.refund.update({ where: { id: refund.id }, data: { status: 'FAILED', failureReason: (e.failureReason ?? e.failureCode ?? 'Provider reported failure').slice(0, 500) } });
      return { status: 'PROCESSED', notify: [{ ...n, data: { status: 'FAILED' } }] };
    }

    this.requireMoney(e, refund.amount, refund.currency);
    const newRefunded = D(donation.refundedAmount).plus(refund.amount);
    if (newRefunded.gt(donation.amount)) throw new WebhookRejection('refund would exceed the donation amount');
    await tx.paymentTransaction.create({
      data: {
        donationId: donation.id, refundId: refund.id, webhookEventId: row.id, provider: row.provider, providerTransactionRef: refund.providerRefundRef,
        type: 'REFUND', status: 'SUCCEEDED', amount: refund.amount, currency: refund.currency, isTest: donation.isTest, occurredAt: e.occurredAt,
      },
    });
    const moved = await tx.refund.updateMany({ where: { id: refund.id, status: 'PROCESSING' }, data: { status: 'SUCCEEDED', completedAt: e.occurredAt } });
    if (moved.count !== 1) throw new Error('refund state changed concurrently');
    await tx.donation.update({
      where: { id: donation.id },
      data: { refundedAmount: newRefunded, paymentStatus: newRefunded.eq(donation.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
    });
    return { status: 'PROCESSED', notify: [{ ...n, data: { status: 'SUCCEEDED' } }] };
  }

  private async findAgreement(tx: Tx, row: PaymentWebhookEvent, e: NormalizedWebhookEvent) {
    if (!e.agreementRef) throw new WebhookRejection('agreement reference missing');
    const rec = await tx.recurringDonation.findUnique({
      where: { provider_providerAgreementRef: { provider: row.provider, providerAgreementRef: e.agreementRef } },
      include: { donor: true },
    });
    if (!rec) throw new WebhookRejection('unknown recurring agreement');
    return rec;
  }

  /** A renewal charge creates a NEW donation (+attempt +ledger row) linked to the recurring donation. */
  private async subscriptionCharge(tx: Tx, row: PaymentWebhookEvent, e: NormalizedWebhookEvent): Promise<Outcome> {
    const rec = await this.findAgreement(tx, row, e);
    if (!e.paymentRef) throw new WebhookRejection('provider payment reference missing');
    const already = await tx.paymentTransaction.findUnique({
      where: { provider_providerTransactionRef_type: { provider: row.provider, providerTransactionRef: e.paymentRef, type: 'CAPTURE' } },
    });
    if (already) return { status: 'IGNORED', note: 'charge already recorded' };
    if (rec.status !== 'ACTIVE' && rec.status !== 'PAST_DUE') throw new WebhookRejection(`REVIEW: charge received for a ${rec.status} recurring donation`);
    this.requireMoney(e, rec.amount, rec.currency);

    const donation = await tx.donation.create({
      data: {
        reference: generateReference('DN'),
        // Renewal donations have no donor-facing link; the token is random and discarded.
        accessTokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
        donorId: rec.donorId,
        amount: rec.amount,
        currency: rec.currency,
        frequency: 'MONTHLY',
        status: 'COMPLETED',
        paymentStatus: 'PAID',
        provider: row.provider,
        isTest: rec.isTest,
        locale: rec.donor.preferredLocale,
        source: 'recurring',
        recurringDonationId: rec.id,
        confirmedAt: e.occurredAt,
        allocations: { create: { designation: rec.designation, campaignId: rec.campaignId, programmeId: rec.programmeId, amount: rec.amount, currency: rec.currency } },
      },
    });
    const attempt = await tx.paymentAttempt.create({
      data: {
        reference: generateReference('PA'), donationId: donation.id, provider: row.provider, providerPaymentRef: e.paymentRef,
        amount: rec.amount, currency: rec.currency, status: 'SUCCEEDED', isTest: rec.isTest, completedAt: new Date(),
      },
    });
    await tx.paymentTransaction.create({
      data: {
        donationId: donation.id, paymentAttemptId: attempt.id, webhookEventId: row.id, provider: row.provider, providerTransactionRef: e.paymentRef,
        type: 'CAPTURE', status: 'SUCCEEDED', amount: rec.amount, currency: rec.currency, isTest: rec.isTest, occurredAt: e.occurredAt, ...this.settlement(e),
      },
    });
    await tx.recurringDonation.update({
      where: { id: rec.id },
      data: { status: 'ACTIVE', lastChargedAt: e.occurredAt, nextBillingDate: addMonths(e.occurredAt, rec.intervalCount), failedAttemptCount: 0 },
    });
    const receipt = await this.maybeIssueReceipt(tx, donation.id);
    const n = { reference: donation.reference, donorId: rec.donorId, locale: rec.donor.preferredLocale };
    return {
      status: 'PROCESSED',
      notify: [{ type: 'donation.confirmed', ...n }, ...(receipt ? [{ type: 'receipt.available' as const, ...n, data: { receiptNumber: receipt.receiptNumber } }] : [])],
    };
  }

  /** Failed renewal: recorded as a FAILED donation (history), never counted. Exceeding the retry policy → FAILED + provider cancel. */
  private async subscriptionChargeFailed(tx: Tx, row: PaymentWebhookEvent, e: NormalizedWebhookEvent): Promise<Outcome> {
    const rec = await this.findAgreement(tx, row, e);
    if (e.paymentRef) {
      const seen = await tx.paymentAttempt.findUnique({ where: { provider_providerPaymentRef: { provider: row.provider, providerPaymentRef: e.paymentRef } } });
      if (seen) return { status: 'IGNORED', note: 'failed charge already recorded' };
    }
    if (rec.status === 'CANCELLED' || rec.status === 'FAILED') return { status: 'IGNORED', note: `recurring donation is ${rec.status}` };
    const donation = await tx.donation.create({
      data: {
        reference: generateReference('DN'),
        accessTokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
        donorId: rec.donorId, amount: rec.amount, currency: rec.currency, frequency: 'MONTHLY', status: 'FAILED', paymentStatus: 'FAILED',
        provider: row.provider, isTest: rec.isTest, locale: rec.donor.preferredLocale, source: 'recurring', recurringDonationId: rec.id,
        allocations: { create: { designation: rec.designation, campaignId: rec.campaignId, programmeId: rec.programmeId, amount: rec.amount, currency: rec.currency } },
      },
    });
    const attempt = await tx.paymentAttempt.create({
      data: {
        reference: generateReference('PA'), donationId: donation.id, provider: row.provider, providerPaymentRef: e.paymentRef ?? null,
        amount: rec.amount, currency: rec.currency, status: 'FAILED', failureCode: e.failureCode?.slice(0, 80), failureReason: e.failureReason?.slice(0, 500),
        isTest: rec.isTest, completedAt: new Date(),
      },
    });
    await tx.paymentTransaction.create({
      data: {
        donationId: donation.id, paymentAttemptId: attempt.id, webhookEventId: row.id, provider: row.provider,
        providerTransactionRef: e.paymentRef ?? `event:${e.eventId}`, type: 'FAILURE', status: 'FAILED', amount: rec.amount,
        currency: rec.currency, failureCode: e.failureCode?.slice(0, 80), isTest: rec.isTest, occurredAt: e.occurredAt,
      },
    });
    const failed = rec.failedAttemptCount + 1;
    const exhausted = failed > rec.maxRetryAttempts;
    await tx.recurringDonation.update({
      where: { id: rec.id },
      data: {
        failedAttemptCount: failed,
        status: exhausted ? 'FAILED' : 'PAST_DUE',
        // Informational next try per retry policy; the provider performs the actual retry.
        nextBillingDate: exhausted ? null : new Date(e.occurredAt.getTime() + this.config.get('RECURRING_RETRY_INTERVAL_DAYS') * 86_400_000),
        ...(exhausted ? { cancelledAt: new Date(), cancelReason: 'Retry policy exhausted' } : {}),
      },
    });
    const adapter = this.registry.get(row.provider);
    return {
      status: 'PROCESSED',
      notify: [{ type: 'recurring.payment_failed', reference: rec.reference, donorId: rec.donorId, locale: rec.donor.preferredLocale }],
      afterCommit: exhausted && adapter.cancelRecurring ? () => adapter.cancelRecurring!(rec.providerAgreementRef!) : undefined,
    };
  }

  private async subscriptionCancelled(tx: Tx, row: PaymentWebhookEvent, e: NormalizedWebhookEvent): Promise<Outcome> {
    const rec = await this.findAgreement(tx, row, e);
    if (rec.status === 'CANCELLED') return { status: 'IGNORED', note: 'already cancelled' };
    await tx.recurringDonation.update({ where: { id: rec.id }, data: { status: 'CANCELLED', cancelledAt: e.occurredAt, cancelReason: 'Cancelled at provider', nextBillingDate: null } });
    return { status: 'PROCESSED' };
  }
}
