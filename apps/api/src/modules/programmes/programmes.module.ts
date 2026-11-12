import { Body, Controller, Delete, Get, Global, HttpCode, Module, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Actor, RequirePermissions } from '../../common/decorators';
import { MediaIdsDto } from '../../common/dto/shared.dto';
import type { ActorContext } from '../../common/types/auth-request';
import { CreateProgrammeDto, CreateProjectDto, ProgrammeQueryDto, UpdateProgrammeDto, UpdateProjectDto } from './programmes.dto';
import { ProgrammesService } from './programmes.service';

@ApiTags('Admin · Programmes')
@ApiCookieAuth()
@Controller('admin')
export class ProgrammesController {
  constructor(private readonly programmes: ProgrammesService) {}

  @Get('programmes')
  @RequirePermissions('programmes.read')
  list(@Query() q: ProgrammeQueryDto) {
    return this.programmes.list(q);
  }

  @Get('programmes/:id')
  @RequirePermissions('programmes.read')
  get(@Param('id') id: string) {
    return this.programmes.get(id);
  }

  @Post('programmes')
  @RequirePermissions('programmes.manage')
  @ApiOperation({ summary: 'Create a programme (always starts as DRAFT)' })
  create(@Body() dto: CreateProgrammeDto, @Actor() actor: ActorContext) {
    return this.programmes.create(dto, actor);
  }

  @Patch('programmes/:id')
  @RequirePermissions('programmes.manage')
  update(@Param('id') id: string, @Body() dto: UpdateProgrammeDto, @Actor() actor: ActorContext) {
    return this.programmes.update(id, dto, actor);
  }

  @Put('programmes/:id/gallery')
  @RequirePermissions('programmes.manage')
  setGallery(@Param('id') id: string, @Body() dto: MediaIdsDto, @Actor() actor: ActorContext) {
    return this.programmes.setGallery(id, dto.mediaIds, actor);
  }

  @Post('programmes/:id/publish')
  @HttpCode(200)
  @RequirePermissions('programmes.publish')
  publish(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.programmes.publish(id, actor);
  }

  @Post('programmes/:id/unpublish')
  @HttpCode(200)
  @RequirePermissions('programmes.publish')
  unpublish(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.programmes.unpublish(id, actor);
  }

  @Delete('programmes/:id')
  @HttpCode(204)
  @RequirePermissions('programmes.manage')
  @ApiOperation({ summary: 'Soft-delete an unpublished programme without campaigns' })
  async remove(@Param('id') id: string, @Actor() actor: ActorContext) {
    await this.programmes.remove(id, actor);
  }

  @Get('projects')
  @RequirePermissions('programmes.read')
  @ApiQuery({ name: 'programmeId', required: false })
  listProjects(@Query('programmeId') programmeId?: string) {
    return this.programmes.listProjects(programmeId);
  }

  @Post('projects')
  @RequirePermissions('programmes.manage')
  createProject(@Body() dto: CreateProjectDto, @Actor() actor: ActorContext) {
    return this.programmes.createProject(dto, actor);
  }

  @Patch('projects/:id')
  @RequirePermissions('programmes.manage')
  updateProject(@Param('id') id: string, @Body() dto: UpdateProjectDto, @Actor() actor: ActorContext) {
    return this.programmes.updateProject(id, dto, actor);
  }
}

@Global()
@Module({ controllers: [ProgrammesController], providers: [ProgrammesService], exports: [ProgrammesService] })
export class ProgrammesModule {}
