import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { SettingsService } from '../settings/settings.module';
import { PublishRuleViolation, PublishingPolicy } from '../../common/publishing/publishing.policy';
import type { ActorContext } from '../../common/types/auth-request';
import { defined, Paginated, parseSort, slugify } from '../../common/utils';
import { CAMPAIGN_TRANSITIONS, type CampaignAction, campaignPublishBlockers, canTransition } from './campaign.rules';
import type { CampaignQueryDto, CreateCampaignDto, UpdateCampaignDto } from './campaigns.dto';

const include = {
  programme: { select: { id: true, slug: true, nameEn: true, nameAr: true, status: true } },
  project: { select: { id: true, code: true, nameEn: true, nameAr: true, sourceFolder: true } },
  coverMedia: true,
  gallery: { orderBy: { sortOrder: 'asc' }, include: { media: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.CampaignInclude;

type CampaignFull = Prisma.CampaignGetPayload<{ include: typeof include }>;

const PUBLIC_STATUSES = ['PUBLISHED', 'PAUSED', 'COMPLETED'] as const;

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly policy: PublishingPolicy,
    private readonly settings: SettingsService,
    private readonly config: AppConfigService,
  ) {}

  private present(c: CampaignFull) {
    return {
      ...c,
      coverMedia: this.media.present(c.coverMedia),
      gallery: c.gallery.filter((g) => !g.media.deletedAt).map((g) => ({ sortOrder: g.sortOrder, media: this.media.present(g.media) })),
    };
  }

  async list(q: CampaignQueryDto) {
    const where: Prisma.CampaignWhereInput = {
      deletedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.programmeId ? { programmeId: q.programmeId } : {}),
      ...(q.provenance ? { provenance: q.provenance } : {}),
      ...(q.isFeatured ? { isFeatured: q.isFeatured === 'true' } : {}),
      ...(q.projectId ? { projectId: q.projectId } : {}),
      ...(q.startsFrom || q.startsTo ? { startsAt: { ...(q.startsFrom ? { gte: new Date(q.startsFrom) } : {}), ...(q.startsTo ? { lte: new Date(q.startsTo) } : {}) } } : {}),
      ...(q.search ? { OR: [{ titleEn: { contains: q.search } }, { titleAr: { contains: q.search } }, { slug: { contains: q.search } }, { code: { contains: q.search } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({
        where,
        include,
        orderBy: parseSort(q.sort, ['sortOrder', 'titleEn', 'createdAt', 'updatedAt', 'status', 'startsAt'], { sortOrder: 'asc' }),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.campaign.count({ where }),
    ]);
    return Paginated.of(items.map((c) => this.present(c)), total, q.page, q.pageSize);
  }

  async get(id: string) {
    const c = await this.prisma.campaign.findFirst({ where: { id, deletedAt: null }, include });
    if (!c) throw new NotFoundException('Campaign not found');
    return this.present(c);
  }

  /**
   * `current` = the stored campaign on update. Phase 6C hierarchy rule (Programme → Cause/project → Campaign): when a campaign
   * is linked to a project that belongs to a programme, the campaign must belong to that same programme.
   */
  private async validateRefs(dto: Partial<CreateCampaignDto>, current?: { programmeId: string | null; projectId: string | null }) {
    await this.media.assertExists([dto.coverMediaId]);
    if (dto.programmeId) {
      const ok = await this.prisma.programme.count({ where: { id: dto.programmeId, deletedAt: null } });
      if (!ok) throw new BadRequestException('programmeId is invalid');
    }
    if (dto.projectId) {
      const ok = await this.prisma.project.count({ where: { id: dto.projectId, deletedAt: null } });
      if (!ok) throw new BadRequestException('projectId is invalid');
    }
    const programmeId = dto.programmeId !== undefined ? dto.programmeId : (current?.programmeId ?? null);
    const projectId = dto.projectId !== undefined ? dto.projectId : (current?.projectId ?? null);
    if (projectId && (dto.programmeId !== undefined || dto.projectId !== undefined)) {
      const project = await this.prisma.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { programmeId: true } });
      if (project?.programmeId && project.programmeId !== programmeId) {
        throw new UnprocessableEntityException({ message: 'The selected project belongs to a different programme', code: 'PROJECT_PROGRAMME_MISMATCH' });
      }
    }
  }

  private assertAmounts(min?: number | null, max?: number | null, starts?: string | Date | null, ends?: string | Date | null) {
    if (min != null && max != null && min > max) throw new UnprocessableEntityException('minCustomAmount must not exceed maxCustomAmount');
    if (starts && ends && new Date(ends) <= new Date(starts)) throw new UnprocessableEntityException('endsAt must be after startsAt');
  }

  async create(dto: CreateCampaignDto, actor: ActorContext) {
    await this.validateRefs(dto);
    this.assertAmounts(dto.minCustomAmount, dto.maxCustomAmount, dto.startsAt, dto.endsAt);
    const slug = dto.slug ?? slugify(dto.titleEn);
    if (!slug) throw new BadRequestException('A slug is required');
    const c = await this.prisma.campaign.create({
      data: {
        ...defined(dto),
        slug,
        suggestedAmounts: dto.suggestedAmounts ? [...dto.suggestedAmounts].sort((a, b) => a - b) : undefined,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        status: 'DRAFT',
        donationsOpen: false,
        createdById: actor.userId,
        updatedById: actor.userId,
      },
    });
    await this.audit.record(actor, 'campaign.create', 'Campaign', c.id, { code: c.code, provenance: c.provenance });
    return this.get(c.id);
  }

  async update(id: string, dto: UpdateCampaignDto, actor: ActorContext) {
    const current = await this.get(id);
    if (current.status === 'ARCHIVED') throw new UnprocessableEntityException('Archived campaigns cannot be edited');
    await this.validateRefs(dto, current);
    this.assertAmounts(
      dto.minCustomAmount ?? current.minCustomAmount?.toNumber(),
      dto.maxCustomAmount ?? current.maxCustomAmount?.toNumber(),
      dto.startsAt === undefined ? current.startsAt : dto.startsAt,
      dto.endsAt === undefined ? current.endsAt : dto.endsAt,
    );
    // Financial terms of an approved campaign changing => approval must be re-recorded.
    const financialChange = dto.targetAmount !== undefined || dto.currency !== undefined || dto.provenance !== undefined;
    const resetApproval = financialChange && !!current.approvedAt;
    if (resetApproval && (current.status === 'PUBLISHED' || current.status === 'PAUSED')) {
      throw new UnprocessableEntityException({
        message: 'Target, currency or provenance of a live campaign cannot change. Unpublish it first.',
        code: 'LIVE_CAMPAIGN_FINANCIAL_CHANGE',
      });
    }
    await this.prisma.campaign.update({
      where: { id },
      data: {
        ...defined(dto),
        suggestedAmounts: dto.suggestedAmounts ? [...dto.suggestedAmounts].sort((a, b) => a - b) : undefined,
        startsAt: dto.startsAt === undefined ? undefined : dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt === undefined ? undefined : dto.endsAt ? new Date(dto.endsAt) : null,
        ...(resetApproval ? { approvedAt: null, approvedById: null, approvalNote: null } : {}),
        updatedById: actor.userId,
      },
    });
    await this.audit.record(actor, 'campaign.update', 'Campaign', id, { fields: AuditService.changedFields(dto), approvalReset: resetApproval });
    return this.get(id);
  }

  async setGallery(id: string, mediaIds: string[], actor: ActorContext) {
    await this.get(id);
    await this.media.assertExists(mediaIds);
    await this.prisma.$transaction([
      this.prisma.campaignMedia.deleteMany({ where: { campaignId: id } }),
      this.prisma.campaignMedia.createMany({ data: mediaIds.map((mediaId, i) => ({ campaignId: id, mediaId, sortOrder: i })) }),
    ]);
    await this.audit.record(actor, 'campaign.gallery_update', 'Campaign', id, { mediaIds });
    return this.get(id);
  }

  /** Records MEKI's approval (who/when/reference). Required before publishing. */
  async approve(id: string, note: string, actor: ActorContext) {
    const c = await this.get(id);
    if (c.provenance === 'DEMO') throw new PublishRuleViolation('DEMO campaigns cannot be approved', 'DEMO_NOT_PUBLISHABLE');
    if (c.status === 'ARCHIVED' || c.status === 'COMPLETED') throw new UnprocessableEntityException('Campaign is closed');
    await this.prisma.campaign.update({ where: { id }, data: { approvedAt: new Date(), approvedById: actor.userId, approvalNote: note, updatedById: actor.userId } });
    await this.audit.record(actor, 'campaign.approve', 'Campaign', id, { note });
    return this.get(id);
  }

  async revokeApproval(id: string, actor: ActorContext) {
    const c = await this.get(id);
    if (c.status === 'PUBLISHED' || c.status === 'PAUSED') throw new UnprocessableEntityException('Unpublish the campaign before revoking approval');
    await this.prisma.campaign.update({ where: { id }, data: { approvedAt: null, approvedById: null, approvalNote: null, updatedById: actor.userId } });
    await this.audit.record(actor, 'campaign.approval_revoked', 'Campaign', id);
    return this.get(id);
  }

  async transition(id: string, action: CampaignAction, actor: ActorContext) {
    const c = await this.get(id);
    if (!canTransition(action, c.status)) {
      throw new UnprocessableEntityException({ message: `Cannot ${action} a campaign in status ${c.status}`, code: 'INVALID_TRANSITION' });
    }
    const to = CAMPAIGN_TRANSITIONS[action].to;
    if (to === 'PUBLISHED') {
      const blockers = campaignPublishBlockers(
        {
          status: c.status,
          provenance: c.provenance,
          approvedAt: c.approvedAt,
          titleEn: c.titleEn,
          summaryEn: c.summaryEn,
          programmeId: c.programmeId,
          programmePublished: c.programme?.status === 'PUBLISHED',
          startsAt: c.startsAt,
          endsAt: c.endsAt,
        },
        { allowDemo: !this.config.isProduction && this.config.get('ALLOW_DEMO_PUBLISH') },
      );
      if (blockers.length) throw new PublishRuleViolation('Campaign cannot be published', 'CAMPAIGN_NOT_PUBLISHABLE', { reasons: blockers });
    }
    await this.prisma.campaign.update({
      where: { id },
      data: {
        status: to,
        ...(to === 'PUBLISHED' && !c.publishedAt ? { publishedAt: new Date() } : {}),
        // Leaving PUBLISHED always closes donations.
        ...(to !== 'PUBLISHED' ? { donationsOpen: false } : {}),
        updatedById: actor.userId,
      },
    });
    await this.audit.record(actor, `campaign.${action}`, 'Campaign', id, { from: c.status, to });
    return this.get(id);
  }

  /** Opening donations requires: published campaign + server payment config + DonationSetting.paymentsEnabled. */
  async setDonationsOpen(id: string, open: boolean, actor: ActorContext) {
    const c = await this.get(id);
    if (open) {
      const donation = await this.settings.getDonation();
      if (!donation.paymentsEffective) {
        throw new UnprocessableEntityException({ message: 'Online payments are not enabled for this platform', code: 'PAYMENTS_DISABLED' });
      }
      if (c.status !== 'PUBLISHED') throw new UnprocessableEntityException('Only published campaigns can accept donations');
    }
    await this.prisma.campaign.update({ where: { id }, data: { donationsOpen: open, updatedById: actor.userId } });
    await this.audit.record(actor, open ? 'campaign.donations_open' : 'campaign.donations_close', 'Campaign', id);
    return this.get(id);
  }

  async remove(id: string, actor: ActorContext) {
    const c = await this.get(id);
    if (c.status === 'PUBLISHED' || c.status === 'PAUSED') throw new UnprocessableEntityException('Unpublish the campaign before deleting it');
    const suffix = `-deleted-${Date.now().toString(36)}`;
    await this.prisma.campaign.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'ARCHIVED', donationsOpen: false, slug: `${c.slug}${suffix}`.slice(0, 120), code: `${c.code}${suffix}`.slice(0, 60), updatedById: actor.userId },
    });
    await this.audit.record(actor, 'campaign.delete', 'Campaign', id, { code: c.code });
  }

  // ── public ──
  private publicWhere(): Prisma.CampaignWhereInput {
    return {
      deletedAt: null,
      status: { in: [...PUBLIC_STATUSES] },
      approvedAt: { not: null },
      provenance: { not: 'DEMO' },
      programme: { status: 'PUBLISHED', deletedAt: null },
    };
  }

  /**
   * Public campaign list. `ids` (used by events) narrows the set and preserves the given order,
   * but never bypasses the public eligibility rules in publicWhere().
   */
  async listPublished(opts: { featured?: boolean; programmeSlug?: string; ids?: string[] }) {
    if (opts.ids && opts.ids.length === 0) return [];
    const items = await this.prisma.campaign.findMany({
      where: {
        ...this.publicWhere(),
        ...(opts.featured ? { isFeatured: true } : {}),
        ...(opts.programmeSlug ? { programme: { slug: opts.programmeSlug, status: 'PUBLISHED' } } : {}),
        ...(opts.ids ? { id: { in: opts.ids } } : {}),
      },
      include,
      orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }],
    });
    if (opts.ids) items.sort((a, b) => opts.ids!.indexOf(a.id) - opts.ids!.indexOf(b.id));
    const donation = await this.settings.getDonation();
    return items.map((c) => this.publicView(this.present(c), donation.paymentsEffective));
  }

  async getPublishedBySlug(slug: string) {
    const c = await this.prisma.campaign.findFirst({ where: { ...this.publicWhere(), slug }, include });
    if (!c) throw new NotFoundException('Campaign not found');
    const donation = await this.settings.getDonation();
    return this.publicView(this.present(c), donation.paymentsEffective);
  }

  private publicView(c: ReturnType<CampaignsService['present']>, paymentsEffective: boolean) {
    const media = (m: { url: string; width: number | null; height: number | null; altEn: string | null; altAr: string | null } | null | undefined) =>
      m ? { url: m.url, width: m.width, height: m.height, altEn: m.altEn, altAr: m.altAr } : null;
    return {
      id: c.id,
      slug: c.slug,
      titleEn: c.titleEn,
      titleAr: c.titleAr,
      summaryEn: c.summaryEn,
      summaryAr: c.summaryAr,
      descriptionEn: c.descriptionEn,
      descriptionAr: c.descriptionAr,
      locationEn: c.locationEn,
      locationAr: c.locationAr,
      status: c.status,
      isFeatured: c.isFeatured,
      programme: c.programme ? { slug: c.programme.slug, nameEn: c.programme.nameEn, nameAr: c.programme.nameAr } : null,
      cover: media(c.coverMedia),
      gallery: c.gallery.map((g) => media(g.media)),
      currency: c.currency,
      suggestedAmounts: c.suggestedAmounts,
      allowCustomAmount: c.allowCustomAmount,
      minCustomAmount: c.minCustomAmount,
      maxCustomAmount: c.maxCustomAmount,
      targetAmount: c.targetAmount, // only ever an approved figure; raised totals come from verified payments (future)
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      acceptingDonations: c.status === 'PUBLISHED' && c.donationsOpen && paymentsEffective,
      seoTitleEn: c.seoTitleEn,
      seoTitleAr: c.seoTitleAr,
      seoDescriptionEn: c.seoDescriptionEn,
      seoDescriptionAr: c.seoDescriptionAr,
    };
  }
}
