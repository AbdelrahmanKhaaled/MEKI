/**
 * Operator recovery: set a TEMPORARY password for an existing admin account (Phase 13A).
 *
 *   ADMIN_RESET_EMAIL=... ADMIN_RESET_PASSWORD=... ADMIN_RESET_CONFIRM=<same e-mail> pnpm --filter @meki/api admin:reset-password
 *
 * For when e-mail-based reset is unavailable (MAIL_TRANSPORT=none) and an administrator is locked out — e.g. the only Super
 * Admin. It needs direct database access (the same trust level as the one-time bootstrap) and an explicit confirmation.
 * - The password comes only from the operator's environment; it is never printed or logged.
 * - The account must already exist and be active; nothing is created; roles are untouched.
 * - mustChangePassword is forced, failed-login lockout is cleared, EVERY session of the account is revoked, and the action
 *   is written to the audit log (actorEmail "cli").
 */
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client';
import { PasswordService } from '../src/modules/auth/password.service';

async function main() {
  const email = process.env.ADMIN_RESET_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_RESET_PASSWORD;
  const confirm = process.env.ADMIN_RESET_CONFIRM?.trim().toLowerCase();
  if (!email || !password) throw new Error('Set ADMIN_RESET_EMAIL and ADMIN_RESET_PASSWORD in the environment');
  if (confirm !== email) throw new Error('Set ADMIN_RESET_CONFIRM to the same e-mail to confirm this operator action');
  const passwords = new PasswordService();
  passwords.assertPolicy(password, email);

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
  try {
    const user = await prisma.adminUser.findUnique({ where: { email } });
    if (!user) throw new Error('No admin account with this e-mail');
    if (!user.isActive) throw new Error('The account is deactivated; reactivate it from the dashboard first');
    const passwordHash = await passwords.hash(password);
    await prisma.$transaction([
      prisma.adminUser.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null, passwordChangedAt: new Date() } }),
      prisma.adminSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.auditLog.create({ data: { action: 'user.password_reset_cli', entityType: 'AdminUser', entityId: user.id, actorEmail: 'cli' } }),
    ]);
    console.log(`Temporary password set for ${email}. All sessions were revoked; a password change is required at the next login.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
