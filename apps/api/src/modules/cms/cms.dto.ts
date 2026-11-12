import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { Provenance, SectionKey } from '../../generated/prisma/enums';
import { SAFE_HREF } from '../../common/dto/shared.dto';

export class UpdatePageDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) titleEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) titleAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) seoTitleEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) seoTitleAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) seoDescriptionEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) seoDescriptionAr?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() ogImageId?: string | null;
}

export class SectionContentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) @Matches(/^[a-z0-9-]+$/) anchor?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isVisible?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) eyebrowEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) eyebrowAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) titleEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) titleAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) subtitleEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) subtitleAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) bodyEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) bodyAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) ctaPrimaryLabelEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) ctaPrimaryLabelAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) @Matches(SAFE_HREF) ctaPrimaryHref?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) ctaSecondaryLabelEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) ctaSecondaryLabelAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) @Matches(SAFE_HREF) ctaSecondaryHref?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() mediaId?: string | null;
  @ApiPropertyOptional({ description: 'Flat map of short labels, e.g. { "visionLabel": "Our vision" } (max 40 keys, 500 chars each)' })
  @IsOptional() @IsObject() labelsEn?: Record<string, string>;
  @ApiPropertyOptional() @IsOptional() @IsObject() labelsAr?: Record<string, string>;
  @ApiPropertyOptional({ enum: Provenance }) @IsOptional() @IsEnum(Provenance) provenance?: Provenance;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) sourceRef?: string;
}

export class CreateSectionDto extends SectionContentDto {
  @ApiProperty({ enum: SectionKey }) @IsEnum(SectionKey) key!: SectionKey;
}

export class UpdateSectionDto extends SectionContentDto {}

export class CreateSectionItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) @Matches(/^[a-z0-9_-]+$/) code?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isVisible?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) titleEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) titleAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) textEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) textAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) @Matches(/^[a-z0-9-]+$/) icon?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) @Matches(SAFE_HREF) href?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() mediaId?: string | null;
  @ApiPropertyOptional({ enum: Provenance }) @IsOptional() @IsEnum(Provenance) provenance?: Provenance;
}

export class UpdateSectionItemDto extends PartialType(CreateSectionItemDto) {}
