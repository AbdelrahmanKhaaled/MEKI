// MEKI client delivery 24 Nov 2026 — images → Media Library → homepage hero, program covers + galleries, homepage gallery.
// Source of truth: client-delivery.manifest.json (built from client-delivery.map.mjs). Every one of the 102 delivered files is
// uploaded to the Media Library (as a ≤ 2560 px WebP derivative, originals untouched) and then used where its folder says.
//
// Safety (same rules as the Nov-23 script):
//  - a file already in the library (same derivative name) is reused — re-runs upload nothing;
//  - the hero / program covers are replaced ONLY while they still hold the seeded built-in photo (or nothing); a photo an editor
//    chose is kept;
//  - a program gallery is filled only while it is EMPTY (the API replaces a whole gallery, so a non-empty one is never touched);
//  - homepage gallery: new photos are ADDED (codes g25-…); the original seeded photos are only HIDDEN (isVisible=false) while they
//    still carry their seeded static image — never deleted, never renamed; editor-written captions are never touched;
//  - a CMS section is republished only when it was PUBLISHED with no pending edits before this run;
//  - nothing is deleted. DRY runs write nothing.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { derive } from './derive.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MANIFEST = JSON.parse(readFileSync(join(HERE, 'client-delivery.manifest.json'), 'utf8'));

const isStaticUrl = (m) => typeof m?.url === 'string' && /\/images\/work\//.test(m.url);
const CATEGORY = { 'hero-main': 'HERO', 'hero-secondary': 'HERO', cover: 'PROGRAMME', water: 'PROGRAMME', gallery: 'GALLERY', library: 'GALLERY' };
const place = (e, l) => (l === 'ar' ? e.placeAr : e.placeEn);
const caption = (e, l) => `${l === 'ar' ? e.titleAr : e.titleEn} – ${place(e, l)}`;

/** Upload spec for one delivered photo (the derivative is built lazily — only when it really has to be uploaded). */
export function mediaSpec(e, root) {
  const rel = e.converted ?? `${MANIFEST.source}/${e.rel}`;
  const sourceName = e.converted ? e.converted : e.rel;
  return {
    key: e.key,
    filename: `${e.key}.webp`,
    mimeType: 'image/webp',
    category: CATEGORY[e.role],
    consentStatus: 'UNKNOWN', // MEKI has not confirmed consent per photo; never claimed here
    provenance: 'VERIFIED_SOURCE', // supplied by MEKI for the website (folders = the client's own organisation); captions are proposed
    altEn: e.titleEn,
    altAr: e.titleAr,
    captionEn: caption(e, 'en'),
    captionAr: caption(e, 'ar'),
    sourceFolder: `client delivery 24 Nov 2026 / ${e.folder} / ${e.file} · caption PROPOSED (not verified by MEKI)`.slice(0, 255),
    load: async () => {
      const original = readFileSync(join(root, rel));
      const { createHash } = await import('node:crypto');
      const expected = e.converted ? e.convertedSha256 : e.sha256;
      if (createHash('sha256').update(original).digest('hex') !== expected) throw new Error(`${sourceName}: not the file MEKI supplied (checksum differs)`);
      const { data } = await derive(original);
      return data;
    },
  };
}

/** @param ctx { call, must, write, DRY, blank, uploadMedia } */
export async function applyImages(ctx, { root }) {
  const { call, must, write, DRY, blank, uploadMedia } = ctx;
  const out = { uploaded: 0, reused: 0, wouldUpload: 0, total: 0, hero: null, programmes: [], gallery: null, unused: [] };
  const entries = MANIFEST.entries;

  // 1. every delivered photo → Media Library
  const ids = {};
  for (const e of entries) {
    const r = await uploadMedia(mediaSpec(e, root));
    ids[e.key] = r.id;
    out.total++;
    if (r.state === 'uploaded') out.uploaded++;
    else if (r.state === 'reused') out.reused++;
    else out.wouldUpload++;
  }

  const home = must(await call('GET', '/admin/cms/pages/home'), 'home page');
  // cleanliness is judged BEFORE this run writes anything (an edit made by this script must not count as an editor's pending edit)
  const cleanBefore = new Map(home.sections.map((s) => [s.id, s.status === 'PUBLISHED' && !s.hasUnpublishedChanges]));
  const publishIfClean = async (s, changed, label) => {
    const clean = cleanBefore.get(s.id) === true;
    let result = null;
    if (changed && clean && !DRY) {
      const r = await call('POST', `/admin/cms/sections/${s.id}/publish`);
      if (r.status >= 300) throw new Error(`publish ${label}: HTTP ${r.status} ${r.json?.error?.code ?? ''}`);
      result = r.revalidation ?? 'published';
    }
    return { published: result, wouldPublish: DRY ? changed && clean : undefined, leftForEditor: changed && !clean };
  };

  // 2. homepage hero: main + secondary (the two "Home P" photos)
  {
    const s = home.sections.find((x) => x.key === 'HERO');
    const main = entries.find((e) => e.role === 'hero-main');
    const second = entries.find((e) => e.role === 'hero-secondary');
    const changes = [];
    if (s) {
      if (!s.mediaId || isStaticUrl(s.media)) {
        await write('PATCH', `/admin/cms/sections/${s.id}`, { mediaId: ids[main.key] }, 'hero main image');
        changes.push('main image');
      }
      const item = (s.items ?? []).find((i) => i.code === 'hero-secondary-image');
      if (!item) {
        await write('POST', `/admin/cms/sections/${s.id}/items`, { code: 'hero-secondary-image', mediaId: ids[second.key], isVisible: true, provenance: 'VERIFIED_SOURCE' }, 'hero secondary image');
        changes.push('secondary image (item created)');
      } else if (!item.mediaId || isStaticUrl(item.media)) {
        await write('PATCH', `/admin/cms/items/${item.id}`, { mediaId: ids[second.key] }, 'hero secondary image');
        changes.push('secondary image');
      }
      // alt text labels (EN/AR) are added only when empty
      const le = { ...(s.labelsEn ?? {}) };
      const la = { ...(s.labelsAr ?? {}) };
      let labels = false;
      for (const [k, v, w] of [['mainImageAlt', main.titleEn, main.titleAr], ['secondaryImageAlt', second.titleEn, second.titleAr]]) {
        if (blank(le[k])) { le[k] = v; labels = true; }
        if (blank(la[k])) { la[k] = w; labels = true; }
      }
      if (labels && changes.length) { await write('PATCH', `/admin/cms/sections/${s.id}`, { labelsEn: le, labelsAr: la }, 'hero alt text'); changes.push('alt text'); }
      out.hero = { changes, ...(await publishIfClean(s, changes.length > 0, 'HERO')) };
    } else out.hero = { missing: true };
  }

  // 3. program covers + program galleries (folder → program)
  const programmes = must(await call('GET', '/admin/programmes?kind=PROGRAMME&pageSize=100'), 'programmes') ?? [];
  for (const p of programmes) {
    const mine = entries.filter((e) => e.program === p.slug);
    if (!mine.length) continue;
    const cover = mine.find((e) => e.role === 'cover');
    const detail = DRY && String(ids[cover.key]).startsWith('(new') ? p : (must(await call('GET', `/admin/programmes/${p.id}`), `programme ${p.slug}`) ?? p);
    const patch = {};
    if (cover && (!detail.coverMediaId || isStaticUrl(detail.coverMedia))) patch.coverMediaId = ids[cover.key];
    if (Object.keys(patch).length) await write('PATCH', `/admin/programmes/${p.id}`, patch, `programme ${p.slug} cover`);
    const order = [...mine.filter((e) => e.role === 'cover'), ...mine.filter((e) => e.role === 'gallery'), ...mine.filter((e) => e.role === 'library')];
    const galleryEmpty = !detail.gallery || detail.gallery.length === 0;
    if (galleryEmpty) await write('PUT', `/admin/programmes/${p.id}/gallery`, { mediaIds: order.map((e) => ids[e.key]) }, `programme ${p.slug} gallery`);
    out.programmes.push({ slug: p.slug, cover: Object.keys(patch).length ? 'set' : 'kept', gallery: galleryEmpty ? `set (${order.length} photos)` : `kept (editor-managed, ${detail.gallery.length} photos)` });
  }

  // 4. homepage gallery "Our work in action": new curated photos added, seeded static photos hidden
  {
    const s = home.sections.find((x) => x.key === 'GALLERY');
    if (s) {
      const featured = ['cover', 'water', 'gallery'].flatMap((r) => entries.filter((e) => e.role === r));
      // reading order: one photo per program first, then the rest of the curated set
      const covers = featured.filter((e) => e.role === 'cover' || e.role === 'water');
      const rest = featured.filter((e) => e.role === 'gallery');
      const list = [];
      for (let i = 0; i < Math.max(covers.length, rest.length); i++) { if (covers[i]) list.push(covers[i]); if (rest[i]) list.push(rest[i]); }
      const changes = [];
      for (const [i, e] of list.entries()) {
        const code = `g25-${e.key}`.slice(0, 80);
        if ((s.items ?? []).some((x) => x.code === code)) continue;
        const slug = e.role === 'water' ? 'wash' : e.program;
        await write('POST', `/admin/cms/sections/${s.id}/items`, {
          code, sortOrder: 100 + i, isVisible: true, provenance: 'PROPOSED',
          titleEn: e.titleEn, titleAr: e.titleAr, textEn: e.placeEn, textAr: e.placeAr,
          ...(slug ? { href: `/programs/${slug}` } : {}), mediaId: ids[e.key],
        }, `gallery ${code}`);
        changes.push(`add ${code}`);
      }
      for (const old of s.items ?? []) {
        if (old.code && old.code.startsWith('g25-')) continue;
        if (old.isVisible && isStaticUrl(old.media) && !blank(old.titleEn)) {
          await write('PATCH', `/admin/cms/items/${old.id}`, { isVisible: false }, `hide seeded photo ${old.id}`);
          changes.push(`hide seeded photo "${old.titleEn}"`);
        }
      }
      out.gallery = { added: changes.filter((c) => c.startsWith('add')).length, hiddenSeeded: changes.filter((c) => c.startsWith('hide')).length, ...(await publishIfClean(s, changes.length > 0, 'GALLERY')) };
    } else out.gallery = { missing: true };
  }

  // 5. accounting: every delivered photo is in the library; which are shown on the site
  const shown = new Set(entries.filter((e) => ['hero-main', 'hero-secondary', 'cover', 'water', 'gallery'].includes(e.role)).map((e) => e.key));
  out.unused = entries.filter((e) => !shown.has(e.key)).length;
  out.note = `${out.total} photos in the Media Library; ${shown.size} used on the homepage / covers, all ${entries.filter((e) => e.program).length} program photos also in their program galleries; ${out.unused} library photos (program galleries only)`;
  return out;
}
