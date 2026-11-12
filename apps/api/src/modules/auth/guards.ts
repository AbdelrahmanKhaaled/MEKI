import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppConfigService } from '../../config/app-config.service';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY, SKIP_CSRF_KEY } from '../../common/decorators';
import type { AuthenticatedRequest } from '../../common/types/auth-request';
import { safeEqualHex, sha256 } from '../../common/utils';
import { SessionService } from './session.service';

export const ALLOW_PENDING_PASSWORD_KEY = 'allowPendingPassword';

/**
 * Global guard #1: resolves the admin session cookie. Every non-@Public route requires a valid session.
 * Accounts flagged mustChangePassword may only reach routes marked ALLOW_PENDING_PASSWORD.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly config: AppConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = (req.cookies as Record<string, string> | undefined)?.[this.config.sessionCookieName];

    if (token) {
      const result = await this.sessions.validate(token);
      if (result) {
        req.user = result.user;
        req.sessionId = result.session.id;
        req.csrfTokenHash = result.session.csrfTokenHash;
      }
    }
    if (isPublic) return true;
    if (!req.user) throw new UnauthorizedException('Authentication required');

    const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_KEY, targets);
    if (req.user.mustChangePassword && !allowPending) {
      throw new ForbiddenException({ message: 'Password change required', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    return true;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Global guard #2: double-submit CSRF check (X-CSRF-Token header vs hashed per-session token). */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (SAFE_METHODS.has(req.method)) return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [ctx.getHandler(), ctx.getClass()])) return true;
    // Cookie-less requests to public endpoints carry no ambient authority -> nothing to protect.
    if (!req.sessionId || !req.csrfTokenHash) return true;
    const header = req.get('x-csrf-token');
    if (!header || header.length > 128 || !safeEqualHex(sha256(header), req.csrfTokenHash)) {
      throw new ForbiddenException({ message: 'Invalid or missing CSRF token', code: 'CSRF_INVALID' });
    }
    return true;
  }
}

/** Global guard #3: RBAC. Requires all @RequirePermissions(...) keys; SUPER_ADMIN bypasses. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required?.length) return true;
    const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) throw new UnauthorizedException('Authentication required');
    if (user.isSuperAdmin) return true;
    const missing = required.filter((p) => !user.permissions.includes(p));
    if (missing.length) throw new ForbiddenException({ message: 'Insufficient permissions', code: 'FORBIDDEN', details: { missing } });
    return true;
  }
}
