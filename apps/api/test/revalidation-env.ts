// Imported FIRST by cms-live-publishing.e2e-spec.ts so these values exist before AppModule's ConfigModule validates the env.
// Test-only values: the "website" is a fake HTTP server started by the spec on loopback.
export const FAKE_WEB_PORT = 39871;
export const REVALIDATE_TEST_SECRET = 'e2e-revalidate-secret-0123456789abcdefXYZ';

process.env.WEB_REVALIDATE_URL = `http://127.0.0.1:${FAKE_WEB_PORT}/api/internal/revalidate`;
process.env.MEKI_REVALIDATE_SECRET = REVALIDATE_TEST_SECRET;
