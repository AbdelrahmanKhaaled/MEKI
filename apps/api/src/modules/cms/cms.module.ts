import { Body, Controller, Delete, Get, Global, HttpCode, Module, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Actor, RequirePermissions } from '../../common/decorators';
import { ReorderDto } from '../../common/dto/shared.dto';
import type { ActorContext } from '../../common/types/auth-request';
import { CreatePageDto, CreateSectionDto, CreateSectionItemDto, UpdatePageDto, UpdateSectionDto, UpdateSectionItemDto } from './cms.dto';
import { CmsService } from './cms.service';
import { RevalidatesPublic } from '../revalidation/revalidation.module';

@ApiTags('Admin · CMS')
@ApiCookieAuth()
@Controller('admin/cms')
export class CmsController {
  constructor(private readonly cms: CmsService) {}

  @Get('pages')
  @RequirePermissions('content.read')
  listPages() {
    return this.cms.listPages();
  }

  @Post('pages')
  @RequirePermissions('content.manage')
  @ApiOperation({ summary: 'Create a site content page (DRAFT). Event landing pages are created through the Events API.' })
  createPage(@Body() dto: CreatePageDto, @Actor() actor: ActorContext) {
    return this.cms.createPage(dto, actor);
  }

  @Get('pages/:slug')
  @RequirePermissions('content.read')
  @ApiOperation({ summary: 'Page with working-copy sections and items (includes hasUnpublishedChanges)' })
  getPage(@Param('slug') slug: string) {
    return this.cms.getPage(slug);
  }

  @Patch('pages/:slug')
  @RevalidatesPublic('cms-page') // title/SEO fields are read live by the public page
  @RequirePermissions('content.manage')
  @ApiOperation({ summary: 'Update page title and SEO metadata' })
  updatePage(@Param('slug') slug: string, @Body() dto: UpdatePageDto, @Actor() actor: ActorContext) {
    return this.cms.updatePage(slug, dto, actor);
  }

  @Post('pages/:slug/publish')
  @RevalidatesPublic('cms-page')
  @HttpCode(200)
  @RequirePermissions('content.publish')
  publishPage(@Param('slug') slug: string, @Actor() actor: ActorContext) {
    return this.cms.setPageStatus(slug, true, actor);
  }

  @Post('pages/:slug/unpublish')
  @RevalidatesPublic('cms-page')
  @HttpCode(200)
  @RequirePermissions('content.publish')
  unpublishPage(@Param('slug') slug: string, @Actor() actor: ActorContext) {
    return this.cms.setPageStatus(slug, false, actor);
  }

  @Post('pages/:slug/sections')
  @RequirePermissions('content.manage')
  createSection(@Param('slug') slug: string, @Body() dto: CreateSectionDto, @Actor() actor: ActorContext) {
    return this.cms.createSection(slug, dto, actor);
  }

  @Put('pages/:slug/sections/order')
  @RevalidatesPublic('cms-page') // public order follows sortOrder
  @RequirePermissions('content.manage')
  @ApiOperation({ summary: 'Reorder sections (takes effect publicly after each section is republished)' })
  reorderSections(@Param('slug') slug: string, @Body() dto: ReorderDto, @Actor() actor: ActorContext) {
    return this.cms.reorderSections(slug, dto.ids, actor);
  }

  @Get('sections/:id')
  @RequirePermissions('content.read')
  getSection(@Param('id') id: string) {
    return this.cms.getSection(id);
  }

  @Patch('sections/:id')
  @RequirePermissions('content.manage')
  @ApiOperation({ summary: 'Edit section working copy (titles, body, CTAs, media, visibility, labels)' })
  updateSection(@Param('id') id: string, @Body() dto: UpdateSectionDto, @Actor() actor: ActorContext) {
    return this.cms.updateSection(id, dto, actor);
  }

  @Post('sections/:id/publish')
  @RevalidatesPublic('cms-section')
  @HttpCode(200)
  @RequirePermissions('content.publish')
  @ApiOperation({ summary: 'Publish the working copy (snapshot) of a section' })
  publishSection(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.cms.publishSection(id, actor);
  }

  @Post('sections/:id/unpublish')
  @RevalidatesPublic('cms-section')
  @HttpCode(200)
  @RequirePermissions('content.publish')
  unpublishSection(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.cms.unpublishSection(id, actor);
  }

  @Delete('sections/:id')
  @HttpCode(204)
  @RequirePermissions('content.manage')
  @ApiOperation({ summary: 'Remove an UNPUBLISHED section (block) and its items; 409 SECTION_PUBLISHED otherwise' })
  async deleteSection(@Param('id') id: string, @Actor() actor: ActorContext) {
    await this.cms.deleteSection(id, actor);
  }

  @Post('sections/:id/items')
  @RequirePermissions('content.manage')
  createItem(@Param('id') id: string, @Body() dto: CreateSectionItemDto, @Actor() actor: ActorContext) {
    return this.cms.createItem(id, dto, actor);
  }

  @Put('sections/:id/items/order')
  @RequirePermissions('content.manage')
  reorderItems(@Param('id') id: string, @Body() dto: ReorderDto, @Actor() actor: ActorContext) {
    return this.cms.reorderItems(id, dto.ids, actor);
  }

  @Patch('items/:id')
  @RequirePermissions('content.manage')
  updateItem(@Param('id') id: string, @Body() dto: UpdateSectionItemDto, @Actor() actor: ActorContext) {
    return this.cms.updateItem(id, dto, actor);
  }

  @Delete('items/:id')
  @HttpCode(204)
  @RequirePermissions('content.manage')
  async deleteItem(@Param('id') id: string, @Actor() actor: ActorContext) {
    await this.cms.deleteItem(id, actor);
  }
}

@Global()
@Module({ controllers: [CmsController], providers: [CmsService], exports: [CmsService] })
export class CmsModule {}
