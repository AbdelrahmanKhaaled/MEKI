import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { ProgrammeKind, Provenance, PublicationStatus } from '../../generated/prisma/enums';
import { SLUG_PATTERN } from '../../common/utils';

export class CreateProgrammeDto {
  @ApiProperty({ example: 'PRG-10' }) @IsString() @Matches(/^[A-Z0-9-]{2,40}$/) code!: string;
  @ApiPropertyOptional({ description: 'Generated from nameEn when omitted' }) @IsOptional() @Matches(SLUG_PATTERN) @MaxLength(100) slug?: string;
  @ApiPropertyOptional({ enum: ProgrammeKind }) @IsOptional() @IsEnum(ProgrammeKind) kind?: ProgrammeKind;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) number?: number;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(255) nameEn!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) nameAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) altNameEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) altNameAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) shortDescEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) shortDescAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) mandateEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) mandateAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20000) descriptionEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20000) descriptionAr?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(200, { each: true }) focusAreasEn?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(200, { each: true }) focusAreasAr?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) @Matches(/^[a-z0-9-]+$/) icon?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() coverMediaId?: string | null;
  /** Phase 11A: MEKI-approved programme fundraising goal (decimal string, e.g. "250000.00"). Set together with targetCurrency, or both null. Never derived. */
  @ApiPropertyOptional({ nullable: true, example: '250000.00', description: 'Approved programme goal; null clears it' }) @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/, { message: 'targetAmount must be a positive decimal with at most 2 decimals' }) targetAmount?: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'USD' }) @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @Matches(/^[A-Z]{3}$/) targetCurrency?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional({ enum: Provenance }) @IsOptional() @IsEnum(Provenance) provenance?: Provenance;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) sourceRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) seoTitleEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) seoTitleAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) seoDescriptionEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) seoDescriptionAr?: string;
}

export class UpdateProgrammeDto extends PartialType(CreateProgrammeDto) {}

export class ProgrammeQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: PublicationStatus }) @IsOptional() @IsEnum(PublicationStatus) status?: PublicationStatus;
  @ApiPropertyOptional({ enum: ProgrammeKind }) @IsOptional() @IsEnum(ProgrammeKind) kind?: ProgrammeKind;
  @ApiPropertyOptional() @IsOptional() @IsIn(['true', 'false']) isFeatured?: string;
  /** Phase 6C (additive): filter by provenance. */
  @ApiPropertyOptional({ enum: Provenance }) @IsOptional() @IsEnum(Provenance) provenance?: Provenance;
}

/** Phase 6C (additive): filters for the (unpaginated) project list. `programmeId` keeps its previous meaning. */
export class ProjectQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) programmeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) search?: string;
  @ApiPropertyOptional({ enum: Provenance }) @IsOptional() @IsEnum(Provenance) provenance?: Provenance;
}

export class CreateProjectDto {
  @ApiProperty() @IsString() @Matches(/^[A-Z0-9-]{2,60}$/) code!: string;
  @ApiPropertyOptional() @IsOptional() @Matches(SLUG_PATTERN) @MaxLength(120) slug?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() programmeId?: string | null;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(255) nameEn!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) nameAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) locationEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) locationAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) sourceFolder?: string;
  /** Phase 11A (additive): public presentation of the cause on its programme page. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) summaryEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) summaryAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20000) descriptionEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20000) descriptionAr?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() coverMediaId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @ApiPropertyOptional({ enum: Provenance }) @IsOptional() @IsEnum(Provenance) provenance?: Provenance;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) sourceRef?: string;
}

export class UpdateProjectDto extends PartialType(CreateProjectDto) {}
