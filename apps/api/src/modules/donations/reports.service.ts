import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DonationConfigService } from './donation-config.service';
import { D, ZERO } from './money';
import type { ReportQueryDto } from './donations.dto';

/** A donation counts as confirmed only after a verified provider capture. Pending/failed/cancelled never count. */
export const CONFIRMED_PAYMENT = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;

type Totals = { currency: string; count: number; gross: string; refunded: string; net: string };

/**
 * All money totals are returned PER CURRENCY. Nothing is converted or summed across currencies
 * (no approved exchange-rate source exists). Test/mock-provider records are excluded unless includeTest=true.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: DonationConfigService,
  ) {}

  private base(q: ReportQueryDto): Prisma.DonationWhereInput {
    return {
      ...(q.includeTest === 'true' ? {} : { isTest: false }),
      ...(q.currency ? { currency: q.currency } : {}),
      ...(q.from || q.to ? { confirmedAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
    };
  }

  private confirmedWhere(q: ReportQueryDto): Prisma.DonationWhereInput {
    return { ...this.base(q), paymentStatus: { in: [...CONFIRMED_PAYMENT] }, confirmedAt: { not: null, ...((this.base(q).confirmedAt as object) ?? {}) } };
  }

  private async totals(rows: { currency: string; _count: { _all: number }; _sum: { amount: Prisma.Decimal | null; refundedAmount: Prisma.Decimal | null } }[]): Promise<Totals[]> {
    const minor = await this.config.minorUnitsFn();
    return rows
      .map((r) => {
        const gross = D(r._sum.amount ?? 0);
        const refunded = D(r._sum.refundedAmount ?? 0);
        const m = minor(r.currency);
        return { currency: r.currency, count: r._count._all, gross: gross.toFixed(m), refunded: refunded.toFixed(m), net: gross.minus(refunded).toFixed(m) };
      })
      .sort((a, b) => a.currency.localeCompare(b.currency));
  }

  async summary(q: ReportQueryDto) {
    const where = this.confirmedWhere(q);
    const [byCurrency, byFrequency, byStatus] = await Promise.all([
      this.prisma.donation.groupBy({ by: ['currency'], where, _count: { _all: true }, _sum: { amount: true, refundedAmount: true } }),
      this.prisma.donation.groupBy({ by: ['frequency', 'currency'], where, _count: { _all: true }, _sum: { amount: true, refundedAmount: true } }),
      this.prisma.donation.groupBy({ by: ['status', 'paymentStatus'], where: this.base(q), _count: { _all: true } }),
    ]);
    const minor = await this.config.minorUnitsFn();
    return {
      note: 'Totals are per currency; currencies are never combined. Only verified, confirmed payments are included.',
      confirmed: await this.totals(byCurrency),
      byFrequency: byFrequency.map((r) => ({
        frequency: r.frequency,
        currency: r.currency,
        count: r._count._all,
        gross: D(r._sum.amount ?? 0).toFixed(minor(r.currency)),
        net: D(r._sum.amount ?? 0).minus(r._sum.refundedAmount ?? 0).toFixed(minor(r.currency)),
      })),
      donationsByStatus: byStatus.map((r) => ({ status: r.status, paymentStatus: r.paymentStatus, count: r._count._all })),
    };
  }

  /** Per campaign (and general fund / programme designations) per currency, net of refunds. */
  async byCampaign(q: ReportQueryDto) {
    const allocations = await this.prisma.donationAllocation.findMany({
      where: { donation: this.confirmedWhere(q) },
      select: {
        designation: true, campaignId: true, programmeId: true, amount: true, currency: true,
        donation: { select: { amount: true, refundedAmount: true } },
        campaign: { select: { slug: true, titleEn: true } },
        programme: { select: { slug: true, nameEn: true } },
      },
    });
    const minor = await this.config.minorUnitsFn();
    const acc = new Map<string, { designation: string; campaign: unknown; programme: unknown; currency: string; count: number; gross: Prisma.Decimal; net: Prisma.Decimal }>();
    for (const a of allocations) {
      const key = `${a.designation}|${a.campaignId ?? ''}|${a.designation === 'PROGRAMME' ? (a.programmeId ?? '') : ''}|${a.currency}`;
      // Refunds are pro-rated to the allocation share (exact while each donation has one allocation).
      const share = D(a.amount).div(a.donation.amount);
      const netAlloc = D(a.amount).minus(D(a.donation.refundedAmount).times(share));
      const cur = acc.get(key) ?? { designation: a.designation, campaign: a.campaign, programme: a.designation === 'PROGRAMME' ? a.programme : null, currency: a.currency, count: 0, gross: ZERO, net: ZERO };
      cur.count += 1;
      cur.gross = cur.gross.plus(a.amount);
      cur.net = cur.net.plus(netAlloc);
      acc.set(key, cur);
    }
    return [...acc.values()].map((r) => ({ ...r, gross: r.gross.toFixed(minor(r.currency)), net: r.net.toFixed(minor(r.currency)) }));
  }

  /**
   * Phase 11A — verified totals for ONE programme, per currency, net of refunds (same rules as every other report).
   *
   * Attribution rule (authoritative, set when the donation is created — DonationsService): every donation has exactly ONE
   * allocation, and its `programmeId` is the selected programme (designation PROGRAMME) or the campaign's programme
   * (designation CAMPAIGN). GENERAL_FUND allocations carry no programme. Summing allocations by `programmeId` therefore counts
   * each donation once: a campaign gift counts toward its programme, never twice, and never toward a "cause" (allocations do
   * not record a project). Only verified captures (CONFIRMED_PAYMENT + confirmedAt), never test records. Gala ticket money
   * lives in EventBooking*, never in Donation, so it can never appear here.
   */
  async programmeTotals(programmeId: string): Promise<Totals[]> {
    const allocations = await this.prisma.donationAllocation.findMany({
      where: { programmeId, donation: this.confirmedWhere({} as ReportQueryDto) },
      select: { amount: true, currency: true, donation: { select: { id: true, amount: true, refundedAmount: true } } },
    });
    const minor = await this.config.minorUnitsFn();
    const acc = new Map<string, { donations: Set<string>; gross: Prisma.Decimal; net: Prisma.Decimal; refunded: Prisma.Decimal }>();
    for (const a of allocations) {
      const share = D(a.amount).div(a.donation.amount);
      const refundedShare = D(a.donation.refundedAmount).times(share);
      const cur = acc.get(a.currency) ?? { donations: new Set<string>(), gross: ZERO, net: ZERO, refunded: ZERO };
      cur.donations.add(a.donation.id);
      cur.gross = cur.gross.plus(a.amount);
      cur.refunded = cur.refunded.plus(refundedShare);
      cur.net = cur.net.plus(D(a.amount).minus(refundedShare));
      acc.set(a.currency, cur);
    }
    return [...acc.entries()]
      .map(([currency, r]) => ({ currency, count: r.donations.size, gross: r.gross.toFixed(minor(currency)), refunded: r.refunded.toFixed(minor(currency)), net: r.net.toFixed(minor(currency)) }))
      .sort((a, b) => a.currency.localeCompare(b.currency));
  }

  async campaignTotals(campaignId: string, q: ReportQueryDto) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true, slug: true, titleEn: true, currency: true, targetAmount: true } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    const rows = (await this.byCampaign(q)).filter((r) => (r.campaign as { slug?: string } | null)?.slug === campaign.slug);
    return { campaign: { ...campaign, targetAmount: campaign.targetAmount?.toString() ?? null }, totals: rows.map(({ currency, count, gross, net }) => ({ currency, count, gross, net })) };
  }

  async byDate(q: ReportQueryDto) {
    const where = this.confirmedWhere(q);
    const rows = await this.prisma.donation.findMany({ where, select: { confirmedAt: true, currency: true, amount: true, refundedAmount: true } });
    const minor = await this.config.minorUnitsFn();
    const acc = new Map<string, { date: string; currency: string; count: number; gross: Prisma.Decimal; net: Prisma.Decimal }>();
    for (const r of rows) {
      const date = r.confirmedAt!.toISOString().slice(0, 10); // UTC day
      const key = `${date}|${r.currency}`;
      const cur = acc.get(key) ?? { date, currency: r.currency, count: 0, gross: ZERO, net: ZERO };
      cur.count += 1;
      cur.gross = cur.gross.plus(r.amount);
      cur.net = cur.net.plus(D(r.amount).minus(r.refundedAmount));
      acc.set(key, cur);
    }
    return [...acc.values()].sort((a, b) => a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency)).map((r) => ({ ...r, gross: r.gross.toFixed(minor(r.currency)), net: r.net.toFixed(minor(r.currency)) }));
  }

  async payments(q: ReportQueryDto) {
    const rows = await this.prisma.paymentAttempt.groupBy({
      by: ['status', 'currency'],
      where: { ...(q.includeTest === 'true' ? {} : { isTest: false }), ...(q.currency ? { currency: q.currency } : {}), ...(q.from || q.to ? { initiatedAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}) },
      _count: { _all: true },
    });
    return rows.map((r) => ({ status: r.status, currency: r.currency, count: r._count._all }));
  }

  async refunds(q: ReportQueryDto) {
    const rows = await this.prisma.refund.groupBy({
      by: ['status', 'currency'],
      where: { ...(q.includeTest === 'true' ? {} : { donation: { isTest: false } }), ...(q.currency ? { currency: q.currency } : {}) },
      _count: { _all: true },
      _sum: { amount: true },
    });
    const minor = await this.config.minorUnitsFn();
    return rows.map((r) => ({ status: r.status, currency: r.currency, count: r._count._all, amount: D(r._sum.amount ?? 0).toFixed(minor(r.currency)) }));
  }

  async recurring(q: ReportQueryDto) {
    const rows = await this.prisma.recurringDonation.groupBy({
      by: ['status', 'currency'],
      where: { ...(q.includeTest === 'true' ? {} : { isTest: false }), ...(q.currency ? { currency: q.currency } : {}) },
      _count: { _all: true },
      _sum: { amount: true },
    });
    const minor = await this.config.minorUnitsFn();
    return rows.map((r) => ({ status: r.status, currency: r.currency, count: r._count._all, monthlyAmount: D(r._sum.amount ?? 0).toFixed(minor(r.currency)) }));
  }
}
