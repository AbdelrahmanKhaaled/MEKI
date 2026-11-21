import { Body, ConflictException, Controller, ForbiddenException, Get, Header, HttpCode, Injectable, Module, NotFoundException, Param, Post, Put, Query, UnprocessableEntityException } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import type { EventFundraisingConfig, Prisma } from '../../generated/prisma/client';
import { Actor, Public, RequirePermissions } from '../../common/decorators';
import type { ActorContext } from '../../common/types/auth-request';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SafeIdPipe } from '../gala/gala-support';
import { AdminLegalCopyController, LegalCopyService } from './legal-copy';

/**
 * Phase 12B — SDI agreement: the Gala campaign raises funds for ONE project in Egypt approved in writing in SDI's Project Plan.
 *
 * - Nothing is chosen automatically: an administrator selects an existing project record (entered by MEKI) after sign-off.
 * - Approval steps are separate and recorded by a DIFFERENT administrator than the last editor (events.approve):
 *     PROJECT_PLAN → the project is approved in the signed Project Plan
 *     PUBLIC_FUNDRAISING → public fundraising may be shown and SDI's Gala donation form linked (needs an approved closing date)
 *     DONATION_REFUND_NOTICE → SDI's "donations are not refundable" statement may be published
 *     TICKET_REFUND_POLICY → the separately confirmed ticket refund policy text may be published
 * - Editing a field clears every approval that depends on it. Revoking is always allowed (it only reduces what is public).
 * - No money is moved, no payment is confirmed and no historical allocation is changed here.
 */

export const APPROVAL_STEPS = ['PROJECT_PLAN', 'PUBLIC_FUNDRAISING', 'DONATION_REFUND_NOTICE', 'TICKET_REFUND_POLICY'] as const;
export type ApprovalStep = (typeof APPROVAL_STEPS)[number];

export class UpdateFundraisingDto {
  @ApiPropertyOptional({ nullable: true, description: 'Existing project (cause) id — never auto-selected; null clears it' })
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(30) projectId?: string | null;
  @ApiPropertyOptional({ nullable: true, description: "Identifies SDI's signed Project Plan (title / version / date)" })
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MinLength(3) @MaxLength(255) projectPlanReference?: string | null;
  @ApiPropertyOptional({ nullable: true, example: '2027-01-31T23:59:59-05:00', description: 'Approved end of the Gala donation campaign' })
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsISO8601({ strict: true }) donationsCloseAt?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(4000) ticketRefundPolicyEn?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(4000) ticketRefundPolicyAr?: string | null;
}

export class ApproveFundraisingDto {
  @ApiProperty({ enum: APPROVAL_STEPS }) @IsIn(APPROVAL_STEPS) step!: ApprovalStep;
  @ApiPropertyOptional({ description: 'What the approval is based on (e.g. signed Project Plan v1, 2026-12-01)' }) @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class RevokeFundraisingDto {
  @ApiProperty({ enum: APPROVAL_STEPS }) @IsIn(APPROVAL_STEPS) step!: ApprovalStep;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class PublicFundraisingQueryDto {
  @ApiPropertyOptional({ enum: ['en', 'ar'] }) @IsOptional() @IsIn(['en', 'ar']) locale?: 'en' | 'ar';
}

const CLEAR_PLAN = { projectPlanApprovedAt: null, projectPlanApprovedById: null, projectPlanApprovalNote: null } as const;
const CLEAR_AUTH = { fundraisingAuthorizedAt: null, fundraisingAuthorizedById: null } as const;
const CLEAR_TICKET_POLICY = { ticketRefundPolicyApprovedAt: null, ticketRefundPolicyApprovedById: null } as const;
const CLEAR_REFUND_NOTICE = { donationRefundNoticeApprovedAt: null, donationRefundNoticeApprovedById: null } as const;

@Injectable()
export class EventFundraisingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly legal: LegalCopyService,
  ) {}

  private async event(eventId: string) {
    const e = await this.prisma.event.findFirst({ where: { id: eventId, deletedAt: null }, select: { id: true, slug: true, code: true } });
    if (!e) throw new NotFoundException('Event not found');
    return e;
  }

  private async row(eventId: string) {
    return this.prisma.eventFundraisingConfig.findUnique({ where: { eventId }, include: { project: { select: { id: true, code: true, nameEn: true, nameAr: true, locationEn: true, locationAr: true, status: true, provenance: true, deletedAt: true, programme: { select: { slug: true, nameEn: true } } } } } });
  }

  /** Effective public state, derived from the approvals + the SDI form switch. Pure, so admin and public views agree. */
  private state(c: EventFundraisingConfig | null, now = new Date()) {
    const planApproved = !!c?.projectId && !!c.projectPlanReference && !!c.projectPlanApprovedAt;
    const authorized = planApproved && !!c?.fundraisingAuthorizedAt;
    const open = authorized && !!c?.donationsCloseAt && now < c.donationsCloseAt;
    const formUrl = this.config.get('ZEFFY_GALA_GIVING_FORM_URL');
    const switchOn = this.config.get('SDI_GALA_GIVING_ENABLED') && !!formUrl;
    return { planApproved, authorized, campaignOpen: open, givingAvailable: open && switchOn, switchOn, formConfigured: !!formUrl };
  }

  async adminGet(eventId: string) {
    await this.event(eventId);
    const c = await this.row(eventId);
    const s = this.state(c);
    return {
      config: c ? this.view(c) : null,
      project: c?.project ?? null,
      state: { ...s, donationRefundNoticeApproved: !!c?.donationRefundNoticeApprovedAt, ticketRefundPolicyApproved: !!c?.ticketRefundPolicyApprovedAt },
      env: { galaGivingSwitch: this.config.get('SDI_GALA_GIVING_ENABLED'), galaGivingFormConfigured: s.formConfigured, generalGivingAuthorized: this.config.get('GENERAL_GIVING_AUTHORIZED'), programmeGivingAuthorized: this.config.get('PROGRAMME_GIVING_AUTHORIZED') },
    };
  }

  private view(c: EventFundraisingConfig) {
    return c;
  }

  async update(eventId: string, dto: UpdateFundraisingDto, actor: ActorContext) {
    await this.event(eventId);
    const before = await this.prisma.eventFundraisingConfig.findUnique({ where: { eventId } });
    const data: Prisma.EventFundraisingConfigUncheckedUpdateInput = {};
    const changed: string[] = [];
    const norm = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : v.trim() || null);

    if (dto.projectId !== undefined && dto.projectId !== (before?.projectId ?? null)) {
      if (dto.projectId !== null) {
        const p = await this.prisma.project.findFirst({ where: { id: dto.projectId, deletedAt: null } });
        if (!p) throw new UnprocessableEntityException({ message: 'Project not found', code: 'PROJECT_NOT_FOUND' });
        if (p.provenance === 'DEMO') throw new UnprocessableEntityException({ message: 'A DEMO project can never be the approved Gala project', code: 'PROJECT_IS_DEMO' });
      }
      data.projectId = dto.projectId;
      changed.push('projectId');
    }
    const ref = norm(dto.projectPlanReference);
    if (ref !== undefined && ref !== (before?.projectPlanReference ?? null)) {
      data.projectPlanReference = ref;
      changed.push('projectPlanReference');
    }
    if (dto.donationsCloseAt !== undefined) {
      const at = dto.donationsCloseAt === null ? null : new Date(dto.donationsCloseAt);
      if (at && Number.isNaN(at.getTime())) throw new UnprocessableEntityException({ message: 'Invalid closing date', code: 'CLOSING_DATE_INVALID' });
      if ((at?.getTime() ?? null) !== (before?.donationsCloseAt?.getTime() ?? null)) {
        data.donationsCloseAt = at;
        changed.push('donationsCloseAt');
      }
    }
    for (const k of ['ticketRefundPolicyEn', 'ticketRefundPolicyAr'] as const) {
      const v = norm(dto[k]);
      if (v !== undefined && v !== (before?.[k] ?? null)) {
        data[k] = v;
        changed.push(k);
      }
    }
    if (changed.length === 0) return this.adminGet(eventId);

    // Any change to what an approval was based on clears that approval (and what depends on it).
    const cleared: string[] = [];
    const had = (k: keyof EventFundraisingConfig) => !!before?.[k];
    if (changed.includes('projectId') || changed.includes('projectPlanReference')) {
      Object.assign(data, CLEAR_PLAN, CLEAR_AUTH);
      if (had('projectPlanApprovedAt')) cleared.push('PROJECT_PLAN');
      if (had('fundraisingAuthorizedAt')) cleared.push('PUBLIC_FUNDRAISING');
    }
    if (changed.includes('donationsCloseAt')) {
      Object.assign(data, CLEAR_AUTH);
      if (had('fundraisingAuthorizedAt') && !cleared.includes('PUBLIC_FUNDRAISING')) cleared.push('PUBLIC_FUNDRAISING');
    }
    if (changed.some((k) => k.startsWith('ticketRefundPolicy'))) {
      Object.assign(data, CLEAR_TICKET_POLICY);
      if (had('ticketRefundPolicyApprovedAt')) cleared.push('TICKET_REFUND_POLICY');
    }
    data.updatedById = actor.userId;
    await this.prisma.eventFundraisingConfig.upsert({
      where: { eventId },
      create: { ...(data as Prisma.EventFundraisingConfigUncheckedCreateInput), eventId },
      update: data,
    });
    await this.audit.record(actor, 'event.fundraising.update', 'Event', eventId, { changed, clearedApprovals: cleared });
    return this.adminGet(eventId);
  }

  async approve(eventId: string, step: ApprovalStep, note: string | undefined, actor: ActorContext) {
    await this.event(eventId);
    const c = await this.prisma.eventFundraisingConfig.findUnique({ where: { eventId } });
    if (!c) throw new ConflictException({ message: 'Configure the Gala fundraising project first', code: 'FUNDRAISING_NOT_CONFIGURED' });
    if (c.updatedById === actor.userId) throw new ForbiddenException({ message: 'A different administrator must record this approval (four-eyes rule)', code: 'FOUR_EYES_REQUIRED' });
    const now = new Date();
    let data: Prisma.EventFundraisingConfigUpdateInput;
    switch (step) {
      case 'PROJECT_PLAN':
        if (!c.projectId || !c.projectPlanReference) throw new UnprocessableEntityException({ message: 'Select the project and enter the Project Plan reference first', code: 'PROJECT_PLAN_INCOMPLETE' });
        data = { projectPlanApprovedAt: now, projectPlanApprovedById: actor.userId, projectPlanApprovalNote: note?.slice(0, 500) ?? null };
        break;
      case 'PUBLIC_FUNDRAISING':
        if (!c.projectPlanApprovedAt) throw new UnprocessableEntityException({ message: 'The Project Plan approval must be recorded first', code: 'PROJECT_PLAN_NOT_APPROVED' });
        if (!c.donationsCloseAt || c.donationsCloseAt <= now) throw new UnprocessableEntityException({ message: 'Enter an approved closing date in the future first', code: 'CLOSING_DATE_REQUIRED' });
        data = { fundraisingAuthorizedAt: now, fundraisingAuthorizedById: actor.userId };
        break;
      case 'DONATION_REFUND_NOTICE':
        data = { donationRefundNoticeApprovedAt: now, donationRefundNoticeApprovedById: actor.userId };
        break;
      case 'TICKET_REFUND_POLICY':
        if (!c.ticketRefundPolicyEn) throw new UnprocessableEntityException({ message: 'Enter the confirmed ticket refund policy text first', code: 'TICKET_POLICY_EMPTY' });
        data = { ticketRefundPolicyApprovedAt: now, ticketRefundPolicyApprovedById: actor.userId };
        break;
    }
    await this.prisma.eventFundraisingConfig.update({ where: { eventId }, data });
    await this.audit.record(actor, 'event.fundraising.approve', 'Event', eventId, { step, note: note?.slice(0, 200) ?? null });
    return this.adminGet(eventId);
  }

  async revoke(eventId: string, step: ApprovalStep, reason: string, actor: ActorContext) {
    await this.event(eventId);
    const c = await this.prisma.eventFundraisingConfig.findUnique({ where: { eventId } });
    if (!c) throw new ConflictException({ message: 'Nothing to revoke', code: 'FUNDRAISING_NOT_CONFIGURED' });
    const data =
      step === 'PROJECT_PLAN' ? { ...CLEAR_PLAN, ...CLEAR_AUTH } : step === 'PUBLIC_FUNDRAISING' ? CLEAR_AUTH : step === 'DONATION_REFUND_NOTICE' ? CLEAR_REFUND_NOTICE : CLEAR_TICKET_POLICY;
    await this.prisma.eventFundraisingConfig.update({ where: { eventId }, data });
    await this.audit.record(actor, 'event.fundraising.revoke', 'Event', eventId, { step, reason: reason.slice(0, 200) });
    return this.adminGet(eventId);
  }

  /**
   * Phase 14 — the Gala giving gate for donation intents (same derivation as the public view). `project` is set only while public
   * fundraising is authorized; it is the single approved project the Gala donation is designated to.
   */
  async galaGivingState(slug: string) {
    const event = await this.prisma.event.findFirst({ where: { slug, deletedAt: null, status: 'PUBLISHED' }, select: { id: true, slug: true } });
    if (!event) return null;
    const c = await this.row(event.id);
    const s = this.state(c);
    const p = c?.project;
    const project = s.authorized && p && !p.deletedAt && p.provenance !== 'DEMO' ? { id: p.id, code: p.code, nameEn: p.nameEn, nameAr: p.nameAr } : null;
    return { eventId: event.id, slug: event.slug, givingAvailable: s.givingAvailable && !!project, formUrl: s.givingAvailable ? (this.config.get('ZEFFY_GALA_GIVING_FORM_URL') ?? null) : null, campaignClosed: s.authorized && !s.campaignOpen, project };
  }

  /** Public view for a published event. Project details appear ONLY after public fundraising was authorized. */
  async publicView(slug: string, locale: 'en' | 'ar' = 'en') {
    const event = await this.prisma.event.findFirst({ where: { slug, deletedAt: null, status: 'PUBLISHED' }, select: { id: true } });
    if (!event) throw new NotFoundException('Event not found');
    const c = await this.row(event.id);
    const s = this.state(c);
    const pick = (en?: string | null, ar?: string | null) => (locale === 'ar' ? (ar || en) : en) || null;
    const p = c?.project;
    return {
      scope: 'GALA_SINGLE_PROJECT' as const,
      project: s.authorized && p && !p.deletedAt && p.provenance !== 'DEMO' ? { code: p.code, name: pick(p.nameEn, p.nameAr), location: pick(p.locationEn, p.locationAr) } : null,
      giving: {
        available: s.givingAvailable,
        formUrl: s.givingAvailable ? this.config.get('ZEFFY_GALA_GIVING_FORM_URL') : null,
        closesAt: s.authorized ? (c?.donationsCloseAt ?? null) : null,
        campaignClosed: s.authorized && !s.campaignOpen,
        /** Additional donations made during ticket checkout are handled on SDI's ticket form. */
        withTickets: 'ON_TICKET_FORM' as const,
      },
      donationRefundNotice: c?.donationRefundNoticeApprovedAt ? ('NON_REFUNDABLE' as const) : null,
      ticketRefundPolicy: c?.ticketRefundPolicyApprovedAt ? pick(c.ticketRefundPolicyEn, c.ticketRefundPolicyAr) : null,
      /** Nov 19 2026: SDI-approved, published Gala disclosures (exact wording); null until then. */
      disclosures: await this.legal.publicDisclosures(event.id, locale),
    };
  }
}

@ApiTags('Admin · Gala fundraising project')
@ApiCookieAuth()
@Controller('admin/events/:eventId/fundraising')
export class AdminFundraisingController {
  constructor(private readonly svc: EventFundraisingService) {}

  @Get()
  @RequirePermissions('events.read')
  @ApiOperation({ summary: 'Gala fundraising scope: the single approved project, approvals and effective public state' })
  get(@Param('eventId', SafeIdPipe) eventId: string) {
    return this.svc.adminGet(eventId);
  }

  @Put()
  @RequirePermissions('events.manage')
  @ApiOperation({ summary: 'Set project / Project Plan reference / closing date / ticket refund policy text (clears dependent approvals)' })
  update(@Param('eventId', SafeIdPipe) eventId: string, @Body() dto: UpdateFundraisingDto, @Actor() actor: ActorContext) {
    return this.svc.update(eventId, dto, actor);
  }

  @Post('approve')
  @HttpCode(200)
  @RequirePermissions('events.approve')
  @ApiOperation({ summary: 'Record one approval step (different administrator from the last editor)' })
  approve(@Param('eventId', SafeIdPipe) eventId: string, @Body() dto: ApproveFundraisingDto, @Actor() actor: ActorContext) {
    return this.svc.approve(eventId, dto.step, dto.note, actor);
  }

  @Post('revoke')
  @HttpCode(200)
  @RequirePermissions('events.approve')
  @ApiOperation({ summary: 'Withdraw an approval (always allowed; public state is reduced immediately)' })
  revoke(@Param('eventId', SafeIdPipe) eventId: string, @Body() dto: RevokeFundraisingDto, @Actor() actor: ActorContext) {
    return this.svc.revoke(eventId, dto.step, dto.reason, actor);
  }
}

@ApiTags('Public · Events')
@Public()
@Controller('public/events')
export class PublicFundraisingController {
  constructor(private readonly svc: EventFundraisingService) {}

  @Get(':slug/fundraising')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Gala fundraising scope: approved project (only once authorized), SDI donation form availability, approved refund notices' })
  get(@Param('slug') slug: string, @Query() q: PublicFundraisingQueryDto) {
    if (!/^[a-z0-9-]{1,120}$/.test(slug)) throw new NotFoundException('Event not found');
    return this.svc.publicView(slug, q.locale ?? 'en');
  }
}

@Module({ controllers: [AdminFundraisingController, PublicFundraisingController, AdminLegalCopyController], providers: [EventFundraisingService, LegalCopyService], exports: [EventFundraisingService] })
export class FundraisingModule {}
