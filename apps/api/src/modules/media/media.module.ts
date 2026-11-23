import {
  Body,
  Controller,
  Delete,
  Get,
  Global,
  HttpCode,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { FileInterceptor, MulterModule } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../common/types/auth-request';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { AppConfigService } from '../../config/app-config.service';
import { Actor, Public, RequirePermissions } from '../../common/decorators';
import type { ActorContext } from '../../common/types/auth-request';
import { MediaMetadataDto, MediaQueryDto, UploadMediaDto } from './media.dto';
import { MediaService } from './media.service';
import { RevalidatesPublic } from '../revalidation/revalidation.module';
import { LocalStorage, S3StorageNotConfigured, STORAGE_DRIVER } from './storage/storage';


@ApiTags('Admin · Media')
@ApiCookieAuth()
@Controller('admin/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @RequirePermissions('media.upload')
  @UseInterceptors(
    // Storage + size limits come from MulterModule.registerAsync (validated MEDIA_MAX_UPLOAD_MB).
    FileInterceptor('file'),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'JPEG/PNG/WebP, max MEDIA_MAX_UPLOAD_MB (default 10 MB). SVG rejected.' },
        altEn: { type: 'string' },
        altAr: { type: 'string' },
        category: { type: 'string', enum: ['BRAND', 'HERO', 'PROGRAMME', 'CAMPAIGN', 'GALLERY', 'OTHER'] },
      },
    },
  })
  @ApiOperation({ summary: 'Upload an image (magic-byte validated, metadata stripped, stored outside MySQL)' })
  upload(@UploadedFile() file: Express.Multer.File | undefined, @Body() dto: UploadMediaDto, @Actor() actor: ActorContext) {
    return this.media.upload(file, dto, actor);
  }

  @Get()
  @RequirePermissions('media.read')
  list(@Query() q: MediaQueryDto) {
    return this.media.list(q);
  }

  @Get(':id')
  @RequirePermissions('media.read')
  @ApiOperation({ summary: 'Media detail including where it is used' })
  get(@Param('id') id: string) {
    return this.media.get(id);
  }

  @Patch(':id')
  @RequirePermissions('media.upload')
  @RevalidatesPublic('media') // alt text, captions and consent are read live by published pages
  update(@Param('id') id: string, @Body() dto: MediaMetadataDto, @Actor() actor: ActorContext) {
    return this.media.updateMetadata(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('media.delete')
  @ApiOperation({ summary: 'Soft-delete media; 409 if still referenced' })
  async remove(@Param('id') id: string, @Actor() actor: ActorContext) {
    await this.media.remove(id, actor);
  }
}

/**
 * Serves uploaded files at the unchanged /media/<storageKey> URLs. Unlike a static file handler it checks,
 * per request: the asset exists in the library, is not deleted, and passes the consent policy
 * (MEDIA_PUBLIC_CONSENT_MODE). Admin sessions with media.read may preview any non-deleted asset.
 * Curated website images (WEB_STATIC) are served by the web app and are unaffected.
 */
@ApiTags('Media files')
@Public()
@SkipThrottle()
@Controller({ path: 'media', version: VERSION_NEUTRAL })
export class MediaFilesController {
  constructor(private readonly media: MediaService) {}

  @Get('*path')
  @ApiOperation({ summary: 'Uploaded media file (404 if deleted, unknown or not publicly servable)' })
  async serve(@Param('path') path: string | string[], @Req() req: AuthenticatedRequest, @Res() res: Response) {
    const key = Array.isArray(path) ? path.join('/') : path;
    const canPreview = !!req.user && (req.user.isSuperAdmin || req.user.permissions.includes('media.read'));
    const file = await this.media.resolveServableFile(key, canPreview);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', file.mimeType);
    // Short public cache so deletion/consent changes take effect quickly; previews are never cached.
    res.setHeader('Cache-Control', file.publicAccess ? 'public, max-age=300' : 'private, no-store');
    res.sendFile(file.absolutePath, { dotfiles: 'deny' });
  }
}

@Global()
@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        storage: memoryStorage(),
        // Hard stop at the transport layer (+1 byte so the service can report a clean 413).
        limits: { fileSize: config.get('MEDIA_MAX_UPLOAD_MB') * 1024 * 1024 + 1, files: 1, fields: 20 },
      }),
    }),
  ],
  controllers: [MediaController, MediaFilesController],
  providers: [
    MediaService,
    {
      provide: STORAGE_DRIVER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        config.get('STORAGE_DRIVER') === 's3' ? new S3StorageNotConfigured() : new LocalStorage(config),
    },
  ],
  exports: [MediaService],
})
export class MediaModule {}
