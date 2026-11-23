import { validateRevalidationConfig } from '../../config/env.validation';
import { HERO_IMAGE_RULES, heroImageProblems } from '../cms/hero-images';
import { storageDirWarning } from '../media/storage/storage';
import { RevalidationService } from './revalidation.service';
import { ALL_PUBLIC_TAG, normalizeTags, SCOPE_TAGS, TAG_PATTERN, tagForPage } from './revalidation.tags';

const SECRET = 'unit-test-secret-0123456789abcdef-XYZ';

function service(env: Record<string, unknown> = { WEB_REVALIDATE_URL: 'http://127.0.0.1:3999/api/internal/revalidate', MEKI_REVALIDATE_SECRET: SECRET, NODE_ENV: 'test' }) {
  const config = { get: (k: string) => env[k] } as never;
  return new RevalidationService(config, {} as never);
}

describe('CMS live publishing — cache tags', () => {
  it('maps pages to the exact tags the website assigns', () => {
    expect(tagForPage('home', false)).toBe('meki:home');
    expect(tagForPage('privacy', false)).toBe('meki:page:privacy');
    expect(tagForPage('gala-night', true)).toBe('meki:events');
    expect(tagForPage('Bad Slug', false)).toBe(ALL_PUBLIC_TAG); // never "nothing"
  });

  it('every module that feeds /public/home includes the home tag; site settings and media flush everything', () => {
    for (const s of ['programmes', 'campaigns', 'faq', 'statistics'] as const) expect(SCOPE_TAGS[s]).toContain('meki:home');
    expect(SCOPE_TAGS.site).toEqual([ALL_PUBLIC_TAG]);
    expect(SCOPE_TAGS.media).toEqual([ALL_PUBLIC_TAG]);
    expect(SCOPE_TAGS.events).toEqual(['meki:events']);
  });

  it('normalizes: dedupes, drops anything outside the grammar, and a full flush wins', () => {
    expect(normalizeTags(['meki:home', 'meki:home', 'meki:events'])).toEqual(['meki:events', 'meki:home']);
    expect(normalizeTags(['meki:home', 'meki-public'])).toEqual(['meki-public']);
    expect(normalizeTags(['evil', 'meki:page:../x', 'meki:page:ok-slug'])).toEqual(['meki:page:ok-slug']);
    for (const t of ['_N_T_/en', 'meki:home ', 'meki:page:', 'MEKI:home']) expect(TAG_PATTERN.test(t)).toBe(false);
  });
});

describe('CMS live publishing — configuration', () => {
  it('needs both values, a long secret and a plain http(s) URL', () => {
    expect(() => validateRevalidationConfig({})).not.toThrow();
    expect(() => validateRevalidationConfig({ WEB_REVALIDATE_URL: 'http://127.0.0.1:3000/api/internal/revalidate' })).toThrow(/together/);
    expect(() => validateRevalidationConfig({ MEKI_REVALIDATE_SECRET: SECRET })).toThrow(/together/);
    expect(() => validateRevalidationConfig({ WEB_REVALIDATE_URL: 'http://127.0.0.1:3000/x', MEKI_REVALIDATE_SECRET: 'short' })).toThrow(/32/);
    for (const url of ['ftp://h/x', 'http://u:p@h/x', 'http://h/x?secret=1', 'not a url']) {
      expect(() => validateRevalidationConfig({ WEB_REVALIDATE_URL: url, MEKI_REVALIDATE_SECRET: SECRET })).toThrow();
    }
    expect(() => validateRevalidationConfig({ WEB_REVALIDATE_URL: 'http://127.0.0.1:3000/api/internal/revalidate', MEKI_REVALIDATE_SECRET: SECRET })).not.toThrow();
  });
});

describe('CMS live publishing — delivery', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('is "disabled" (never an error) when not configured', async () => {
    const svc = service({ NODE_ENV: 'test' });
    expect(await svc.revalidate(['meki:home'])).toBe('disabled');
    expect(svc.status()).toMatchObject({ enabled: false, state: 'disabled', pendingTags: [] });
  });

  it('sends the tags with the secret in the Authorization header only, and reports a confirmed refresh', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ revalidated: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as never;
    const svc = service();
    expect(await svc.revalidate(['meki:home'])).toBe('revalidated');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).not.toContain(SECRET);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ tags: ['meki:home'] });
    expect(String(calls[0].init.body)).not.toContain(SECRET);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`);
    expect(svc.status()).toMatchObject({ state: 'ok', pendingTags: [], consecutiveFailures: 0 });
  });

  it('keeps a failed refresh pending (bounded: 2 attempts), never leaks the secret in the status, and retry delivers it', async () => {
    let up = false;
    global.fetch = jest.fn(async () => (up ? new Response('{"revalidated":true}', { status: 200 }) : new Response('down', { status: 503 }))) as never;
    const svc = service();
    expect(await svc.revalidate(['meki:home'])).toBe('pending');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const st = svc.status();
    expect(st).toMatchObject({ state: 'pending', pendingTags: ['meki:home'], lastError: 'HTTP_503', consecutiveFailures: 1 });
    expect(st.nextRetryAt).not.toBeNull();
    expect(JSON.stringify(st)).not.toContain(SECRET);
    up = true;
    expect(await svc.retry()).toMatchObject({ state: 'ok', pendingTags: [], consecutiveFailures: 0, nextRetryAt: null });
    svc.onModuleDestroy();
  });

  it('a response that does not confirm the refresh is not a success; network errors are reported by code only', async () => {
    global.fetch = jest.fn(async () => new Response('{"ok":true}', { status: 200 })) as never;
    const svc = service();
    expect(await svc.revalidate(['meki:events'])).toBe('pending');
    expect(svc.status().lastError).toBe('BAD_RESPONSE');
    global.fetch = jest.fn(async () => {
      throw new TypeError('fetch failed');
    }) as never;
    await svc.retry();
    expect(svc.status().lastError).toBe('NETWORK');
    svc.onModuleDestroy();
  });
});

describe('Uploaded media survive deploys (storage location warning)', () => {
  it('warns in staging/production for relative or release-scoped upload directories only', () => {
    expect(storageDirWarning('/var/lib/meki/uploads', 'production')).toBeNull();
    expect(storageDirWarning('./storage/uploads', 'production')).toMatch(/relative/);
    expect(storageDirWarning('/srv/meki/current/apps/api/storage/uploads', 'production')).toMatch(/release/);
    expect(storageDirWarning('/srv/meki/releases/20261123/apps/api/uploads', 'staging')).toMatch(/release/);
    expect(storageDirWarning('./storage/uploads', 'development')).toBeNull();
  });
});

describe('Hero image placement rules', () => {
  const ok = { deletedAt: null, mimeType: 'image/webp', consentStatus: 'UNKNOWN', provenance: 'PROPOSED', width: 1333, height: 2000, sizeBytes: 400_000, storageDriver: 'LOCAL' } as const;
  it('accepts a live, public, large-enough image', () => {
    expect(heroImageProblems(ok, 'main', 'not_denied')).toEqual([]);
    expect(heroImageProblems({ ...ok, width: 300, height: 300 }, 'secondary', 'not_denied')).toEqual([]);
  });
  it('rejects deleted, non-public, DEMO, too small, unknown size and oversized images', () => {
    expect(heroImageProblems({ ...ok, deletedAt: new Date() }, 'main', 'not_denied')).toContain('DELETED');
    expect(heroImageProblems({ ...ok, consentStatus: 'NOT_GRANTED' }, 'main', 'not_denied')).toContain('NOT_PUBLIC');
    expect(heroImageProblems(ok, 'main', 'confirmed_only')).toContain('NOT_PUBLIC');
    expect(heroImageProblems({ ...ok, provenance: 'DEMO' }, 'main', 'not_denied')).toContain('DEMO');
    expect(heroImageProblems({ ...ok, width: HERO_IMAGE_RULES.main.minWidth - 1 }, 'main', 'not_denied')).toContain('TOO_SMALL');
    expect(heroImageProblems({ ...ok, width: 299, height: 299 }, 'secondary', 'not_denied')).toContain('TOO_SMALL');
    expect(heroImageProblems({ ...ok, width: null, height: null }, 'main', 'not_denied')).toContain('UNKNOWN_SIZE');
    expect(heroImageProblems({ ...ok, width: null, height: null, storageDriver: 'WEB_STATIC' }, 'main', 'not_denied')).toEqual([]);
    expect(heroImageProblems({ ...ok, sizeBytes: 11 * 1024 * 1024 }, 'main', 'not_denied')).toContain('TOO_LARGE');
    expect(heroImageProblems({ ...ok, mimeType: 'image/svg+xml' }, 'main', 'not_denied')).toContain('NOT_IMAGE');
  });
});
