import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { generateToken, sha256 } from '../../common/utils';
import type { ActorContext, AuthUser } from '../../common/types/auth-request';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { PASSWORD_RESET_NOTIFIER, type PasswordResetNotifier } from './password-reset.notifier';

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;
const RESET_TOKEN_MINUTES = 60;
const GENERIC_LOGIN_ERROR = 'Invalid email or password';

interface ClientInfo {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    @Inject(PASSWORD_RESET_NOTIFIER) private readonly notifier: PasswordResetNotifier,
  ) {}

  /** Generic error for unknown e-mail, wrong password, locked or inactive account (no enumeration). */
  async login(email: string, password: string, client: ClientInfo) {
    const user = await this.prisma.adminUser.findUnique({ where: { email } });
    const ctx = { ...client, email };
    if (!user) {
      await this.passwords.verifyDummy(password);
      await this.audit.record(ctx, 'auth.login_failed', 'AdminUser', null, { reason: 'unknown_email' });
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }
    if (!user.isActive || (user.lockedUntil && user.lockedUntil > new Date())) {
      await this.passwords.verifyDummy(password);
      await this.audit.record({ ...ctx, userId: user.id }, 'auth.login_blocked', 'AdminUser', user.id, {
        reason: user.isActive ? 'locked' : 'inactive',
      });
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }
    const ok = await this.passwords.verify(user.passwordHash, password);
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await this.prisma.adminUser.update({
        where: { id: user.id },
        data: {
          failedLoginCount: lock ? 0 : failed,
          lockedUntil: lock ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : undefined,
        },
      });
      await this.audit.record({ ...ctx, userId: user.id }, lock ? 'auth.account_locked' : 'auth.login_failed', 'AdminUser', user.id, {
        reason: 'bad_password',
      });
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    await this.prisma.adminUser.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    const { token, csrfToken, session } = await this.sessions.create(user.id, client.ip, client.userAgent);
    await this.audit.record({ ...ctx, userId: user.id }, 'auth.login', 'AdminSession', session.id);
    const validated = await this.sessions.validate(token);
    return { token, csrfToken, expiresAt: session.expiresAt, user: validated!.user };
  }

  async logout(sessionId: string, actor: ActorContext) {
    await this.sessions.revoke(sessionId);
    await this.audit.record(actor, 'auth.logout', 'AdminSession', sessionId);
  }

  async changePassword(user: AuthUser, sessionId: string, current: string, next: string, actor: ActorContext) {
    const record = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await this.passwords.verify(record.passwordHash, current))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    this.passwords.assertPolicy(next, record.email);
    // Phase 13A: ONE transaction. Staging showed the change could commit and the request still fail (pool timeout on a later
    // statement), so the client threw away a password that was already active. Now either everything is applied — new hash,
    // other sessions revoked, audit row — or nothing is, and an error always means the old password still works.
    // The (slow, memory-hard) hash is computed BEFORE the transaction so no connection is held while hashing.
    const passwordHash = await this.passwords.hash(next);
    await this.prisma.$transaction(async (tx) => {
      await tx.adminUser.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false } });
      // Keep the current session, end all others.
      await this.sessions.revokeAllForUser(user.id, sessionId, tx);
      await this.audit.record(actor, 'auth.password_changed', 'AdminUser', user.id, undefined, tx);
    });
  }

  /** Always resolves the same way regardless of whether the account exists. */
  async requestPasswordReset(email: string, client: ClientInfo) {
    const user = await this.prisma.adminUser.findUnique({ where: { email } });
    if (!user || !user.isActive) return;
    const token = generateToken(32);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000);
    await this.prisma.$transaction([
      // Invalidate earlier outstanding tokens.
      this.prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt } }),
    ]);
    await this.audit.record({ ...client, email, userId: user.id }, 'auth.password_reset_requested', 'AdminUser', user.id);
    await this.notifier.send(user.email, token, expiresAt);
  }

  async confirmPasswordReset(token: string, newPassword: string, client: ClientInfo) {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!record || record.usedAt || record.expiresAt <= new Date() || !record.user.isActive) {
      throw new UnauthorizedException('Reset link is invalid or has expired');
    }
    this.passwords.assertPolicy(newPassword, record.user.email);
    const hash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.adminUser.update({
        where: { id: record.userId },
        data: { passwordHash: hash, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null, mustChangePassword: false },
      }),
    ]);
    await this.sessions.revokeAllForUser(record.userId);
    await this.audit.record({ ...client, email: record.user.email, userId: record.userId }, 'auth.password_reset_completed', 'AdminUser', record.userId);
  }
}
