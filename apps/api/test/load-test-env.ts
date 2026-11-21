import { config } from 'dotenv';
import { resolve } from 'node:path';

process.env.NODE_ENV = 'test';
config({ path: resolve(__dirname, '../.env.test'), override: true, quiet: true });

// Phase 5B.1: no background poller and an in-memory mail transport in tests (jobs are run explicitly).
process.env.GALA_JOBS_INTERVAL_SECONDS ??= '0';
process.env.MAIL_TRANSPORT ??= 'memory';
// Phase 12B: the legacy MEKI-native donation suites exercise the donation PIPELINE (mock provider) and need these designations.
// Both default to false in every real environment; test/phase12b-agreement.e2e-spec.ts verifies the refusal with them off.
process.env.GENERAL_GIVING_AUTHORIZED ??= 'true';
process.env.PROGRAMME_GIVING_AUTHORIZED ??= 'true';

const db = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
if (!db.endsWith('_test')) {
  throw new Error(`Integration tests refuse to run against "${db}". DATABASE_URL in .env.test must point to a *_test database.`);
}
