import { Body, Controller, Delete, Get, Header, HttpCode, Module, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Actor, Public, RequirePermissions } from '../../common/decorators';
import { LocaleQueryDto, ReorderDto } from '../../common/dto/shared.dto';
import type { ActorContext } from '../../common/types/auth-request';
import { localize } from '../../common/utils/localize';
import { CreateSectionItemDto, UpdateSectionDto, UpdateSectionItemDto } from '../cms/cms.dto';
import {
  ApproveEventDto,
  CreateEventDto,
  CreateEventSectionDto,
  EventCampaignsDto,
  EventGalleryDto,
  EventQueryDto,
  PublicEventQueryDto,
  UpdateEventDto,
} from './events.dto';
import { EventsService } from './events.service';
import { RevalidatesPublic } from '../revalidation/revalidation.module';

@ApiTags('Admin · Events')
@ApiCookieAuth()
@RevalidatesPublic('events')
@Controller('admin/events')
export class EventsAdminController {
  constructor(private readonly events: EventsService) {}

  @Get() @RequirePermissions('events.read')
  @ApiOperation({ summary: 'List events (search, status, visibility, featured, date range, sort)' })
  list(@Query() q: EventQueryDto) {
    return this.events.list(q);
  }

  @Get(':id') @RequirePermissions('events.read')
  get(@Param('id') id: string) {
    return this.events.get(id);
  }

  @Post() @RequirePermissions('events.manage')
  @ApiOperation({ summary: 'Create an event (DRAFT) with its own CMS landing page' })
  create(@Body() dto: CreateEventDto, @Actor() actor: ActorContext) {
    return this.events.create(dto, actor);
  }

  @Patch(':id') @RequirePermissions('events.manage')
  update(@Param('id') id: string, @Body() dto: UpdateEventDto, @Actor() actor: ActorContext) {
    return this.events.update(id, dto, actor);
  }

  @Delete(':id') @HttpCode(204) @RequirePermissions('events.manage')
  @ApiOperation({ summary: 'Soft-delete a non-live event' })
  async remove(@Param('id') id: string, @Actor() actor: ActorContext) {
    await this.events.remove(id, actor);
  }

  @Put(':id/gallery') @RequirePermissions('events.manage')
  @ApiOperation({ summary: 'Replace gallery/supporting images (existing Media Library assets, ordered)' })
  setGallery(@Param('id') id: string, @Body() dto: EventGalleryDto, @Actor() actor: ActorContext) {
    return this.events.setGallery(id, dto.items, actor);
  }

  @Put(':id/campaigns') @RequirePermissions('events.manage')
  @ApiOperation({ summary: 'Replace linked campaigns (does not publish or open any campaign)' })
  setCampaigns(@Param('id') id: string, @Body() dto: EventCampaignsDto, @Actor() actor: ActorContext) {
    return this.events.setCampaigns(id, dto.campaignIds, actor);
  }

  @Post(':id/approve') @HttpCode(200) @RequirePermissions('events.approve')
  @ApiOperation({ summary: 'Record client approval of the event content (required to publish)' })
  approve(@Param('id') id: string, @Body() dto: ApproveEventDto, @Actor() actor: ActorContext) {
    return this.events.approve(id, dto.note, actor);
  }

  @Post(':id/revoke-approval') @HttpCode(200) @RequirePermissions('events.approve')
  revokeApproval(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.events.revokeApproval(id, actor);
  }

  @Post(':id/submit') @HttpCode(200) @RequirePermissions('events.manage')
  submit(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.events.transition(id, 'submit', actor);
  }

  @Post(':id/publish') @HttpCode(200) @RequirePermissions('events.publish')
  @ApiOperation({ summary: 'Publish (requires approval, confirmed start time + timezone, short description, non-DEMO)' })
  publish(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.events.transition(id, 'publish', actor);
  }

  @Post(':id/unpublish') @HttpCode(200) @RequirePermissions('events.publish')
  unpublish(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.events.transition(id, 'unpublish', actor);
  }

  @Post(':id/cancel') @HttpCode(200) @RequirePermissions('events.publish')
  @ApiOperation({ summary: 'Cancel (a previously published event stays visible with status CANCELLED)' })
  cancel(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.events.transition(id, 'cancel', actor);
  }

  @Post(':id/complete') @HttpCode(200) @RequirePermissions('events.publish')
  complete(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.events.transition(id, 'complete', actor);
  }

  @Post(':id/archive') @HttpCode(200) @RequirePermissions('events.publish')
  archive(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.events.transition(id, 'archive', actor);
  }

  // ── event landing page (Phase 1 CMS, scoped to this event) ──

  @Get(':id/page') @RequirePermissions('events.read')
  @ApiOperation({ summary: 'Event landing page with working-copy sections/items' })
  getPage(@Param('id') id: string) {
    return this.events.getPage(id);
  }

  @Post(':id/sections') @RequirePermissions('events.manage')
  createSection(@Param('id') id: string, @Body() dto: CreateEventSectionDto, @Actor() actor: ActorContext) {
    return this.events.createSection(id, dto, actor);
  }

  @Put(':id/sections/order') @RequirePermissions('events.manage')
  reorderSections(@Param('id') id: string, @Body() dto: ReorderDto, @Actor() actor: ActorContext) {
    return this.events.reorderSections(id, dto.ids, actor);
  }

  @Patch(':id/sections/:sectionId') @RequirePermissions('events.manage')
  updateSection(@Param('id') id: string, @Param('sectionId') sectionId: string, @Body() dto: UpdateSectionDto, @Actor() actor: ActorContext) {
    return this.events.updateSection(id, sectionId, dto, actor);
  }

  @Post(':id/sections/:sectionId/publish') @HttpCode(200) @RequirePermissions('events.publish')
  @ApiOperation({ summary: 'Snapshot a section; it is only served publicly while the event itself is public' })
  publishSection(@Param('id') id: string, @Param('sectionId') sectionId: string, @Actor() actor: ActorContext) {
    return this.events.publishSection(id, sectionId, actor);
  }

  @Post(':id/sections/:sectionId/unpublish') @HttpCode(200) @RequirePermissions('events.publish')
  unpublishSection(@Param('id') id: string, @Param('sectionId') sectionId: string, @Actor() actor: ActorContext) {
    return this.events.unpublishSection(id, sectionId, actor);
  }

  @Post(':id/sections/:sectionId/items') @RequirePermissions('events.manage')
  createItem(@Param('id') id: string, @Param('sectionId') sectionId: string, @Body() dto: CreateSectionItemDto, @Actor() actor: ActorContext) {
    return this.events.createItem(id, sectionId, dto, actor);
  }

  @Patch(':id/items/:itemId') @RequirePermissions('events.manage')
  updateItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: UpdateSectionItemDto, @Actor() actor: ActorContext) {
    return this.events.updateItem(id, itemId, dto, actor);
  }

  @Delete(':id/items/:itemId') @HttpCode(204) @RequirePermissions('events.manage')
  async deleteItem(@Param('id') id: string, @Param('itemId') itemId: string, @Actor() actor: ActorContext) {
    await this.events.deleteItem(id, itemId, actor);
  }

  @Put(':id/sections/:sectionId/items/order') @RequirePermissions('events.manage')
  reorderItems(@Param('id') id: string, @Param('sectionId') sectionId: string, @Body() dto: ReorderDto, @Actor() actor: ActorContext) {
    return this.events.reorderItems(id, sectionId, dto.ids, actor);
  }
}

const CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';

@ApiTags('Public')
@Public()
@Controller('public/events')
export class EventsPublicController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @Header('Cache-Control', CACHE)
  @ApiOperation({ summary: 'Published, approved, PUBLIC-visibility events (optionally featured / upcoming / past)' })
  async list(@Query() q: PublicEventQueryDto) {
    return localize(await this.events.listPublished({ featured: q.featured === 'true', when: q.when }), q.locale);
  }

  @Get(':slug')
  @Header('Cache-Control', CACHE)
  @ApiOperation({ summary: 'Published event by slug (PUBLIC or UNLISTED)' })
  async get(@Param('slug') slug: string, @Query() q: LocaleQueryDto) {
    return localize(await this.events.getPublishedBySlug(slug), q.locale);
  }

  @Get(':slug/page')
  @Header('Cache-Control', CACHE)
  @ApiOperation({ summary: 'Published landing-page sections of a published event' })
  async page(@Param('slug') slug: string, @Query() q: LocaleQueryDto) {
    return localize(await this.events.getPublishedPage(slug), q.locale);
  }

  @Get(':slug/campaigns')
  @Header('Cache-Control', CACHE)
  @ApiOperation({ summary: 'Linked campaigns that are themselves publicly eligible' })
  async campaigns(@Param('slug') slug: string, @Query() q: LocaleQueryDto) {
    return localize(await this.events.getPublishedCampaigns(slug), q.locale);
  }
}

@Module({ controllers: [EventsAdminController, EventsPublicController], providers: [EventsService] })
export class EventsModule {}
