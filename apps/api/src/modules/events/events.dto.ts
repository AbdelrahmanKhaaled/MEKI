import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
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
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { SAFE_HREF } from '../../common/dto/shared.dto';
import { SectionContentDto } from '../cms/cms.dto';
import { EventMediaRole, EventRegistrationMode, EventStatus, EventVisibility, Provenance } from '../../generated/prisma/enums';
import { SLUG_PATTERN } from '../../common/utils';

const HTTPS = /^https:\/\/[^\s"'<>]+$/;

export const EVENT_SECTION_KEYS = [
  'EVENT_HERO',
  'EVENT_ABOUT',
  'EVENT_HIGHLIGHTS',
  'EVENT_AGENDA',
  'EVENT_SPEAKERS',
  'EVENT_VENUE',
  'EVENT_SPONSORSHIP',
  'EVENT_CAMPAIGNS',
  'EVENT_FAQ',
  'EVENT_REGISTRATION',
  'EVENT_CONTACT',
] as const;
export type EventSectionKey = (typeof EVENT_SECTION_KEYS)[number];

export class CreateEventDto {
  @ApiProperty({ example: 'EVT-GALA-2027' }) @IsString() @Matches(/^[A-Z0-9-]{2,60}$/) code!: string;
  @ApiPropertyOptional({ description: 'Generated from titleEn when omitted' }) @IsOptional() @Matches(SLUG_PATTERN) @MaxLength(120) slug?: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(255) titleEn!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) titleAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) shortDescEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) shortDescAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20000) descriptionEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20000) descriptionAr?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(300, { each: true }) highlightsEn?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(300, { each: true }) highlightsAr?: string[];
  @ApiPropertyOptional({ nullable: true, description: 'ISO-8601 with offset, e.g. 2027-12-12T19:00:00+02:00' })
  @IsOptional() @IsISO8601({ strict: true }) startsAt?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsISO8601({ strict: true }) endsAt?: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'Africa/Cairo' }) @IsOptional() @IsString() @MaxLength(64) timezone?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) scheduleNoteEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) scheduleNoteAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) venueNameEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) venueNameAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) addressEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) addressAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) city?: string;
  @ApiPropertyOptional({ example: 'EG' }) @IsOptional() @Matches(/^[A-Z]{2}$/) countryCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) @Matches(HTTPS, { message: 'mapUrl must be https' }) mapUrl?: string;
  @ApiPropertyOptional({ enum: EventRegistrationMode }) @IsOptional() @IsEnum(EventRegistrationMode) registrationMode?: EventRegistrationMode;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(500) @Matches(HTTPS, { message: 'externalRegistrationUrl must be https' }) externalRegistrationUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) ctaPrimaryLabelEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) ctaPrimaryLabelAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) @Matches(SAFE_HREF) ctaPrimaryHref?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) ctaSecondaryLabelEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) ctaSecondaryLabelAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) @Matches(SAFE_HREF) ctaSecondaryHref?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() heroMediaId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() coverMediaId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional({ enum: EventVisibility }) @IsOptional() @IsEnum(EventVisibility) visibility?: EventVisibility;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @ApiPropertyOptional({ enum: Provenance }) @IsOptional() @IsEnum(Provenance) provenance?: Provenance;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) sourceRef?: string;
  @ApiPropertyOptional({ description: 'Admin-only; never exposed publicly' }) @IsOptional() @IsString() @MaxLength(5000) internalNotes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) seoTitleEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) seoTitleAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) seoDescriptionEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) seoDescriptionAr?: string;
}

export class UpdateEventDto extends PartialType(OmitType(CreateEventDto, ['code'] as const)) {}

export class EventQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: EventStatus }) @IsOptional() @IsEnum(EventStatus) status?: EventStatus;
  @ApiPropertyOptional({ enum: EventVisibility }) @IsOptional() @IsEnum(EventVisibility) visibility?: EventVisibility;
  @ApiPropertyOptional() @IsOptional() @IsIn(['true', 'false']) isFeatured?: string;
  @ApiPropertyOptional({ description: 'startsAt >= from' }) @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional({ description: 'startsAt <= to' }) @IsOptional() @IsISO8601() to?: string;
}

export class PublicEventQueryDto {
  @ApiPropertyOptional({ enum: ['en', 'ar'] }) @IsOptional() @IsIn(['en', 'ar']) locale?: 'en' | 'ar';
  @ApiPropertyOptional() @IsOptional() @IsIn(['true', 'false']) featured?: string;
  @ApiPropertyOptional({ enum: ['upcoming', 'past', 'all'], default: 'all' }) @IsOptional() @IsIn(['upcoming', 'past', 'all']) when?: 'upcoming' | 'past' | 'all';
}

export class EventGalleryItemDto {
  @ApiProperty() @IsString() mediaId!: string;
  @ApiPropertyOptional({ enum: EventMediaRole, default: 'GALLERY' }) @IsOptional() @IsEnum(EventMediaRole) role?: EventMediaRole;
}

export class EventGalleryDto {
  @ApiProperty({ type: [EventGalleryItemDto], description: 'Order = display order' })
  @IsArray() @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => EventGalleryItemDto)
  items!: EventGalleryItemDto[];
}

export class EventCampaignsDto {
  @ApiProperty({ type: [String], description: 'Campaign IDs in display order (links only; campaigns are not modified)' })
  @IsArray() @ArrayUnique() @ArrayMaxSize(20) @IsString({ each: true })
  campaignIds!: string[];
}

export class ApproveEventDto {
  @ApiProperty({ description: 'Reference to the client approval (who/when/channel)' })
  @IsString() @MinLength(5) @MaxLength(2000) note!: string;
}

export class CreateEventSectionDto extends SectionContentDto {
  @ApiProperty({ enum: EVENT_SECTION_KEYS }) @IsIn(EVENT_SECTION_KEYS) key!: EventSectionKey;
}
