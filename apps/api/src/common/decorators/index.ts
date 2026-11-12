import { createParamDecorator, ExecutionContext, SetMetadata, UnauthorizedException } from '@nestjs/common';
import type { PermissionKey } from '../../modules/users/permissions.catalog';
import type { ActorContext, AuthenticatedRequest, AuthUser } from '../types/auth-request';

export const IS_PUBLIC_KEY = 'isPublic';
/** Route does not require an admin session (public website APIs, login, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'requiredPermissions';
/** Requires ALL listed permissions (SUPER_ADMIN bypasses). Enforced server-side by PermissionsGuard. */
export const RequirePermissions = (...permissions: PermissionKey[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const SKIP_CSRF_KEY = 'skipCsrf';
/** Only for endpoints that cannot carry a CSRF token yet (login, password reset). */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
});

/** Resolves the authenticated actor (for createdBy/updatedBy and audit logs). */
export const Actor = createParamDecorator((_data: unknown, ctx: ExecutionContext): ActorContext => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!req.user) throw new UnauthorizedException();
  return {
    userId: req.user.id,
    email: req.user.email,
    ip: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 255),
    requestId: req.requestId,
  };
});
