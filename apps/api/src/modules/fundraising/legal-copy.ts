import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, NotFoundException, Param, Post, Put, UnprocessableEntityException } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import type { EventLegalCopy, Prisma } from '../../generated/prisma/client';
import { Actor, RequirePermissions } from '../../common/decorators';
import type { ActorContext } from '../../common/types/auth-request';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { D } from '../donations/money';
import { SafeIdPipe } from '../gala/gala-support';
import { RevalidatesPublic } from '../revalidation/revalidation.module';

/**
 * November 19 2026 client update — approval-gated legal copy for the Gala (ticket purchase disclosure, ticket receipt wording,
 * website disclosure). MEKI drafted the wording; SDI is the fiscal sponsor and the ONLY receipt issuer, so:
 *  - text is entered verbatim by an administrator (events.manage) — the system never generates legal or tax wording;
 *  - every edit clears SDI approval and publication;
 *  - SDI's written approval is recorded by a DIFFERENT administrator (events.approve), with a reference note;
 *  - publication needs that approval, consistent amounts (price = fair market value + deductible portion) and, for the
 *    ticket disclosure, a price equal to the LIVE ticket price (stale wording such as USD 750 can never be published);
 *  - TICKET_RECEIPT is wording for SDI's own receipt configuration: MEKI never publishes it and never issues receipts.
 */
export const LEGAL_KINDS = ['TICKET_PURCHASE_DISCLOSURE', 'TICKET_RECEIPT', 'WEBSITE_DISCLOSURE'] as const;
export type LegalKind = (typeof LEGAL_KINDS)[number];
const PUBLISHABLE: readonly LegalKind[] = ['TICKET_PURCHASE_DISCLOSURE', 'WEBSITE_DISCLOSURE'];
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;

export class UpdateLegalCopyDto {
  @ApiPropertyOptional({ nullable: true, description: 'Exact English wording (verbatim)' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(10000) textEn?: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Exact Arabic wording (verbatim, if supplied)' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(10000) textAr?: string | null;
  @ApiPropertyOptional({ nullable: true, example: '500.00' }) @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(MONEY) ticketPrice?: string | null;
  @ApiPropertyOptional({ nullable: true, example: '200.00' }) @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(MONEY) fairMarketValue?: string | null;
  @ApiPropertyOptional({ nullable: true, example: '300.00' }) @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(MONEY) deductibleAmount?: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Where the wording came from (e.g. "MEKI draft, e-mail 2026-11-19")' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(255) sourceNote?: string | null;
}
export class LegalApprovalDto {
  @ApiProperty({ description: "Reference to SDI's WRITTEN approval (who, date, channel)" }) @IsString() @MinLength(5) @MaxLength(500) note!: string;
}
export class LegalWithdrawDto {
  @ApiProperty({ enum: ['SDI_APPROVAL', 'PUBLICATION'] }) @IsIn(['SDI_APPROVAL', 'PUBLICATION']) what!: 'SDI_APPROVAL' | 'PUBLICATION';
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

const money = (v: Prisma.Decimal | null) => (v === null ? null : D(v).toFixed(2));

@Injectable()
export class LegalCopyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private kind(k: string): LegalKind {
    if (!(LEGAL_KINDS as readonly string[]).includes(k)) throw new NotFoundException('Unknown legal copy kind');
    return k as LegalKind;
  }
  private async event(eventId: string) {
    const e = await this.prisma.event.findFirst({ where: { id: eventId, deletedAt: null }, select: { id: true, ticketConfig: { select: { ticketPrice: true, currency: true } } } });
    if (!e) throw new NotFoundException('Event not found');
    return e;
  }
  private view(c: EventLegalCopy) {
    return { ...c, ticketPrice: money(c.ticketPrice), fairMarketValue: money(c.fairMarketValue), deductibleAmount: money(c.deductibleAmount), publishable: PUBLISHABLE.includes(c.kind) };
  }

  async list(eventId: string) {
    const e = await this.event(eventId);
    const rows = await this.prisma.eventLegalCopy.findMany({ where: { eventId } });
    return {
      liveTicketPrice: e.ticketConfig ? D(e.ticketConfig.ticketPrice).toFixed(2) : null,
      items: LEGAL_KINDS.map((kind) => {
        const r = rows.find((x) => x.kind === kind);
        return r ? this.view(r) : { kind, textEn: null, textAr: null, ticketPrice: null, fairMarketValue: null, deductibleAmount: null, sdiApprovedAt: null, publishedAt: null, publishable: PUBLISHABLE.includes(kind) };
      }),
    };
  }

  /** Breakdown must be all-or-none and add up exactly. Exported for unit tests. */
  static checkAmounts(price: string | null, fmv: string | null, deductible: string | null) {
    const set = [price, fmv, deductible].filter((v) => v !== null).length;
    if (set !== 0 && set !== 3) throw new UnprocessableEntityException({ message: 'Enter the ticket price, fair market value and deductible portion together', code: 'LEGAL_AMOUNTS_INCOMPLETE' });
    if (set === 3 && !D(fmv!).plus(deductible!).equals(price!)) throw new UnprocessableEntityException({ message: 'Fair market value + deductible portion must equal the ticket price', code: 'LEGAL_AMOUNTS_INCONSISTENT' });
  }

  async update(eventId: string, kindRaw: string, dto: UpdateLegalCopyDto, actor: ActorContext) {
    const kind = this.kind(kindRaw);
    await this.event(eventId);
    const before = await this.prisma.eventLegalCopy.findUnique({ where: { eventId_kind: { eventId, kind } } });
    const norm = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : v.trim() || null);
    const next = {
      textEn: norm(dto.textEn) ?? (dto.textEn === undefined ? (before?.textEn ?? null) : null),
      textAr: norm(dto.textAr) ?? (dto.textAr === undefined ? (before?.textAr ?? null) : null),
      ticketPrice: dto.ticketPrice !== undefined ? dto.ticketPrice : money(before?.ticketPrice ?? null),
      fairMarketValue: dto.fairMarketValue !== undefined ? dto.fairMarketValue : money(before?.fairMarketValue ?? null),
      deductibleAmount: dto.deductibleAmount !== undefined ? dto.deductibleAmount : money(before?.deductibleAmount ?? null),
      sourceNote: norm(dto.sourceNote) ?? (dto.sourceNote === undefined ? (before?.sourceNote ?? null) : null),
    };
    LegalCopyService.checkAmounts(next.ticketPrice, next.fairMarketValue, next.deductibleAmount);
    const changed = (['textEn', 'textAr', 'ticketPrice', 'fairMarketValue', 'deductibleAmount'] as const).filter((k) => {
      const b = k === 'textEn' || k === 'textAr' ? (before?.[k] ?? null) : money(before?.[k] ?? null);
      return (next[k] ?? null) !== b;
    });
    const data = { ...next, updatedById: actor.userId, ...(changed.length ? { sdiApprovedAt: null, sdiApprovedById: null, sdiApprovalNote: null, publishedAt: null, publishedById: null } : {}) };
    const row = await this.prisma.eventLegalCopy.upsert({ where: { eventId_kind: { eventId, kind } }, create: { eventId, kind, ...data }, update: data });
    await this.audit.record(actor, 'event.legal_copy.update', 'Event', eventId, { kind, changed, clearedApproval: changed.length > 0 && !!before?.sdiApprovedAt, unpublished: changed.length > 0 && !!before?.publishedAt });
    return this.view(row);
  }

  async recordSdiApproval(eventId: string, kindRaw: string, note: string, actor: ActorContext) {
    const kind = this.kind(kindRaw);
    const row = await this.prisma.eventLegalCopy.findUnique({ where: { eventId_kind: { eventId, kind } } });
    if (!row || !row.textEn) throw new UnprocessableEntityException({ message: 'Enter the exact wording first', code: 'LEGAL_TEXT_EMPTY' });
    if (row.updatedById === actor.userId) throw new ForbiddenException({ message: 'A different administrator must record SDI approval (four-eyes rule)', code: 'FOUR_EYES_REQUIRED' });
    const updated = await this.prisma.eventLegalCopy.update({ where: { id: row.id }, data: { sdiApprovedAt: new Date(), sdiApprovedById: actor.userId, sdiApprovalNote: note.slice(0, 500) } });
    await this.audit.record(actor, 'event.legal_copy.sdi_approval', 'Event', eventId, { kind, note: note.slice(0, 200) });
    return this.view(updated);
  }

  async publish(eventId: string, kindRaw: string, actor: ActorContext) {
    const kind = this.kind(kindRaw);
    if (!PUBLISHABLE.includes(kind)) throw new ConflictException({ message: 'Ticket receipt wording is configured by SDI on its own receipts; MEKI never publishes it', code: 'LEGAL_NOT_PUBLISHABLE' });
    const e = await this.event(eventId);
    const row = await this.prisma.eventLegalCopy.findUnique({ where: { eventId_kind: { eventId, kind } } });
    if (!row?.sdiApprovedAt) throw new UnprocessableEntityException({ message: "Record SDI's written approval first", code: 'LEGAL_NOT_SDI_APPROVED' });
    if (row.ticketPrice !== null) {
      if (!e.ticketConfig) throw new UnprocessableEntityException({ message: 'The event has no ticket configuration to check the price against', code: 'LEGAL_PRICE_UNVERIFIABLE' });
      if (!D(row.ticketPrice).equals(e.ticketConfig.ticketPrice)) {
        throw new UnprocessableEntityException({ message: `The wording states ${money(row.ticketPrice)} but the live ticket price is ${D(e.ticketConfig.ticketPrice).toFixed(2)}`, code: 'LEGAL_PRICE_MISMATCH' });
      }
    }
    const updated = await this.prisma.eventLegalCopy.update({ where: { id: row.id }, data: { publishedAt: new Date(), publishedById: actor.userId } });
    await this.audit.record(actor, 'event.legal_copy.publish', 'Event', eventId, { kind });
    return this.view(updated);
  }

  async withdraw(eventId: string, kindRaw: string, what: 'SDI_APPROVAL' | 'PUBLICATION', reason: string, actor: ActorContext) {
    const kind = this.kind(kindRaw);
    const row = await this.prisma.eventLegalCopy.findUnique({ where: { eventId_kind: { eventId, kind } } });
    if (!row) throw new NotFoundException('Nothing to withdraw');
    const data = what === 'SDI_APPROVAL' ? { sdiApprovedAt: null, sdiApprovedById: null, sdiApprovalNote: null, publishedAt: null, publishedById: null } : { publishedAt: null, publishedById: null };
    const updated = await this.prisma.eventLegalCopy.update({ where: { id: row.id }, data });
    await this.audit.record(actor, 'event.legal_copy.withdraw', 'Event', eventId, { kind, what, reason: reason.slice(0, 200) });
    return this.view(updated);
  }

  /** Public: only PUBLISHED, SDI-approved disclosures whose stated price still equals the live ticket price. */
  async publicDisclosures(eventId: string, locale: 'en' | 'ar') {
    const e = await this.event(eventId);
    const rows = await this.prisma.eventLegalCopy.findMany({ where: { eventId, kind: { in: [...PUBLISHABLE] }, publishedAt: { not: null }, sdiApprovedAt: { not: null } } });
    const pick = (r?: EventLegalCopy) => {
      if (!r) return null;
      if (r.ticketPrice !== null && (!e.ticketConfig || !D(r.ticketPrice).equals(e.ticketConfig.ticketPrice))) return null; // price changed since publication
      return (locale === 'ar' ? r.textAr || r.textEn : r.textEn) ?? null;
    };
    return { ticketPurchase: pick(rows.find((r) => r.kind === 'TICKET_PURCHASE_DISCLOSURE')), website: pick(rows.find((r) => r.kind === 'WEBSITE_DISCLOSURE')) };
  }
}

@ApiTags('Admin · Gala legal copy')
@ApiCookieAuth()
@RevalidatesPublic('events')
@Controller('admin/events/:eventId/legal-copy')
export class AdminLegalCopyController {
  constructor(private readonly svc: LegalCopyService) {}

  @Get()
  @RequirePermissions('events.read')
  @ApiOperation({ summary: 'Gala legal copy drafts (ticket purchase disclosure, SDI receipt wording, website disclosure) and their approval state' })
  list(@Param('eventId', SafeIdPipe) eventId: string) {
    return this.svc.list(eventId);
  }

  @Put(':kind')
  @RequirePermissions('events.manage')
  @ApiOperation({ summary: 'Save exact wording / amounts (clears SDI approval and publication)' })
  update(@Param('eventId', SafeIdPipe) eventId: string, @Param('kind') kind: string, @Body() dto: UpdateLegalCopyDto, @Actor() actor: ActorContext) {
    return this.svc.update(eventId, kind, dto, actor);
  }

  @Post(':kind/sdi-approval')
  @HttpCode(200)
  @RequirePermissions('events.approve')
  @ApiOperation({ summary: "Record SDI's written approval of this wording (different administrator from the last editor)" })
  approve(@Param('eventId', SafeIdPipe) eventId: string, @Param('kind') kind: string, @Body() dto: LegalApprovalDto, @Actor() actor: ActorContext) {
    return this.svc.recordSdiApproval(eventId, kind, dto.note, actor);
  }

  @Post(':kind/publish')
  @HttpCode(200)
  @RequirePermissions('events.approve')
  @ApiOperation({ summary: 'Publish an SDI-approved disclosure (never the ticket receipt wording)' })
  publish(@Param('eventId', SafeIdPipe) eventId: string, @Param('kind') kind: string, @Actor() actor: ActorContext) {
    return this.svc.publish(eventId, kind, actor);
  }

  @Post(':kind/withdraw')
  @HttpCode(200)
  @RequirePermissions('events.approve')
  @ApiOperation({ summary: 'Withdraw publication or the recorded SDI approval (always allowed)' })
  withdraw(@Param('eventId', SafeIdPipe) eventId: string, @Param('kind') kind: string, @Body() dto: LegalWithdrawDto, @Actor() actor: ActorContext) {
    return this.svc.withdraw(eventId, kind, dto.what, dto.reason, actor);
  }
}
