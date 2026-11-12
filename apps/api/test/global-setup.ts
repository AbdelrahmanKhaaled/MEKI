import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import './load-test-env';

/**
 * Prepares the dedicated *_test database WITHOUT destroying anything:
 *  - `prisma migrate deploy` only applies pending reviewed migrations (never resets).
 *  - The baseline seed is create-only and idempotent.
 * Tests create their own uniquely-named records; no table is truncated.
 */
export default async function globalSetup() {
  const cwd = resolve(__dirname, '..');
  const env = { ...process.env };
  execSync('npx prisma migrate deploy', { cwd, env, stdio: 'pipe' });
  execSync('npx tsx prisma/seed.ts', { cwd, env, stdio: 'pipe' });
}
