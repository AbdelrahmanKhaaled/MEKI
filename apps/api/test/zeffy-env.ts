// Imported FIRST by zeffy.e2e-spec.ts so these values exist before AppModule's ConfigModule validates the environment.
// Test-only values; no real SDI credential exists anywhere in the repository.
export const ZEFFY_TEST_SECRET = 'whsec_meki_e2e_secret_0123456789';
export const ZEFFY_TEST_CAMPAIGN = '00000000-0000-4000-8000-0000000e2e01';
export const ZEFFY_TEST_EVENT_CODE = 'EVT-ZEFFY-E2E';

process.env.ZEFFY_WEBHOOK_SECRET = `rotated_out_secret_000000000001,${ZEFFY_TEST_SECRET}`;
process.env.ZEFFY_API_KEY = 'zk_e2e_fake_key_never_used_live';
process.env.ZEFFY_API_BASE_URL = 'https://api.zeffy.com'; // never contacted: the test injects a fake transport
process.env.ZEFFY_GALA_TICKET_CAMPAIGN_ID = ZEFFY_TEST_CAMPAIGN;
process.env.ZEFFY_GALA_EVENT_CODE = ZEFFY_TEST_EVENT_CODE;
process.env.ZEFFY_GALA_AUTO_CONFIRM = 'true'; // allowed only outside staging/production (env validation)
process.env.ZEFFY_DONATION_CAMPAIGN_IDS = '00000000-0000-4000-8000-0000000e2e02';
