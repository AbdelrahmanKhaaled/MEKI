import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { LOCALES } from '../../common/utils/localize';

const SOCIAL_NETWORKS = ['facebook', 'instagram', 'x', 'linkedin', 'youtube', 'tiktok', 'whatsapp', 'telegram', 'website'] as const;

export class SocialLinkDto {
  @ApiPropertyOptional({ enum: SOCIAL_NETWORKS }) @IsIn(SOCIAL_NETWORKS) network!: string;
  @ApiPropertyOptional() @IsString() @MaxLength(500) @Matches(/^https:\/\/[^\s"'<>]+$/, { message: 'url must be https' }) url!: string;
}

const ASSET_URL = /^(\/[\w\-/.]+|https:\/\/[^\s"'<>]+)$/;

export class UpdateSiteSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) orgNameEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) orgNameAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) legalNameEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) legalNameAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) taglineEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) taglineAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) legacyLineEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) legacyLineAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) @Matches(ASSET_URL) logoPrimaryUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) @Matches(ASSET_URL) logoInverseUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) @Matches(ASSET_URL) logoIconUrl?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsEmail() @MaxLength(191) contactEmail?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @Matches(/^\+?[\d\s()-]{6,40}$/) contactPhone?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) addressEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) addressAr?: string;
  @ApiPropertyOptional({ type: [SocialLinkDto] })
  @IsOptional() @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => SocialLinkDto)
  socialLinks?: SocialLinkDto[];
  @ApiPropertyOptional({ enum: LOCALES }) @IsOptional() @IsIn(LOCALES) defaultLocale?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) footerTextEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) footerTextAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) footerNoteEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) footerNoteAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) copyrightEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) copyrightAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) seoTitleEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) seoTitleAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) seoDescriptionEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) seoDescriptionAr?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() ogImageId?: string | null;
}

const CURRENCY = /^[A-Z]{3}$/;

export class UpdateDonationSettingsDto {
  @ApiPropertyOptional({ example: 'USD' }) @IsOptional() @Matches(CURRENCY) defaultCurrency?: string;
  @ApiPropertyOptional({ type: [String], example: ['USD'] })
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ArrayUnique() @Matches(CURRENCY, { each: true })
  displayCurrencies?: string[];
  @ApiPropertyOptional({ type: [Number], example: [25, 50, 100, 250] })
  @IsOptional() @IsArray() @ArrayMaxSize(8) @ArrayUnique() @IsNumber({ maxDecimalPlaces: 2 }, { each: true }) @IsPositive({ each: true })
  suggestedAmounts?: number[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowCustomAmount?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() minAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() maxAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowOneTime?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowRecurring?: boolean;
  @ApiPropertyOptional({ description: 'Rejected unless the server has an approved provider configured' })
  @IsOptional() @IsBoolean() paymentsEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) previewNoticeEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) previewNoticeAr?: string;
}
