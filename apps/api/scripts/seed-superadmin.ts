/**
 * Interactive Super Admin provisioning for the DEVELOPMENT database.
 *
 *   pnpm --filter @meki/api seed:superadmin
 *
 * - Prompts for e-mail, display name, password (hidden) and confirmation — nothing is hard-coded, passed on the command line
 *   or read from files; the password is never printed or logged.
 * - Hashes with the application's own PasswordService (argon2id) and enforces its password policy.
 * - Creates the account, or — when the e-mail already exists — updates ONLY that account (new password, SUPER_ADMIN role,
 *   active, lock cleared, old sessions revoked). It never deletes or modifies any other user or data. Safe to re-run.
 * - Uses the existing role/permission model: the account gets the seeded SUPER_ADMIN role (run `db:seed` first).
 * - Refuses to run unless DATABASE_URL points at a development database (name ending in `_dev`) and NODE_ENV is not production.
 * - Requires an interactive terminal (no piped credentials).
 */
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client';
import { PasswordService } from '../src/modules/auth/password.service';
import { SUPER_ADMIN } from '../src/modules/users/permissions.catalog';

/** Reads one line from the TTY; `hidden` suppresses echo (raw mode). Ctrl+C aborts. */
function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    let buf = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const done = (fn: () => void) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      process.stdout.write('\n');
      fn();
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return done(() => resolve(buf));
        if (ch === '\u0003') return done(() => reject(new Error('Aborted.')));
        if (ch === '\u007f' || ch === '\b') {
          if (buf.length) {
            buf = buf.slice(0, -1);
            if (!hidden) process.stdout.write('\b \b');
          }
        } else if (ch >= ' ') {
          buf += ch;
          if (!hidden) process.stdout.write(ch);
        }
      }
    };
    stdin.on('data', onData);
  });
}

function target(url: string) {
  const u = new URL(url);
  return { host: u.host, db: u.pathname.replace(/^\//, '').split('?')[0] };
}

async function main() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('This command is interactive: run it directly in a terminal (credentials cannot be piped).');
  }
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run with NODE_ENV=production.');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (apps/api/.env).');
  const { host, db } = target(url);
  if (!/_dev$/.test(db)) throw new Error(`Refusing to run: database "${db}" is not a development database (its name must end in "_dev").`);

  console.log(`Target: database "${db}" on ${host} (development).`);
  const email = (await ask('Super Admin email: ')).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 191) throw new Error('That is not a valid e-mail address.');
  const nameInput = (await ask('Display name (Enter for "Super Admin"): ')).trim();
  const name = (nameInput || 'Super Admin').slice(0, 120);
  const password = await ask('Password (hidden): ', true);
  const passwords = new PasswordService();
  passwords.assertPolicy(password, email); // same policy as the application
  const confirm = await ask('Confirm password (hidden): ', true);
  if (password !== confirm) throw new Error('Passwords do not match.');

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });
  try {
    const role = await prisma.role.findUnique({ where: { key: SUPER_ADMIN } });
    if (!role) throw new Error('The SUPER_ADMIN role does not exist — run `pnpm --filter @meki/api db:seed` first.');
    const existing = await prisma.adminUser.findUnique({ where: { email }, select: { id: true } });
    const answer = (await ask(existing ? `An account for ${email} exists. Update its password and make it SUPER_ADMIN? (y/N) ` : `Create SUPER_ADMIN ${email}? (y/N) `)).trim().toLowerCase();
    if (answer !== 'y' && answer !== 'yes') {
      console.log('Cancelled. Nothing was changed.');
      return;
    }
    const passwordHash = await passwords.hash(password);
    const now = new Date();
    const user = await prisma.$transaction(async (tx) => {
      const data = { name, passwordHash, isActive: true, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, passwordChangedAt: now };
      const u = existing
        ? await tx.adminUser.update({ where: { id: existing.id }, data })
        : await tx.adminUser.create({ data: { email, ...data } });
      await tx.userRole.upsert({ where: { userId_roleId: { userId: u.id, roleId: role.id } }, update: {}, create: { userId: u.id, roleId: role.id } });
      if (existing) await tx.adminSession.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: now } }); // a new password ends old sessions
      await tx.auditLog.create({ data: { action: existing ? 'user.seed_super_admin_update' : 'user.seed_super_admin_create', entityType: 'AdminUser', entityId: u.id, actorEmail: 'cli', metadata: { role: SUPER_ADMIN } } });
      return u;
    });
    console.log(`${existing ? 'Updated' : 'Created'} SUPER_ADMIN account for ${user.email} (database "${db}").`);
    console.log('You can now sign in at the Admin Dashboard login page.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : 'Failed.'}`);
  process.exit(1);
});
