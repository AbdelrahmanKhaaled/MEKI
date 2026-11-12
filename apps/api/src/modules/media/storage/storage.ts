import { Injectable, NotImplementedException } from '@nestjs/common';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { AppConfigService } from '../../../config/app-config.service';

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');

export interface StoragePort {
  readonly driver: 'LOCAL' | 'S3';
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
  publicUrl(key: string): string;
  /** Absolute file path for locally stored keys (undefined for remote storage). */
  localPath?(key: string): string;
}

/** Local disk storage for development. Keys are generated server-side (never from user input). */
@Injectable()
export class LocalStorage implements StoragePort {
  readonly driver = 'LOCAL' as const;
  private readonly root: string;
  private readonly baseUrl: string;

  constructor(config: AppConfigService) {
    this.root = resolve(config.get('LOCAL_STORAGE_DIR'));
    this.baseUrl = config.get('PUBLIC_MEDIA_BASE_URL').replace(/\/$/, '');
  }

  private pathFor(key: string) {
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new Error('Invalid storage key');
    return full;
  }

  localPath(key: string) {
    return this.pathFor(key);
  }

  async put(key: string, body: Buffer) {
    const full = this.pathFor(key);
    await mkdir(dirname(full), { recursive: true });
    const tmp = `${full}.tmp`;
    await writeFile(tmp, body, { flag: 'wx' });
    await rename(tmp, full);
  }

  async remove(key: string) {
    await unlink(this.pathFor(key)).catch(() => undefined);
  }

  publicUrl(key: string) {
    return `${this.baseUrl}/${key}`;
  }
}

/** Placeholder until hosting/bucket is confirmed (client dependency). Same interface, no schema change needed. */
@Injectable()
export class S3StorageNotConfigured implements StoragePort {
  readonly driver = 'S3' as const;
  put(): Promise<void> {
    throw new NotImplementedException('S3-compatible storage is not configured yet');
  }
  remove(): Promise<void> {
    throw new NotImplementedException('S3-compatible storage is not configured yet');
  }
  publicUrl(key: string) {
    return key;
  }
}
