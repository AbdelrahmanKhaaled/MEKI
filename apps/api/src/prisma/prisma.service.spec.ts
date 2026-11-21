import { POOL_DEFAULTS, withPoolDefaults } from './prisma.service';

describe('database pool defaults (Phase 13A)', () => {
  it('adds the connect/acquire timeouts when absent, keeping credentials, host, database and other params', () => {
    const out = new URL(withPoolDefaults('mysql://app:p%40ss@db.internal:3306/meki?allowPublicKeyRetrieval=true'));
    expect(out.searchParams.get('connectTimeout')).toBe(POOL_DEFAULTS.connectTimeout);
    expect(out.searchParams.get('acquireTimeout')).toBe(POOL_DEFAULTS.acquireTimeout);
    expect(out.searchParams.get('allowPublicKeyRetrieval')).toBe('true');
    expect([out.username, out.password, out.host, out.pathname]).toEqual(['app', 'p%40ss', 'db.internal:3306', '/meki']);
  });
  it('never overrides values set explicitly in DATABASE_URL', () => {
    const out = new URL(withPoolDefaults('mysql://u:p@h:3306/d?connectTimeout=2500&acquireTimeout=5000'));
    expect(out.searchParams.get('connectTimeout')).toBe('2500');
    expect(out.searchParams.get('acquireTimeout')).toBe('5000');
  });
  it('passes a malformed URL through unchanged (the driver reports it)', () => {
    expect(withPoolDefaults('not a url')).toBe('not a url');
  });
});
