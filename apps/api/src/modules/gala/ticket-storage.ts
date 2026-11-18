import { Injectable, NotImplementedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { AppConfigService } from '../../config/app-config.service';

export const PRIVATE_STORAGE = Symbol('PRIVATE_STORAGE');

/**
 * Private file storage (ticket PDFs). Unlike the media StoragePort there is NO public URL and nothing here is ever
 * served statically: files leave only through authorised API endpoints. Keys are generated server-side and are never
 * returned by the API.
 */
export interface PrivateStoragePort {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

/** Keys are server-generated: plain path segments of [A-Za-z0-9_-] ending in .pdf. Anything else (.., absolute, backslash, NUL, drive letters) is refused. */
export const SAFE_KEY = /^(?:[A-Za-z0-9_-]+\/)+[A-Za-z0-9_-]+\.pdf$/;

/** Server-generated key: unguessable suffix, no user input. */
export const newTicketPdfKey = (eventId: string, ticketId: string) => `tickets/${eventId}/${ticketId}-${randomBytes(12).toString('hex')}.pdf`;

@Injectable()
export class LocalPrivateStorage implements PrivateStoragePort {
  private readonly root: string;
  private readonly driver: string;

  constructor(config: AppConfigService) {
    this.root = resolve(config.get('PRIVATE_STORAGE_DIR'));
    this.driver = config.get('STORAGE_DRIVER');
  }

  private pathFor(key: string) {
    if (this.driver !== 'local') throw new NotImplementedException('Private S3 storage is not configured yet');
    if (!SAFE_KEY.test(key)) throw new Error('Invalid storage key');
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new Error('Invalid storage key');
    return full;
  }

  async put(key: string, body: Buffer) {
    const full = this.pathFor(key);
    await mkdir(dirname(full), { recursive: true });
    const tmp = `${full}.tmp`;
    await writeFile(tmp, body, { flag: 'wx' });
    await rename(tmp, full);
  }

  async get(key: string) {
    try {
      return await readFile(this.pathFor(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async remove(key: string) {
    await unlink(this.pathFor(key)).catch(() => undefined);
  }
}
