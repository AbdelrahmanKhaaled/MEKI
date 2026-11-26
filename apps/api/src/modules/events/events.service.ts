import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { CmsService } from '../cms/cms.service';
import { PublishRuleViolation } from '../../common/publishing/publishing.policy';
import type { ActorContext } from '../../common/types/auth-request';
import { defined, Paginated, parseSort, slugify } from '../../common/utils';
import type { CreateSectionItemDto, UpdateSectionDto, UpdateSectionItemDto } from '../cms/cms.dto';
import {
  canTransitionEvent,
  EVENT_TRANSITIONS,
  type EventAction,
  eventPublishBlockers,
  pageStatusFor,
  PUBLIC_EVENT_STATUSES,
  scheduleProblems,
} from './event.rules';
import type { CreateEventDto, CreateEventSectionDto, EventGalleryItemDto, EventQueryDto, UpdateEventDto } from './events.dto';

const include = {
  heroMedia: true,
  coverMedia: true,
  gallery: { orderBy: { sortOrder: 'asc' }, include: { media: true } },
  campaigns: {
    orderBy: { sortOrder: 'asc' },
    include: { campaign: { select: { id: true, code: true, slug: true, titleEn: true, titleAr: true, status: true, approvedAt: true, deletedAt: true } } },
  },
  page: { select: { id: true, slug: true, status: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.EventInclude;

type EventFull = Prisma.EventGetPayload<{ include: typeof include }>;

const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v));

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly cms: CmsService,
    private readonly campaigns: CampaignsService,
    private readonly config: AppConfigService,
  ) {}

  private present(e: EventFull) {
    return {
      ...e,
      heroMedia: this.media.present(e.heroMedia),
      coverMedia: this.media.present(e.coverMedia),
      gallery: e.gallery.filter((g) => !g.media.deletedAt).map((g) => ({ sortOrder: g.sortOrder, role: g.role, media: this.media.present(g.media) })),
      campaigns: e.campaigns.filter((c) => !c.campaign.deletedAt).map((c) => ({ sortOrder: c.sortOrder, ...c.campaign })),
    };
  }

  // ───────────── admin: events ─────────────

  async list(q: EventQueryDto) {
    const where: Prisma.EventWhereInput = {
      deletedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.visibility ? { visibility: q.visibility } : {}),
      ...(q.isFeatured ? { isFeatured: q.isFeatured === 'true' } : {}),
      ...(q.from || q.to ? { startsAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
      ...(q.search ? { OR: [{ titleEn: { contains: q.search } }, { titleAr: { contains: q.search } }, { slug: { contains: q.search } }, { code: { contains: q.search } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        include,
        orderBy: parseSort(q.sort, ['sortOrder', 'startsAt', 'titleEn', 'createdAt', 'updatedAt', 'status'], { sortOrder: 'asc' }),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.event.count({ where }),
    ]);
    return Paginated.of(items.map((e) => this.present(e)), total, q.page, q.pageSize);
  }

  async get(id: string) {
    const e = await this.prisma.event.findFirst({ where: { id, deletedAt: null }, include });
    if (!e) throw new NotFoundException('Event not found');
    // `publishBlockers` is the server's own list of reasons Publish would be refused (same rules as transition()); the admin shows it verbatim.
    return { ...this.present(e), publishBlockers: eventPublishBlockers(e, { allowDemo: !this.config.isProduction && this.config.get('ALLOW_DEMO_PUBLISH') }) };
  }

  private assertSchedule(startsAt: Date | null, endsAt: Date | null, timezone: string | null) {
    const problems = scheduleProblems({ startsAt, endsAt, timezone });
    if (problems.length) throw new UnprocessableEntityException({ message: 'Invalid event schedule', code: 'INVALID_EVENT_SCHEDULE', details: problems });
  }

  async create(dto: CreateEventDto, actor: ActorContext) {
    await this.media.assertExists([dto.heroMediaId, dto.coverMediaId]);
    const startsAt = toDate(dto.startsAt) ?? null;
    const endsAt = toDate(dto.endsAt) ?? null;
    this.assertSchedule(startsAt, endsAt, dto.timezone ?? null);
    const slug = dto.slug ?? slugify(dto.titleEn);
    if (!slug) throw new BadRequestException('A slug is required');

    const event = await this.prisma.$transaction(async (tx) => {
      // Each event owns a CMS page (reused Phase 1 sections/items/snapshots). Stable slug from the code.
      const page = await tx.page.create({
        data: { slug: `event-${dto.code.toLowerCase()}`, titleEn: dto.titleEn, titleAr: dto.titleAr, status: 'DRAFT', provenance: dto.provenance ?? 'PROPOSED', createdById: actor.userId, updatedById: actor.userId },
      });
      return tx.event.create({
        data: {
          ...defined(dto),
          slug,
          startsAt,
          endsAt,
          status: 'DRAFT',
          pageId: page.id,
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
    });
    await this.audit.record(actor, 'event.create', 'Event', event.id, { code: event.code });
    return this.get(event.id);
  }

  async update(id: string, dto: UpdateEventDto, actor: ActorContext) {
    const current = await this.get(id);
    if (current.status === 'ARCHIVED') throw new UnprocessableEntityException('Archived events cannot be edited');
    await this.media.assertExists([dto.heroMediaId, dto.coverMediaId]);
    const startsAt = dto.startsAt === undefined ? current.startsAt : toDate(dto.startsAt)!;
    const endsAt = dto.endsAt === undefined ? current.endsAt : toDate(dto.endsAt)!;
    const timezone = dto.timezone === undefined ? current.timezone : dto.timezone;
    this.assertSchedule(startsAt, endsAt, timezone);

    const live = PUBLIC_EVENT_STATUSES.includes(current.status);
    // A live event may never fall back to an unconfirmed schedule or lose its approved provenance.
    if (live && (startsAt === null || timezone === null)) {
      throw new UnprocessableEntityException({ message: 'A live event must keep a confirmed date, time and timezone', code: 'LIVE_EVENT_SCHEDULE' });
    }
    if (live && dto.provenance === 'DEMO') throw new PublishRuleViolation('A live event cannot become DEMO content', 'DEMO_NOT_PUBLISHABLE');

    await this.prisma.$transaction([
      this.prisma.event.update({
        where: { id },
        data: { ...defined(dto), startsAt: toDate(dto.startsAt), endsAt: toDate(dto.endsAt), updatedById: actor.userId },
      }),
      ...(dto.titleEn !== undefined || dto.titleAr !== undefined
        ? [this.prisma.page.update({ where: { id: current.pageId }, data: defined({ titleEn: dto.titleEn, titleAr: dto.titleAr }) })]
        : []),
    ]);
    await this.audit.record(actor, 'event.update', 'Event', id, { fields: AuditService.changedFields(dto), live });
    return this.get(id);
  }

  async setGallery(id: string, items: EventGalleryItemDto[], actor: ActorContext) {
    await this.get(id);
    const ids = items.map((i) => i.mediaId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Duplicate mediaId in gallery');
    await this.media.assertExists(ids);
    await this.prisma.$transaction([
      this.prisma.eventMedia.deleteMany({ where: { eventId: id } }),
      this.prisma.eventMedia.createMany({ data: items.map((i, n) => ({ eventId: id, mediaId: i.mediaId, role: i.role ?? 'GALLERY', sortOrder: n })) }),
    ]);
    await this.audit.record(actor, 'event.gallery_update', 'Event', id, { mediaIds: ids });
    return this.get(id);
  }

  /** Links only. Campaigns are never modified, published or opened for donations by this call. */
  async setCampaigns(id: string, campaignIds: string[], actor: ActorContext) {
    await this.get(id);
    const found = await this.prisma.campaign.count({ where: { id: { in: campaignIds }, deletedAt: null } });
    if (found !== campaignIds.length) throw new BadRequestException('One or more campaign IDs are invalid');
    await this.prisma.$transaction([
      this.prisma.eventCampaign.deleteMany({ where: { eventId: id } }),
      this.prisma.eventCampaign.createMany({ data: campaignIds.map((campaignId, n) => ({ eventId: id, campaignId, sortOrder: n })) }),
    ]);
    await this.audit.record(actor, 'event.campaigns_update', 'Event', id, { campaignIds });
    return this.get(id);
  }

  async approve(id: string, note: string, actor: ActorContext) {
    const e = await this.get(id);
    if (e.provenance === 'DEMO') throw new PublishRuleViolation('DEMO events cannot be approved', 'DEMO_NOT_PUBLISHABLE');
    if (e.status === 'ARCHIVED' || e.status === 'COMPLETED') throw new UnprocessableEntityException('Event is closed');
    await this.prisma.event.update({ where: { id }, data: { approvedAt: new Date(), approvedById: actor.userId, approvalNote: note, updatedById: actor.userId } });
    await this.audit.record(actor, 'event.approve', 'Event', id, { note });
    return this.get(id);
  }

  async revokeApproval(id: string, actor: ActorContext) {
    const e = await this.get(id);
    if (PUBLIC_EVENT_STATUSES.includes(e.status)) throw new UnprocessableEntityException('Unpublish the event before revoking approval');
    await this.prisma.event.update({ where: { id }, data: { approvedAt: null, approvedById: null, approvalNote: null, updatedById: actor.userId } });
    await this.audit.record(actor, 'event.approval_revoked', 'Event', id);
    return this.get(id);
  }

  async transition(id: string, action: EventAction, actor: ActorContext) {
    const e = await this.get(id);
    if (!canTransitionEvent(action, e.status)) {
      throw new UnprocessableEntityException({ message: `Cannot ${action} an event in status ${e.status}`, code: 'INVALID_TRANSITION' });
    }
    const to = EVENT_TRANSITIONS[action].to;
    if (to === 'PUBLISHED') {
      const blockers = eventPublishBlockers(e, { allowDemo: !this.config.isProduction && this.config.get('ALLOW_DEMO_PUBLISH') });
      if (blockers.length) throw new PublishRuleViolation('Event cannot be published', 'EVENT_NOT_PUBLISHABLE', { reasons: blockers });
    }
    // A never-published draft that is cancelled stays private.
    const pageStatus = to === 'CANCELLED' && !e.publishedAt ? 'DRAFT' : pageStatusFor(to);
    await this.prisma.$transaction([
      this.prisma.event.update({
        where: { id },
        data: { status: to, ...(to === 'PUBLISHED' ? { publishedAt: e.publishedAt ?? new Date() } : {}), updatedById: actor.userId },
      }),
      this.prisma.page.update({
        where: { id: e.pageId },
        data: { status: pageStatus, ...(pageStatus === 'PUBLISHED' ? { publishedAt: new Date() } : {}), updatedById: actor.userId },
      }),
    ]);
    await this.audit.record(actor, `event.${action}`, 'Event', id, { from: e.status, to });
    return this.get(id);
  }

  /**
   * Soft delete. Refused while the event is live. Extension point: once registrations, tickets,
   * sponsorships or event donations exist, this must also refuse when any such financial record references the event.
   */
  async remove(id: string, actor: ActorContext) {
    const e = await this.get(id);
    if (PUBLIC_EVENT_STATUSES.includes(e.status) && e.status !== 'COMPLETED') {
      throw new ConflictException({ message: 'Unpublish or archive the event before deleting it', code: 'EVENT_IS_LIVE' });
    }
    if (e.status === 'COMPLETED') {
      throw new ConflictException({ message: 'Completed events are kept for the record; archive instead', code: 'EVENT_COMPLETED' });
    }
    await this.assertNoFinancialRecords(id);
    const suffix = `-deleted-${Date.now().toString(36)}`;
    await this.prisma.$transaction([
      this.prisma.event.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'ARCHIVED', slug: `${e.slug}${suffix}`.slice(0, 120), code: `${e.code}${suffix}`.slice(0, 60), updatedById: actor.userId },
      }),
      this.prisma.page.update({ where: { id: e.pageId }, data: { status: 'DRAFT' } }),
    ]);
    await this.audit.record(actor, 'event.delete', 'Event', id, { code: e.code });
  }

  /** No event-related financial tables exist in Phase 2. Kept as the single place to add those checks later. */
  private async assertNoFinancialRecords(_eventId: string) {
    return;
  }

  // ───────────── admin: event page (reuses Phase 1 CMS) ─────────────

  private async scope(id: string) {
    const e = await this.prisma.event.findFirst({ where: { id, deletedAt: null }, select: { pageId: true, page: { select: { slug: true } } } });
    if (!e) throw new NotFoundException('Event not found');
    return { pageId: e.pageId, slug: e.page.slug };
  }

  async getPage(id: string) {
    return this.cms.getPage((await this.scope(id)).slug);
  }
  async createSection(id: string, dto: CreateEventSectionDto, actor: ActorContext) {
    const s = await this.scope(id);
    return this.cms.createSection(s.slug, dto, actor, { pageId: s.pageId });
  }
  async updateSection(id: string, sectionId: string, dto: UpdateSectionDto, actor: ActorContext) {
    return this.cms.updateSection(sectionId, dto, actor, { pageId: (await this.scope(id)).pageId });
  }
  async reorderSections(id: string, ids: string[], actor: ActorContext) {
    const s = await this.scope(id);
    return this.cms.reorderSections(s.slug, ids, actor, { pageId: s.pageId });
  }
  async publishSection(id: string, sectionId: string, actor: ActorContext) {
    return this.cms.publishSection(sectionId, actor, { pageId: (await this.scope(id)).pageId });
  }
  async unpublishSection(id: string, sectionId: string, actor: ActorContext) {
    return this.cms.unpublishSection(sectionId, actor, { pageId: (await this.scope(id)).pageId });
  }
  async createItem(id: string, sectionId: string, dto: CreateSectionItemDto, actor: ActorContext) {
    return this.cms.createItem(sectionId, dto, actor, { pageId: (await this.scope(id)).pageId });
  }
  async updateItem(id: string, itemId: string, dto: UpdateSectionItemDto, actor: ActorContext) {
    return this.cms.updateItem(itemId, dto, actor, { pageId: (await this.scope(id)).pageId });
  }
  async deleteItem(id: string, itemId: string, actor: ActorContext) {
    return this.cms.deleteItem(itemId, actor, { pageId: (await this.scope(id)).pageId });
  }
  async reorderItems(id: string, sectionId: string, ids: string[], actor: ActorContext) {
    return this.cms.reorderItems(sectionId, ids, actor, { pageId: (await this.scope(id)).pageId });
  }

  // ───────────── public ─────────────

  private publicWhere(): Prisma.EventWhereInput {
    return {
      deletedAt: null,
      status: { in: PUBLIC_EVENT_STATUSES },
      // approvedAt is intentionally NOT required (see event.rules.ts): an event is public once it is PUBLISHED by someone with events.publish.
      publishedAt: { not: null },
      provenance: { not: 'DEMO' },
    };
  }

  async listPublished(opts: { featured?: boolean; when?: 'upcoming' | 'past' | 'all' }) {
    const now = new Date();
    const items = await this.prisma.event.findMany({
      where: {
        ...this.publicWhere(),
        visibility: 'PUBLIC',
        ...(opts.featured ? { isFeatured: true } : {}),
        ...(opts.when === 'upcoming' ? { OR: [{ endsAt: { gte: now } }, { endsAt: null, startsAt: { gte: now } }] } : {}),
        ...(opts.when === 'past' ? { OR: [{ endsAt: { lt: now } }, { endsAt: null, startsAt: { lt: now } }] } : {}),
      },
      include,
      orderBy: [{ sortOrder: 'asc' }, { startsAt: 'asc' }],
    });
    return items.map((e) => this.publicView(this.present(e)));
  }

  private async findPublishedBySlug(slug: string) {
    const e = await this.prisma.event.findFirst({ where: { ...this.publicWhere(), slug }, include });
    if (!e) throw new NotFoundException('Event not found');
    return e;
  }

  async getPublishedBySlug(slug: string) {
    return this.publicView(this.present(await this.findPublishedBySlug(slug)));
  }

  async getPublishedPage(slug: string) {
    const e = await this.findPublishedBySlug(slug);
    return this.cms.getPublishedPageById(e.pageId);
  }

  /** Linked campaigns filtered through the Campaigns public rules (approval, publication, programme, non-DEMO). */
  async getPublishedCampaigns(slug: string) {
    const e = await this.findPublishedBySlug(slug);
    return this.campaigns.listPublished({ ids: e.campaigns.map((c) => c.campaignId) });
  }

  private publicView(e: ReturnType<EventsService['present']>) {
    const media = (m: { url: string; width: number | null; height: number | null; altEn: string | null; altAr: string | null } | null | undefined) =>
      m ? { url: m.url, width: m.width, height: m.height, altEn: m.altEn, altAr: m.altAr } : null;
    return {
      id: e.id,
      slug: e.slug,
      status: e.status,
      titleEn: e.titleEn,
      titleAr: e.titleAr,
      shortDescEn: e.shortDescEn,
      shortDescAr: e.shortDescAr,
      descriptionEn: e.descriptionEn,
      descriptionAr: e.descriptionAr,
      highlightsEn: e.highlightsEn,
      highlightsAr: e.highlightsAr,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      timezone: e.timezone,
      scheduleNoteEn: e.scheduleNoteEn,
      scheduleNoteAr: e.scheduleNoteAr,
      venueNameEn: e.venueNameEn,
      venueNameAr: e.venueNameAr,
      addressEn: e.addressEn,
      addressAr: e.addressAr,
      city: e.city,
      countryCode: e.countryCode,
      mapUrl: e.mapUrl,
      registrationMode: e.registrationMode,
      externalRegistrationUrl: e.registrationMode === 'EXTERNAL_LINK' ? e.externalRegistrationUrl : null,
      ctaPrimaryLabelEn: e.ctaPrimaryLabelEn,
      ctaPrimaryLabelAr: e.ctaPrimaryLabelAr,
      ctaPrimaryHref: e.ctaPrimaryHref,
      ctaSecondaryLabelEn: e.ctaSecondaryLabelEn,
      ctaSecondaryLabelAr: e.ctaSecondaryLabelAr,
      ctaSecondaryHref: e.ctaSecondaryHref,
      isFeatured: e.isFeatured,
      hero: media(e.heroMedia),
      cover: media(e.coverMedia),
      gallery: e.gallery.map((g) => ({ role: g.role, ...media(g.media) })),
      seoTitleEn: e.seoTitleEn,
      seoTitleAr: e.seoTitleAr,
      seoDescriptionEn: e.seoDescriptionEn,
      seoDescriptionAr: e.seoDescriptionAr,
    };
  }
}
