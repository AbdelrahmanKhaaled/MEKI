import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { MediaAsset, PageSection, SectionItem } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { PublishingPolicy } from '../../common/publishing/publishing.policy';
import type { ActorContext } from '../../common/types/auth-request';
import { defined } from '../../common/utils';
import { buildSectionSnapshot, type SectionSnapshot, type SnapshotMedia } from './section-snapshot';
import type { CreatePageDto, CreateSectionDto, CreateSectionItemDto, UpdatePageDto, UpdateSectionDto, UpdateSectionItemDto } from './cms.dto';

/**
 * Which page a CMS mutation is allowed to touch.
 *  - omitted: site CMS (/admin/cms/*) — event landing pages are refused (they follow event approval rules).
 *  - { pageId }: caller (Events API) has already authorised that page; the section must belong to it.
 */
export interface CmsScope {
  pageId?: string;
}

const isEventKey = (key: string) => key.startsWith('EVENT_');

type SectionWithRelations = PageSection & { media: MediaAsset | null; items: (SectionItem & { media: MediaAsset | null })[] };

const sectionInclude = {
  media: true,
  items: { orderBy: { sortOrder: 'asc' }, include: { media: true } },
} satisfies Prisma.PageSectionInclude;

function assertLabels(labels: unknown, field: string) {
  if (labels === undefined || labels === null) return;
  const entries = Object.entries(labels as Record<string, unknown>);
  if (entries.length > 40 || entries.some(([k, v]) => !/^[a-zA-Z][\w]{0,59}$/.test(k) || typeof v !== 'string' || v.length > 500)) {
    throw new BadRequestException(`${field} must be a flat map of up to 40 string labels (500 chars max)`);
  }
}

@Injectable()
export class CmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly policy: PublishingPolicy,
  ) {}

  private async assertPageScope(pageId: string, scope?: CmsScope) {
    if (scope?.pageId) {
      if (pageId !== scope.pageId) throw new NotFoundException('Section not found');
      return;
    }
    const event = await this.prisma.event.findUnique({ where: { pageId }, select: { id: true } });
    if (event) {
      throw new ForbiddenException({ message: 'Event pages are managed through the Events API', code: 'EVENT_PAGE_SCOPE' });
    }
  }

  private async assertSectionScope(sectionId: string, scope?: CmsScope) {
    const section = await this.prisma.pageSection.findUnique({ where: { id: sectionId }, select: { pageId: true } });
    if (!section) throw new NotFoundException('Section not found');
    await this.assertPageScope(section.pageId, scope);
  }

  // ── pages ──
  /**
   * Phase 6D (additive): each row also says whether it is an event landing page (managed through the Events API) and
   * who last updated it (name only), so the admin can list site pages with "last updated by".
   */
  async listPages() {
    const pages = await this.prisma.page.findMany({
      orderBy: { slug: 'asc' },
      include: { _count: { select: { sections: true } }, event: { select: { id: true } } },
    });
    const userIds = [...new Set(pages.map((p) => p.updatedById).filter((v): v is string => !!v))];
    const users = userIds.length ? await this.prisma.adminUser.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
    const name = new Map(users.map((u) => [u.id, u.name]));
    return pages.map(({ event, ...p }) => ({ ...p, isEventPage: !!event, updatedByName: p.updatedById ? (name.get(p.updatedById) ?? null) : null }));
  }

  /** Phase 6D (additive): create a site content page (DRAFT). Slugs are unique across all pages (incl. event pages). */
  async createPage(dto: CreatePageDto, actor: ActorContext) {
    await this.media.assertExists([dto.ogImageId]);
    if (await this.prisma.page.count({ where: { slug: dto.slug } })) {
      throw new ConflictException({ message: 'A page with this slug already exists', code: 'PAGE_SLUG_TAKEN' });
    }
    const page = await this.prisma.page.create({
      data: { ...defined(dto), status: 'DRAFT', createdById: actor.userId, updatedById: actor.userId },
    });
    await this.audit.record(actor, 'page.create', 'Page', page.id, { slug: page.slug, provenance: page.provenance });
    return this.getPage(page.slug);
  }

  async getPage(slug: string) {
    const page = await this.prisma.page.findUnique({
      where: { slug },
      include: { ogImage: true, sections: { orderBy: { sortOrder: 'asc' }, include: sectionInclude } },
    });
    if (!page) throw new NotFoundException('Page not found');
    return {
      ...page,
      ogImage: this.media.present(page.ogImage),
      sections: page.sections.map((s) => this.presentSection(s)),
    };
  }

  async updatePage(slug: string, dto: UpdatePageDto, actor: ActorContext) {
    const page = await this.getPage(slug);
    await this.assertPageScope(page.id);
    await this.media.assertExists([dto.ogImageId]);
    await this.prisma.page.update({ where: { id: page.id }, data: { ...defined(dto), updatedById: actor.userId } });
    await this.audit.record(actor, 'page.update', 'Page', page.id, { fields: AuditService.changedFields(dto) });
    return this.getPage(slug);
  }

  async setPageStatus(slug: string, publish: boolean, actor: ActorContext) {
    const page = await this.getPage(slug);
    await this.assertPageScope(page.id);
    if (publish) {
      this.policy.assertProvenancePublishable(page.provenance);
      this.policy.assertRequired({ titleEn: page.titleEn });
    }
    await this.prisma.page.update({
      where: { id: page.id },
      data: { status: publish ? 'PUBLISHED' : 'DRAFT', publishedAt: publish ? new Date() : page.publishedAt, updatedById: actor.userId },
    });
    await this.audit.record(actor, publish ? 'page.publish' : 'page.unpublish', 'Page', page.id);
    return this.getPage(slug);
  }

  // ── sections ──
  private presentSection(s: SectionWithRelations) {
    return {
      ...s,
      media: this.media.present(s.media),
      items: s.items.map((i) => ({ ...i, media: this.media.present(i.media) })),
    };
  }

  async getSection(id: string) {
    const section = await this.prisma.pageSection.findUnique({ where: { id }, include: sectionInclude });
    if (!section) throw new NotFoundException('Section not found');
    return this.presentSection(section);
  }

  async createSection(slug: string, dto: CreateSectionDto, actor: ActorContext, scope?: CmsScope) {
    const page = await this.getPage(slug);
    await this.assertPageScope(page.id, scope);
    if (isEventKey(dto.key) !== !!scope?.pageId) {
      throw new BadRequestException(scope?.pageId ? 'Event pages only accept EVENT_* sections' : 'EVENT_* sections belong to event pages');
    }
    assertLabels(dto.labelsEn, 'labelsEn');
    assertLabels(dto.labelsAr, 'labelsAr');
    await this.media.assertExists([dto.mediaId]);
    const max = await this.prisma.pageSection.aggregate({ where: { pageId: page.id }, _max: { sortOrder: true } });
    const section = await this.prisma.pageSection.create({
      data: {
        ...defined(dto),
        labelsEn: dto.labelsEn as Prisma.InputJsonValue | undefined,
        labelsAr: dto.labelsAr as Prisma.InputJsonValue | undefined,
        pageId: page.id,
        sortOrder: (max._max.sortOrder ?? 0) + 10,
        createdById: actor.userId,
        updatedById: actor.userId,
      },
    });
    await this.audit.record(actor, 'section.create', 'PageSection', section.id, { key: dto.key });
    return this.getSection(section.id);
  }

  async updateSection(id: string, dto: UpdateSectionDto, actor: ActorContext, scope?: CmsScope) {
    await this.assertSectionScope(id, scope);
    assertLabels(dto.labelsEn, 'labelsEn');
    assertLabels(dto.labelsAr, 'labelsAr');
    await this.media.assertExists([dto.mediaId]);
    await this.prisma.pageSection.update({
      where: { id },
      data: {
        ...defined(dto),
        labelsEn: dto.labelsEn as Prisma.InputJsonValue | undefined,
        labelsAr: dto.labelsAr as Prisma.InputJsonValue | undefined,
        hasUnpublishedChanges: true,
        updatedById: actor.userId,
      },
    });
    await this.audit.record(actor, 'section.update', 'PageSection', id, { fields: AuditService.changedFields(dto) });
    return this.getSection(id);
  }

  async reorderSections(slug: string, ids: string[], actor: ActorContext, scope?: CmsScope) {
    const page = await this.getPage(slug);
    await this.assertPageScope(page.id, scope);
    const own = new Set(page.sections.map((s) => s.id));
    if (ids.length !== own.size || ids.some((id) => !own.has(id))) {
      throw new BadRequestException('ids must list every section of the page exactly once');
    }
    await this.prisma.$transaction(
      ids.map((id, i) => this.prisma.pageSection.update({ where: { id }, data: { sortOrder: (i + 1) * 10, hasUnpublishedChanges: true } })),
    );
    await this.audit.record(actor, 'section.reorder', 'Page', page.id, { ids });
    return this.getPage(slug);
  }

  async publishSection(id: string, actor: ActorContext, scope?: CmsScope) {
    await this.assertSectionScope(id, scope);
    const section = await this.prisma.pageSection.findUnique({ where: { id }, include: sectionInclude });
    if (!section) throw new NotFoundException('Section not found');
    this.policy.assertProvenancePublishable(section.provenance);
    section.items.filter((i) => i.isVisible).forEach((i) => this.policy.assertProvenancePublishable(i.provenance));
    const data = buildSectionSnapshot(section) as unknown as Prisma.InputJsonValue;
    await this.prisma.pageSection.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedData: data, publishedAt: new Date(), hasUnpublishedChanges: false, updatedById: actor.userId },
    });
    await this.audit.record(actor, 'section.publish', 'PageSection', id, { key: section.key });
    return this.getSection(id);
  }

  async unpublishSection(id: string, actor: ActorContext, scope?: CmsScope) {
    await this.assertSectionScope(id, scope);
    await this.prisma.pageSection.update({
      where: { id },
      data: { status: 'DRAFT', publishedData: Prisma.DbNull, hasUnpublishedChanges: true, updatedById: actor.userId },
    });
    await this.audit.record(actor, 'section.unpublish', 'PageSection', id);
    return this.getSection(id);
  }

  /**
   * Phase 6D (additive): remove a block (section) from a site page. Only unpublished sections can be removed, so public
   * content never disappears by deletion — unpublish first. Items go with it (cascade); the audit log keeps the record.
   */
  async deleteSection(id: string, actor: ActorContext, scope?: CmsScope) {
    await this.assertSectionScope(id, scope);
    const section = await this.prisma.pageSection.findUnique({ where: { id }, select: { id: true, key: true, pageId: true, status: true, titleEn: true } });
    if (!section) throw new NotFoundException('Section not found');
    if (section.status === 'PUBLISHED') {
      throw new ConflictException({ message: 'Unpublish the section before removing it', code: 'SECTION_PUBLISHED' });
    }
    await this.prisma.pageSection.delete({ where: { id } });
    await this.audit.record(actor, 'section.delete', 'PageSection', id, { key: section.key, pageId: section.pageId, titleEn: section.titleEn });
  }

  // ── section items ──
  async createItem(sectionId: string, dto: CreateSectionItemDto, actor: ActorContext, scope?: CmsScope) {
    await this.assertSectionScope(sectionId, scope);
    await this.media.assertExists([dto.mediaId]);
    const max = await this.prisma.sectionItem.aggregate({ where: { sectionId }, _max: { sortOrder: true } });
    const item = await this.prisma.sectionItem.create({
      data: { ...defined(dto), sectionId, sortOrder: dto.sortOrder ?? (max._max.sortOrder ?? 0) + 10 },
    });
    await this.touch(sectionId, actor);
    await this.audit.record(actor, 'section_item.create', 'SectionItem', item.id, { sectionId });
    return item;
  }

  private async getItem(id: string) {
    const item = await this.prisma.sectionItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Section item not found');
    return item;
  }

  async updateItem(id: string, dto: UpdateSectionItemDto, actor: ActorContext, scope?: CmsScope) {
    const item = await this.getItem(id);
    await this.assertSectionScope(item.sectionId, scope);
    await this.media.assertExists([dto.mediaId]);
    const updated = await this.prisma.sectionItem.update({ where: { id }, data: defined(dto) });
    await this.touch(item.sectionId, actor);
    await this.audit.record(actor, 'section_item.update', 'SectionItem', id, { fields: AuditService.changedFields(dto) });
    return updated;
  }

  /** Items are small content fragments; deletion is audited and does not affect the published snapshot until republish. */
  async deleteItem(id: string, actor: ActorContext, scope?: CmsScope) {
    const item = await this.getItem(id);
    await this.assertSectionScope(item.sectionId, scope);
    await this.prisma.sectionItem.delete({ where: { id } });
    await this.touch(item.sectionId, actor);
    await this.audit.record(actor, 'section_item.delete', 'SectionItem', id, { sectionId: item.sectionId, titleEn: item.titleEn });
  }

  async reorderItems(sectionId: string, ids: string[], actor: ActorContext, scope?: CmsScope) {
    await this.assertSectionScope(sectionId, scope);
    const section = await this.getSection(sectionId);
    const own = new Set(section.items.map((i) => i.id));
    if (ids.length !== own.size || ids.some((id) => !own.has(id))) throw new BadRequestException('ids must list every item exactly once');
    await this.prisma.$transaction(ids.map((id, i) => this.prisma.sectionItem.update({ where: { id }, data: { sortOrder: (i + 1) * 10 } })));
    await this.touch(sectionId, actor);
    await this.audit.record(actor, 'section_item.reorder', 'PageSection', sectionId, { ids });
    return this.getSection(sectionId);
  }

  private touch(sectionId: string, actor: ActorContext) {
    return this.prisma.pageSection.update({ where: { id: sectionId }, data: { hasUnpublishedChanges: true, updatedById: actor.userId } });
  }

  // ── public ──
  private readonly publicPageInclude = {
    ogImage: true,
    sections: { where: { status: 'PUBLISHED' }, orderBy: { sortOrder: 'asc' } },
  } satisfies Prisma.PageInclude;

  /** Site pages only; event landing pages are served through the Events public API. */
  async getPublishedPage(slug: string) {
    const page = await this.prisma.page.findFirst({
      where: { slug, status: 'PUBLISHED', event: { is: null } },
      include: this.publicPageInclude,
    });
    if (!page) throw new NotFoundException('Page not found');
    return this.presentPublicPage(page);
  }

  /** For the Events API, which has already checked the event's own publication rules. */
  async getPublishedPageById(pageId: string) {
    const page = await this.prisma.page.findFirst({ where: { id: pageId, status: 'PUBLISHED' }, include: this.publicPageInclude });
    if (!page) throw new NotFoundException('Page not found');
    return this.presentPublicPage(page);
  }

  private presentPublicPage(page: Prisma.PageGetPayload<{ include: CmsService['publicPageInclude'] }>) {
    const allowDemo = (p: string) => p !== 'DEMO';
    const resolveMedia = (m: SnapshotMedia | null | undefined) =>
      m
        ? {
            id: m.id,
            url: this.media.url(m),
            width: m.width,
            height: m.height,
            altEn: m.altEn,
            altAr: m.altAr,
            captionEn: m.captionEn,
            captionAr: m.captionAr,
          }
        : null;
    return {
      slug: page.slug,
      titleEn: page.titleEn,
      titleAr: page.titleAr,
      seoTitleEn: page.seoTitleEn,
      seoTitleAr: page.seoTitleAr,
      seoDescriptionEn: page.seoDescriptionEn,
      seoDescriptionAr: page.seoDescriptionAr,
      ogImageUrl: page.ogImage && !page.ogImage.deletedAt ? this.media.url(page.ogImage) : null,
      publishedAt: page.publishedAt,
      /**
       * Phase 6D (additive): keys of sections an editor published as HIDDEN. Hidden sections are left out of `sections`
       * (as before); listing their keys lets the website hide them instead of falling back to its built-in copy.
       */
      hiddenSectionKeys: page.sections
        .map((s) => s.publishedData as unknown as SectionSnapshot | null)
        .filter((d): d is SectionSnapshot => !!d && d.isVisible === false)
        .map((d) => d.key),
      sections: page.sections
        .map((s) => s.publishedData as unknown as SectionSnapshot | null)
        .filter((d): d is SectionSnapshot => !!d && d.isVisible === true && allowDemo(d.provenance))
        .map((d) => ({
          ...d,
          media: resolveMedia(d.media),
          items: (d.items ?? []).filter((i) => allowDemo(i.provenance)).map((i) => ({ ...i, media: resolveMedia(i.media) })),
        })),
    };
  }
}
