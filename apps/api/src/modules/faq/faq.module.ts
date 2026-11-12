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
  Put,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { Prisma } from '../../generated/prisma/client';
import { Provenance, PublicationStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PublishingPolicy } from '../../common/publishing/publishing.policy';
import { Actor, RequirePermissions } from '../../common/decorators';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { ReorderDto } from '../../common/dto/shared.dto';
import type { ActorContext } from '../../common/types/auth-request';
import { defined, Paginated, parseSort } from '../../common/utils';

export class CreateFaqDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[a-z0-9_-]{2,60}$/) code?: string;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(500) questionEn!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) questionAr?: string;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(10000) answerEn!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) answerAr?: string;
  @ApiPropertyOptional({ default: 'general' }) @IsOptional() @IsString() @Matches(/^[a-z0-9_-]{2,60}$/) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @ApiPropertyOptional({ enum: Provenance }) @IsOptional() @IsEnum(Provenance) provenance?: Provenance;
}
export class UpdateFaqDto extends PartialType(CreateFaqDto) {}

export class FaqQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: PublicationStatus }) @IsOptional() @IsEnum(PublicationStatus) status?: PublicationStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) category?: string;
}

@Injectable()
export class FaqService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly policy: PublishingPolicy,
  ) {}

  async list(q: FaqQueryDto) {
    const where: Prisma.FaqWhereInput = {
      deletedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.search ? { OR: [{ questionEn: { contains: q.search } }, { questionAr: { contains: q.search } }, { answerEn: { contains: q.search } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.faq.findMany({
        where,
        orderBy: parseSort(q.sort, ['sortOrder', 'createdAt', 'updatedAt', 'category'], { sortOrder: 'asc' }),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.faq.count({ where }),
    ]);
    return Paginated.of(items, total, q.page, q.pageSize);
  }

  async get(id: string) {
    const f = await this.prisma.faq.findFirst({ where: { id, deletedAt: null } });
    if (!f) throw new NotFoundException('FAQ not found');
    return f;
  }

  async create(dto: CreateFaqDto, actor: ActorContext) {
    const max = await this.prisma.faq.aggregate({ where: { deletedAt: null }, _max: { sortOrder: true } });
    const f = await this.prisma.faq.create({
      data: { ...defined(dto), sortOrder: dto.sortOrder ?? (max._max.sortOrder ?? 0) + 10, status: 'DRAFT', createdById: actor.userId, updatedById: actor.userId },
    });
    await this.audit.record(actor, 'faq.create', 'Faq', f.id);
    return f;
  }

  async update(id: string, dto: UpdateFaqDto, actor: ActorContext) {
    await this.get(id);
    const f = await this.prisma.faq.update({ where: { id }, data: { ...defined(dto), updatedById: actor.userId } });
    await this.audit.record(actor, 'faq.update', 'Faq', id, { fields: AuditService.changedFields(dto) });
    return f;
  }

  async setPublished(id: string, publish: boolean, actor: ActorContext) {
    const f = await this.get(id);
    if (publish) {
      this.policy.assertProvenancePublishable(f.provenance);
      this.policy.assertRequired({ questionEn: f.questionEn, answerEn: f.answerEn });
    }
    const updated = await this.prisma.faq.update({
      where: { id },
      data: { status: publish ? 'PUBLISHED' : 'DRAFT', ...(publish ? { publishedAt: new Date() } : {}), updatedById: actor.userId },
    });
    await this.audit.record(actor, publish ? 'faq.publish' : 'faq.unpublish', 'Faq', id);
    return updated;
  }

  async reorder(ids: string[], actor: ActorContext) {
    const count = await this.prisma.faq.count({ where: { id: { in: ids }, deletedAt: null } });
    if (count !== ids.length) throw new BadRequestException('Unknown FAQ id in list');
    await this.prisma.$transaction(ids.map((id, i) => this.prisma.faq.update({ where: { id }, data: { sortOrder: (i + 1) * 10 } })));
    await this.audit.record(actor, 'faq.reorder', 'Faq', null, { ids });
    return { reordered: ids.length };
  }

  async remove(id: string, actor: ActorContext) {
    const f = await this.get(id);
    await this.prisma.faq.update({ where: { id }, data: { deletedAt: new Date(), status: 'ARCHIVED', code: f.code ? `${f.code}-deleted-${Date.now().toString(36)}`.slice(0, 60) : null } });
    await this.audit.record(actor, 'faq.delete', 'Faq', id);
  }

  listPublished(category?: string) {
    return this.prisma.faq.findMany({
      where: { deletedAt: null, status: 'PUBLISHED', provenance: { not: 'DEMO' }, ...(category ? { category } : {}) },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, questionEn: true, questionAr: true, answerEn: true, answerAr: true, category: true, sortOrder: true },
    });
  }
}

@ApiTags('Admin · FAQ')
@ApiCookieAuth()
@Controller('admin/faqs')
export class FaqController {
  constructor(private readonly faq: FaqService) {}

  @Get() @RequirePermissions('faq.read')
  list(@Query() q: FaqQueryDto) {
    return this.faq.list(q);
  }

  @Put('order') @RequirePermissions('faq.manage')
  reorder(@Body() dto: ReorderDto, @Actor() actor: ActorContext) {
    return this.faq.reorder(dto.ids, actor);
  }

  @Get(':id') @RequirePermissions('faq.read')
  get(@Param('id') id: string) {
    return this.faq.get(id);
  }

  @Post() @RequirePermissions('faq.manage')
  create(@Body() dto: CreateFaqDto, @Actor() actor: ActorContext) {
    return this.faq.create(dto, actor);
  }

  @Patch(':id') @RequirePermissions('faq.manage')
  update(@Param('id') id: string, @Body() dto: UpdateFaqDto, @Actor() actor: ActorContext) {
    return this.faq.update(id, dto, actor);
  }

  @Post(':id/publish') @HttpCode(200) @RequirePermissions('faq.publish')
  publish(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.faq.setPublished(id, true, actor);
  }

  @Post(':id/unpublish') @HttpCode(200) @RequirePermissions('faq.publish')
  unpublish(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.faq.setPublished(id, false, actor);
  }

  @Delete(':id') @HttpCode(204) @RequirePermissions('faq.manage')
  async remove(@Param('id') id: string, @Actor() actor: ActorContext) {
    await this.faq.remove(id, actor);
  }
}

@Global()
@Module({ controllers: [FaqController], providers: [FaqService], exports: [FaqService] })
export class FaqModule {}
