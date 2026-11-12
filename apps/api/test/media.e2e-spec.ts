import sharp from 'sharp';
import { createTestApp, loginAs, type Session, type TestContext } from './helpers';

const png = async (seed: number, withExif = false) => {
  // Random colour + size so images are unique across runs on the persistent test database.
  const rnd = () => Math.floor(Math.random() * 256);
  let img = sharp({ create: { width: 32 + seed + rnd(), height: 24 + rnd(), channels: 3, background: { r: rnd(), g: rnd(), b: rnd() } } }).png();
  if (withExif) img = img.withMetadata({ exif: { IFD0: { Copyright: 'secret-gps-owner' } } });
  return img.toBuffer();
};

describe('Media library', () => {
  let ctx: TestContext;
  let editor: Session;
  beforeAll(async () => {
    ctx = await createTestApp();
    editor = await loginAs(ctx, ['CONTENT_MANAGER']);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  const upload = (buf: Buffer, filename: string, contentType = 'image/png', fields: Record<string, string> = {}) => {
    let req = editor.post('/admin/media');
    // supertest: multipart instead of JSON body
    req = req.attach('file', buf, { filename, contentType });
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req;
  };

  it('accepts a valid image, strips metadata, stores outside MySQL with a generated key', async () => {
    const buf = await png(Date.now() % 200, true);
    const res = await upload(buf, '../../evil name<script>.png', 'image/png', { altEn: 'Alt text', altAr: 'نص بديل', category: 'PROGRAMME' }).expect(201);
    const m = res.body.data;
    expect(m).toMatchObject({ mimeType: 'image/png', storageDriver: 'LOCAL', altAr: 'نص بديل', category: 'PROGRAMME' });
    expect(m.storageKey).toMatch(/^uploads\/\d{4}\/\d{2}\/[a-f0-9]{24}\.png$/);
    expect(m.originalName).not.toMatch(/[<>/\\]/);
    const served = await ctx.http().get(`/media/${m.storageKey}`).expect(200);
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    const meta = await sharp(served.body as Buffer).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it('rejects SVG and spoofed files (magic bytes, not extension)', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await upload(svg, 'logo.svg', 'image/svg+xml').expect(415);
    await upload(Buffer.from('MZ this is an exe pretending to be png....'), 'photo.png', 'image/png').expect(415);
  });

  it('rejects files over the size limit', async () => {
    const big = Buffer.alloc(11 * 1024 * 1024, 0);
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await upload(big, 'big.png').expect(413);
  });

  it('rejects duplicate uploads', async () => {
    const buf = await png(201);
    await upload(buf, 'a.png').expect(201);
    const dup = await upload(buf, 'b.png').expect(409);
    expect(dup.body.error.code).toBe('DUPLICATE_MEDIA');
  });

  it('blocks deleting media that is in use; soft-deletes unused media', async () => {
    const used = (await upload(await png(202), 'used.png').expect(201)).body.data;
    const programme = await ctx.prisma.programme.findUniqueOrThrow({ where: { code: 'PRG-03' } });
    const original = programme.coverMediaId;
    await editor.patch(`/admin/programmes/${programme.id}`, { coverMediaId: used.id }).expect(200);
    const admin = await loginAs(ctx, ['ADMINISTRATOR']);
    const blocked = await admin.del(`/admin/media/${used.id}`).expect(409);
    expect(blocked.body.error.details.programmeCovers).toBe(1);
    await editor.patch(`/admin/programmes/${programme.id}`, { coverMediaId: original }).expect(200);

    const unused = (await upload(await png(203), 'unused.png').expect(201)).body.data;
    await editor.del(`/admin/media/${unused.id}`).expect(403); // content managers lack media.delete
    await admin.del(`/admin/media/${unused.id}`).expect(204);
    await admin.get(`/admin/media/${unused.id}`).expect(404);
    const row = await ctx.prisma.mediaAsset.findUnique({ where: { id: unused.id } });
    expect(row!.deletedAt).not.toBeNull();
  });

  it('requires upload permission and rejects invalid references', async () => {
    const finance = await loginAs(ctx, ['FINANCE_MANAGER']);
    await finance.post('/admin/media').attach('file', await png(204), { filename: 'x.png', contentType: 'image/png' }).expect(403);
    const programme = await ctx.prisma.programme.findUniqueOrThrow({ where: { code: 'PRG-03' } });
    await editor.patch(`/admin/programmes/${programme.id}`, { coverMediaId: 'does-not-exist' }).expect(400);
  });
});
