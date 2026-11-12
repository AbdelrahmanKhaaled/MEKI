import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { generateToken, sha256 } from '../../common/utils';
import type { AuthUser } from '../../common/types/auth-request';
import { SUPER_ADMIN } from '../users/permissions.catalog';

/** Sliding idle refresh is written at most once per this interval to limit DB writes. */
const TOUCH_INTERVAL_MS = 60_000;

const sessionInclude = {
  user: {
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  },
} as const;

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  private idleMs() {
    return this.config.get('SESSION_IDLE_MINUTES') * 60_000;
  }
  private absoluteMs() {
    return this.config.get('SESSION_ABSOLUTE_HOURS') * 3_600_000;
  }

  /** Creates a session. Returns the raw tokens ONCE; only their hashes are persisted. */
  async create(userId: string, ip?: string, userAgent?: string) {
    const token = generateToken(32);
    const csrfToken = generateToken(32);
    const now = Date.now();
    const session = await this.prisma.adminSession.create({
      data: {
        tokenHash: sha256(token),
        csrfTokenHash: sha256(csrfToken),
        userId,
        ip: ip?.slice(0, 64),
        userAgent: userAgent?.slice(0, 255),
        idleExpiresAt: new Date(now + this.idleMs()),
        expiresAt: new Date(now + this.absoluteMs()),
      },
    });
    return { token, csrfToken, session };
  }

  /** Validates a raw session token; slides the idle window. Returns null when invalid/expired. */
  async validate(token: string) {
    if (!token || token.length > 128) return null;
    const session = await this.prisma.adminSession.findUnique({ where: { tokenHash: sha256(token) }, include: sessionInclude });
    if (!session) return null;
    const now = Date.now();
    if (session.revokedAt || session.expiresAt.getTime() <= now || session.idleExpiresAt.getTime() <= now) return null;
    if (!session.user.isActive) return null;

    if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.adminSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now), idleExpiresAt: new Date(Math.min(now + this.idleMs(), session.expiresAt.getTime())) },
      });
    }

    const roles = session.user.roles.map((r) => r.role.key);
    const permissions = Array.from(
      new Set(session.user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key))),
    );
    const user: AuthUser = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      roles,
      permissions,
      isSuperAdmin: roles.includes(SUPER_ADMIN),
      mustChangePassword: session.user.mustChangePassword,
    };
    return { session, user };
  }

  /** Rotates the CSRF token for an existing session (GET /auth/csrf). */
  async rotateCsrf(sessionId: string) {
    const csrfToken = generateToken(32);
    await this.prisma.adminSession.update({ where: { id: sessionId }, data: { csrfTokenHash: sha256(csrfToken) } });
    return csrfToken;
  }

  revoke(sessionId: string) {
    return this.prisma.adminSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  revokeAllForUser(userId: string, exceptSessionId?: string) {
    return this.prisma.adminSession.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      data: { revokedAt: new Date() },
    });
  }
}
