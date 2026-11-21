#!/usr/bin/env node
// Phase 13B — applies MEKI's 21 November 2026 caption convention ("Title – Place") to an EXISTING database through the audited
// admin API (never SQL). The seed only creates rows, so existing databases (staging, a VPS) keep the old "·" working labels.
//
// Safety:
//  - a value is replaced ONLY when it still equals the exact old seeded text (anything an editor changed is left alone);
//  - a CMS section is republished ONLY if it was PUBLISHED with no other pending edits before this script touched it
//    (otherwise the change stays in the working copy for an editor to review and publish);
//  - nothing is deleted; the hero "photoCaption" value is kept (the website simply no longer renders it);
//  - DRY_RUN=1 (default) only prints what would change. Set DRY_RUN=0 to apply.
//
//   ADMIN_URL=http://localhost:3201 DRY_RUN=0 node deploy/staging/apply-nov21-captions.mjs   (credentials from .env.staging-admin)
// Requires content.manage + content.publish + media.upload. Docs: docs/56 §3.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ADMIN = (process.env.ADMIN_URL ?? 'http://localhost:3201').replace(/\/$/, '');
const DRY = process.env.DRY_RUN !== '0';

/** [old EN, new EN, old AR, new AR, curated image key] — the old values are exactly what the seed wrote. */
export const CAPTIONS = [
  ['Hand-weaving workshop · Alexandria', 'Hand-weaving workshop – Alexandria', 'ورشة السجاد اليدوي · الإسكندرية', 'ورشة السجاد اليدوي – الإسكندرية', 'weavers-loom'],
  ['Water desalination station · Luxor', 'Water desalination station – Luxor', 'محطة تحلية مياه · الأقصر', 'محطة تحلية مياه – الأقصر', 'water-station'],
  ['Greenhouses · Beni Suef', 'Greenhouses – Beni Suef', 'الصوب الزراعية · بني سويف', 'الصوب الزراعية – بني سويف', 'greenhouse-harvest'],
  ['Housing works · Shelter & warmth', 'Shelter & Warmth housing works – Egypt', 'أعمال إسكان · سكن ودفا', 'أعمال إسكان «سكن ودفا» – مصر', 'housing-site'],
  ['Mobile medical unit', 'Mobile medical unit – Egypt', 'قافلة طبية متنقلة', 'قافلة طبية متنقلة – مصر', 'mobile-clinic'],
  ['Luxor', 'Water-connection project – Luxor', 'الأقصر', 'مشروع توصيل المياه – الأقصر', 'farmer-portrait'],
  ['Hospital support', 'Hospital support – Egypt', 'دعم المستشفيات', 'دعم المستشفيات – مصر', 'operating-room'],
];
const ABOUT_LABELS = {
  captionA: ['Alexandria · Economic Empowerment', 'Hand-weaving workshop – Alexandria', 'الإسكندرية · التمكين الاقتصادي', 'ورشة السجاد اليدوي – الإسكندرية'],
  captionB: ['Luxor', 'Water-connection project – Luxor', 'الأقصر', 'مشروع توصيل المياه – الأقصر'],
};
/** `imageKey` (media only): the caption is replaced only on the curated image it was seeded for (e.g. a "Luxor" caption elsewhere is kept). */
const swap = (v, lang, imageKey) => {
  for (const [oe, ne, oa, na, key] of CAPTIONS) {
    if (imageKey !== undefined && key !== imageKey) continue;
    if (lang === 'en' && v === oe) return ne;
    if (lang === 'ar' && v === oa) return na;
  }
  return null;
};

const cred = Object.fromEntries(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '.env.staging-admin'), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
let cookie = '';
let csrf = '';
const call = async (method, path, body) => {
  const res = await fetch(`${ADMIN}/api/v1${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(csrf && method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sid = (res.headers.getSetCookie?.() ?? []).find((c) => /meki_admin_sid=/.test(c));
  if (sid) cookie = sid.split(';')[0];
  return { status: res.status, json: await res.json().catch(() => null) };
};
const must = (r, what) => {
  if (r.status >= 300) throw new Error(`${what}: HTTP ${r.status} ${r.json?.error?.code ?? ''}`);
  return r.json?.data;
};

const login = await call('POST', '/admin/auth/login', { email: cred.ADMIN_BOOTSTRAP_EMAIL, password: cred.ADMIN_BOOTSTRAP_PASSWORD });
if (login.status !== 200) throw new Error(`login failed: HTTP ${login.status} ${login.json?.error?.code ?? ''}`);
csrf = login.json.data.csrfToken;
const report = { dryRun: DRY, sections: [], media: [] };
try {
  const home = must(await call('GET', '/admin/cms/pages/home'), 'home page');
  for (const key of ['GALLERY', 'ABOUT']) {
    const s = home.sections.find((x) => x.key === key);
    if (!s) continue;
    const cleanPublished = s.status === 'PUBLISHED' && !s.hasUnpublishedChanges;
    const changes = [];
    if (key === 'GALLERY') {
      for (const it of s.items ?? []) {
        const patch = {};
        const en = swap(it.titleEn, 'en');
        const ar = swap(it.titleAr, 'ar');
        if (en) patch.titleEn = en;
        if (ar) patch.titleAr = ar;
        if (Object.keys(patch).length) {
          changes.push({ item: it.code ?? it.id, ...patch });
          if (!DRY) must(await call('PATCH', `/admin/cms/items/${it.id}`, patch), `item ${it.id}`);
        }
      }
    } else {
      const le = { ...(s.labelsEn ?? {}) };
      const la = { ...(s.labelsAr ?? {}) };
      let touched = false;
      for (const [k, [oe, ne, oa, na]] of Object.entries(ABOUT_LABELS)) {
        if (le[k] === oe) { le[k] = ne; touched = true; changes.push({ label: `${k}.en`, to: ne }); }
        if (la[k] === oa) { la[k] = na; touched = true; changes.push({ label: `${k}.ar`, to: na }); }
      }
      if (touched && !DRY) must(await call('PATCH', `/admin/cms/sections/${s.id}`, { labelsEn: le, labelsAr: la }), `section ${key}`);
    }
    let republished = false;
    if (changes.length && cleanPublished && !DRY) {
      must(await call('POST', `/admin/cms/sections/${s.id}/publish`), `publish ${key}`);
      republished = true;
    }
    report.sections.push({ key, status: s.status, hadPendingEdits: !!s.hasUnpublishedChanges, changes, republished, leftForEditor: changes.length > 0 && !cleanPublished });
  }
  for (let page = 1; page <= 20; page++) {
    const r = await call('GET', `/admin/media?page=${page}&pageSize=100`);
    const items = must(r, 'media list') ?? [];
    for (const m of items) {
      const patch = {};
      const key = /\/images\/work\/([a-z-]+)\.webp$/.exec(String(m.url ?? ''))?.[1] ?? /(?:^|\/)([a-z-]+)\.webp$/.exec(String(m.storageKey ?? ''))?.[1] ?? null;
      if (!key) continue;
      const en = swap(m.captionEn, 'en', key);
      const ar = swap(m.captionAr, 'ar', key);
      if (en) patch.captionEn = en;
      if (ar) patch.captionAr = ar;
      if (Object.keys(patch).length) {
        report.media.push({ id: m.id, ...patch });
        if (!DRY) must(await call('PATCH', `/admin/media/${m.id}`, patch), `media ${m.id}`);
      }
    }
    if (page >= (r.json?.meta?.totalPages ?? 1)) break;
  }
} finally {
  await call('POST', '/admin/auth/logout');
}
console.log(JSON.stringify(report, null, 2));
