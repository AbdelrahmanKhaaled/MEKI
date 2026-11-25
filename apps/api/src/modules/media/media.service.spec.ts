import { BadRequestException, ConflictException, UnsupportedMediaTypeException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { MediaService } from './media.service';

/** MEKI client edits (24 Nov 2026): the sponsorship packages PDF shares the Media Library with images. Pure unit test (fakes). */
function setup(existing: { id: string; mimeType: string }[] = []) {
  const stored: { key: string; body: Buffer; mime: string }[] = [];
  const created: Record<string, unknown>[] = [];
  const prisma = {
    mediaAsset: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 'new1', deletedAt: null, ...data };
      }),
      count: jest.fn(async ({ where }: { where: { id: { in: string[] }; mimeType?: string } }) =>
        existing.filter((e) => where.id.in.includes(e.id) && (!where.mimeType || e.mimeType === where.mimeType)).length,
      ),
    },
  };
  const audit = { record: jest.fn(async () => undefined) };
  const config = { get: (k: string) => ({ MEDIA_MAX_UPLOAD_MB: 10, MEDIA_PUBLIC_CONSENT_MODE: 'not_denied', WEB_URL: 'https://meki.test' } as Record<string, unknown>)[k] };
  const storage = {
    driver: 'LOCAL',
    put: jest.fn(async (key: string, body: Buffer, mime: string) => void stored.push({ key, body, mime })),
    remove: jest.fn(async () => undefined),
    publicUrl: (k: string) => `https://api.meki.test/media/${k}`,
    localPath: (k: string) => `/var/lib/meki/uploads/${k}`,
  };
  const svc = new MediaService(prisma as never, audit as never, config as never, storage as never);
  return { svc, prisma, stored, created };
}
const actor = { userId: 'u1' } as never;
const file = (buffer: Buffer, originalname: string) => ({ buffer, size: buffer.length, originalname }) as Express.Multer.File;
const pdf = Buffer.from(`%PDF-1.7\n${'1 0 obj << /Type /Catalog >> endobj\n'.repeat(4)}trailer\n%%EOF\n`, 'latin1');

describe('MediaService — PDF documents', () => {
  it('stores a PDF byte-for-byte under a .pdf key with its checksum and no dimensions', async () => {
    const { svc, stored, created } = setup();
    const out = await svc.upload(file(pdf, 'Sponsorship Packages.pdf'), { consentStatus: 'CONFIRMED' } as never, actor);
    expect(stored).toHaveLength(1);
    expect(stored[0].mime).toBe('application/pdf');
    expect(stored[0].key).toMatch(/^uploads\/\d{4}\/\d{2}\/[0-9a-f]{24}\.pdf$/);
    expect(stored[0].body.equals(pdf)).toBe(true);
    expect(created[0]).toMatchObject({ mimeType: 'application/pdf', width: undefined, height: undefined, originalName: 'Sponsorship Packages.pdf', checksum: createHash('sha256').update(pdf).digest('hex') });
    expect(out.url).toMatch(/\/media\/uploads\/.+\.pdf$/);
  });

  it('rejects a file that only claims to be a PDF', async () => {
    const { svc } = setup();
    await expect(svc.upload(file(Buffer.from(`%PDF-1.7 ${'x'.repeat(100)}`), 'cut.pdf'), {} as never, actor)).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    await expect(svc.upload(file(Buffer.from(`<script>${'x'.repeat(100)}</script>%%EOF`), 'x.pdf'), {} as never, actor)).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
  });

  it('reports an identical re-upload as a duplicate with the existing id (re-runs reuse the asset)', async () => {
    const { svc, prisma } = setup();
    prisma.mediaAsset.findFirst.mockResolvedValueOnce({ id: 'existing' } as never);
    await expect(svc.upload(file(pdf, 'Sponsorship Packages.pdf'), {} as never, actor)).rejects.toBeInstanceOf(ConflictException);
  });

  it('a PDF can never be used where an image is required; CMS sections may reference it explicitly', async () => {
    const { svc } = setup([{ id: 'doc', mimeType: 'application/pdf' }, { id: 'img', mimeType: 'image/jpeg' }]);
    await expect(svc.assertExists(['img'])).resolves.toBeUndefined();
    await expect(svc.assertExists(['doc'])).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.assertExists(['doc'], { allowDocuments: true })).resolves.toBeUndefined();
    await expect(svc.assertExists(['missing'], { allowDocuments: true })).rejects.toBeInstanceOf(BadRequestException);
  });
});
