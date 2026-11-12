import { API, COOKIE, createAdmin, createTestApp, fakeIp, login, loginAs, TEST_PASSWORD, type TestContext } from './helpers';

describe('Admin authentication', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('logs in with valid credentials and sets a hardened HttpOnly cookie', async () => {
    const user = await createAdmin(ctx, ['CONTENT_MANAGER']);
    const res = await ctx.http().post(`${API}/admin/auth/login`).set('X-Forwarded-For', fakeIp()).send({ email: user.email, password: TEST_PASSWORD }).expect(200);
    const cookie = ([] as string[]).concat(res.headers['set-cookie']).find((c) => c.startsWith(COOKIE))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\//);
    expect(res.body.data.csrfToken).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({ email: user.email, roles: ['CONTENT_MANAGER'] });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$argon2/);
  });

  it('stores only hashes of session and CSRF tokens', async () => {
    const user = await createAdmin(ctx, ['CONTENT_MANAGER']);
    const s = await login(ctx, user.email, user.password);
    const raw = decodeURIComponent(s.cookie.split('=')[1]);
    const row = await ctx.prisma.adminSession.findFirst({ where: { userId: user.id } });
    expect(row!.tokenHash).toHaveLength(64);
    expect(row!.tokenHash).not.toBe(raw);
    expect(row!.csrfTokenHash).not.toBe(s.csrf);
    const stored = await ctx.prisma.adminUser.findUnique({ where: { id: user.id } });
    expect(stored!.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('returns the same generic error for unknown e-mail and wrong password', async () => {
    const user = await createAdmin(ctx, ['CONTENT_MANAGER']);
    const a = await ctx.http().post(`${API}/admin/auth/login`).set('X-Forwarded-For', fakeIp()).send({ email: 'nobody-x@meki.test', password: 'whatever-123' }).expect(401);
    const b = await ctx.http().post(`${API}/admin/auth/login`).set('X-Forwarded-For', fakeIp()).send({ email: user.email, password: 'wrong-password-1' }).expect(401);
    expect(a.body.error.message).toBe(b.body.error.message);
    expect(a.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('GET /me returns the current user; requires a session', async () => {
    await ctx.http().get(`${API}/admin/auth/me`).expect(401);
    const s = await loginAs(ctx, ['FINANCE_MANAGER']);
    const me = await s.get('/admin/auth/me').expect(200);
    expect(me.body.data.permissions).toContain('donations.read');
    expect(me.body.data.isSuperAdmin).toBe(false);
  });

  it('logout revokes the session server-side', async () => {
    const s = await loginAs(ctx, ['CONTENT_MANAGER']);
    await s.post('/admin/auth/logout').expect(200);
    await s.get('/admin/auth/me').expect(401);
  });

  it('rejects mutations without a valid CSRF token', async () => {
    const s = await loginAs(ctx, ['CONTENT_MANAGER']);
    await ctx.http().post(`${API}/admin/auth/logout`).set('Cookie', s.cookie).expect(403);
    await ctx.http().post(`${API}/admin/auth/logout`).set('Cookie', s.cookie).set('X-CSRF-Token', 'forged').expect(403);
    const rotated = await s.get('/admin/auth/csrf').expect(200);
    expect(rotated.body.data.csrfToken).not.toBe(s.csrf);
    await ctx.http().post(`${API}/admin/auth/logout`).set('Cookie', s.cookie).set('X-CSRF-Token', rotated.body.data.csrfToken).expect(200);
  });

  it('locks the account after repeated failures (generic error even with the right password)', async () => {
    const user = await createAdmin(ctx, ['CONTENT_MANAGER']);
    for (let i = 0; i < 5; i++) {
      await ctx.http().post(`${API}/admin/auth/login`).set('X-Forwarded-For', fakeIp()).send({ email: user.email, password: `bad-password-${i}` }).expect(401);
    }
    await ctx.http().post(`${API}/admin/auth/login`).set('X-Forwarded-For', fakeIp()).send({ email: user.email, password: TEST_PASSWORD }).expect(401);
    const row = await ctx.prisma.adminUser.findUnique({ where: { id: user.id } });
    expect(row!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    const audit = await ctx.prisma.auditLog.findFirst({ where: { entityId: user.id, action: 'auth.account_locked' } });
    expect(audit).not.toBeNull();
  });

  it('rate-limits login attempts per client IP (429)', async () => {
    const ip = fakeIp();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const r = await ctx.http().post(`${API}/admin/auth/login`).set('X-Forwarded-For', ip).send({ email: 'rl@meki.test', password: 'x-password-1' });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses).toContain(429);
  });

  it('deactivated accounts cannot log in and their sessions are revoked', async () => {
    const admin = await loginAs(ctx, ['ADMINISTRATOR']);
    const user = await createAdmin(ctx, ['CONTENT_MANAGER']);
    const victim = await login(ctx, user.email, user.password);
    await admin.patch(`/admin/users/${user.id}/status`, { isActive: false }).expect(200);
    await victim.get('/admin/auth/me').expect(401);
    await ctx.http().post(`${API}/admin/auth/login`).set('X-Forwarded-For', fakeIp()).send({ email: user.email, password: user.password }).expect(401);
    await admin.patch(`/admin/users/${user.id}/status`, { isActive: true }).expect(200);
    await login(ctx, user.email, user.password);
  });

  it('forces a password change before other routes are usable, and enforces the policy', async () => {
    const user = await createAdmin(ctx, ['CONTENT_MANAGER'], { mustChangePassword: true });
    const s = await login(ctx, user.email, user.password);
    const blocked = await s.get('/admin/programmes').expect(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await s.post('/admin/auth/password/change', { currentPassword: user.password, newPassword: 'short' }).expect(400);
    await s.post('/admin/auth/password/change', { currentPassword: 'not-it-1234567', newPassword: 'A-much-better-pass-99' }).expect(401);
    await s.post('/admin/auth/password/change', { currentPassword: user.password, newPassword: 'A-much-better-pass-99' }).expect(200);
    await s.get('/admin/programmes').expect(200);
    await login(ctx, user.email, 'A-much-better-pass-99');
  });

  it('password reset: no enumeration, single-use token, revokes sessions', async () => {
    const user = await createAdmin(ctx, ['CONTENT_MANAGER']);
    const s = await login(ctx, user.email, user.password);
    ctx.notifier.last = undefined;
    await ctx.http().post(`${API}/admin/auth/password/reset-request`).set('X-Forwarded-For', fakeIp()).send({ email: 'missing-user@meki.test' }).expect(202);
    expect(ctx.notifier.last).toBeUndefined();
    await ctx.http().post(`${API}/admin/auth/password/reset-request`).set('X-Forwarded-For', fakeIp()).send({ email: user.email }).expect(202);
    const token = ctx.notifier.last!.token;
    await ctx.http().post(`${API}/admin/auth/password/reset-confirm`).set('X-Forwarded-For', fakeIp()).send({ token, newPassword: 'Reset-Password-2026!' }).expect(200);
    await ctx.http().post(`${API}/admin/auth/password/reset-confirm`).set('X-Forwarded-For', fakeIp()).send({ token, newPassword: 'Another-Password-2026!' }).expect(401);
    await s.get('/admin/auth/me').expect(401);
    await login(ctx, user.email, 'Reset-Password-2026!');
  });

  it('there is no public registration endpoint', async () => {
    await ctx.http().post(`${API}/admin/auth/register`).send({ email: 'x@y.z', password: 'whatever-123456' }).expect(404);
    await ctx.http().post(`${API}/admin/users`).send({ email: 'x@y.z' }).expect(401);
  });
});
