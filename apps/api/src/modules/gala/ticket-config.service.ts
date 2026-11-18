import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { ActorContext, AuthUser } from '../../common/types/auth-request';
import { AMOUNT_PATTERN, D } from '../donations/money';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Ticket labels are printed with the built-in PDF fonts: printable ASCII + Latin-1 only. */
const LABEL = new RegExp(`^[ -~${String.fromCharCode(0xa0)}-${String.fromCharCode(0xff)}]+$`);
const PRICE = /^(?:[1-9]\d{0,8})(?:\.\d{1,2})?$/;

export class CreateTicketConfigDto {
  @ApiProperty({ example: '750.00', description: 'Price per guest, decimal string' }) @Matches(PRICE) ticketPrice!: string;
  @ApiPropertyOptional({ example: 'USD' }) @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @ApiProperty({ example: 'Every Light Counts' }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(255) @Matches(LABEL) displayNameEn!: string;
  @ApiProperty({ example: 'Saturday, December 12, 2026' }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) @Matches(LABEL) eventDateLabelEn!: string;
  @ApiProperty({ example: '583 Park Avenue, New York, USA' }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(255) @Matches(LABEL) venueLabelEn!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(50) maxTicketsPerBooking?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100000) capacity?: number;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(500) @Matches(LABEL) checkInNoteEn?: string;
}

export class UpdateTicketConfigDto {
  @ApiPropertyOptional({ example: '750.00' }) @IsOptional() @Matches(PRICE) ticketPrice?: string;
  @ApiPropertyOptional({ description: 'Opens/closes ticket sales (requires events.approve). Independent of payment availability.' }) @IsOptional() @IsBoolean() salesEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(255) @Matches(LABEL) displayNameEn?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) @Matches(LABEL) eventDateLabelEn?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(255) @Matches(LABEL) venueLabelEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(50) maxTicketsPerBooking?: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Min(1) @Max(100000) capacity?: number | null;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(500) @Matches(LABEL) checkInNoteEn?: string;
}

/** Server-side ticket sale configuration. The price and the sales switch can only be changed here, never by a client request. */
@Injectable()
export class TicketConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private view(c: { ticketPrice: unknown; [k: string]: unknown }) {
    return { ...c, ticketPrice: D(c.ticketPrice as string).toFixed(2) };
  }

  async get(eventId: string) {
    const c = await this.prisma.eventTicketConfig.findUnique({ where: { eventId } });
    if (!c) throw new NotFoundException('Ticketing is not configured for this event');
    return this.view(c);
  }

  async create(eventId: string, dto: CreateTicketConfigDto, actor: ActorContext) {
    if (await this.prisma.eventTicketConfig.findUnique({ where: { eventId } })) throw new ConflictException('Ticketing is already configured for this event');
    if (!AMOUNT_PATTERN.test(dto.ticketPrice)) throw new ConflictException('Invalid price');
    const c = await this.prisma.eventTicketConfig.create({
      data: {
        eventId,
        ticketPrice: D(dto.ticketPrice),
        currency: dto.currency ?? 'USD',
        displayNameEn: dto.displayNameEn,
        eventDateLabelEn: dto.eventDateLabelEn,
        venueLabelEn: dto.venueLabelEn,
        maxTicketsPerBooking: dto.maxTicketsPerBooking ?? 10,
        capacity: dto.capacity ?? null,
        checkInNoteEn: dto.checkInNoteEn ?? null,
        salesEnabled: false, // opening sales is a separate, approval-gated step
        updatedById: actor.userId,
      },
    });
    await this.audit.record(actor, 'gala.ticketing.create', 'EventTicketConfig', c.id, { ticketPrice: dto.ticketPrice, currency: c.currency, salesEnabled: false });
    return this.view(c);
  }

  async update(eventId: string, dto: UpdateTicketConfigDto, user: AuthUser, actor: ActorContext) {
    const current = await this.prisma.eventTicketConfig.findUnique({ where: { eventId } });
    if (!current) throw new NotFoundException('Ticketing is not configured for this event');
    if (dto.salesEnabled !== undefined && !user.isSuperAdmin && !user.permissions.includes('events.approve')) {
      throw new ForbiddenException({ message: 'Opening or closing ticket sales requires events.approve', code: 'FORBIDDEN', details: { missing: ['events.approve'] } });
    }
    const { ticketPrice, ...rest } = dto;
    const c = await this.prisma.eventTicketConfig.update({
      where: { eventId },
      data: { ...rest, ...(ticketPrice !== undefined ? { ticketPrice: D(ticketPrice) } : {}), updatedById: actor.userId },
    });
    await this.audit.record(actor, 'gala.ticketing.update', 'EventTicketConfig', c.id, {
      fields: Object.keys(dto),
      ...(ticketPrice !== undefined ? { ticketPriceFrom: D(current.ticketPrice).toFixed(2), ticketPriceTo: ticketPrice } : {}),
      ...(dto.salesEnabled !== undefined ? { salesEnabled: dto.salesEnabled } : {}),
    });
    return this.view(c);
  }
}
