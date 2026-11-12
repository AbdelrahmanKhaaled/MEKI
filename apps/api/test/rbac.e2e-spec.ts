import { createAdmin, createTestApp, loginAs, uid, type TestContext } from './helpers';

describe('RBAC & user management', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it.each([
    ['CONTENT_MANAGER', 'get', '/admin/users', 403],
    ['CONTENT_MANAGER', 'get', '/admin/audit-logs', 403],
    ['CONTENT_MANAGER', 'get', '/admin/programmes', 200],
    ['CAMPAIGN_MANAGER', 'get', '/admin/campaigns', 200],
    ['CAMPAIGN_MANAGER', 'get', '/admin/cms/pages', 200],
    ['CAMPAIGN_MANAGER', 'get', '/admin/faqs', 403],
    ['FINANCE_MANAGER', 'get', '/admin/audit-logs', 200],
    ['FINANCE_MANAGER', 'get', '/admin/users', 403],
    ['ADMINISTRATOR', 'get', '/admin/users', 200],
    ['SUPER_ADMIN', 'get', '/admin/roles', 200],
  ] as const)('%s %s %s → %d', async (role, _m, url, status) => {
    const s = await loginAs(ctx, [role]);
    await s.get(url).expect(status);
  });

  it('read-only roles cannot mutate', async () => {
    const finance = await loginAs(ctx, ['FINANCE_MANAGER']);
    await finance.patch('/admin/settings/site', { taglineEn: 'nope' }).expect(403);
    await finance.post('/admin/faqs', { questionEn: 'Question?', answerEn: 'Answer.' }).expect(403);
  });

  it('campaign manager cannot record MEKI approval', async () => {
    const cm = await loginAs(ctx, ['CAMPAIGN_MANAGER']);
    const created = await cm.post('/admin/campaigns', { code: `CMP-T-${uid().toUpperCase()}`, titleEn: `RBAC test campaign ${uid()}` }).expect(201);
    const res = await cm.post(`/admin/campaigns/${created.body.data.id}/approve`, { note: 'approved by me' }).expect(403);
    expect(res.body.error.details.missing).toEqual(['campaigns.approve']);
  });

  it('administrators create users (forced password change) but cannot grant SUPER_ADMIN', async () => {
    const admin = await loginAs(ctx, ['ADMINISTRATOR']);
    const email = `new-${uid()}@meki.test`;
    const res = await admin.post('/admin/users', { email, name: 'New Editor', temporaryPassword: 'Temporary-Pass-77', roleKeys: ['CONTENT_MANAGER'] }).expect(201);
    expect(res.body.data).toMatchObject({ email, mustChangePassword: true });
    expect(res.body.data.passwordHash).toBeUndefined();
    await admin.post('/admin/users', { email: `x-${uid()}@meki.test`, name: 'Sneaky', temporaryPassword: 'Temporary-Pass-77', roleKeys: ['SUPER_ADMIN'] }).expect(403);
    await admin.post('/admin/users', { email, name: 'Dup', temporaryPassword: 'Temporary-Pass-77', roleKeys: ['CONTENT_MANAGER'] }).expect(409);
  });

  it('administrators cannot modify a Super Admin; nobody can deactivate themselves', async () => {
    const admin = await loginAs(ctx, ['ADMINISTRATOR']);
    const superUser = await createAdmin(ctx, ['SUPER_ADMIN']);
    await admin.patch(`/admin/users/${superUser.id}/status`, { isActive: false }).expect(403);
    await admin.patch(`/admin/users/${admin.userId}/status`, { isActive: false }).expect(400);
  });

  it('only roles.manage can change role permissions; SUPER_ADMIN role is fixed', async () => {
    const admin = await loginAs(ctx, ['ADMINISTRATOR']);
    await admin.put('/admin/roles/FINANCE_MANAGER/permissions', { permissions: ['audit.read'] }).expect(403);
    const root = await loginAs(ctx, ['SUPER_ADMIN']);
    await root.put('/admin/roles/SUPER_ADMIN/permissions', { permissions: [] }).expect(400);
    await root.put('/admin/roles/FINANCE_MANAGER/permissions', { permissions: ['not.a.permission'] }).expect(400);
  });

  it('responses never include password hashes', async () => {
    const admin = await loginAs(ctx, ['ADMINISTRATOR']);
    const res = await admin.get('/admin/users?pageSize=100').expect(200);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$argon2/);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 100 });
  });
});
