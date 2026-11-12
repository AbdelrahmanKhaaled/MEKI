/**
 * Secure first Super Admin provisioning.
 *
 *   ADMIN_BOOTSTRAP_EMAIL=... ADMIN_BOOTSTRAP_PASSWORD=... pnpm --filter @meki/api admin:bootstrap
 *
 * - Credentials come only from the environment of the person running it (never hardcoded/committed).
 * - Refuses to run if any active Super Admin already exists (one-time bootstrap, not a backdoor).
 * - Requires the baseline seed (roles) to have run. Forces a password change at first login.
 */
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client';
import { PasswordService } from '../src/modules/auth/password.service';
import { SUPER_ADMIN } from '../src/modules/users/permissions.catalog';

async function main() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const name = process.env.ADMIN_BOOTSTRAP_NAME?.trim() || 'Super Admin';
  if (!email || !password) throw new Error('Set ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD in the environment');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('ADMIN_BOOTSTRAP_EMAIL is not a valid e-mail');

  const passwords = new PasswordService();
  passwords.assertPolicy(password, email);

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
  try {
    const role = await prisma.role.findUnique({ where: { key: SUPER_ADMIN } });
    if (!role) throw new Error('Roles not found — run `pnpm --filter @meki/api db:seed` first');
    const existing = await prisma.adminUser.count({ where: { isActive: true, roles: { some: { roleId: role.id } } } });
    if (existing > 0) {
      console.log('An active Super Admin already exists. Bootstrap skipped (create further users from the dashboard).');
      return;
    }
    if (await prisma.adminUser.findUnique({ where: { email } })) throw new Error('A user with this e-mail already exists');
    const user = await prisma.adminUser.create({
      data: {
        email,
        name,
        passwordHash: await passwords.hash(password),
        mustChangePassword: true,
        roles: { create: { roleId: role.id } },
      },
    });
    await prisma.auditLog.create({ data: { action: 'user.bootstrap_super_admin', entityType: 'AdminUser', entityId: user.id, actorEmail: 'cli' } });
    console.log(`Super Admin created for ${email}. Password change will be required at first login.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
