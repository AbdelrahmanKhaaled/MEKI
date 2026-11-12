import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { LOCALES, type Locale } from '../utils/localize';

export class LocaleQueryDto {
  @ApiPropertyOptional({ enum: LOCALES, description: 'Flatten bilingual fields for a locale (Arabic falls back to English). Omit for both languages.' })
  @IsOptional()
  @IsIn(LOCALES)
  locale?: Locale;
}

export class ReorderDto {
  @ApiProperty({ type: [String], description: 'IDs in the desired order' })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids!: string[];
}

export class MediaIdsDto {
  @ApiProperty({ type: [String], description: 'Media asset IDs in gallery order' })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  mediaIds!: string[];
}

export class NoteDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

/** Validates that an href is a safe in-site anchor/path or an https URL (no javascript:, data:). */
export const SAFE_HREF = /^(#[\w-]{1,60}|\/(?!\/)[\w\-/.#?=&%]*|https:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+|tel:\+?[\d\s-]+)$/;
