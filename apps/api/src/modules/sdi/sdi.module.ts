import { Body, Controller, Get, HttpCode, Module, Param, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { Actor, RequirePermissions } from '../../common/decorators';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import type { ActorContext } from '../../common/types/auth-request';
import { GalaModule } from '../gala/gala.module';
import { SafeIdPipe } from '../gala/gala-support';
import { REPORT_LIMITS } from './sdi-report.parser';
import { SdiReportsService } from './sdi-reports.service';

const KINDS = ['RECONCILIATION', 'ATTENDEES'] as const;
const toBool = ({ value }: { value: unknown }) => value === true || value === 'true';

export class UploadReportDto {
  @ApiProperty({ enum: KINDS }) @IsIn(KINDS) kind!: (typeof KINDS)[number];
  @ApiPropertyOptional({ description: 'Explicitly labelled synthetic test fixture (never applied in staging/production)' }) @IsOptional() @Transform(toBool) @IsBoolean() isSynthetic?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class PreviewReportDto {
  @ApiPropertyOptional({ description: 'Column mapping (see docs/48). Omit when using mappingProfileId.' }) @IsOptional() @IsObject() mapping?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) mappingProfileId?: string;
  @ApiPropertyOptional({ example: '2026-11-18' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) periodFrom?: string;
  @ApiPropertyOptional({ example: '2026-11-18' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) periodTo?: string;
  @ApiPropertyOptional({ description: 'Earlier import this corrected file replaces' }) @IsOptional() @IsString() @MaxLength(30) supersedesId?: string;
}

export class RejectReportDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class SaveMappingDto {
  @ApiProperty({ enum: KINDS }) @IsIn(KINDS) kind!: (typeof KINDS)[number];
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @ApiProperty() @IsObject() mapping!: Record<string, unknown>;
  @ApiProperty({ type: [String], description: 'Headers of the file the mapping was built from' }) @IsArray() @ArrayMaxSize(REPORT_LIMITS.maxColumns) @IsString({ each: true }) @MaxLength(REPORT_LIMITS.maxHeader, { each: true }) headers!: string[];
}

export class VerifyMappingDto {
  @ApiProperty({ description: 'Which REAL SDI sample file this mapping was checked against (name/date)' }) @IsString() @MinLength(5) @MaxLength(500) note!: string;
}

export class ReportListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: KINDS }) @IsOptional() @IsIn(KINDS) kind?: string;
  @ApiPropertyOptional({ enum: ['UPLOADED', 'PREVIEWED', 'APPLIED', 'REJECTED'] }) @IsOptional() @IsIn(['UPLOADED', 'PREVIEWED', 'APPLIED', 'REJECTED']) status?: string;
}

export class ReportRowQueryDto extends ListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsIn(['MATCHED', 'UNMATCHED', 'AMBIGUOUS', 'INVALID_REFERENCE', 'AMOUNT_MISMATCH', 'DUPLICATE_ROW', 'STALE', 'ALREADY_APPLIED', 'REQUIRES_REVIEW', 'INVALID', 'INFO']) matchStatus?: string;
}

export class AttendeeQueryDto extends ListQueryDto {
  @ApiPropertyOptional() @IsOptional() @Matches(/^EB-[0-9A-Z]{12}$/) bookingReference?: string;
}

/**
 * Phase 12 — SDI report reconciliation (Admin). Upload/preview: sdi.reports.upload. Apply (second administrator) and mapping
 * verification: sdi.reports.approve. Attendee list: gala.guests.read. Nothing here can issue tickets or mark a booking paid
 * outside an approved, verified report.
 */
@ApiTags('Admin · SDI reconciliation')
@ApiCookieAuth()
@Controller('admin/sdi')
export class SdiReportsController {
  constructor(private readonly reports: SdiReportsService) {}

  @Get('status')
  @RequirePermissions('sdi.reports.upload')
  @ApiOperation({ summary: 'Integration mode, availability switches (no secrets), last applied report, review backlog, missing business days' })
  status() {
    return this.reports.status();
  }

  @Post('reports')
  @RequirePermissions('sdi.reports.upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, kind: { type: 'string', enum: [...KINDS] }, isSynthetic: { type: 'boolean' }, notes: { type: 'string' } } } })
  @ApiOperation({ summary: 'Upload an SDI report (.csv / .xlsx, ≤ 5 MB). Stored privately; headers read; NOTHING applied.' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: REPORT_LIMITS.maxBytes, files: 1, fields: 10 } }))
  upload(@UploadedFile() file: Express.Multer.File | undefined, @Body() dto: UploadReportDto, @Actor() actor: ActorContext) {
    return this.reports.upload(file, dto, actor);
  }

  @Get('reports')
  @RequirePermissions('sdi.reports.upload')
  list(@Query() q: ReportListQueryDto) {
    return this.reports.list(q);
  }

  @Get('reports/:id')
  @RequirePermissions('sdi.reports.upload')
  get(@Param('id', SafeIdPipe) id: string) {
    return this.reports.detail(id);
  }

  @Get('reports/:id/rows')
  @RequirePermissions('sdi.reports.upload')
  rows(@Param('id', SafeIdPipe) id: string, @Query() q: ReportRowQueryDto) {
    return this.reports.rows(id, q);
  }

  @Post('reports/:id/preview')
  @HttpCode(200)
  @RequirePermissions('sdi.reports.upload')
  @ApiOperation({ summary: 'Validate + match every row with a column mapping. Read-only with respect to bookings and money.' })
  preview(@Param('id', SafeIdPipe) id: string, @Body() dto: PreviewReportDto, @Actor() actor: ActorContext) {
    return this.reports.preview(id, dto, actor);
  }

  @Post('reports/:id/apply')
  @HttpCode(200)
  @RequirePermissions('sdi.reports.approve')
  @ApiOperation({ summary: 'Apply a previewed report (different administrator; verified mapping; SDI_REPORT_APPLY_ENABLED). One transaction.' })
  apply(@Param('id', SafeIdPipe) id: string, @Actor() actor: ActorContext) {
    return this.reports.apply(id, actor);
  }

  @Post('reports/:id/reject')
  @HttpCode(200)
  @RequirePermissions('sdi.reports.upload')
  reject(@Param('id', SafeIdPipe) id: string, @Body() dto: RejectReportDto, @Actor() actor: ActorContext) {
    return this.reports.reject(id, dto.reason, actor);
  }

  @Get('reports/:id/export')
  @RequirePermissions('sdi.reports.upload')
  @ApiOperation({ summary: 'Reconciliation results as CSV (formula-safe; contains no personal data)' })
  async export(@Param('id', SafeIdPipe) id: string, @Actor() actor: ActorContext, @Res() res: Response) {
    const out = await this.reports.exportCsv(id, actor);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8').setHeader('Content-Disposition', `attachment; filename="${out.fileName}"`).setHeader('Cache-Control', 'no-store');
    res.send(out.body);
  }

  @Get('mappings')
  @RequirePermissions('sdi.reports.upload')
  mappings(@Query('kind') kind?: string) {
    return this.reports.listProfiles(kind && (KINDS as readonly string[]).includes(kind) ? kind : undefined);
  }

  @Post('mappings')
  @RequirePermissions('sdi.reports.upload')
  createMapping(@Body() dto: SaveMappingDto, @Actor() actor: ActorContext) {
    return this.reports.saveProfile(dto, actor);
  }

  @Put('mappings/:id')
  @RequirePermissions('sdi.reports.upload')
  @ApiOperation({ summary: 'Update a mapping (clears its verification — re-verify against a real sample)' })
  updateMapping(@Param('id', SafeIdPipe) id: string, @Body() dto: SaveMappingDto, @Actor() actor: ActorContext) {
    return this.reports.saveProfile({ ...dto, id }, actor);
  }

  @Post('mappings/:id/verify')
  @HttpCode(200)
  @RequirePermissions('sdi.reports.approve')
  @ApiOperation({ summary: 'Attest the mapping was checked against a REAL SDI sample report (different administrator)' })
  verifyMapping(@Param('id', SafeIdPipe) id: string, @Body() dto: VerifyMappingDto, @Actor() actor: ActorContext) {
    return this.reports.verifyProfile(id, dto.note, actor);
  }

  @Get('attendees')
  @RequirePermissions('gala.guests.read')
  @ApiOperation({ summary: 'Latest applied SDI attendee list (operational; not proof of payment)' })
  attendees(@Query() q: AttendeeQueryDto) {
    return this.reports.attendees(q);
  }
}

@Module({ imports: [GalaModule], controllers: [SdiReportsController], providers: [SdiReportsService], exports: [SdiReportsService] })
export class SdiModule {}
