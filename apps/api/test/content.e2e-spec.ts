import './env-payments-disabled'; // this suite asserts behaviour without any configured provider
import { API, createTestApp, loginAs, uid, type Session, type TestContext } from './helpers';

describe('CMS, programmes, statistics, FAQ, settings', () => {
  let ctx: TestContext;
  let editor: Session;
  let pageSlug: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    editor = await loginAs(ctx, ['CONTENT_MANAGER']);
    // Isolated page so the seeded homepage is never modified by tests.
    pageSlug = `test-${uid()}`;
    await ctx.prisma.page.create({ data: { slug: pageSlug, titleEn: 'Test page', status: 'PUBLISHED', publishedAt: new Date() } });
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  describe('CMS draft/publish workflow', () => {
    it('edits stay private until the section is published', async () => {
      const created = await editor.post(`/admin/cms/pages/${pageSlug}/sections`, { key: 'HERO', titleEn: 'Draft title', titleAr: 'عنوان', ctaPrimaryHref: '#programmes' }).expect(201);
      const id = created.body.data.id;
      let pub = await ctx.http().get(`${API}/public/pages/${pageSlug}`).expect(200);
      expect(pub.body.data.sections).toHaveLength(0);

      await editor.post(`/admin/cms/sections/${id}/publish`).expect(200);
      pub = await ctx.http().get(`${API}/public/pages/${pageSlug}?locale=ar`).expect(200);
      expect(pub.body.data.sections[0]).toMatchObject({ key: 'HERO', title: 'عنوان' });

      await editor.patch(`/admin/cms/sections/${id}`, { titleEn: 'Changed but unpublished' }).expect(200);
      const admin = await editor.get(`/admin/cms/sections/${id}`).expect(200);
      expect(admin.body.data.hasUnpublishedChanges).toBe(true);
      pub = await ctx.http().get(`${API}/public/pages/${pageSlug}?locale=en`).expect(200);
      expect(pub.body.data.sections[0].title).toBe('Draft title');

      await editor.post(`/admin/cms/sections/${id}/publish`).expect(200);
      pub = await ctx.http().get(`${API}/public/pages/${pageSlug}?locale=en`).expect(200);
      expect(pub.body.data.sections[0].title).toBe('Changed but unpublished');

      await editor.post(`/admin/cms/sections/${id}/unpublish`).expect(200);
      pub = await ctx.http().get(`${API}/public/pages/${pageSlug}`).expect(200);
      expect(pub.body.data.sections).toHaveLength(0);
    });

    it('supports items, ordering, visibility; Arabic falls back to English', async () => {
      const s = await editor.post(`/admin/cms/pages/${pageSlug}/sections`, { key: 'HOW_WE_WORK', titleEn: 'How' }).expect(201);
      const id = s.body.data.id;
      const a = await editor.post(`/admin/cms/sections/${id}/items`, { titleEn: 'Connect', titleAr: 'نربط' }).expect(201);
      const b = await editor.post(`/admin/cms/sections/${id}/items`, { titleEn: 'Unite' }).expect(201);
      const hidden = await editor.post(`/admin/cms/sections/${id}/items`, { titleEn: 'Hidden', isVisible: false }).expect(201);
      await editor.put(`/admin/cms/sections/${id}/items/order`, { ids: [b.body.data.id, a.body.data.id, hidden.body.data.id] }).expect(200);
      await editor.post(`/admin/cms/sections/${id}/publish`).expect(200);
      const pub = await ctx.http().get(`${API}/public/pages/${pageSlug}?locale=ar`).expect(200);
      const section = pub.body.data.sections.find((x: { key: string }) => x.key === 'HOW_WE_WORK');
      expect(section.items.map((i: { title: string }) => i.title)).toEqual(['Unite', 'نربط']);
      expect(section.items[0].translationFallback).toEqual(['title']);
    });

    it('rejects unsafe CTA links and malformed label maps', async () => {
      const s = await editor.post(`/admin/cms/pages/${pageSlug}/sections`, { key: 'FAQ' }).expect(201);
      await editor.patch(`/admin/cms/sections/${s.body.data.id}`, { ctaPrimaryHref: 'javascript:alert(1)' }).expect(400);
      await editor.patch(`/admin/cms/sections/${s.body.data.id}`, { labelsEn: { nested: { a: 1 } } }).expect(400);
      await editor.patch(`/admin/cms/sections/${s.body.data.id}`, { unknownField: 'x' }).expect(400);
    });

    it('DEMO content cannot be published', async () => {
      const s = await editor.post(`/admin/cms/pages/${pageSlug}/sections`, { key: 'GALLERY', titleEn: 'Mock', provenance: 'DEMO' }).expect(201);
      const res = await editor.post(`/admin/cms/sections/${s.body.data.id}/publish`).expect(422);
      expect(res.body.error.code).toBe('DEMO_NOT_PUBLISHABLE');
    });

    it('the seeded homepage represents the implemented landing page', async () => {
      const res = await ctx.http().get(`${API}/public/home?locale=en`).expect(200);
      const keys = res.body.data.page.sections.map((s: { key: string }) => s.key);
      expect(keys).toEqual(expect.arrayContaining(['HERO', 'ABOUT', 'VISION_MISSION', 'HOW_WE_WORK', 'IMPACT', 'PROGRAMMES', 'CAMPAIGNS', 'GALLERY', 'FAQ', 'FOOTER']));
      const hero = res.body.data.page.sections.find((s: { key: string }) => s.key === 'HERO');
      expect(hero.title).toBe('Lasting Change,'); // approved brand tagline "Lasting Change, Built Together." (apps/web/src/content/en.ts)
      expect(hero.media.url).toMatch(/\/images\/work\/hero-family\.webp$/);
      expect(res.body.data.programmes.filter((p: { kind: string }) => p.kind === 'PROGRAMME')).toHaveLength(9);
      expect(res.body.data.site.contactEmail).toBeNull();
      expect(res.body.data.donation.paymentsEnabled).toBe(false);
    });
  });

  describe('Programmes', () => {
    it('CRUD + publish + public visibility + slug uniqueness', async () => {
      const code = `PRG-T${uid().toUpperCase()}`;
      const res = await editor.post('/admin/programmes', { code, nameEn: `Test Programme ${code}`, nameAr: 'برنامج' }).expect(201);
      const p = res.body.data;
      expect(p.status).toBe('DRAFT');
      await ctx.http().get(`${API}/public/programmes/${p.slug}`).expect(404);
      const blocked = await editor.post(`/admin/programmes/${p.id}/publish`).expect(422);
      expect(blocked.body.error.details.missing).toContain('shortDescEn');
      await editor.patch(`/admin/programmes/${p.id}`, { shortDescEn: 'Short description', focusAreasEn: ['One', 'Two'] }).expect(200);
      await editor.post(`/admin/programmes/${p.id}/publish`).expect(200);
      const pub = await ctx.http().get(`${API}/public/programmes/${p.slug}?locale=ar`).expect(200);
      expect(pub.body.data.name).toBe('برنامج');
      expect(pub.body.data.shortDesc).toBe('Short description');
      await editor.post('/admin/programmes', { code: `${code}X`, slug: p.slug, nameEn: 'Dup' }).expect(409);
      await editor.del(`/admin/programmes/${p.id}`).expect(409);
      await editor.post(`/admin/programmes/${p.id}/unpublish`).expect(200);
      await editor.del(`/admin/programmes/${p.id}`).expect(204);
      await editor.get(`/admin/programmes/${p.id}`).expect(404);
    });

    it('lists with pagination, search and sort', async () => {
      const res = await editor.get('/admin/programmes?search=Health&pageSize=5&sort=sortOrder:asc').expect(200);
      expect(res.body.meta.pageSize).toBe(5);
      expect(res.body.data[0].nameEn).toMatch(/Health/);
      await editor.get('/admin/programmes?pageSize=1000').expect(400);
      await editor.get('/admin/programmes?sort=password:asc;drop').expect(400);
    });
  });

  describe('Impact statistics', () => {
    it('only verified statistics with a source can be published; editing a fact resets verification', async () => {
      const code = `stat-${uid()}`;
      const s = (await editor.post('/admin/statistics', { code, labelEn: 'Test stat', value: 42 }).expect(201)).body.data;
      // Content managers can draft figures but cannot verify or publish them.
      await editor.post(`/admin/statistics/${s.id}/publish`).expect(403);
      await editor.post(`/admin/statistics/${s.id}/verify`, { verificationStatus: 'VERIFIED' }).expect(403);
      const admin = await loginAs(ctx, ['ADMINISTRATOR']);
      const r = await admin.post(`/admin/statistics/${s.id}/publish`).expect(422);
      expect(r.body.error.code).toBe('STATISTIC_NOT_VERIFIED');
      await admin.post(`/admin/statistics/${s.id}/verify`, { verificationStatus: 'VERIFIED' }).expect(422); // no sourceRef
      await admin.patch(`/admin/statistics/${s.id}`, { sourceRef: 'Test source p.1' }).expect(200);
      await admin.post(`/admin/statistics/${s.id}/verify`, { verificationStatus: 'VERIFIED' }).expect(200);
      await admin.post(`/admin/statistics/${s.id}/publish`).expect(200);
      let pub = await ctx.http().get(`${API}/public/statistics`).expect(200);
      expect(pub.body.data.map((x: { code: string }) => x.code)).toContain(code);

      const edited = await admin.patch(`/admin/statistics/${s.id}`, { value: 43 }).expect(200);
      expect(edited.body.data).toMatchObject({ verificationStatus: 'UNVERIFIED', status: 'DRAFT' });
      pub = await ctx.http().get(`${API}/public/statistics`).expect(200);
      expect(pub.body.data.map((x: { code: string }) => x.code)).not.toContain(code);
    });

    it('seeded Misr El-Kheir figures are public with their attribution', async () => {
      const pub = await ctx.http().get(`${API}/public/statistics?locale=en`).expect(200);
      const seeded = pub.body.data.filter((x: { code: string }) => ['years-of-service', 'beneficiaries-reached'].includes(x.code));
      expect(seeded).toHaveLength(2);
      seeded.forEach((x: { attribution: string; sourceRef: string }) => {
        expect(x.attribution).toBe('Figures: Misr El-Kheir, Egypt.');
        expect(x.sourceRef).toMatch(/Brand Guidelines/);
      });
    });
  });

  describe('FAQ', () => {
    it('create → publish → public; unpublish hides', async () => {
      const f = (await editor.post('/admin/faqs', { questionEn: `Q ${uid()}?`, answerEn: 'An answer.', category: 'testing' }).expect(201)).body.data;
      let pub = await ctx.http().get(`${API}/public/faqs?category=testing`).expect(200);
      expect(pub.body.data.find((x: { id: string }) => x.id === f.id)).toBeUndefined();
      await editor.post(`/admin/faqs/${f.id}/publish`).expect(200);
      pub = await ctx.http().get(`${API}/public/faqs?category=testing&locale=ar`).expect(200);
      expect(pub.body.data.find((x: { id: string }) => x.id === f.id).question).toBe(f.questionEn);
      await editor.post(`/admin/faqs/${f.id}/unpublish`).expect(200);
      pub = await ctx.http().get(`${API}/public/faqs?category=testing`).expect(200);
      expect(pub.body.data.find((x: { id: string }) => x.id === f.id)).toBeUndefined();
    });
  });

  describe('Settings', () => {
    it('payments cannot be enabled without an approved provider', async () => {
      const admin = await loginAs(ctx, ['ADMINISTRATOR']);
      const r = await admin.patch('/admin/settings/donation', { paymentsEnabled: true }).expect(422);
      expect(r.body.error.code).toBe('PAYMENTS_NOT_CONFIGURED');
      await admin.patch('/admin/settings/donation', { defaultCurrency: 'EGP' }).expect(422); // not in displayCurrencies
      await admin.patch('/admin/settings/site', { socialLinks: [{ network: 'facebook', url: 'http://insecure' }] }).expect(400);
    });
  });
});
