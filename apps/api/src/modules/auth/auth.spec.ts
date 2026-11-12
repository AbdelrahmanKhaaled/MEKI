import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/decorators';
import type { AuthUser } from '../../common/types/auth-request';
import { CsrfGuard, PermissionsGuard } from './guards';
import { PasswordService } from './password.service';
import { sha256 } from '../../common/utils';

const ctxFor = (req: object): ExecutionContext =>
  ({ getHandler: () => () => undefined, getClass: () => class {}, switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

const user = (over: Partial<AuthUser> = {}): AuthUser => ({
  id: 'u', email: 'a@b.c', name: 'n', roles: [], permissions: [], isSuperAdmin: false, mustChangePassword: false, ...over,
});

describe('PasswordService', () => {
  const svc = new PasswordService();
  it('hashes with argon2id and verifies', async () => {
    const hash = await svc.hash('Correct-Horse-9');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(svc.verify(hash, 'Correct-Horse-9')).resolves.toBe(true);
    await expect(svc.verify(hash, 'wrong')).resolves.toBe(false);
    await expect(svc.verify('not-a-hash', 'x')).resolves.toBe(false);
  });
  it('enforces the password policy', () => {
    expect(() => svc.assertPolicy('short1!')).toThrow();
    expect(() => svc.assertPolicy('onlylettersssss')).toThrow();
    expect(() => svc.assertPolicy('jane.doe-2026-secure', 'jane.doe@meki.org')).toThrow();
    expect(() => svc.assertPolicy('Long-enough-pass-1')).not.toThrow();
  });
});

describe('PermissionsGuard', () => {
  const reflector = new Reflector();
  const guard = new PermissionsGuard(reflector);
  const withRequired = (perms: string[] | undefined) => jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => (key === PERMISSIONS_KEY ? perms : undefined));

  afterEach(() => jest.restoreAllMocks());

  it('passes routes without requirements', () => {
    withRequired(undefined);
    expect(guard.canActivate(ctxFor({ user: user() }))).toBe(true);
  });
  it('requires all permissions', () => {
    withRequired(['campaigns.read', 'campaigns.publish']);
    expect(() => guard.canActivate(ctxFor({ user: user({ permissions: ['campaigns.read'] }) }))).toThrow(ForbiddenException);
    expect(guard.canActivate(ctxFor({ user: user({ permissions: ['campaigns.read', 'campaigns.publish'] }) }))).toBe(true);
  });
  it('super admin bypasses; missing user is unauthenticated', () => {
    withRequired(['roles.manage']);
    expect(guard.canActivate(ctxFor({ user: user({ isSuperAdmin: true }) }))).toBe(true);
    expect(() => guard.canActivate(ctxFor({}))).toThrow(UnauthorizedException);
  });
});

describe('CsrfGuard', () => {
  const reflector = new Reflector();
  const guard = new CsrfGuard(reflector);
  const req = (method: string, header?: string) => ({ method, sessionId: 's', csrfTokenHash: sha256('tok'), get: () => header });
  it('ignores safe methods and cookie-less requests', () => {
    expect(guard.canActivate(ctxFor(req('GET')))).toBe(true);
    expect(guard.canActivate(ctxFor({ method: 'POST', get: () => undefined }))).toBe(true);
  });
  it('requires a matching token on mutations with a session', () => {
    expect(() => guard.canActivate(ctxFor(req('POST')))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctxFor(req('PATCH', 'bad')))).toThrow(ForbiddenException);
    expect(guard.canActivate(ctxFor(req('DELETE', 'tok')))).toBe(true);
  });
});
