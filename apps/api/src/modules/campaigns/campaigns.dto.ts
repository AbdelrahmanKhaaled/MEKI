import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { CampaignStatus, Provenance } from '../../generated/prisma/enums';
import { SLUG_PATTERN } from '../../common/utils';

export class CreateCampaignDto {
  @ApiProperty({ example: 'CMP-HOSPITALS' }) @IsString() @Matches(/^[A-Z0-9-]{2,60}$/) code!: string;
  @ApiPropertyOptional() @IsOptional() @Matches(SLUG_PATTERN) @MaxLength(120) slug?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() programmeId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() projectId?: string | null;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(255) titleEn!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) titleAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) summaryEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) summaryAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20000) descriptionEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20000) descriptionAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) locationEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) locationAr?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() coverMediaId?: string | null;
  @ApiPropertyOptional({ example: 'USD' }) @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @ApiPropertyOptional({ type: [Number], description: 'Preset amounts in major units; empty = use site defaults' })
  @IsOptional() @IsArray() @ArrayMaxSize(8) @ArrayUnique() @IsNumber({ maxDecimalPlaces: 2 }, { each: true }) @IsPositive({ each: true })
  suggestedAmounts?: number[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowCustomAmount?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() minCustomAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() maxCustomAmount?: number;
  @ApiPropertyOptional({ description: 'Only a figure approved by MEKI. Leave empty otherwise — never estimate.', nullable: true })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() targetAmount?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsISO8601() startsAt?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsISO8601() endsAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @ApiPropertyOptional({ enum: Provenance }) @IsOptional() @IsEnum(Provenance) provenance?: Provenance;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) sourceRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) seoTitleEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) seoTitleAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) seoDescriptionEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) seoDescriptionAr?: string;
}

export class UpdateCampaignDto extends PartialType(OmitType(CreateCampaignDto, ['code'] as const)) {}

export class CampaignQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: CampaignStatus }) @IsOptional() @IsEnum(CampaignStatus) status?: CampaignStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() programmeId?: string;
  @ApiPropertyOptional({ enum: Provenance }) @IsOptional() @IsEnum(Provenance) provenance?: Provenance;
  @ApiPropertyOptional() @IsOptional() @IsIn(['true', 'false']) isFeatured?: string;
}

export class ApproveCampaignDto {
  @ApiProperty({ description: 'Reference to MEKI approval (e.g. e-mail/date/approver)' })
  @IsString() @MinLength(5) @MaxLength(2000) note!: string;
}

export class DonationsOpenDto {
  @ApiProperty() @IsBoolean() open!: boolean;
}
