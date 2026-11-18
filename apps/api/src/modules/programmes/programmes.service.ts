import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { PublishingPolicy } from '../../common/publishing/publishing.policy';
import type { ActorContext } from '../../common/types/auth-request';
import { defined, Paginated, parseSort, slugify } from '../../common/utils';
import type { CreateProgrammeDto, CreateProjectDto, ProgrammeQueryDto, ProjectQueryDto, UpdateProgrammeDto, UpdateProjectDto } from './programmes.dto';

const include = {
  coverMedia: true,
  gallery: { orderBy: { sortOrder: 'asc' }, include: { media: true } },
  projects: { where: { deletedAt: null }, orderBy: { nameEn: 'asc' } },
  _count: { select: { campaigns: { where: { deletedAt: null } } } },
} satisfies Prisma.ProgrammeInclude;

type ProgrammeFull = Prisma.ProgrammeGetPayload<{ include: typeof include }>;

@Injectable()
export class ProgrammesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly policy: PublishingPolicy,
  ) {}

  present(p: ProgrammeFull) {
    return {
      ...p,
      coverMedia: this.media.present(p.coverMedia),
      gallery: p.gallery.filter((g) => !g.media.deletedAt).map((g) => ({ sortOrder: g.sortOrder, media: this.media.present(g.media) })),
    };
  }

  async list(q: ProgrammeQueryDto) {
    const where: Prisma.ProgrammeWhereInput = {
      deletedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.isFeatured ? { isFeatured: q.isFeatured === 'true' } : {}),
      ...(q.provenance ? { provenance: q.provenance } : {}),
      ...(q.search ? { OR: [{ nameEn: { contains: q.search } }, { nameAr: { contains: q.search } }, { slug: { contains: q.search } }, { code: { contains: q.search } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.programme.findMany({
        where,
        include,
        orderBy: parseSort(q.sort, ['sortOrder', 'nameEn', 'createdAt', 'updatedAt', 'number'], { sortOrder: 'asc' }),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.programme.count({ where }),
    ]);
    return Paginated.of(items.map((p) => this.present(p)), total, q.page, q.pageSize);
  }

  async get(id: string) {
    const p = await this.prisma.programme.findFirst({ where: { id, deletedAt: null }, include });
    if (!p) throw new NotFoundException('Programme not found');
    return this.present(p);
  }

  async create(dto: CreateProgrammeDto, actor: ActorContext) {
    await this.media.assertExists([dto.coverMediaId]);
    const slug = dto.slug ?? slugify(dto.nameEn);
    if (!slug) throw new BadRequestException('A slug is required');
    const p = await this.prisma.programme.create({
      data: { ...defined(dto), slug, status: 'DRAFT', createdById: actor.userId, updatedById: actor.userId },
    });
    await this.audit.record(actor, 'programme.create', 'Programme', p.id, { code: p.code });
    return this.get(p.id);
  }

  async update(id: string, dto: UpdateProgrammeDto, actor: ActorContext) {
    await this.get(id);
    await this.media.assertExists([dto.coverMediaId]);
    await this.prisma.programme.update({ where: { id }, data: { ...defined(dto), updatedById: actor.userId } });
    await this.audit.record(actor, 'programme.update', 'Programme', id, { fields: AuditService.changedFields(dto) });
    return this.get(id);
  }

  async setGallery(id: string, mediaIds: string[], actor: ActorContext) {
    await this.get(id);
    await this.media.assertExists(mediaIds);
    await this.prisma.$transaction([
      this.prisma.programmeMedia.deleteMany({ where: { programmeId: id } }),
      this.prisma.programmeMedia.createMany({ data: mediaIds.map((mediaId, i) => ({ programmeId: id, mediaId, sortOrder: i })) }),
    ]);
    await this.audit.record(actor, 'programme.gallery_update', 'Programme', id, { mediaIds });
    return this.get(id);
  }

  async publish(id: string, actor: ActorContext) {
    const p = await this.get(id);
    this.policy.assertProvenancePublishable(p.provenance);
    this.policy.assertRequired({ nameEn: p.nameEn, shortDescEn: p.shortDescEn, slug: p.slug });
    await this.prisma.programme.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date(), updatedById: actor.userId } });
    await this.audit.record(actor, 'programme.publish', 'Programme', id);
    return this.get(id);
  }

  async unpublish(id: string, actor: ActorContext) {
    await this.get(id);
    const live = await this.prisma.campaign.count({ where: { programmeId: id, status: { in: ['PUBLISHED', 'PAUSED'] }, deletedAt: null } });
    if (live) throw new ConflictException({ message: 'Unpublish or pause linked campaigns first', code: 'PROGRAMME_HAS_LIVE_CAMPAIGNS', details: { live } });
    await this.prisma.programme.update({ where: { id }, data: { status: 'DRAFT', updatedById: actor.userId } });
    await this.audit.record(actor, 'programme.unpublish', 'Programme', id);
    return this.get(id);
  }

  async remove(id: string, actor: ActorContext) {
    const p = await this.get(id);
    if (p.status === 'PUBLISHED') throw new ConflictException('Unpublish the programme before deleting it');
    if (p._count.campaigns > 0) throw new ConflictException({ message: 'Programme has campaigns', code: 'PROGRAMME_IN_USE' });
    // Soft delete; free the unique slug/code for reuse by suffixing.
    const suffix = `-deleted-${Date.now().toString(36)}`;
    await this.prisma.programme.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'ARCHIVED', slug: `${p.slug}${suffix}`.slice(0, 100), code: `${p.code}${suffix}`.slice(0, 40), updatedById: actor.userId },
    });
    await this.audit.record(actor, 'programme.delete', 'Programme', id, { code: p.code, slug: p.slug });
  }

  // ── projects ──
  /**
   * Projects are presented as "Causes" in the admin (Programme → Cause → Campaign). Phase 6C added, additively: search and
   * provenance filters, the programme's status/kind/Arabic name and a non-deleted campaign count on every row.
   */
  listProjects(q: ProjectQueryDto = {}) {
    const s = q.search?.trim();
    return this.prisma.project.findMany({
      where: {
        deletedAt: null,
        ...(q.programmeId ? { programmeId: q.programmeId } : {}),
        ...(q.provenance ? { provenance: q.provenance } : {}),
        ...(s ? { OR: [{ nameEn: { contains: s } }, { nameAr: { contains: s } }, { code: { contains: s } }, { slug: { contains: s } }, { locationEn: { contains: s } }] } : {}),
      },
      orderBy: { nameEn: 'asc' },
      include: {
        programme: { select: { id: true, nameEn: true, nameAr: true, slug: true, status: true, kind: true } },
        _count: { select: { campaigns: { where: { deletedAt: null } } } },
      },
    });
  }

  /** Phase 6C (additive): one project with its programme and its (non-deleted) campaigns. */
  async getProject(id: string) {
    const p = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: {
        programme: { select: { id: true, nameEn: true, nameAr: true, slug: true, status: true, kind: true } },
        campaigns: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: { id: true, code: true, slug: true, titleEn: true, titleAr: true, status: true, provenance: true, approvedAt: true, currency: true, targetAmount: true, startsAt: true, endsAt: true },
        },
      },
    });
    if (!p) throw new NotFoundException('Project not found');
    return { ...p, campaigns: p.campaigns.map((c) => ({ ...c, targetAmount: c.targetAmount?.toString() ?? null })) };
  }

  private async assertProgramme(programmeId?: string | null) {
    if (!programmeId) return;
    const exists = await this.prisma.programme.count({ where: { id: programmeId, deletedAt: null } });
    if (!exists) throw new BadRequestException('programmeId is invalid');
  }

  async createProject(dto: CreateProjectDto, actor: ActorContext) {
    await this.assertProgramme(dto.programmeId);
    const project = await this.prisma.project.create({
      data: { ...defined(dto), slug: dto.slug ?? slugify(dto.nameEn), createdById: actor.userId, updatedById: actor.userId },
    });
    await this.audit.record(actor, 'project.create', 'Project', project.id, { code: project.code });
    return project;
  }

  async updateProject(id: string, dto: UpdateProjectDto, actor: ActorContext) {
    const existing = await this.prisma.project.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Project not found');
    await this.assertProgramme(dto.programmeId);
    // Phase 6C hierarchy guard: a project (Cause) that already has campaigns cannot move to another programme (or be
    // detached), otherwise its campaigns would point to a programme the Cause no longer belongs to.
    if (dto.programmeId !== undefined && dto.programmeId !== existing.programmeId) {
      const campaigns = await this.prisma.campaign.count({ where: { projectId: id, deletedAt: null } });
      if (campaigns > 0) {
        throw new ConflictException({ message: 'Move or remove the campaigns of this project before changing its programme', code: 'PROJECT_HAS_CAMPAIGNS', details: { campaigns } });
      }
    }
    const project = await this.prisma.project.update({ where: { id }, data: { ...defined(dto), updatedById: actor.userId } });
    await this.audit.record(actor, 'project.update', 'Project', id, { fields: AuditService.changedFields(dto) });
    return project;
  }

  // ── public ──
  async listPublished() {
    const items = await this.prisma.programme.findMany({
      where: { status: 'PUBLISHED', deletedAt: null, provenance: { not: 'DEMO' } },
      include,
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
    });
    return items.map((p) => this.publicView(this.present(p)));
  }

  async getPublishedBySlug(slug: string) {
    const p = await this.prisma.programme.findFirst({ where: { slug, status: 'PUBLISHED', deletedAt: null, provenance: { not: 'DEMO' } }, include });
    if (!p) throw new NotFoundException('Programme not found');
    return this.publicView(this.present(p));
  }

  private publicView(p: ReturnType<ProgrammesService['present']>) {
    const media = (m: { url: string; width: number | null; height: number | null; altEn: string | null; altAr: string | null } | null | undefined) =>
      m ? { url: m.url, width: m.width, height: m.height, altEn: m.altEn, altAr: m.altAr } : null;
    return {
      id: p.id,
      slug: p.slug,
      kind: p.kind,
      number: p.number,
      nameEn: p.nameEn,
      nameAr: p.nameAr,
      shortDescEn: p.shortDescEn,
      shortDescAr: p.shortDescAr,
      mandateEn: p.mandateEn,
      mandateAr: p.mandateAr,
      descriptionEn: p.descriptionEn,
      descriptionAr: p.descriptionAr,
      focusAreasEn: p.focusAreasEn,
      focusAreasAr: p.focusAreasAr,
      icon: p.icon,
      isFeatured: p.isFeatured,
      sortOrder: p.sortOrder,
      seoTitleEn: p.seoTitleEn,
      seoTitleAr: p.seoTitleAr,
      seoDescriptionEn: p.seoDescriptionEn,
      seoDescriptionAr: p.seoDescriptionAr,
      cover: media(p.coverMedia),
      gallery: p.gallery.map((g) => media(g.media)),
    };
  }
}
