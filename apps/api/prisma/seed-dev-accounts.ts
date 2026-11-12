/**
 * DEVELOPMENT-ONLY test accounts (one per system role) for local dashboard work.
 *
 *   DEV_ACCOUNTS_PASSWORD=... pnpm --filter @meki/api db:seed:dev
 *
 * - Hard-refuses when NODE_ENV is production/staging or the database name does not end with _dev/_test.
 * - Password is supplied via env (never hardcoded). Accounts use the reserved .test TLD.
 * - Create-only: existing accounts are left untouched.
 */
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client';
import { PasswordService } from '../src/modules/auth/password.service';
import { SYSTEM_ROLES } from '../src/modules/users/permissions.catalog';

async function main() {
  const env = process.env.NODE_ENV ?? 'development';
  const url = process.env.DATABASE_URL ?? '';
  const dbName = url.split('/').pop()?.split('?')[0] ?? '';
  if (env === 'production' || env === 'staging') throw new Error('Refusing to create dev accounts outside development');
  if (!/_(dev|test)$/.test(dbName)) throw new Error(`Refusing: database "${dbName}" is not a *_dev or *_test database`);
  const password = process.env.DEV_ACCOUNTS_PASSWORD;
  if (!password) throw new Error('Set DEV_ACCOUNTS_PASSWORD');
  const passwords = new PasswordService();
  passwords.assertPolicy(password);

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });
  try {
    const hash = await passwords.hash(password);
    for (const key of Object.keys(SYSTEM_ROLES)) {
      const email = `${key.toLowerCase().replace(/_/g, '.')}@meki.test`;
      const role = await prisma.role.findUnique({ where: { key } });
      if (!role) throw new Error('Run the baseline seed first');
      if (await prisma.adminUser.findUnique({ where: { email } })) {
        console.log(`exists  ${email}`);
        continue;
      }
      await prisma.adminUser.create({ data: { email, name: `DEV ${SYSTEM_ROLES[key].name}`, passwordHash: hash, roles: { create: { roleId: role.id } } } });
      console.log(`created ${email} (${key})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
