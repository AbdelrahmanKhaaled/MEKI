import sharp from 'sharp';
import { createTestApp, loginAs, type Session, type TestContext } from './helpers';

/** Regression tests for the Phase 1+2 integration-review findings. */
describe('Security fixes (media serving, keys, config-driven limits)', () => {
  let ctx: TestContext;
  let editor: Session;
  let admin: Session;

  beforeAll(async () => {
    ctx = await createTestApp();
    editor = await loginAs(ctx, ['CONTENT_MANAGER']);
    admin = await loginAs(ctx, ['ADMINISTRATOR']);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  const upload = async () => {
    const rnd = () => Math.floor(Math.random() * 256);
    const png = await sharp({ create: { width: 40 + rnd(), height: 30 + rnd(), channels: 3, background: { r: rnd(), g: rnd(), b: rnd() } } }).png().toBuffer();
    return (await editor.post('/admin/media').attach('file', png, { filename: 'x.png', contentType: 'image/png' }).expect(201)).body.data;
  };

  it('storage keys are 96-bit random hex (crypto), URLs keep the /media/<key> shape', async () => {
    const a = await upload();
    const b = await upload();
    expect(a.storageKey).toMatch(/^uploads\/\d{4}\/\d{2}\/[a-f0-9]{24}\.png$/);
    expect(a.storageKey).not.toBe(b.storageKey);
    expect(a.url).toMatch(/\/media\/uploads\/\d{4}\/\d{2}\/[a-f0-9]{24}\.png$/);
  });

  it('deleted media is no longer served (public or admin)', async () => {
    const m = await upload();
    await ctx.http().get(`/media/${m.storageKey}`).expect(200);
    await admin.del(`/admin/media/${m.id}`).expect(204);
    await ctx.http().get(`/media/${m.storageKey}`).expect(404);
    await ctx.http().get(`/media/${m.storageKey}`).set('Cookie', admin.cookie).expect(404);
  });

  it('consent NOT_GRANTED hides an image publicly but admins can preview it', async () => {
    const m = await upload();
    await editor.patch(`/admin/media/${m.id}`, { consentStatus: 'NOT_GRANTED' }).expect(200);
    await ctx.http().get(`/media/${m.storageKey}`).expect(404);
    const preview = await ctx.http().get(`/media/${m.storageKey}`).set('Cookie', editor.cookie).expect(200);
    expect(preview.headers['cache-control']).toBe('private, no-store');
    await editor.patch(`/admin/media/${m.id}`, { consentStatus: 'CONFIRMED' }).expect(200);
    const pub = await ctx.http().get(`/media/${m.storageKey}`).expect(200);
    expect(pub.headers['cache-control']).toMatch(/public/);
    expect(pub.headers['x-content-type-options']).toBe('nosniff');
  });

  it('files not registered in the library, traversal and directories return 404', async () => {
    await ctx.http().get('/media/uploads/2026/11/ffffffffffffffffffffffff.png').expect(404);
    await ctx.http().get('/media/..%2F..%2F.env').expect(404);
    await ctx.http().get('/media/uploads/').expect(404);
  });

  it('login throttle still applies with the limit read from validated config', async () => {
    const ip = `10.250.${Math.floor(Math.random() * 250)}.1`;
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      statuses.push((await ctx.http().post('/api/v1/admin/auth/login').set('X-Forwarded-For', ip).send({ email: 'nobody@meki.test', password: 'x-password-1' })).status);
    }
    expect(statuses.filter((s) => s === 401)).toHaveLength(5); // LOGIN_RATE_LIMIT_PER_MINUTE=5 in .env.test
    expect(statuses).toContain(429);
  });

  it('upload limit comes from validated MEDIA_MAX_UPLOAD_MB (10 MB in .env.test)', async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 10, 0);
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await editor.post('/admin/media').attach('file', big, { filename: 'big.png', contentType: 'image/png' }).expect(413);
  });
});
