import type { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  sessionId?: string;
  csrfTokenHash?: string;
  requestId?: string;
}

/** Context passed to services for created/updated-by tracking and audit logging. */
export interface ActorContext {
  userId: string;
  email: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}
