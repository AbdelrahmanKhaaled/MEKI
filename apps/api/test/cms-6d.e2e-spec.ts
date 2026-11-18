import { API, createTestApp, loginAs, uid, type Session, type TestContext } from './helpers';

/**
 * Phase 6D additive CMS API: create a site content page, remove an unpublished section (block), and the page list's
 * `isEventPage` / `updatedByName`. Plus the publish → public visibility contract the admin relies on.
 */
describe('Phase 6D CMS additions', () => {
  let ctx: TestContext;
  let content: Session; // CONTENT_MANAGER: content.read/manage/publish
  let reader: Session; // CAMPAIGN_MANAGER: content.read only

  beforeAll(async () => {
    ctx = await createTestApp();
    content = await loginAs(ctx, ['CONTENT_MANAGER']);
    reader = await loginAs(ctx, ['CAMPAIGN_MANAGER']);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  const newPage = async (extra: object = {}) => {
    const slug = `t6d-${uid()}`;
    const res = await content.post('/admin/cms/pages', { slug, titleEn: `Test page ${slug}`, titleAr: 'صفحة', ...extra }).expect(201);
    return res.body.data;
  };

  it('creates a DRAFT content page; slug is validated and unique; permission enforced', async () => {
    const p = await newPage({ provenance: 'VERIFIED_SOURCE' });
    expect(p).toMatchObject({ status: 'DRAFT', provenance: 'VERIFIED_SOURCE', sections: [] });
    expect((await content.post('/admin/cms/pages', { slug: p.slug, titleEn: 'Duplicate' }).expect(409)).body.error.code).toBe('PAGE_SLUG_TAKEN');
    expect((await content.post('/admin/cms/pages', { slug: 'home', titleEn: 'Clash with home' }).expect(409)).body.error.code).toBe('PAGE_SLUG_TAKEN');
    await content.post('/admin/cms/pages', { slug: 'Bad Slug', titleEn: 'x x' }).expect(400);
    await content.post('/admin/cms/pages', { slug: `t6d-${uid()}`, titleEn: 'x' }).expect(400); // titleEn min 2
    await content.post('/admin/cms/pages', { slug: `t6d-${uid()}`, titleEn: 'ok ok', status: 'PUBLISHED' }).expect(400); // status cannot be set
    await reader.post('/admin/cms/pages', { slug: `t6d-${uid()}`, titleEn: 'Nope' }).expect(403);
  });

  it('page list flags event pages and names the last editor', async () => {
    const p = await newPage();
    const list = (await reader.get('/admin/cms/pages').expect(200)).body.data as { slug: string; isEventPage: boolean; updatedByName: string | null }[];
    expect(list.find((x) => x.slug === p.slug)).toMatchObject({ isEventPage: false, updatedByName: 'Test CONTENT_MANAGER' });
    expect(list.find((x) => x.slug === 'home')?.isEventPage).toBe(false);
    const gala = list.find((x) => x.slug === 'gala-night');
    if (gala) expect(gala.isEventPage).toBe(true);
  });

  it('blocks: draft sections can be removed (with items); published ones must be unpublished first', async () => {
    const p = await newPage();
    const s = (await content.post(`/admin/cms/pages/${p.slug}/sections`, { key: 'ABOUT', titleEn: 'Who we are', bodyEn: 'Body' }).expect(201)).body.data;
    await content.post(`/admin/cms/sections/${s.id}/items`, { titleEn: 'Item' }).expect(201);
    await reader.del(`/admin/cms/sections/${s.id}`).expect(403);
    await content.post(`/admin/cms/sections/${s.id}/publish`).expect(200);
    expect((await content.del(`/admin/cms/sections/${s.id}`).expect(409)).body.error.code).toBe('SECTION_PUBLISHED');
    await content.post(`/admin/cms/sections/${s.id}/unpublish`).expect(200);
    await content.del(`/admin/cms/sections/${s.id}`).expect(204);
    await content.get(`/admin/cms/sections/${s.id}`).expect(404);
    expect(await ctx.prisma.sectionItem.count({ where: { sectionId: s.id } })).toBe(0);
    await content.del('/admin/cms/sections/does-not-exist').expect(404);
  });

  it('event landing pages stay out of the site CMS (no section removal through /admin/cms)', async () => {
    const gala = await ctx.prisma.page.findFirst({ where: { event: { isNot: null } }, include: { sections: { take: 1 } } });
    if (!gala?.sections[0]) return;
    expect((await content.del(`/admin/cms/sections/${gala.sections[0].id}`).expect(403)).body.error.code).toBe('EVENT_PAGE_SCOPE');
  });

  it('publishing contract: only a published page with published, visible sections is public; drafts never leak', async () => {
    const p = await newPage();
    const pub = (await content.post(`/admin/cms/pages/${p.slug}/sections`, { key: 'ABOUT', titleEn: 'Published block', bodyEn: 'Visible text' }).expect(201)).body.data;
    await content.post(`/admin/cms/pages/${p.slug}/sections`, { key: 'WHY', titleEn: 'Draft block', bodyEn: 'Secret draft text' }).expect(201);
    await ctx.http().get(`${API}/public/pages/${p.slug}`).expect(404); // page still DRAFT
    await content.post(`/admin/cms/sections/${pub.id}/publish`).expect(200);
    await content.post(`/admin/cms/pages/${p.slug}/publish`).expect(200);
    const en = (await ctx.http().get(`${API}/public/pages/${p.slug}?locale=en`).expect(200)).body.data;
    expect(en.sections.map((s: { title: string }) => s.title)).toEqual(['Published block']);
    expect(JSON.stringify(en)).not.toContain('Secret draft text');
    // working-copy edits are not public until republished
    await content.patch(`/admin/cms/sections/${pub.id}`, { bodyEn: 'Edited but not republished' }).expect(200);
    expect(JSON.stringify((await ctx.http().get(`${API}/public/pages/${p.slug}`).expect(200)).body.data)).not.toContain('Edited but not republished');
    // Arabic localisation of the same page
    await content.patch(`/admin/cms/sections/${pub.id}`, { titleAr: 'كتلة منشورة' }).expect(200);
    await content.post(`/admin/cms/sections/${pub.id}/publish`).expect(200);
    const ar = (await ctx.http().get(`${API}/public/pages/${p.slug}?locale=ar`).expect(200)).body.data;
    expect(ar.sections[0].title).toBe('كتلة منشورة');
    // a section published as hidden is left out of `sections` and listed in `hiddenSectionKeys`
    await content.patch(`/admin/cms/sections/${pub.id}`, { isVisible: false }).expect(200);
    await content.post(`/admin/cms/sections/${pub.id}/publish`).expect(200);
    const hidden = (await ctx.http().get(`${API}/public/pages/${p.slug}?locale=en`).expect(200)).body.data;
    expect(hidden.sections).toHaveLength(0);
    expect(hidden.hiddenSectionKeys).toEqual(['ABOUT']);
    await content.post(`/admin/cms/pages/${p.slug}/unpublish`).expect(200);
    await ctx.http().get(`${API}/public/pages/${p.slug}`).expect(404);
  });

  it('DEMO pages cannot be published', async () => {
    const p = await newPage({ provenance: 'DEMO' });
    expect((await content.post(`/admin/cms/pages/${p.slug}/publish`).expect(422)).body.error.code).toBe('DEMO_NOT_PUBLISHABLE');
  });
});
