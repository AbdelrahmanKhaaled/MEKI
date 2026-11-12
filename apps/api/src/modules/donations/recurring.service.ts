import { BadGatewayException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { RecurringStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { ActorContext } from '../../common/types/auth-request';
import { Paginated, parseSort } from '../../common/utils';
import { PaymentProviderRegistry } from './payments/payment-provider.registry';
import { DONATION_NOTIFIER, type DonationNotifier } from './donation-notifier';
import type { RecurringQueryDto } from './donations.dto';

const TRANSITIONS: Record<'pause' | 'resume' | 'cancel', RecurringStatus[]> = {
  pause: ['ACTIVE', 'PAST_DUE'],
  resume: ['PAUSED'],
  cancel: ['PENDING_ACTIVATION', 'ACTIVE', 'PAUSED', 'PAST_DUE'],
};

/**
 * Recurring donations are never "charged" by MEKI: the provider bills the agreement and reports each charge by
 * verified webhook (WebhooksService). Pause/resume/cancel are only applied after the provider call succeeds,
 * and are refused when the provider does not support them.
 */
@Injectable()
export class RecurringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: PaymentProviderRegistry,
    @Inject(DONATION_NOTIFIER) private readonly notifier: DonationNotifier,
  ) {}

  async list(q: RecurringQueryDto) {
    const where: Prisma.RecurringDonationWhereInput = {
      ...(q.includeTest === 'true' ? {} : { isTest: false }),
      ...(q.status ? { status: q.status } : {}),
      ...(q.currency ? { currency: q.currency } : {}),
      ...(q.search ? { reference: { contains: q.search.toUpperCase() } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.recurringDonation.findMany({ where, orderBy: parseSort(q.sort, ['createdAt', 'nextBillingDate', 'status'], { createdAt: 'desc' }), skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.recurringDonation.count({ where }),
    ]);
    return Paginated.of(items.map((r) => ({ ...r, amount: r.amount.toString() })), total, q.page, q.pageSize);
  }

  async get(id: string) {
    const r = await this.prisma.recurringDonation.findUnique({
      where: { id },
      include: {
        campaign: { select: { id: true, slug: true, titleEn: true } },
        programme: { select: { id: true, slug: true, nameEn: true } },
        donations: { orderBy: { createdAt: 'asc' }, select: { id: true, reference: true, amount: true, currency: true, status: true, paymentStatus: true, confirmedAt: true, createdAt: true } },
      },
    });
    if (!r) throw new NotFoundException('Recurring donation not found');
    return { ...r, amount: r.amount.toString(), paymentHistory: r.donations.map((d) => ({ ...d, amount: d.amount.toString() })), donations: undefined };
  }

  async change(id: string, action: 'pause' | 'resume' | 'cancel', reason: string | undefined, actor: ActorContext) {
    const rec = await this.prisma.recurringDonation.findUnique({ where: { id }, include: { donor: { select: { preferredLocale: true } } } });
    if (!rec) throw new NotFoundException('Recurring donation not found');
    if (!TRANSITIONS[action].includes(rec.status)) {
      throw new UnprocessableEntityException({ message: `Cannot ${action} a ${rec.status} recurring donation`, code: 'INVALID_TRANSITION' });
    }
    const adapter = this.registry.get(rec.provider);
    const method = action === 'pause' ? adapter.pauseRecurring : action === 'resume' ? adapter.resumeRecurring : adapter.cancelRecurring;
    if (!method || (action !== 'cancel' && !adapter.capabilities.pauseRecurring)) {
      throw new UnprocessableEntityException({ message: `The payment provider does not support ${action}`, code: 'NOT_SUPPORTED_BY_PROVIDER' });
    }
    if (rec.providerAgreementRef) {
      try {
        await method.call(adapter, rec.providerAgreementRef);
      } catch (e) {
        throw new BadGatewayException({ message: `Provider could not ${action} the agreement: ${(e as Error).message}`, code: 'PROVIDER_ERROR' });
      }
    }
    const data: Prisma.RecurringDonationUpdateInput =
      action === 'pause'
        ? { status: 'PAUSED', pausedAt: new Date() }
        : action === 'resume'
          ? { status: 'ACTIVE', pausedAt: null }
          : { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason ?? 'Cancelled by administrator', nextBillingDate: null };
    await this.prisma.recurringDonation.update({ where: { id }, data });
    await this.audit.record(actor, `recurring.${action}`, 'RecurringDonation', id, { reason });
    await this.notifier.notify({ type: 'recurring.reminder', reference: rec.reference, donorId: rec.donorId, locale: rec.donor.preferredLocale, data: { change: action } });
    return this.get(id);
  }

  /**
   * Hook for a future scheduler: donors due in `days` days get a reminder. Returns references only.
   * (No scheduler/queue is installed in Phase 3.)
   */
  async sendUpcomingReminders(days = 3) {
    const until = new Date(Date.now() + days * 86_400_000);
    const due = await this.prisma.recurringDonation.findMany({
      where: { status: 'ACTIVE', isTest: false, nextBillingDate: { lte: until, gte: new Date() } },
      include: { donor: { select: { preferredLocale: true } } },
    });
    for (const r of due) await this.notifier.notify({ type: 'recurring.reminder', reference: r.reference, donorId: r.donorId, locale: r.donor.preferredLocale });
    return due.map((r) => r.reference);
  }
}
