import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { DonationConfigService } from '../donations/donation-config.service';
import { D, ZERO } from '../donations/money';
import { ReportsService } from '../donations/reports.service';
import type { ReportQueryDto } from '../donations/donations.dto';
import { ProgrammesService } from '../programmes/programmes.service';
import { StatisticsService } from '../statistics/statistics.module';

type PublicMedia = { url: string; width: number | null; height: number | null; altEn: string | null; altAr: string | null; captionEn?: string | null; captionAr?: string | null };
type GuardedMedia = PublicMedia & { deletedAt: Date | null; provenance: string; consentStatus: string };

/** A media item is public only if it is not deleted, not DEMO and its consent was not explicitly refused. */
const publicMedia = (m: GuardedMedia | null | undefined): PublicMedia | null =>
  m && !m.deletedAt && m.provenance !== 'DEMO' && m.consentStatus !== 'NOT_GRANTED'
    ? { url: m.url, width: m.width, height: m.height, altEn: m.altEn, altAr: m.altAr, captionEn: m.captionEn ?? null, captionAr: m.captionAr ?? null }
    : null;

/**
 * Phase 11A — everything the single programme page needs, in ONE public response.
 *
 * Fundraising rules (no figure is ever invented):
 *  - goal      = Programme.targetAmount/targetCurrency, an MEKI-approved figure; null → no progress is computed at all
 *                (never a derived sum of campaign targets, never "100 %" for missing data).
 *  - collected = ReportsService.programmeTotals: verified captures only, never test records, net of refunds, per currency,
 *                each donation counted once (allocation-level attribution — see that method).
 *  - remaining = max(goal − collected, 0) in the goal's currency; percent = collected / goal × 100 (exact decimals, 1 dp).
 *  - currencies are never combined: collections in other currencies are listed separately and never enter the progress.
 * Campaign figures use the same verified source (ReportsService.byCampaign) and only count toward a campaign progress when
 * the campaign has an approved target in the same currency.
 */
@Injectable()
export class ProgrammeDetailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly programmes: ProgrammesService,
    private readonly campaigns: CampaignsService,
    private readonly stats: StatisticsService,
    private readonly reports: ReportsService,
    private readonly donationConfig: DonationConfigService,
  ) {}

  private progress(goal: Prisma.Decimal, collected: Prisma.Decimal, minor: number) {
    const remaining = goal.minus(collected);
    return {
      goal: goal.toFixed(minor),
      collected: collected.toFixed(minor),
      remaining: (remaining.isNegative() ? ZERO : remaining).toFixed(minor),
      percent: collected.div(goal).times(100).toDecimalPlaces(1, Prisma.Decimal.ROUND_DOWN).toFixed(1),
    };
  }

  async detail(slug: string) {
    // Both lookups enforce PUBLISHED + not DEMO + not deleted (404 otherwise).
    const programme = await this.programmes.getPublishedBySlug(slug);
    const record = await this.programmes.publicProgrammeRecord(slug);
    const minor = await this.donationConfig.minorUnitsFn();

    const [causes, campaigns, stats, totals, campaignRows] = await Promise.all([
      this.programmes.publicCauses(record.id),
      this.campaigns.listPublished({ programmeSlug: slug }),
      this.stats.listPublished(),
      this.reports.programmeTotals(record.id),
      this.reports.byCampaign({} as ReportQueryDto),
    ]);

    // Campaign → cause (project) mapping, read from the authoritative relation.
    const campaignIds = campaigns.map((c) => c.id);
    const links = campaignIds.length
      ? await this.prisma.campaign.findMany({ where: { id: { in: campaignIds } }, select: { id: true, projectId: true } })
      : [];
    const causeOf = new Map(links.map((l) => [l.id, l.projectId]));
    const publicCauseIds = new Set(causes.map((c) => c.id));

    const campaignView = (c: (typeof campaigns)[number]) => {
      const verified = campaignRows.filter((r) => r.designation === 'CAMPAIGN' && (r.campaign as { slug?: string } | null)?.slug === c.slug);
      const sameCurrency = verified.find((r) => r.currency === c.currency);
      const target = c.targetAmount ? D(c.targetAmount) : null;
      const collected = sameCurrency ? D(sameCurrency.net) : ZERO;
      return {
        ...c,
        fundraising: {
          collected: verified.map((r) => ({ currency: r.currency, net: r.net, donations: r.count })),
          progress: target && target.greaterThan(0) ? { currency: c.currency, ...this.progress(target, collected, minor(c.currency)) } : null,
        },
      };
    };

    const goal = record.targetAmount && record.targetCurrency && D(record.targetAmount).greaterThan(0) ? { amount: D(record.targetAmount), currency: record.targetCurrency } : null;
    const inGoalCurrency = goal ? totals.find((t) => t.currency === goal.currency) : undefined;

    return {
      programme: {
        ...programme,
        cover: publicMedia(record.coverMedia),
        gallery: record.gallery.map((m) => publicMedia(m)).filter((m): m is PublicMedia => m !== null),
      },
      fundraising: {
        goal: goal ? { amount: goal.amount.toFixed(minor(goal.currency)), currency: goal.currency } : null,
        progress: goal ? { currency: goal.currency, donations: inGoalCurrency?.count ?? 0, ...this.progress(goal.amount, D(inGoalCurrency?.net ?? 0), minor(goal.currency)) } : null,
        /** Verified net collections per currency (all currencies; never summed across currencies). */
        collected: totals.map((t) => ({ currency: t.currency, net: t.net, donations: t.count })),
        note: 'Verified, provider-confirmed donations only (test records excluded), net of refunds, per currency. Progress only against an MEKI-approved goal.',
      },
      causes: causes.map((c) => ({
        slug: c.slug,
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        summaryEn: c.summaryEn,
        summaryAr: c.summaryAr,
        descriptionEn: c.descriptionEn,
        descriptionAr: c.descriptionAr,
        locationEn: c.locationEn,
        locationAr: c.locationAr,
        cover: publicMedia(c.coverMedia),
        campaigns: campaigns.filter((k) => causeOf.get(k.id) === c.id).map(campaignView),
      })),
      /** Approved campaigns of this programme that are not under a published cause. */
      otherCampaigns: campaigns.filter((k) => !publicCauseIds.has(causeOf.get(k.id) ?? '')).map(campaignView),
      statistics: stats.filter((s) => s.programmeSlug === slug),
    };
  }
}
