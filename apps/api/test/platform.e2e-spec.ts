import { runSeed } from '../prisma/seed/run-seed';
import { API, createTestApp, loginAs, type TestContext } from './helpers';

describe('Seed idempotency, audit log protection, public access', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  describe('Seed', () => {
    it('is idempotent and never overwrites dashboard edits', async () => {
      const programme = await ctx.prisma.programme.findUniqueOrThrow({ where: { code: 'PRG-01' } });
      const before = {
        programmes: await ctx.prisma.programme.count(),
        campaigns: await ctx.prisma.campaign.count(),
        sections: await ctx.prisma.pageSection.count(),
        items: await ctx.prisma.sectionItem.count(),
        media: await ctx.prisma.mediaAsset.count(),
      };
      const edited = `Edited in dashboard ${Date.now()}`;
      await ctx.prisma.programme.update({ where: { id: programme.id }, data: { shortDescEn: edited } });
      try {
        const report = await runSeed(ctx.prisma);
        expect(report.created).toEqual({});
        expect(await ctx.prisma.programme.count()).toBe(before.programmes);
        expect(await ctx.prisma.campaign.count()).toBe(before.campaigns);
        expect(await ctx.prisma.pageSection.count()).toBe(before.sections);
        expect(await ctx.prisma.sectionItem.count()).toBe(before.items);
        expect(await ctx.prisma.mediaAsset.count()).toBe(before.media);
        const after = await ctx.prisma.programme.findUniqueOrThrow({ where: { id: programme.id } });
        expect(after.shortDescEn).toBe(edited);
      } finally {
        await ctx.prisma.programme.update({ where: { id: programme.id }, data: { shortDescEn: programme.shortDescEn } });
      }
    });

    it('seeds the nine official programmes with both source wordings and no admin accounts', async () => {
      const programmes = await ctx.prisma.programme.findMany({ where: { code: { startsWith: 'PRG-0' } }, orderBy: { number: 'asc' } });
      expect(programmes).toHaveLength(9);
      expect(programmes[0]).toMatchObject({ nameEn: 'Social Solidarity & Household Resilience', altNameEn: 'Social Solidarity & Family Resilience', provenance: 'VERIFIED_SOURCE' });
      const enabling = await ctx.prisma.programme.count({ where: { kind: 'ENABLING_FUNCTION', code: { startsWith: 'ENB-' } } });
      expect(enabling).toBe(3);
      const seedAdmins = await ctx.prisma.adminUser.count({ where: { email: { endsWith: '@meki.org' } } });
      expect(seedAdmins).toBe(0);
    });
  });

  describe('Audit log', () => {
    it('cannot be modified or deleted, even directly in the database', async () => {
      const row = await ctx.prisma.auditLog.create({ data: { action: 'test.audit', entityType: 'Test' } });
      await expect(ctx.prisma.auditLog.update({ where: { id: row.id }, data: { action: 'tampered' } })).rejects.toThrow(/append-only/);
      await expect(ctx.prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
    });

    it('is exposed read-only to authorised roles with filters', async () => {
      const finance = await loginAs(ctx, ['FINANCE_MANAGER']);
      const res = await finance.get('/admin/audit-logs?action=auth.login&pageSize=5').expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every((r: { action: string }) => r.action === 'auth.login')).toBe(true);
      const root = await loginAs(ctx, ['SUPER_ADMIN']);
      await root.del(`/admin/audit-logs/${res.body.data[0].id}`).expect(404);
      await root.patch(`/admin/audit-logs/${res.body.data[0].id}`, { action: 'x' }).expect(404);
    });
  });

  describe('Public API access restrictions', () => {
    it.each(['/admin/programmes', '/admin/campaigns', '/admin/media', '/admin/settings/site', '/admin/audit-logs', '/admin/users'])(
      'unauthenticated %s → 401',
      async (url) => {
        await ctx.http().get(`${API}${url}`).expect(401);
      },
    );

    it('public endpoints hide drafts, DEMO content and internal fields', async () => {
      const draft = await ctx.prisma.programme.create({ data: { code: `PRG-HIDDEN-${Date.now()}`, slug: `hidden-${Date.now()}`, nameEn: 'Hidden', shortDescEn: 'x', status: 'DRAFT' } });
      const demo = await ctx.prisma.programme.create({ data: { code: `PRG-DEMO-${Date.now()}`, slug: `demo-${Date.now()}`, nameEn: 'Demo', shortDescEn: 'x', status: 'PUBLISHED', provenance: 'DEMO' } });
      const res = await ctx.http().get(`${API}/public/programmes`).expect(200);
      const slugs = res.body.data.map((p: { slug: string }) => p.slug);
      expect(slugs).not.toContain(draft.slug);
      expect(slugs).not.toContain(demo.slug);
      const body = JSON.stringify(res.body);
      expect(body).not.toMatch(/createdById|updatedById|sourceRef|deletedAt|provenance/);
      expect(res.headers['cache-control']).toMatch(/s-maxage/);
    });

    it('public writes are not possible', async () => {
      await ctx.http().post(`${API}/public/campaigns`).send({}).expect(404);
      await ctx.http().patch(`${API}/public/site`).send({}).expect(404);
    });

    it('health check reports database status', async () => {
      const res = await ctx.http().get(`${API}/health`).expect(200);
      expect(res.body.data).toMatchObject({ status: 'ok', database: 'up' });
    });

    it('returns the consistent error envelope', async () => {
      const res = await ctx.http().get(`${API}/public/campaigns/does-not-exist`).expect(404);
      expect(res.body.error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND', path: `${API}/public/campaigns/does-not-exist` });
      expect(res.body.error.requestId).toEqual(expect.any(String));
      expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
    });
  });
});
