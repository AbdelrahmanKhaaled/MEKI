import { BadGatewayException, ForbiddenException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { ActorContext } from '../../common/types/auth-request';
import { Paginated, parseSort } from '../../common/utils';
import { D, decimalPlaces, formatAmount, generateReference } from './money';
import { PaymentProviderRegistry } from './payments/payment-provider.registry';
import type { RefundQueryDto } from './donations.dto';

const OPEN = ['REQUESTED', 'APPROVED', 'PROCESSING'] as const;

/**
 * REQUESTED → (APPROVED | REJECTED) → PROCESSING → (SUCCEEDED | FAILED)
 * Four-eyes: the approver must differ from the requester. SUCCEEDED/FAILED are set ONLY by verified provider
 * events (WebhooksService); the original donation and ledger are never rewritten — a REFUND ledger row is added.
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: PaymentProviderRegistry,
  ) {}

  async request(donationId: string, amount: string, reason: string, actor: ActorContext) {
    const donation = await this.prisma.donation.findUnique({ where: { id: donationId }, include: { refunds: { where: { status: { in: [...OPEN] } } } } });
    if (!donation) throw new NotFoundException('Donation not found');
    if (!['PAID', 'PARTIALLY_REFUNDED'].includes(donation.paymentStatus)) {
      throw new UnprocessableEntityException({ message: 'Only confirmed, not fully refunded donations can be refunded', code: 'NOT_REFUNDABLE' });
    }
    const currency = await this.prisma.currency.findUnique({ where: { code: donation.currency } });
    if (decimalPlaces(amount) > (currency?.minorUnits ?? 2)) throw new UnprocessableEntityException({ message: 'Too many decimal places for this currency', code: 'INVALID_AMOUNT_PRECISION' });
    const value = D(amount);
    if (value.lte(0)) throw new UnprocessableEntityException('Refund amount must be greater than zero');
    const pending = donation.refunds.reduce((acc, r) => acc.plus(r.amount), D(0));
    const refundable = D(donation.amount).minus(donation.refundedAmount).minus(pending);
    if (value.gt(refundable)) {
      throw new UnprocessableEntityException({
        message: 'Refund exceeds the refundable balance',
        code: 'REFUND_EXCEEDS_BALANCE',
        details: { refundable: formatAmount(refundable, currency?.minorUnits ?? 2), currency: donation.currency },
      });
    }
    const provider = donation.provider ? await this.prisma.paymentProvider.findUnique({ where: { code: donation.provider } }) : null;
    if (!provider?.supportsRefunds) throw new UnprocessableEntityException({ message: 'The payment provider does not support refunds', code: 'REFUNDS_NOT_SUPPORTED' });
    if (!value.eq(D(donation.amount).minus(donation.refundedAmount)) && !provider.supportsPartialRefund) {
      throw new UnprocessableEntityException({ message: 'The payment provider does not support partial refunds', code: 'PARTIAL_REFUNDS_NOT_SUPPORTED' });
    }
    const refund = await this.prisma.refund.create({
      data: { reference: generateReference('RF'), donationId, amount: value, currency: donation.currency, reason, requestedById: actor.userId, provider: donation.provider },
    });
    await this.audit.record(actor, 'refund.request', 'Refund', refund.id, { donationId, amount: value.toString(), currency: donation.currency });
    return this.get(refund.id);
  }

  async decide(id: string, approve: boolean, note: string | undefined, actor: ActorContext) {
    const refund = await this.get(id);
    if (refund.status !== 'REQUESTED') throw new UnprocessableEntityException({ message: `Refund is ${refund.status}`, code: 'INVALID_REFUND_STATE' });
    if (refund.requestedById === actor.userId) throw new ForbiddenException({ message: 'A refund must be approved by someone other than the requester', code: 'FOUR_EYES_REQUIRED' });
    const moved = await this.prisma.refund.updateMany({
      where: { id, status: 'REQUESTED' },
      data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: actor.userId, decisionNote: note, decidedAt: new Date() },
    });
    if (moved.count !== 1) throw new UnprocessableEntityException('Refund changed concurrently');
    await this.audit.record(actor, approve ? 'refund.approve' : 'refund.reject', 'Refund', id, { note });
    return this.get(id);
  }

  /** Sends an APPROVED refund to the provider. The result stays PROCESSING until a verified provider event. */
  async execute(id: string, actor: ActorContext) {
    const refund = await this.get(id);
    if (refund.status !== 'APPROVED') throw new UnprocessableEntityException({ message: `Refund is ${refund.status}`, code: 'INVALID_REFUND_STATE' });
    const capture = await this.prisma.paymentTransaction.findFirst({
      where: { donationId: refund.donationId, type: 'CAPTURE', status: 'SUCCEEDED' },
      orderBy: { occurredAt: 'asc' },
    });
    if (!capture || !refund.provider) throw new UnprocessableEntityException('No captured payment found for this donation');
    const adapter = this.registry.get(refund.provider);
    const locked = await this.prisma.refund.updateMany({ where: { id, status: 'APPROVED' }, data: { status: 'PROCESSING', executedById: actor.userId, executedAt: new Date() } });
    if (locked.count !== 1) throw new UnprocessableEntityException('Refund changed concurrently');
    try {
      const minor = (await this.prisma.currency.findUnique({ where: { code: refund.currency } }))?.minorUnits ?? 2;
      const result = await adapter.refund({
        providerPaymentRef: capture.providerTransactionRef,
        amount: formatAmount(refund.amount, minor)!,
        currency: refund.currency,
        refundReference: refund.reference,
        reason: refund.reason,
      });
      await this.prisma.refund.update({ where: { id }, data: { providerRefundRef: result.providerRefundRef } });
    } catch (e) {
      // Provider rejected or was unreachable: back to APPROVED so it can be retried; nothing was refunded.
      await this.prisma.refund.update({ where: { id }, data: { status: 'APPROVED', failureReason: (e as Error).message.slice(0, 500) } });
      this.logger.error(`refund execute failed ${refund.reference}: ${(e as Error).message}`);
      throw new BadGatewayException({ message: 'The payment provider could not process the refund', code: 'PROVIDER_ERROR' });
    }
    await this.audit.record(actor, 'refund.execute', 'Refund', id, { provider: refund.provider });
    return this.get(id);
  }

  async get(id: string) {
    const r = await this.prisma.refund.findUnique({
      where: { id },
      include: { donation: { select: { reference: true, amount: true, refundedAmount: true, currency: true } }, requestedBy: { select: { id: true, name: true } }, decidedBy: { select: { id: true, name: true } } },
    });
    if (!r) throw new NotFoundException('Refund not found');
    return { ...r, amount: r.amount.toString(), donation: { ...r.donation, amount: r.donation.amount.toString(), refundedAmount: r.donation.refundedAmount.toString() } };
  }

  async list(q: RefundQueryDto) {
    const where: Prisma.RefundWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.donationId ? { donationId: q.donationId } : {}),
      ...(q.search ? { reference: { contains: q.search.toUpperCase() } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      // Phase 6B (additive, read-only): the donation reference and test flag let the admin list link to the donation and
      // badge refunds of test-provider donations. No filtering or refund behaviour changes.
      this.prisma.refund.findMany({
        where,
        include: { donation: { select: { reference: true, isTest: true } } },
        orderBy: parseSort(q.sort, ['requestedAt', 'status', 'amount'], { requestedAt: 'desc' }),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.refund.count({ where }),
    ]);
    return Paginated.of(items.map((r) => ({ ...r, amount: r.amount.toString() })), total, q.page, q.pageSize);
  }
}
