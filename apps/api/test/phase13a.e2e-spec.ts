import { createAdmin, createTestApp, login, type TestContext } from './helpers';
import { SessionService } from '../src/modules/auth/session.service';

/**
 * Phase 13A regressions found on the staging rehearsal (docs/53):
 *  - a first-login password change could COMMIT and still return HTTP 500 (a later statement timed out), so the client threw
 *    away a password that was already active and the only Super Admin was locked out. The change is now one transaction.
 */
describe('Phase 13A — atomic password change', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('a failure after the password update rolls EVERYTHING back: old password still works, flags unchanged, no audit row', async () => {
    const user = await createAdmin(ctx, ['CONTENT_MANAGER'], { mustChangePassword: true });
    const s = await login(ctx, user.email, user.password);
    const sessions = ctx.app.get(SessionService);
    const spy = jest.spyOn(sessions, 'revokeAllForUser').mockImplementationOnce(() => {
      throw new Error('simulated failure after the password update');
    });
    const res = await s.post('/admin/auth/password/change', { currentPassword: user.password, newPassword: 'Brand-new-passphrase-2026!' });
    spy.mockRestore();
    expect(res.status).toBe(500);
    const after = await ctx.prisma.adminUser.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.mustChangePassword).toBe(true); // nothing applied
    expect(await ctx.prisma.auditLog.count({ where: { entityId: user.id, action: 'auth.password_changed' } })).toBe(0);
    await login(ctx, user.email, user.password); // the OLD password is still the valid one (login() expects 200)
  });

  it('the normal change applies all three effects together (new password, other sessions revoked, audited)', async () => {
    const user = await createAdmin(ctx, ['CONTENT_MANAGER'], { mustChangePassword: true });
    const a = await login(ctx, user.email, user.password);
    const b = await login(ctx, user.email, user.password); // a second, older session
    await a.post('/admin/auth/password/change', { currentPassword: user.password, newPassword: 'Brand-new-passphrase-2026!' }).expect(200);
    expect((await ctx.prisma.adminUser.findUniqueOrThrow({ where: { id: user.id } })).mustChangePassword).toBe(false);
    expect((await b.get('/admin/auth/me')).status).toBe(401); // other session revoked
    expect((await a.get('/admin/auth/me')).status).toBe(200); // current session kept
    expect(await ctx.prisma.auditLog.count({ where: { entityId: user.id, action: 'auth.password_changed' } })).toBe(1);
    await login(ctx, user.email, 'Brand-new-passphrase-2026!');
  });
});
