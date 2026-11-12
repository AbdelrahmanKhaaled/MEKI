import { Body, Controller, Delete, Get, Global, HttpCode, Module, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Actor, RequirePermissions } from '../../common/decorators';
import { MediaIdsDto } from '../../common/dto/shared.dto';
import type { ActorContext } from '../../common/types/auth-request';
import { ApproveCampaignDto, CampaignQueryDto, CreateCampaignDto, DonationsOpenDto, UpdateCampaignDto } from './campaigns.dto';
import { CampaignsService } from './campaigns.service';

@ApiTags('Admin · Campaigns')
@ApiCookieAuth()
@Controller('admin/campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  @RequirePermissions('campaigns.read')
  list(@Query() q: CampaignQueryDto) {
    return this.campaigns.list(q);
  }

  @Get(':id')
  @RequirePermissions('campaigns.read')
  get(@Param('id') id: string) {
    return this.campaigns.get(id);
  }

  @Post()
  @RequirePermissions('campaigns.manage')
  @ApiOperation({ summary: 'Create a campaign (always DRAFT, donations closed)' })
  create(@Body() dto: CreateCampaignDto, @Actor() actor: ActorContext) {
    return this.campaigns.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('campaigns.manage')
  update(@Param('id') id: string, @Body() dto: UpdateCampaignDto, @Actor() actor: ActorContext) {
    return this.campaigns.update(id, dto, actor);
  }

  @Put(':id/gallery')
  @RequirePermissions('campaigns.manage')
  setGallery(@Param('id') id: string, @Body() dto: MediaIdsDto, @Actor() actor: ActorContext) {
    return this.campaigns.setGallery(id, dto.mediaIds, actor);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions('campaigns.approve')
  @ApiOperation({ summary: 'Record MEKI approval (required before publishing)' })
  approve(@Param('id') id: string, @Body() dto: ApproveCampaignDto, @Actor() actor: ActorContext) {
    return this.campaigns.approve(id, dto.note, actor);
  }

  @Post(':id/revoke-approval')
  @HttpCode(200)
  @RequirePermissions('campaigns.approve')
  revokeApproval(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.campaigns.revokeApproval(id, actor);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermissions('campaigns.manage')
  @ApiOperation({ summary: 'DRAFT → IN_REVIEW' })
  submit(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.campaigns.transition(id, 'submit', actor);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermissions('campaigns.publish')
  @ApiOperation({ summary: 'Publish (requires approval, published programme, non-DEMO, required fields)' })
  publish(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.campaigns.transition(id, 'publish', actor);
  }

  @Post(':id/pause')
  @HttpCode(200)
  @RequirePermissions('campaigns.publish')
  pause(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.campaigns.transition(id, 'pause', actor);
  }

  @Post(':id/resume')
  @HttpCode(200)
  @RequirePermissions('campaigns.publish')
  resume(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.campaigns.transition(id, 'resume', actor);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @RequirePermissions('campaigns.publish')
  complete(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.campaigns.transition(id, 'complete', actor);
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  @RequirePermissions('campaigns.publish')
  unpublish(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.campaigns.transition(id, 'unpublish', actor);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermissions('campaigns.publish')
  archive(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.campaigns.transition(id, 'archive', actor);
  }

  @Patch(':id/donations')
  @RequirePermissions('campaigns.publish')
  @ApiOperation({ summary: 'Open/close donations (refused while payments are not enabled platform-wide)' })
  setDonations(@Param('id') id: string, @Body() dto: DonationsOpenDto, @Actor() actor: ActorContext) {
    return this.campaigns.setDonationsOpen(id, dto.open, actor);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('campaigns.manage')
  async remove(@Param('id') id: string, @Actor() actor: ActorContext) {
    await this.campaigns.remove(id, actor);
  }
}

@Global()
@Module({ controllers: [CampaignsController], providers: [CampaignsService], exports: [CampaignsService] })
export class CampaignsModule {}
