import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Global,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { Prisma } from '../../generated/prisma/client';
import { Provenance, PublicationStatus, StatDisplayFormat, VerificationStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PublishRuleViolation, PublishingPolicy } from '../../common/publishing/publishing.policy';
import { Actor, RequirePermissions } from '../../common/decorators';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import type { ActorContext } from '../../common/types/auth-request';
import { defined, Paginated, parseSort } from '../../common/utils';

export class CreateStatisticDto {
  @ApiProperty({ example: 'beneficiaries' }) @IsString() @Matches(/^[a-z0-9_-]{2,60}$/) code!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(255) labelEn!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) labelAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) descriptionEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) descriptionAr?: string;
  @ApiProperty() @IsNumber({ maxDecimalPlaces: 2 }) value!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10) prefix?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10) suffix?: string;
  @ApiPropertyOptional({ enum: StatDisplayFormat }) @IsOptional() @IsEnum(StatDisplayFormat) displayFormat?: StatDisplayFormat;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() programmeId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) sourceRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) attributionEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) attributionAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) reportingPeriodEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) reportingPeriodAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @ApiPropertyOptional({ enum: Provenance }) @IsOptional() @IsEnum(Provenance) provenance?: Provenance;
}
export class UpdateStatisticDto extends PartialType(CreateStatisticDto) {}

export class StatisticQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: PublicationStatus }) @IsOptional() @IsEnum(PublicationStatus) status?: PublicationStatus;
  @ApiPropertyOptional({ enum: VerificationStatus }) @IsOptional() @IsEnum(VerificationStatus) verificationStatus?: VerificationStatus;
}

export class VerifyStatisticDto {
  @ApiProperty({ enum: ['VERIFIED', 'REJECTED'] }) @IsEnum(VerificationStatus) verificationStatus!: VerificationStatus;
}

/** Fields whose change invalidates a prior verification. */
const FACT_FIELDS = ['value', 'unit', 'prefix', 'suffix', 'sourceRef', 'reportingPeriodEn', 'programmeId', 'attributionEn'] as const;

@Injectable()
export class StatisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly policy: PublishingPolicy,
  ) {}

  async list(q: StatisticQueryDto) {
    const where: Prisma.ImpactStatisticWhereInput = {
      deletedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.verificationStatus ? { verificationStatus: q.verificationStatus } : {}),
      ...(q.search ? { OR: [{ labelEn: { contains: q.search } }, { labelAr: { contains: q.search } }, { code: { contains: q.search } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.impactStatistic.findMany({
        where,
        orderBy: parseSort(q.sort, ['sortOrder', 'labelEn', 'createdAt', 'updatedAt'], { sortOrder: 'asc' }),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.impactStatistic.count({ where }),
    ]);
    return Paginated.of(items, total, q.page, q.pageSize);
  }

  async get(id: string) {
    const s = await this.prisma.impactStatistic.findFirst({ where: { id, deletedAt: null } });
    if (!s) throw new NotFoundException('Statistic not found');
    return s;
  }

  private async assertProgramme(id?: string | null) {
    if (id && !(await this.prisma.programme.count({ where: { id, deletedAt: null } }))) throw new BadRequestException('programmeId is invalid');
  }

  async create(dto: CreateStatisticDto, actor: ActorContext) {
    await this.assertProgramme(dto.programmeId);
    const s = await this.prisma.impactStatistic.create({
      data: { ...defined(dto), status: 'DRAFT', verificationStatus: 'UNVERIFIED', createdById: actor.userId, updatedById: actor.userId },
    });
    await this.audit.record(actor, 'statistic.create', 'ImpactStatistic', s.id, { code: s.code });
    return s;
  }

  async update(id: string, dto: UpdateStatisticDto, actor: ActorContext) {
    const current = await this.get(id);
    await this.assertProgramme(dto.programmeId);
    const factChanged = FACT_FIELDS.some((f) => dto[f] !== undefined && String(dto[f]) !== String(current[f] ?? ''));
    const invalidate = factChanged && current.verificationStatus === 'VERIFIED';
    const s = await this.prisma.impactStatistic.update({
      where: { id },
      data: {
        ...defined(dto),
        ...(invalidate ? { verificationStatus: 'UNVERIFIED', verifiedAt: null, verifiedById: null, status: current.status === 'PUBLISHED' ? 'DRAFT' : current.status } : {}),
        updatedById: actor.userId,
      },
    });
    await this.audit.record(actor, 'statistic.update', 'ImpactStatistic', id, { fields: AuditService.changedFields(dto), verificationReset: invalidate });
    return s;
  }

  async verify(id: string, status: VerificationStatus, actor: ActorContext) {
    const s = await this.get(id);
    if (status === 'UNVERIFIED') throw new BadRequestException('Use VERIFIED or REJECTED');
    if (status === 'VERIFIED') {
      if (s.provenance === 'DEMO') throw new PublishRuleViolation('DEMO figures cannot be verified', 'DEMO_NOT_PUBLISHABLE');
      this.policy.assertRequired({ sourceRef: s.sourceRef });
    }
    const updated = await this.prisma.impactStatistic.update({
      where: { id },
      data: {
        verificationStatus: status,
        verifiedAt: new Date(),
        verifiedById: actor.userId,
        ...(status === 'REJECTED' && s.status === 'PUBLISHED' ? { status: 'DRAFT' } : {}),
        updatedById: actor.userId,
      },
    });
    await this.audit.record(actor, `statistic.${status === 'VERIFIED' ? 'verify' : 'reject'}`, 'ImpactStatistic', id, { sourceRef: s.sourceRef });
    return updated;
  }

  async setPublished(id: string, publish: boolean, actor: ActorContext) {
    const s = await this.get(id);
    if (publish) {
      this.policy.assertProvenancePublishable(s.provenance);
      if (s.verificationStatus !== 'VERIFIED') {
        throw new UnprocessableEntityException({ message: 'Only verified statistics can be published', code: 'STATISTIC_NOT_VERIFIED' });
      }
      this.policy.assertRequired({ sourceRef: s.sourceRef, labelEn: s.labelEn });
    }
    const updated = await this.prisma.impactStatistic.update({
      where: { id },
      data: { status: publish ? 'PUBLISHED' : 'DRAFT', ...(publish ? { publishedAt: new Date() } : {}), updatedById: actor.userId },
    });
    await this.audit.record(actor, publish ? 'statistic.publish' : 'statistic.unpublish', 'ImpactStatistic', id);
    return updated;
  }

  async remove(id: string, actor: ActorContext) {
    const s = await this.get(id);
    if (s.status === 'PUBLISHED') throw new UnprocessableEntityException('Unpublish the statistic before deleting it');
    await this.prisma.impactStatistic.update({ where: { id }, data: { deletedAt: new Date(), code: `${s.code}-deleted-${Date.now().toString(36)}`.slice(0, 60) } });
    await this.audit.record(actor, 'statistic.delete', 'ImpactStatistic', id, { code: s.code });
  }

  /** Public: published AND verified AND non-demo, always with source attribution. */
  async listPublished() {
    const items = await this.prisma.impactStatistic.findMany({
      where: { deletedAt: null, status: 'PUBLISHED', verificationStatus: 'VERIFIED', provenance: { not: 'DEMO' } },
      orderBy: { sortOrder: 'asc' },
      include: { programme: { select: { slug: true } } },
    });
    return items.map((s) => ({
      code: s.code,
      labelEn: s.labelEn,
      labelAr: s.labelAr,
      descriptionEn: s.descriptionEn,
      descriptionAr: s.descriptionAr,
      value: s.value,
      unit: s.unit,
      prefix: s.prefix,
      suffix: s.suffix,
      displayFormat: s.displayFormat,
      programmeSlug: s.programme?.slug ?? null,
      attributionEn: s.attributionEn,
      attributionAr: s.attributionAr,
      reportingPeriodEn: s.reportingPeriodEn,
      reportingPeriodAr: s.reportingPeriodAr,
      sourceRef: s.sourceRef,
      sortOrder: s.sortOrder,
    }));
  }
}

@ApiTags('Admin · Impact statistics')
@ApiCookieAuth()
@Controller('admin/statistics')
export class StatisticsController {
  constructor(private readonly stats: StatisticsService) {}

  @Get() @RequirePermissions('statistics.read')
  list(@Query() q: StatisticQueryDto) {
    return this.stats.list(q);
  }

  @Get(':id') @RequirePermissions('statistics.read')
  get(@Param('id') id: string) {
    return this.stats.get(id);
  }

  @Post() @RequirePermissions('statistics.manage')
  @ApiOperation({ summary: 'Create (DRAFT + UNVERIFIED)' })
  create(@Body() dto: CreateStatisticDto, @Actor() actor: ActorContext) {
    return this.stats.create(dto, actor);
  }

  @Patch(':id') @RequirePermissions('statistics.manage')
  @ApiOperation({ summary: 'Update; changing a verified fact resets verification and unpublishes' })
  update(@Param('id') id: string, @Body() dto: UpdateStatisticDto, @Actor() actor: ActorContext) {
    return this.stats.update(id, dto, actor);
  }

  @Post(':id/verify') @HttpCode(200) @RequirePermissions('statistics.verify')
  @ApiOperation({ summary: 'Mark VERIFIED (requires sourceRef) or REJECTED' })
  verify(@Param('id') id: string, @Body() dto: VerifyStatisticDto, @Actor() actor: ActorContext) {
    return this.stats.verify(id, dto.verificationStatus, actor);
  }

  @Post(':id/publish') @HttpCode(200) @RequirePermissions('statistics.publish')
  publish(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.stats.setPublished(id, true, actor);
  }

  @Post(':id/unpublish') @HttpCode(200) @RequirePermissions('statistics.publish')
  unpublish(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.stats.setPublished(id, false, actor);
  }

  @Delete(':id') @HttpCode(204) @RequirePermissions('statistics.manage')
  async remove(@Param('id') id: string, @Actor() actor: ActorContext) {
    await this.stats.remove(id, actor);
  }
}

@Global()
@Module({ controllers: [StatisticsController], providers: [StatisticsService], exports: [StatisticsService] })
export class StatisticsModule {}
