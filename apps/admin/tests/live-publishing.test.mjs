import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { HERO_ALT_LABELS, HERO_RULES, HERO_SECONDARY_ITEM_CODE, heroImageProblems } from '../src/lib/hero-images.ts';
import { liveAr, liveEn } from '../src/lib/i18n-live.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const keysDeep = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keysDeep(v, `${p}${k}.`) : [`${p}${k}`])).sort();

test('live-publishing copy exists in English and Arabic with identical keys, and only claims "refreshed" for a confirmed refresh', () => {
  assert.deepEqual(keysDeep(liveAr), keysDeep(liveEn));
  for (const k of ['pending', 'disabled']) assert.doesNotMatch(liveEn.notice[k], /has been refreshed/);
  assert.match(liveEn.notice.revalidated, /has been refreshed/);
  assert.match(liveEn.editor.savedDraft, /not live yet/);
});

test('Hero image rules mirror the API (sizes, DEMO, consent, format)', () => {
  assert.equal(HERO_SECONDARY_ITEM_CODE, 'hero-secondary-image');
  assert.deepEqual(HERO_ALT_LABELS, { main: 'mainImageAlt', secondary: 'secondaryImageAlt' });
  assert.deepEqual([HERO_RULES.main.minWidth, HERO_RULES.main.minHeight, HERO_RULES.secondary.minWidth, HERO_RULES.secondary.minHeight], [800, 1000, 300, 300]);
  const ok = { width: 1333, height: 2000, provenance: 'PROPOSED', consentStatus: 'UNKNOWN', sizeBytes: 500_000, mimeType: 'image/webp', storageDriver: 'LOCAL' };
  assert.deepEqual(heroImageProblems(ok, 'main'), []);
  assert.deepEqual(heroImageProblems({ ...ok, width: 400, height: 400 }, 'main'), ['TOO_SMALL']);
  assert.deepEqual(heroImageProblems({ ...ok, width: 400, height: 400 }, 'secondary'), []);
  assert.ok(heroImageProblems({ ...ok, provenance: 'DEMO' }, 'main').includes('DEMO'));
  assert.ok(heroImageProblems({ ...ok, consentStatus: 'NOT_GRANTED' }, 'main').includes('NOT_PUBLIC'));
  assert.ok(heroImageProblems({ ...ok, mimeType: 'image/svg+xml' }, 'main').includes('NOT_IMAGE'));
  assert.ok(heroImageProblems({ ...ok, width: null, height: null }, 'main').includes('UNKNOWN_SIZE'));
  for (const code of ['DEMO', 'TOO_SMALL', 'UNKNOWN_SIZE', 'NOT_PUBLIC', 'TOO_LARGE', 'NOT_IMAGE', 'DELETED']) assert.ok(liveEn.hero.invalid[code] && liveAr.hero.invalid[code], code);
});

test('Save & publish exists only for publishers; editors keep the draft workflow; messages follow the confirmed outcome', () => {
  const ed = read('../src/components/cms/SectionEditor.tsx');
  assert.match(ed, /\{canPublish && \(\s*<button[^>]*disabled=\{!form\.dirty\.length \|\| !pubG\.allowed/);
  assert.match(ed, /form\.dirty\.length > 0 && !canPublish && <span[^>]*>\{live\.draftOnly\}/);
  assert.match(ed, /svc\.publishSectionOutcome\(section\.id, true\)/);
  assert.match(ed, /o === "revalidated" \? e\.publishedLive : o === "pending" \? e\.publishedPending : e\.publishedDisabled/);
  // the Hero editor reuses the Media Library picker (no second library) and the CMS relations (section media + item)
  const hero = read('../src/components/cms/HeroImagesField.tsx');
  assert.match(hero, /import \{ MediaPicker \} from "@\/components\/content\/media"/);
  assert.match(ed, /code: HERO_SECONDARY_ITEM_CODE, mediaId: secondary\.mediaId/);
  assert.match(read('../src/lib/cms.ts'), /key: "HERO",[^\n]*heroImages: true/);
});

test('the refresh outcome is read from the API header on successful mutations only, and shown app-wide with a gated retry', () => {
  const api = read('../src/lib/api.ts');
  assert.match(api, /method === "GET" \? null : readRevalidation\(res\.headers\.get\("X-Meki-Revalidation"\)\)/);
  assert.match(read('../src/components/layout/AppShell.tsx'), /<LiveSiteNotice \/>/);
  const notice = read('../src/features/live/LiveSiteNotice.tsx');
  assert.match(notice, /outcome === "pending" && can\("content\.publish"\)/);
  assert.match(read('../src/services/cms.ts'), /apiPost\(`\/admin\/cms\/revalidation\/retry/);
});
