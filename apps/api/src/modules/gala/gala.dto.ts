import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  Equals,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { BookingPaymentStatus, EventBookingStatus, EventJobStatus, EventJobType, TicketStatus } from '../../generated/prisma/enums';
import { NAME_PATTERN, PHONE_PATTERN } from './gala.rules';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

// ───────────── public ─────────────

export class PurchaserDto {
  @ApiProperty({ example: 'Amira Hassan' }) @Transform(trim) @IsString() @Matches(NAME_PATTERN, { message: 'fullName contains invalid characters' }) fullName!: string;
  @ApiProperty() @Transform(lower) @IsEmail() @MaxLength(191) email!: string;
  @ApiProperty({ example: '+1 212 555 0100' }) @Transform(trim) @IsString() @Matches(PHONE_PATTERN, { message: 'phone is not a valid phone number' }) phone!: string;
}

export class GuestInputDto {
  @ApiProperty() @Transform(trim) @IsString() @Matches(NAME_PATTERN, { message: 'fullName contains invalid characters' }) fullName!: string;
  @ApiProperty() @Transform(lower) @IsEmail() @MaxLength(191) email!: string;
  @ApiProperty() @Transform(trim) @IsString() @Matches(PHONE_PATTERN, { message: 'phone is not a valid phone number' }) phone!: string;
  @ApiProperty({ example: 'None', description: 'Dietary requirements ("None" if there are none)' })
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(500) dietaryRequirements!: string;
  @ApiPropertyOptional({ description: 'The purchaser is this guest (informational)' }) @IsOptional() @IsBoolean() isPurchaser?: boolean;
}

/** NOTE: there is intentionally no price/amount field — unknown properties are rejected (whitelist + forbidNonWhitelisted). */
export class CreateBookingDto {
  @ApiProperty({ type: PurchaserDto }) @ValidateNested() @Type(() => PurchaserDto) purchaser!: PurchaserDto;
  @ApiProperty({ type: [GuestInputDto], description: 'One entry per individual ticket; each ticket is issued in that guest\'s own name' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => GuestInputDto) guests!: GuestInputDto[];
  @ApiPropertyOptional({ description: 'Optional cross-check: must equal guests.length' }) @IsOptional() @IsInt() @Min(1) ticketCount?: number;
  @ApiPropertyOptional({ enum: ['en', 'ar'] }) @IsOptional() @IsIn(['en', 'ar']) locale?: 'en' | 'ar';
  @ApiProperty({ description: 'Must be true' }) @Equals(true) privacyConsent!: boolean;
}

export class BookingTokenQueryDto {
  @ApiPropertyOptional({ description: 'Booking access token (alternative to the X-Booking-Token header)' }) @IsOptional() @IsString() @MaxLength(100) token?: string;
  @ApiPropertyOptional({ enum: ['en', 'ar'] }) @IsOptional() @IsIn(['en', 'ar']) locale?: 'en' | 'ar';
}

// ───────────── admin ─────────────

export class BookingQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: EventBookingStatus }) @IsOptional() @IsEnum(EventBookingStatus) bookingStatus?: EventBookingStatus;
  @ApiPropertyOptional({ enum: BookingPaymentStatus }) @IsOptional() @IsEnum(BookingPaymentStatus) paymentStatus?: BookingPaymentStatus;
  @ApiPropertyOptional({ description: 'Include test-provider bookings (excluded by default)' }) @IsOptional() @IsIn(['true', 'false']) includeTest?: 'true' | 'false';
  @ApiPropertyOptional({ description: 'Booking date (createdAt) >= from (ISO-8601) — Phase 6E' }) @IsOptional() @IsISO8601({ strict: true }) from?: string;
  @ApiPropertyOptional({ description: 'Booking date (createdAt) < to (ISO-8601, exclusive) — Phase 6E' }) @IsOptional() @IsISO8601({ strict: true }) to?: string;
}

// ───────────── Phase 6E (admin operations, read-only additions) ─────────────

export class JobQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: EventJobStatus }) @IsOptional() @IsEnum(EventJobStatus) status?: EventJobStatus;
  @ApiPropertyOptional({ enum: EventJobType }) @IsOptional() @IsEnum(EventJobType) type?: EventJobType;
}

export class CheckInLookupQueryDto {
  @ApiProperty({ description: 'Ticket number (or part of it) or guest name; at least 3 characters' }) @Transform(trim) @IsString() @MinLength(3) @MaxLength(60) q!: string;
}

export class CheckInHistoryQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: ['checked_in', 'manual', 'rejected', 'undo'] }) @IsOptional() @IsIn(['checked_in', 'manual', 'rejected', 'undo']) kind?: 'checked_in' | 'manual' | 'rejected' | 'undo';
}

export class GuestQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: BookingPaymentStatus }) @IsOptional() @IsEnum(BookingPaymentStatus) paymentStatus?: BookingPaymentStatus;
  @ApiPropertyOptional({ enum: TicketStatus }) @IsOptional() @IsEnum(TicketStatus) ticketStatus?: TicketStatus;
  @ApiPropertyOptional({ enum: ['CHECKED_IN', 'NOT_CHECKED_IN'] }) @IsOptional() @IsIn(['CHECKED_IN', 'NOT_CHECKED_IN']) checkInStatus?: 'CHECKED_IN' | 'NOT_CHECKED_IN';
  @ApiPropertyOptional({ description: 'Include test-provider bookings (excluded by default)' }) @IsOptional() @IsIn(['true', 'false']) includeTest?: 'true' | 'false';
}

export class GuestExportQueryDto extends GuestQueryDto {
  @ApiPropertyOptional({ enum: ['csv', 'xlsx'], default: 'csv' })
  @IsOptional() @IsIn(['csv', 'xlsx']) format?: 'csv' | 'xlsx';
}

export class TicketQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: TicketStatus }) @IsOptional() @IsEnum(TicketStatus) status?: TicketStatus;
}

export class UpdateGuestDto {
  @ApiProperty() @IsString() @MaxLength(30) id!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Matches(NAME_PATTERN) fullName?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(lower) @IsEmail() @MaxLength(191) email?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Matches(PHONE_PATTERN) phone?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(500) dietaryRequirements?: string;
}

export class UpdateBookingDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Matches(NAME_PATTERN) purchaserName?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(lower) @IsEmail() @MaxLength(191) purchaserEmail?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Matches(PHONE_PATTERN) purchaserPhone?: string;
  @ApiPropertyOptional({ type: [UpdateGuestDto], description: 'Changing a name on an issued ticket rotates its QR token and regenerates the PDF' })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => UpdateGuestDto) guests?: UpdateGuestDto[];
}

export class ReasonDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class ValidateCheckInDto {
  @ApiProperty({ description: 'Scanned QR content (opaque token)', example: 'mkt_…' }) @IsString() @MaxLength(100) token!: string;
  @ApiPropertyOptional({ description: 'true = look up without recording a check-in' }) @IsOptional() @IsBoolean() verifyOnly?: boolean;
}

export class FinancialQueryDto {
  @ApiPropertyOptional({ description: 'Include test-provider bookings (excluded by default)' }) @IsOptional() @IsIn(['true', 'false']) includeTest?: 'true' | 'false';
}
