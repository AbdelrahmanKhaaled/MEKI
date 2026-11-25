import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { pathsForTags, resourceTag, TAG_PATTERN, tagsForPath } from '../src/lib/revalidation-tags.ts';
import { isAllowedRemoteImage, media, slotImage } from '../src/content/media.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('every cached API read carries meki-public plus the resource tag the API invalidates', () => {
  assert.deepEqual(tagsForPath('/public/home?locale=ar'), ['meki-public', 'meki:home']);
  assert.equal(resourceTag('/public/pages/privacy?locale=en'), 'meki:page:privacy');
  assert.equal(resourceTag('/public/events/gala-night/ticketing'), 'meki:events');
  assert.equal(resourceTag('/public/programmes/health/detail?locale=en'), 'meki:programmes');
  assert.equal(resourceTag('/public/campaigns/x'), 'meki:campaigns');
  for (const p of ['/public/giving/options?locale=en', '/public/hosted-forms', '/public/site']) assert.equal(resourceTag(p), 'meki:site');
  const api = read('../src/lib/api.ts');
  assert.equal((api.match(/tags: tagsForPath\(path\)/g) ?? []).length, 2);
  assert.doesNotMatch(api, /tags: \["meki-public"\]/);
});

test('the tag grammar is identical on the website and the API (one source of truth per side, kept in sync)', () => {
  const apiSrc = read('../../api/src/modules/revalidation/revalidation.tags.ts');
  const apiPattern = /export const TAG_PATTERN = (\/.*\/);/.exec(apiSrc)?.[1];
  assert.equal(apiPattern, String(TAG_PATTERN));
  for (const t of ['meki-public', 'meki:home', 'meki:page:privacy', 'meki:events']) assert.ok(TAG_PATTERN.test(t));
  for (const t of ['_N_T_/en', 'meki:page:../x', 'meki:anything', '']) assert.ok(!TAG_PATTERN.test(t));
});

test('a homepage refresh marks every locale page (layout); other tags mark their EN and AR routes', () => {
  assert.deepEqual(pathsForTags(['meki:home']), [{ path: '/[locale]', type: 'layout' }]);
  assert.deepEqual(pathsForTags(['meki-public', 'meki:home']), [{ path: '/[locale]', type: 'layout' }]);
  assert.deepEqual(pathsForTags(['meki:page:privacy']), [{ path: '/en/privacy' }, { path: '/ar/privacy' }]);
  assert.deepEqual(pathsForTags(['meki:events']), [{ path: '/en/events/gala-night' }, { path: '/ar/events/gala-night' }]);
});

test('revalidation route: server-only secret in the Authorization header, constant-time check, fixed tag grammar, immediate expiry', () => {
  const r = read('../src/app/api/internal/revalidate/route.ts');
  assert.match(r, /process\.env\.MEKI_REVALIDATE_SECRET/);
  assert.doesNotMatch(r, /process\.env\.NEXT_PUBLIC_|searchParams|nextUrl/); // never a public variable, never a query-string secret
  assert.match(r, /request\.headers\.get\("authorization"\)/);
  assert.match(r, /timingSafeEqual\(digest\(auth\), digest\(`Bearer \$\{secret\}`\)\)/);
  assert.match(r, /revalidateTag\(tag, \{ expire: 0 \}\)/); // "max" would serve the stale page once more (the original defect)
  assert.match(r, /TAG_PATTERN\.test\(t\)/);
  assert.match(r, /secret\.length < 32/);
  // nginx keeps the internal route off the public site
  assert.match(read('../../../deploy/vps/nginx-meki-us.conf'), /location \^~ \/api\/internal\/ \{ return 404; \}/);
});

test('Hero images are data-driven with the curated photos as fallback and only allowed remote images', () => {
  const origin = 'https://api.meki-us.org';
  assert.equal(isAllowedRemoteImage('https://api.meki-us.org/media/uploads/2026/11/abc.webp', origin), true);
  for (const u of ['https://evil.example/media/x.webp', 'https://api.meki-us.org/other/x.webp', 'http://api.meki-us.org/media/x.webp', 'https://u:p@api.meki-us.org/media/x.webp', 'nonsense'])
    assert.equal(isAllowedRemoteImage(u, origin), false, u);
  assert.equal(slotImage(undefined, 'hero-field').src, media['hero-field'].src);
  assert.equal(slotImage('weaver', 'hero-field').src, media.weaver.src);
  assert.equal(slotImage('https://evil.example/media/x.webp', 'water-pier').src, media['water-pier'].src); // blocked host → default
  const hero = read('../src/components/sections/Hero.tsx');
  assert.match(hero, /const mainImage = slotImage\(h\.image, "hero-family"\)/); // 24 Nov 2026 delivery: approved family photo
  assert.match(hero, /const secondaryImage = slotImage\(h\.secondaryImage, "hero-school"\)/);
  // design preserved: same frame, sizes, priority, object position, parallax and animation attributes
  for (const kept of ['data-hero-image', 'data-parallax="0.06"', 'priority', 'coverSizes("(min-width: 1280px) 26vw, (min-width: 768px) 45vw, 75vw", mainImage, 0.75)', 'object-cover object-[44%_30%]', 'sizes="144px"', 'rounded-t-full rounded-b-[2.5rem]', '<GoldArc', 'data-hero-card'])
    assert.ok(hero.includes(kept), kept);
  const content = read('../src/lib/content.ts');
  assert.match(content, /const main = toMediaRef\(hero\.media\)/);
  assert.match(content, /hero\.items\?\.find\(\(i\) => i\.code === HERO_SECONDARY_ITEM_CODE\)/);
});
