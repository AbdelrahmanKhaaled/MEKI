import { FAKE_WEB_PORT, REVALIDATE_TEST_SECRET } from './revalidation-env';
import { createServer, type Server } from 'node:http';
import { Prisma, type PageSection } from '../src/generated/prisma/client';
import { createTestApp, loginAs, uid, type Session, type TestContext } from './helpers';

/**
 * CMS live publishing: publish → committed → website caches invalidated (server-to-server, secret in a header) → admin told the
 * truth (X-Meki-Revalidation). Plus the Homepage Hero images on the existing CMS relations. The "website" is a fake loopback
 * server so the exact request can be inspected and outages simulated. The seeded HERO section is restored afterwards.
 */
describe('CMS live publishing + Hero images', () => {
  let ctx: TestContext;
  let content: Session; // CONTENT_MANAGER: content.read/manage/publish, faq.*
  let reader: Session; // CAMPAIGN_MANAGER: content.read only
  let web: Server;
  let mode: 'ok' | 'fail' = 'ok';
  const calls: { auth: string | undefined; tags: string[]; url: string }[] = [];
  let hero: PageSection;
  const createdMedia: string[] = [];

  beforeAll(async () => {
    web = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        calls.push({ auth: req.headers.authorization, tags: (JSON.parse(body || '{}') as { tags?: string[] }).tags ?? [], url: req.url ?? '' });
        if (mode === 'fail') {
          res.writeHead(503).end('unavailable');
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ revalidated: true }));
      });
    });
    await new Promise<void>((r) => web.listen(FAKE_WEB_PORT, '127.0.0.1', r));
    ctx = await createTestApp();
    content = await loginAs(ctx, ['CONTENT_MANAGER']);
    reader = await loginAs(ctx, ['CAMPAIGN_MANAGER']);
    const page = await ctx.prisma.page.findUniqueOrThrow({ where: { slug: 'home' } });
    hero = await ctx.prisma.pageSection.findUniqueOrThrow({ where: { pageId_key: { pageId: page.id, key: 'HERO' } } });
  });

  afterAll(async () => {
    // restore the seeded HERO section exactly (working copy + published snapshot) and remove test rows
    await ctx.prisma.sectionItem.deleteMany({ where: { sectionId: hero.id, code: 'hero-secondary-image' } });
    await ctx.prisma.pageSection.update({
      where: { id: hero.id },
      data: {
        eyebrowEn: hero.eyebrowEn,
        titleEn: hero.titleEn,
        titleAr: hero.titleAr,
        mediaId: hero.mediaId,
        labelsEn: hero.labelsEn ?? Prisma.DbNull,
        labelsAr: hero.labelsAr ?? Prisma.DbNull,
        status: hero.status,
        publishedData: hero.publishedData ?? Prisma.DbNull,
        publishedAt: hero.publishedAt,
        hasUnpublishedChanges: hero.hasUnpublishedChanges,
      },
    });
    if (createdMedia.length) await ctx.prisma.mediaAsset.deleteMany({ where: { id: { in: createdMedia } } });
    await ctx.app.close();
    await new Promise((r) => web.close(r));
  });

  const publicHero = async (locale = 'en') => {
    const res = await ctx.http().get(`/api/v1/public/home?locale=${locale}`).expect(200);
    return (res.body.data.page.sections as { key: string; title: string; media: { url: string } | null; items: { code: string; media: { url: string } | null }[] }[]).find((s) => s.key === 'HERO');
  };
  const image = async (w: number, h: number, extra: object = {}) => {
    const a = await ctx.prisma.mediaAsset.create({
      data: { storageDriver: 'LOCAL', storageKey: `uploads/test/${uid()}.webp`, mimeType: 'image/webp', sizeBytes: 120_000, width: w, height: h, provenance: 'PROPOSED', ...extra },
    });
    createdMedia.push(a.id);
    return a;
  };

  it('two consecutive Hero publishes: each one commits, invalidates the homepage tag and is served at once (Tests 1, 2, 7)', async () => {
    for (const version of ['CMS Test Version A', 'CMS Test Version B']) {
      calls.length = 0;
      await content.patch(`/admin/cms/sections/${hero.id}`, { titleEn: version, titleAr: `${version} AR` }).expect(200);
      const res = await content.post(`/admin/cms/sections/${hero.id}/publish`).expect(200);
      expect(res.headers['x-meki-revalidation']).toBe('revalidated');
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ url: '/api/internal/revalidate', tags: ['meki:home'], auth: `Bearer ${REVALIDATE_TEST_SECRET}` });
      expect((await publicHero('en'))?.title).toBe(version);
      expect((await publicHero('ar'))?.title).toBe(`${version} AR`);
    }
  });

  it('saving a draft neither publishes nor touches the website cache (Test 5)', async () => {
    calls.length = 0;
    const res = await content.patch(`/admin/cms/sections/${hero.id}`, { titleEn: 'Unpublished draft title' }).expect(200);
    expect(res.headers['x-meki-revalidation']).toBeUndefined();
    expect(calls).toHaveLength(0);
    expect((await publicHero())?.title).toBe('CMS Test Version B');
  });

  it('Hero images: invalid assets are refused; valid ones stay drafts until published, then reach the public API (Tests 3, 4, 8)', async () => {
    const small = await image(400, 400);
    const demo = await image(1600, 2000, { provenance: 'DEMO' });
    const denied = await image(1600, 2000, { consentStatus: 'NOT_GRANTED' });
    for (const bad of [small, demo, denied]) {
      const r = await content.patch(`/admin/cms/sections/${hero.id}`, { mediaId: bad.id }).expect(400);
      expect(r.body.error.code).toBe('HERO_IMAGE_INVALID');
    }
    await content.patch(`/admin/cms/sections/${hero.id}`, { mediaId: 'does-not-exist' }).expect(400);
    await reader.patch(`/admin/cms/sections/${hero.id}`, { mediaId: small.id }).expect(403);

    const main = await image(1600, 2000);
    const second = await image(600, 600);
    await content.patch(`/admin/cms/sections/${hero.id}`, { mediaId: main.id }).expect(200);
    const tiny = await image(100, 100);
    expect((await content.post(`/admin/cms/sections/${hero.id}/items`, { code: 'hero-secondary-image', mediaId: tiny.id }).expect(400)).body.error.code).toBe('HERO_IMAGE_INVALID');
    const item = (await content.post(`/admin/cms/sections/${hero.id}/items`, { code: 'hero-secondary-image', mediaId: second.id, titleEn: '' }).expect(201)).body.data;
    expect((await content.patch(`/admin/cms/items/${item.id}`, { mediaId: demo.id }).expect(400)).body.error.code).toBe('HERO_IMAGE_INVALID');

    // still drafts: the public hero shows the previously published images
    const before = await publicHero();
    expect(before?.media?.url ?? '').not.toContain(main.storageKey);
    expect(before?.items.find((i) => i.code === 'hero-secondary-image')).toBeUndefined();

    await content.patch(`/admin/cms/sections/${hero.id}`, { titleEn: 'CMS Test Version B' }).expect(200);
    calls.length = 0;
    expect((await content.post(`/admin/cms/sections/${hero.id}/publish`).expect(200)).headers['x-meki-revalidation']).toBe('revalidated');
    expect(calls[0]?.tags).toEqual(['meki:home']);
    const after = await publicHero();
    expect(after?.media?.url).toContain(main.storageKey);
    expect(after?.items.find((i) => i.code === 'hero-secondary-image')?.media?.url).toContain(second.storageKey);

    // restore default: null is always allowed and, once published, the website falls back to its curated photo
    await content.patch(`/admin/cms/sections/${hero.id}`, { mediaId: null }).expect(200);
    await content.post(`/admin/cms/sections/${hero.id}/publish`).expect(200);
    expect((await publicHero())?.media).toBeNull();

    // a published image whose consent is withdrawn later is dropped from the public payload (no broken image)
    await content.patch(`/admin/cms/sections/${hero.id}`, { mediaId: main.id }).expect(200);
    await content.post(`/admin/cms/sections/${hero.id}/publish`).expect(200);
    await ctx.prisma.mediaAsset.update({ where: { id: main.id }, data: { consentStatus: 'NOT_GRANTED' } });
    expect((await publicHero())?.media).toBeNull();
  });

  it('unauthorised callers can neither publish nor force a refresh (Test 8)', async () => {
    calls.length = 0;
    await reader.post(`/admin/cms/sections/${hero.id}/publish`).expect(403);
    await reader.post(`/admin/cms/sections/${hero.id}/unpublish`).expect(403);
    await reader.post('/admin/cms/revalidation/retry').expect(403);
    await ctx.http().post('/api/v1/admin/cms/revalidation/retry').expect(401);
    expect(calls).toHaveLength(0);
    expect((await reader.get('/admin/cms/revalidation').expect(200)).body.data).toMatchObject({ enabled: true });
  });

  it('website down: the publish is kept, the admin is told "pending", and retry delivers it without republishing (Test 9)', async () => {
    mode = 'fail';
    calls.length = 0;
    await content.patch(`/admin/cms/sections/${hero.id}`, { titleEn: 'Published during outage' }).expect(200);
    const res = await content.post(`/admin/cms/sections/${hero.id}/publish`).expect(200);
    expect(res.headers['x-meki-revalidation']).toBe('pending');
    expect(calls.length).toBe(2); // bounded: two attempts, then background retry
    expect((await publicHero())?.title).toBe('Published during outage'); // committed
    const pending = (await content.get('/admin/cms/revalidation').expect(200)).body.data;
    expect(pending).toMatchObject({ state: 'pending', pendingTags: ['meki:home'], lastError: 'HTTP_503' });
    expect(JSON.stringify(pending)).not.toContain(REVALIDATE_TEST_SECRET);

    mode = 'ok';
    calls.length = 0;
    const retried = (await content.post('/admin/cms/revalidation/retry').expect(200)).body.data;
    expect(retried).toMatchObject({ state: 'ok', pendingTags: [], consecutiveFailures: 0 });
    expect(calls[0]?.tags).toEqual(['meki:home']);
    // full refresh on demand
    calls.length = 0;
    await content.post('/admin/cms/revalidation/retry?all=true').expect(200);
    expect(calls[0]?.tags).toEqual(['meki-public']);
  });

  it('unpublish is reflected after invalidation (Test 6)', async () => {
    calls.length = 0;
    const res = await content.post(`/admin/cms/sections/${hero.id}/unpublish`).expect(200);
    expect(res.headers['x-meki-revalidation']).toBe('revalidated');
    expect(calls[0]?.tags).toEqual(['meki:home']);
    expect(await publicHero()).toBeUndefined();
  });

  it('other publishing modules invalidate their own pages (FAQ → home; another CMS page → its own tag)', async () => {
    const faq = (await content.post('/admin/faqs', { questionEn: `Live publishing test ${uid()}?`, answerEn: 'Yes.', provenance: 'PROPOSED' }).expect(201)).body.data;
    calls.length = 0;
    expect((await content.post(`/admin/faqs/${faq.id}/publish`).expect(200)).headers['x-meki-revalidation']).toBe('revalidated');
    expect(calls[0]?.tags).toEqual(['meki:home']);
    await content.post(`/admin/faqs/${faq.id}/unpublish`).expect(200);
    await content.del(`/admin/faqs/${faq.id}`).expect(204);

    const slug = `live-${uid()}`;
    await content.post('/admin/cms/pages', { slug, titleEn: 'Live test page' }).expect(201);
    calls.length = 0;
    await content.post(`/admin/cms/pages/${slug}/publish`).expect(200);
    expect(calls[0]?.tags).toEqual([`meki:page:${slug}`]);
    await content.post(`/admin/cms/pages/${slug}/unpublish`).expect(200);
    // GET requests never trigger anything
    calls.length = 0;
    await content.get(`/admin/cms/pages/${slug}`).expect(200);
    expect(calls).toHaveLength(0);
  });
});
