import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { AppConfigService } from '../../config/app-config.service';
import { Prisma } from '../../generated/prisma/client';
import type { MediaAsset } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { ActorContext } from '../../common/types/auth-request';
import { defined, Paginated, parseSort } from '../../common/utils';
import { ALLOWED_IMAGE_TYPES, detectImageMime, sanitizeFilename } from './media.validation';
import { STORAGE_DRIVER, type StoragePort } from './storage/storage';
import type { MediaMetadataDto, MediaQueryDto } from './media.dto';

const MAX_PIXELS = 60_000_000; // decompression-bomb guard

/** Public serving policy (pure; unit tested). Deleted assets are never public. */
export function isPubliclyServable(
  asset: Pick<MediaAsset, 'deletedAt' | 'consentStatus'>,
  mode: 'not_denied' | 'confirmed_only',
): boolean {
  if (asset.deletedAt) return false;
  return mode === 'confirmed_only' ? asset.consentStatus === 'CONFIRMED' : asset.consentStatus !== 'NOT_GRANTED';
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    @Inject(STORAGE_DRIVER) private readonly storage: StoragePort,
  ) {}

  get maxBytes() {
    return this.config.get('MEDIA_MAX_UPLOAD_MB') * 1024 * 1024;
  }

  /** Adds a resolved public `url` to a media row. */
  url(asset: Pick<MediaAsset, 'storageDriver' | 'storageKey'>) {
    if (asset.storageDriver === 'WEB_STATIC') {
      return `${this.config.get('WEB_URL').replace(/\/$/, '')}${asset.storageKey}`;
    }
    return this.storage.publicUrl(asset.storageKey);
  }

  present(asset: MediaAsset): MediaAsset & { url: string };
  present(asset: MediaAsset | null | undefined): (MediaAsset & { url: string }) | null;
  present(asset: MediaAsset | null | undefined): (MediaAsset & { url: string }) | null {
    if (!asset) return null;
    return { ...asset, url: this.url(asset) };
  }

  async upload(file: Express.Multer.File | undefined, meta: MediaMetadataDto, actor: ActorContext) {
    if (!file?.buffer?.length) throw new BadRequestException('A file field named "file" is required');
    if (file.size > this.maxBytes) throw new PayloadTooLargeException(`File exceeds ${this.config.get('MEDIA_MAX_UPLOAD_MB')} MB`);
    const mime = detectImageMime(file.buffer);
    if (!mime) throw new UnsupportedMediaTypeException('Only JPEG, PNG and WebP images are accepted');

    let body: Buffer;
    let width: number | undefined;
    let height: number | undefined;
    try {
      const img = sharp(file.buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' });
      // Re-encode: applies EXIF orientation, strips EXIF/GPS/XMP metadata, rejects malformed files.
      const encoded = img.rotate();
      const out =
        mime === 'image/jpeg'
          ? encoded.jpeg({ quality: 90, mozjpeg: true })
          : mime === 'image/png'
            ? encoded.png()
            : encoded.webp({ quality: 90 });
      const result = await out.toBuffer({ resolveWithObject: true });
      body = result.data;
      width = result.info.width;
      height = result.info.height;
    } catch {
      throw new UnsupportedMediaTypeException('The image could not be processed');
    }

    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await this.prisma.mediaAsset.findFirst({ where: { checksum, deletedAt: null }, select: { id: true } });
    if (duplicate) throw new ConflictException({ message: 'This image already exists in the library', code: 'DUPLICATE_MEDIA', details: { id: duplicate.id } });

    const now = new Date();
    const id = randomBytes(12).toString('hex'); // 96-bit CSPRNG, unguessable storage key
    const key = `uploads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${ALLOWED_IMAGE_TYPES[mime]}`;
    await this.storage.put(key, body, mime);

    try {
      const asset = await this.prisma.mediaAsset.create({
        data: {
          storageDriver: this.storage.driver,
          storageKey: key,
          originalName: sanitizeFilename(file.originalname ?? 'file'),
          mimeType: mime,
          sizeBytes: body.length,
          width,
          height,
          checksum,
          uploadedById: actor.userId,
          ...defined(meta),
        },
      });
      await this.audit.record(actor, 'media.upload', 'MediaAsset', asset.id, { mimeType: mime, sizeBytes: body.length });
      return this.present(asset);
    } catch (e) {
      await this.storage.remove(key);
      throw e;
    }
  }

  async list(q: MediaQueryDto) {
    const where: Prisma.MediaAssetWhereInput = {
      ...(q.includeDeleted === 'true' ? {} : { deletedAt: null }),
      ...(q.category ? { category: q.category } : {}),
      ...(q.consentStatus ? { consentStatus: q.consentStatus } : {}),
      ...(q.search
        ? { OR: [{ originalName: { contains: q.search } }, { altEn: { contains: q.search } }, { altAr: { contains: q.search } }, { sourceFolder: { contains: q.search } }, { code: { contains: q.search } }] }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.mediaAsset.findMany({
        where,
        orderBy: parseSort(q.sort, ['createdAt', 'originalName', 'sizeBytes', 'category'], { createdAt: 'desc' }),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);
    return Paginated.of(items.map((i) => this.present(i)), total, q.page, q.pageSize);
  }

  async get(id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id, deletedAt: null } });
    if (!asset) throw new NotFoundException('Media not found');
    return { ...this.present(asset), usage: await this.usage(id) };
  }

  async updateMetadata(id: string, dto: MediaMetadataDto, actor: ActorContext) {
    await this.get(id);
    const asset = await this.prisma.mediaAsset.update({ where: { id }, data: defined(dto) });
    await this.audit.record(actor, 'media.update', 'MediaAsset', id, { fields: AuditService.changedFields(dto) });
    return this.present(asset);
  }

  async usage(id: string) {
    const [programmeCovers, campaignCovers, programmeGallery, campaignGallery, sections, sectionItems, pages, settings] =
      await this.prisma.$transaction([
        this.prisma.programme.count({ where: { coverMediaId: id, deletedAt: null } }),
        this.prisma.campaign.count({ where: { coverMediaId: id, deletedAt: null } }),
        this.prisma.programmeMedia.count({ where: { mediaId: id } }),
        this.prisma.campaignMedia.count({ where: { mediaId: id } }),
        this.prisma.pageSection.count({ where: { mediaId: id } }),
        this.prisma.sectionItem.count({ where: { mediaId: id } }),
        this.prisma.page.count({ where: { ogImageId: id } }),
        this.prisma.siteSetting.count({ where: { ogImageId: id } }),
      ]);
    const [eventImages, eventGallery] = await this.prisma.$transaction([
      this.prisma.event.count({ where: { deletedAt: null, OR: [{ heroMediaId: id }, { coverMediaId: id }] } }),
      this.prisma.eventMedia.count({ where: { mediaId: id } }),
    ]);
    const total =
      programmeCovers + campaignCovers + programmeGallery + campaignGallery + sections + sectionItems + pages + settings + eventImages + eventGallery;
    return { total, programmeCovers, campaignCovers, programmeGallery, campaignGallery, sections, sectionItems, pages, settings, eventImages, eventGallery };
  }

  /** Soft delete only, and only when nothing references the asset. Binaries are retained for recovery. */
  async remove(id: string, actor: ActorContext) {
    const asset = await this.get(id);
    if (asset.usage.total > 0) {
      throw new ConflictException({ message: 'Media is in use and cannot be deleted', code: 'MEDIA_IN_USE', details: asset.usage });
    }
    if (asset.storageDriver === 'WEB_STATIC') throw new ConflictException('Curated website assets cannot be deleted from the API');
    await this.prisma.mediaAsset.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record(actor, 'media.delete', 'MediaAsset', id);
  }

  /**
   * Resolves a /media/<key> request. Unknown keys, deleted assets, non-local storage and assets failing the
   * consent policy all return the same 404 (no information about why).
   */
  async resolveServableFile(key: string, canPreview: boolean) {
    const notFound = new NotFoundException('File not found');
    if (!key || key.length > 500 || key.includes('..')) throw notFound;
    const asset = await this.prisma.mediaAsset.findUnique({ where: { storageKey: key } });
    if (!asset || asset.storageDriver !== 'LOCAL' || !this.storage.localPath) throw notFound;
    const publicAccess = isPubliclyServable(asset, this.config.get('MEDIA_PUBLIC_CONSENT_MODE'));
    if (!publicAccess && !(canPreview && !asset.deletedAt)) throw notFound;
    return { absolutePath: this.storage.localPath(key), mimeType: asset.mimeType, publicAccess };
  }

  /** Throws if any of the given IDs is missing or deleted (used by programmes/campaigns/CMS). */
  async assertExists(ids: (string | null | undefined)[]) {
    const wanted = Array.from(new Set(ids.filter((v): v is string => !!v)));
    if (!wanted.length) return;
    const found = await this.prisma.mediaAsset.count({ where: { id: { in: wanted }, deletedAt: null } });
    if (found !== wanted.length) throw new BadRequestException('One or more media references are invalid');
  }
}
