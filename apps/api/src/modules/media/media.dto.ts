import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { ConsentStatus, MediaCategory, Provenance } from '../../generated/prisma/enums';

export class MediaMetadataDto {
  @ApiPropertyOptional({ maxLength: 300 }) @IsOptional() @IsString() @MaxLength(300) altEn?: string;
  @ApiPropertyOptional({ maxLength: 300 }) @IsOptional() @IsString() @MaxLength(300) altAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) captionEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) captionAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) credit?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) sourceFolder?: string;
  @ApiPropertyOptional({ enum: MediaCategory }) @IsOptional() @IsEnum(MediaCategory) category?: MediaCategory;
  @ApiPropertyOptional({ enum: ConsentStatus }) @IsOptional() @IsEnum(ConsentStatus) consentStatus?: ConsentStatus;
  @ApiPropertyOptional({ enum: Provenance }) @IsOptional() @IsEnum(Provenance) provenance?: Provenance;
}

/** Multipart text fields accompanying an upload. */
export class UploadMediaDto extends MediaMetadataDto {}

export class MediaQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: MediaCategory }) @IsOptional() @IsEnum(MediaCategory) category?: MediaCategory;
  @ApiPropertyOptional({ enum: ConsentStatus }) @IsOptional() @IsEnum(ConsentStatus) consentStatus?: ConsentStatus;
  @ApiPropertyOptional() @IsOptional() @IsIn(['true', 'false']) includeDeleted?: string;
  /** Phase 6C (additive): filter by provenance. */
  @ApiPropertyOptional({ enum: Provenance }) @IsOptional() @IsEnum(Provenance) provenance?: Provenance;
}
