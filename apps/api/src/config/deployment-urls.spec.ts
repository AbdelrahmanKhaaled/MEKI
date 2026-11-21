import { validateDeploymentUrls, validateEnv } from './env.validation';

/** Phase 13A — staging/production never run on the localhost defaults (docs/51, docs/52). */
describe('deployment URL guard (strict environments)', () => {
  it('accepts an explicit native-VPS bind IP and rejects a hostname or injected bind value', () => {
    const base = { NODE_ENV: 'test', DATABASE_URL: 'mysql://test:test@127.0.0.1:3306/meki_test' };
    expect(validateEnv({ ...base, API_BIND_HOST: '127.0.0.1' }).API_BIND_HOST).toBe('127.0.0.1');
    expect(validateEnv(base).API_BIND_HOST).toBe('0.0.0.0');
    expect(() => validateEnv({ ...base, API_BIND_HOST: 'localhost; command' })).toThrow();
  });
  const good = {
    WEB_URL: 'https://staging.example.org',
    API_PUBLIC_URL: 'https://api.staging.example.org',
    PUBLIC_MEDIA_BASE_URL: 'https://api.staging.example.org/media',
    DONATION_RETURN_URL: 'https://staging.example.org/{locale}/donation/return',
    EVENT_BOOKING_RETURN_URL: 'https://staging.example.org/{locale}/events/{slug}/booking',
    CORS_ORIGINS: 'https://staging.example.org,https://admin.staging.example.org',
    STAGING_LOCAL_REHEARSAL: false,
  };

  it('accepts explicit https, non-local URLs in staging and production', () => {
    for (const NODE_ENV of ['staging', 'production'] as const) expect(() => validateDeploymentUrls({ ...good, NODE_ENV })).not.toThrow();
  });

  it('refuses every localhost / http default in staging and production', () => {
    for (const NODE_ENV of ['staging', 'production'] as const) {
      expect(() => validateDeploymentUrls({ ...good, NODE_ENV, WEB_URL: 'http://localhost:3000' })).toThrow(/WEB_URL/);
      expect(() => validateDeploymentUrls({ ...good, NODE_ENV, API_PUBLIC_URL: 'http://api.staging.example.org' })).toThrow(/API_PUBLIC_URL/);
      expect(() => validateDeploymentUrls({ ...good, NODE_ENV, CORS_ORIGINS: 'https://staging.example.org,http://localhost:3001' })).toThrow(/CORS_ORIGINS/);
      expect(() => validateDeploymentUrls({ ...good, NODE_ENV, CORS_ORIGINS: ' , ' })).toThrow(/CORS_ORIGINS/);
      expect(() => validateDeploymentUrls({ ...good, NODE_ENV, EVENT_BOOKING_RETURN_URL: 'http://127.0.0.1:3000/{locale}/events/{slug}/booking' })).toThrow(/EVENT_BOOKING_RETURN_URL/);
    }
  });

  it('the local-rehearsal escape hatch is staging-only', () => {
    const local = { ...good, WEB_URL: 'http://localhost:3200', CORS_ORIGINS: 'http://localhost:3200', STAGING_LOCAL_REHEARSAL: true };
    expect(() => validateDeploymentUrls({ ...local, NODE_ENV: 'staging' })).not.toThrow();
    expect(() => validateDeploymentUrls({ ...local, NODE_ENV: 'production' })).toThrow(/only allowed with NODE_ENV=staging/);
  });

  it('development and test keep their localhost defaults', () => {
    for (const NODE_ENV of ['development', 'test'] as const) expect(() => validateDeploymentUrls({ ...good, NODE_ENV, WEB_URL: 'http://localhost:3000', CORS_ORIGINS: 'http://localhost:3000' })).not.toThrow();
  });

  it('a production env relying on defaults fails at startup (full validateEnv)', () => {
    expect(() => validateEnv({ NODE_ENV: 'production', DATABASE_URL: 'mysql://u:p@db:3306/meki', EVENT_BOOKING_TOKEN_SECRET: 'x'.repeat(40) })).toThrow(/https URL that is not localhost/);
  });
});
