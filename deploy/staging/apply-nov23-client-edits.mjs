#!/usr/bin/env node
// MEKI client edits (Word "MEKI-US Website Edits for the IT Team", 22 Nov 2026 + feedback 23 Nov 2026) — applies the approved copy to
// an EXISTING database through the audited admin API (never SQL). The seed only creates rows, so existing databases (staging, the
// VPS) keep the old wording until updated. Values: apply-nov23-client-edits.data.json (old → new, generated from the website copy).
//
// Safety (same rules as apply-nov21-captions.mjs):
//  - a value is replaced ONLY when it still equals the exact old seeded text (also its UK-spelling seed variant); editor changes are kept;
//  - new fields (programme summary/outcomes, new labels, the five "How it works" items) are only ADDED when absent — never overwritten;
//  - a CMS section is republished ONLY if it was PUBLISHED with no other pending edits before this script touched it
//    (otherwise the change stays in the working copy for an editor to review and publish);
//  - programmes: only shortDesc/focusAreas that still equal the seed are replaced; summary/outcomes only filled when empty;
//  - site settings: confirmed social accounts added per network (an editor's URL for a network is kept); logo paths only when
//    still the old seeded paths;
//  - Gala assets (24 Nov 2026): the supplied files (checksum-verified, from ASSET_DIR) are uploaded through the Media Library API
//    (re-runs reuse them) and assigned to empty Gala section slots; the host photo stays a draft unless HOST_PHOTO_APPROVED=1;
//    SKIP_ASSETS=1 skips this phase. Every publish reports the website refresh result (X-Meki-Revalidation);
//  - nothing is deleted. DRY_RUN=1 (default) prints what would change. Set DRY_RUN=0 to apply.
//
//   export ADMIN_URL=https://admin.example ADMIN_EMAIL=<publisher account>
//   node deploy/staging/apply-nov23-client-edits.mjs            # dry run; password asked with hidden input
//   DRY_RUN=0 node deploy/staging/apply-nov23-client-edits.mjs  # apply (after reviewing the dry-run report)
//   Never put the password on the command line. Local staging may use deploy/staging/.env.staging-admin (git-ignored).
// Requires content.manage, content.publish, programmes.manage, settings.manage, media.upload, events.manage and
// events.publish (missing permissions stop the run with HTTP 403; nothing is forced). Run AFTER the release switch
// (migration 20261123100000_client_edits_programme_copy adds the programme summary/outcomes columns).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ADMIN = (process.env.ADMIN_URL ?? 'http://localhost:3201').replace(/\/$/, '');
const DRY = process.env.DRY_RUN !== '0';
const D = JSON.parse(readFileSync(join(HERE, 'apply-nov23-client-edits.data.json'), 'utf8'));

/** Older seeds wrote UK spelling; both count as "untouched seed text". */
const uk = (s) => s.replace(/program(?!me)/g, 'programme').replace(/Program(?!me)/g, 'Programme').replace(/labor/g, 'labour').replace(/Labor/g, 'Labour').replace(/stabiliz/g, 'stabilis');
export const isOld = (v, old) => typeof v === 'string' && typeof old === 'string' && (v.trim() === old.trim() || v.trim() === uk(old).trim());
const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => isOld(x, b[i]));
const blank = (v) => v == null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

// Credentials — never as command-line arguments and never printed:
//  1. ADMIN_EMAIL (+ ADMIN_PASSWORD only if already exported in the environment, e.g. by CI);
//  2. otherwise, on an interactive terminal, the password is asked for with hidden input (production use);
//  3. otherwise deploy/staging/.env.staging-admin (local staging; git-ignored, never committed).
async function askHidden(prompt) {
  process.stderr.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let value = '';
  return await new Promise((resolve, reject) => {
    process.stdin.on('data', function onData(chunk) {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\r' || ch === '\n') { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData); process.stderr.write('\n'); return resolve(value); }
        if (ch === '\u0003') { process.stdin.setRawMode(false); return reject(new Error('cancelled')); }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    });
  });
}
const cred = process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD
  ? { ADMIN_BOOTSTRAP_EMAIL: process.env.ADMIN_EMAIL, ADMIN_BOOTSTRAP_PASSWORD: process.env.ADMIN_PASSWORD }
  : process.env.ADMIN_EMAIL && process.stdin.isTTY
    ? { ADMIN_BOOTSTRAP_EMAIL: process.env.ADMIN_EMAIL, ADMIN_BOOTSTRAP_PASSWORD: await askHidden(`Admin password for ${process.env.ADMIN_EMAIL}: `) }
    : Object.fromEntries(readFileSync(join(HERE, '.env.staging-admin'), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
delete process.env.ADMIN_PASSWORD; // not inherited by anything this process might start
let cookie = '';
let csrf = '';
const call = async (method, path, body) => {
  const res = await fetch(`${ADMIN}/api/v1${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(csrf && method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sid = (res.headers.getSetCookie?.() ?? []).find((c) => /meki_admin_sid=/.test(c));
  if (sid) cookie = sid.split(';')[0];
  // X-Meki-Revalidation: revalidated | pending | disabled — reported for every publish (live-site refresh check).
  return { status: res.status, json: await res.json().catch(() => null), revalidation: res.headers.get('x-meki-revalidation') };
};
const must = (r, what) => {
  if (r.status >= 300) throw new Error(`${what}: HTTP ${r.status} ${r.json?.error?.code ?? ''}`);
  return r.json?.data;
};
const write = async (method, path, body, what) => (DRY ? null : must(await call(method, path, body), what));

const login = await call('POST', '/admin/auth/login', { email: cred.ADMIN_BOOTSTRAP_EMAIL, password: cred.ADMIN_BOOTSTRAP_PASSWORD });
if (login.status !== 200) throw new Error(`login failed: HTTP ${login.status} ${login.json?.error?.code ?? ''}`);
csrf = login.json.data.csrfToken;
const report = { dryRun: DRY, sections: [], programmes: [], site: null };

try {
  // ───────── homepage sections ─────────
  const home = must(await call('GET', '/admin/cms/pages/home'), 'home page');
  for (const [key, spec] of Object.entries(D.sections)) {
    const s = home.sections.find((x) => x.key === key);
    if (!s) { report.sections.push({ key, missing: true }); continue; }
    const cleanPublished = s.status === 'PUBLISHED' && !s.hasUnpublishedChanges;
    const changes = [];
    // section fields
    const patch = {};
    for (const [field, v] of Object.entries(spec)) {
      if (!v || typeof v !== 'object' || !('old' in v)) continue;
      if (isOld(s[field], v.old)) { patch[field] = v.new; changes.push({ field, to: v.new }); }
    }
    // labels: replace old values, add missing ones
    const le = { ...(s.labelsEn ?? {}) };
    const la = { ...(s.labelsAr ?? {}) };
    let labelsTouched = false;
    for (const [k, v] of Object.entries(spec.labels ?? {})) {
      if ([v.en.old, ...(v.en.olderVariants ?? [])].some((o) => isOld(le[k], o))) { le[k] = v.en.new; labelsTouched = true; changes.push({ label: `${k}.en`, to: v.en.new }); }
      if (isOld(la[k], v.ar.old)) { la[k] = v.ar.new; labelsTouched = true; changes.push({ label: `${k}.ar`, to: v.ar.new }); }
    }
    for (const [k, val] of Object.entries(spec.addLabels?.en ?? {})) if (blank(le[k])) { le[k] = val; labelsTouched = true; changes.push({ label: `${k}.en (added)`, to: val }); }
    for (const [k, val] of Object.entries(spec.addLabels?.ar ?? {})) if (blank(la[k])) { la[k] = val; labelsTouched = true; changes.push({ label: `${k}.ar (added)`, to: val }); }
    if (labelsTouched) { patch.labelsEn = le; patch.labelsAr = la; }
    if (Object.keys(patch).length) await write('PATCH', `/admin/cms/sections/${s.id}`, patch, `section ${key}`);

    // existing items (by code)
    for (const [code, iv] of Object.entries(spec.items ?? {})) {
      const it = (s.items ?? []).find((i) => i.code === code);
      if (!it) continue;
      const ip = {};
      if ('oldTitlesEn' in iv) {
        // Gallery: an old item title held the whole caption (21 Nov "Title – Place" or the earlier "·" label); split it into
        // title + place + program link. A caption an editor wrote is never touched.
        if (iv.oldTitlesEn.some((o) => isOld(it.titleEn, o)) && blank(it.textEn) && blank(it.href)) Object.assign(ip, { titleEn: iv.titleEn, textEn: iv.textEn, href: iv.href });
        if (iv.oldTitlesAr.some((o) => isOld(it.titleAr, o)) && blank(it.textAr)) Object.assign(ip, { titleAr: iv.titleAr, textAr: iv.textAr });
      } else {
        for (const [field, v] of Object.entries(iv)) if (isOld(it[field], v.old)) ip[field] = v.new;
      }
      // The API stores "" as "": an emptied text is sent as null (cleared).
      for (const k of Object.keys(ip)) if (ip[k] === '') ip[k] = null;
      if (Object.keys(ip).length) {
        changes.push({ item: code, ...ip });
        await write('PATCH', `/admin/cms/items/${it.id}`, ip, `item ${code}`);
      }
    }
    // new items (only when the code does not exist yet)
    for (const [i, ni] of (spec.addItems ?? []).entries()) {
      if ((s.items ?? []).some((x) => x.code === ni.code)) continue;
      changes.push({ addItem: ni.code });
      await write('POST', `/admin/cms/sections/${s.id}/items`, { ...ni, sortOrder: (i + 1) * 10, provenance: 'VERIFIED_SOURCE' }, `add ${ni.code}`);
    }
    let republished = false;
    if (changes.length && cleanPublished && !DRY) {
      must(await call('POST', `/admin/cms/sections/${s.id}/publish`), `publish ${key}`);
      republished = true;
    }
    report.sections.push({ key, status: s.status, hadPendingEdits: !!s.hasUnpublishedChanges, changes, republished, ...(DRY ? { wouldRepublish: changes.length > 0 && cleanPublished } : {}), leftForEditor: changes.length > 0 && !cleanPublished });
  }

  // ───────── programmes + enabling functions ─────────
  const list = [];
  for (const kind of ['PROGRAMME', 'ENABLING_FUNCTION']) {
    const rows = must(await call('GET', `/admin/programmes?kind=${kind}&pageSize=100`), `programmes ${kind}`) ?? [];
    list.push(...rows);
  }
  for (const spec of [...D.programmes, ...D.enabling]) {
    const p = list.find((x) => x.code === spec.code);
    if (!p) { report.programmes.push({ code: spec.code, missing: true }); continue; }
    const patch = {};
    for (const f of ['shortDescEn', 'shortDescAr']) if (spec[f] && isOld(p[f], spec[f].old) && p[f] !== spec[f].new) patch[f] = spec[f].new;
    for (const f of ['focusAreasEn', 'focusAreasAr']) if (spec[f] && sameList(p[f], spec[f].old) && JSON.stringify(spec[f].old) !== JSON.stringify(spec[f].new)) patch[f] = spec[f].new;
    for (const f of ['summaryEn', 'summaryAr', 'outcomesEn', 'outcomesAr']) if (spec[f] !== undefined && blank(p[f])) patch[f] = spec[f];
    if (Object.keys(patch).length) await write('PATCH', `/admin/programmes/${p.id}`, patch, `programme ${spec.code}`);
    report.programmes.push({ code: spec.code, status: p.status, changes: Object.keys(patch) });
  }

  // ───────── site settings ─────────
  const site = must(await call('GET', '/admin/settings/site'), 'site settings');
  const sp = {};
  // 24 Nov 2026: official accounts merged by network — a network already stored (an editor's URL) is never overwritten.
  const stored = Array.isArray(site.socialLinks) ? site.socialLinks : [];
  const missing = D.site.socialLinksConfirmed.filter((l) => !stored.some((s) => String(s?.network).toLowerCase() === l.network));
  if (missing.length) sp.socialLinks = [...stored, ...missing];
  for (const [f, v] of Object.entries(D.site.logos)) if (site[f] === v.old) sp[f] = v.new;
  if (Object.keys(sp).length) await write('PATCH', '/admin/settings/site', sp, 'site settings');
  report.site = { changes: Object.keys(sp), socialAdded: (sp.socialLinks ?? []).slice(stored.length).map((l) => l.network) };

  // ───────── Gala assets (MEKI confirmations, 24 Nov 2026) ─────────
  if (process.env.SKIP_ASSETS !== '1') report.gala = await applyGalaAssets();
} finally {
  await call('POST', '/admin/auth/logout');
}
console.log(JSON.stringify(report, null, 2));

/**
 * MEKI confirmations (24 Nov 2026): registers the supplied Gala files in the Media Library (POST /admin/media — the same endpoint
 * the admin uses; checksum de-duplication makes re-runs reuse the existing asset) and assigns them to the Gala event's
 * landing-page sections. Values already set by an editor are never replaced. A section is published only if this run created it
 * or it was already published with no pending edits. The host photo stays a DRAFT unless HOST_PHOTO_APPROVED=1.
 */
async function applyGalaAssets() {
  const G = D.gala;
  const hostApproved = process.env.HOST_PHOTO_APPROVED === '1';
  const dir = process.env.ASSET_DIR ?? join(HERE, '../../references/client-edits-2026-11-23/06-gala-assets');
  const out = { hostPhotoApproved: hostApproved, assets: {}, sections: [], eventStatus: null };
  const ids = {};

  for (const a of D.assets.files) {
    const buf = readFileSync(join(dir, a.file));
    if (createHash('sha256').update(buf).digest('hex') !== a.sha256) throw new Error(`${a.file}: not the file MEKI supplied (checksum differs)`);
    const consent = a.key === 'host-raya-abirached' && hostApproved ? 'CONFIRMED' : a.consentStatus;
    // Already in the library (same bytes)? Reuse it without uploading again.
    const found = (must(await call('GET', `/admin/media?search=${encodeURIComponent(basename(a.file))}&pageSize=100`), 'media search') ?? []).find((m) => m.checksum === a.sha256 && !m.deletedAt);
    if (found) {
      ids[a.key] = found.id;
      out.assets[a.key] = 'already in library (reused)';
      if (consent === 'CONFIRMED' && found.consentStatus !== 'CONFIRMED' && a.key === 'host-raya-abirached') await write('PATCH', `/admin/media/${found.id}`, { consentStatus: 'CONFIRMED' }, 'host consent');
      continue;
    }
    if (DRY) { ids[a.key] = `(new:${a.key})`; out.assets[a.key] = 'would upload'; continue; }
    const form = new FormData();
    for (const [k, v] of Object.entries({ category: a.category, consentStatus: consent, provenance: a.provenance, altEn: a.altEn, altAr: a.altAr, captionEn: a.captionEn, captionAr: a.captionAr, credit: a.credit, sourceFolder: a.sourceFolder })) if (v) form.append(k, v);
    const type = a.mimeType ?? (/\.png$/i.test(a.file) ? 'image/png' : 'image/jpeg');
    form.append('file', new Blob([buf], { type }), basename(a.file));
    const res = await fetch(`${ADMIN}/api/v1/admin/media`, { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf }, body: form });
    const json = await res.json().catch(() => null);
    if (res.status < 300) { ids[a.key] = json.data.id; out.assets[a.key] = 'uploaded'; }
    else if (res.status === 409 && json?.error?.code === 'DUPLICATE_MEDIA' && json.error.details?.id) {
      ids[a.key] = json.error.details.id;
      out.assets[a.key] = 'already in library (reused)';
      if (consent === 'CONFIRMED' && a.key === 'host-raya-abirached') must(await call('PATCH', `/admin/media/${ids[a.key]}`, { consentStatus: 'CONFIRMED' }), 'host consent');
    } else throw new Error(`upload ${a.file}: HTTP ${res.status} ${json?.error?.code ?? ''}`);
  }

  const events = must(await call('GET', '/admin/events?pageSize=100'), 'events') ?? [];
  const ev = events.find((e) => e.slug === G.eventSlug);
  if (!ev) return { ...out, missingEvent: G.eventSlug };
  out.eventStatus = ev.status;
  const page = must(await call('GET', `/admin/events/${ev.id}/page`), 'event page');

  const block = async (key, apply, { publish = true, ours } = {}) => {
    let s = page.sections.find((x) => x.key === key);
    const created = !s;
    if (!s) s = DRY ? { id: '(new)', key, items: [], status: 'DRAFT' } : must(await call('POST', `/admin/events/${ev.id}/sections`, { key, provenance: 'VERIFIED_SOURCE' }), `create ${key}`);
    s.items ??= [];
    const cleanPublished = !created && s.status === 'PUBLISHED' && !s.hasUnpublishedChanges;
    // An empty seed shell (never published, no image, no items) carries nothing an editor wrote: publishing it after this run
    // fills it exposes only the client-supplied material — treated like a section created by this run.
    const emptyShell = !created && !s.publishedAt && !s.mediaId && s.items.length === 0;
    const changes = [];
    // A never-published section holding only what an earlier run of this script added (e.g. the host photo awaiting approval)
    // is published once its approval is given, even when this run changes nothing else.
    if (publish && ours && !created && !s.publishedAt && s.status !== 'PUBLISHED' && ours(s)) changes.push('publish after approval');
    await apply(s, changes);
    let published = null;
    const owned = !!ours && !s.publishedAt && ours(s);
    if (changes.length && publish && (created || cleanPublished || emptyShell || owned) && !DRY) {
      const r = must2(await call('POST', `/admin/events/${ev.id}/sections/${s.id}/publish`), `publish ${key}`);
      published = r.revalidation ?? 'published';
    }
    const eligible = changes.length > 0 && publish && (created || cleanPublished || emptyShell || owned);
    // dry run: report what WOULD happen, so the reviewed report matches the real run
    out.sections.push({ key, created, changes, published, ...(DRY ? { wouldPublish: eligible } : {}), leftAsDraftOrForEditor: changes.length > 0 && !eligible });
  };
  const patchSection = (s, b, what) => write('PATCH', `/admin/events/${ev.id}/sections/${s.id}`, b, what);
  const addItem = (s, b, what) => write('POST', `/admin/events/${ev.id}/sections/${s.id}/items`, { provenance: 'VERIFIED_SOURCE', ...b }, what);
  const patchItem = (i, b, what) => write('PATCH', `/admin/events/${ev.id}/items/${i.id}`, b, what);

  await block('EVENT_HERO', async (s, ch) => {
    if (!s.mediaId) { await patchSection(s, { mediaId: ids[G.hero.asset] }, 'hero photo'); ch.push('hero photo'); }
  });
  await block('EVENT_VENUE', async (s, ch) => {
    if (!s.mediaId) { await patchSection(s, { mediaId: ids[G.venue.logo] }, 'venue logo'); ch.push('venue logo'); }
    for (const [n, p] of G.venue.photos.entries()) {
      if (s.items.some((i) => i.mediaId === ids[p.asset])) continue;
      await addItem(s, { titleEn: p.titleEn, titleAr: p.titleAr, textEn: p.textEn, textAr: p.textAr, mediaId: ids[p.asset], sortOrder: (n + 1) * 10 }, 'venue photo');
      ch.push(`venue photo ${p.asset}`);
    }
  });
  await block('EVENT_SPEAKERS', async (s, ch) => {
    const host = s.items.find((i) => i.code === 'host');
    if (!host) { await addItem(s, { code: 'host', mediaId: ids[G.host.asset] }, 'host'); ch.push('host photo'); }
    else if (!host.mediaId) { await patchItem(host, { mediaId: ids[G.host.asset] }, 'host photo'); ch.push('host photo'); }
  }, { publish: hostApproved, ours: (s) => !s.mediaId && s.items.length === 1 && s.items[0].code === 'host' && s.items[0].mediaId === ids[G.host.asset] && !s.items[0].titleEn });
  await block('EVENT_HIGHLIGHTS', async (s, ch) => {
    for (const [n, c] of G.experience.cards.entries()) {
      const it = s.items.find((i) => i.code === c.code);
      const old = G.experience.oldTitles[c.code];
      if (!it) { await addItem(s, { ...c, sortOrder: (n + 1) * 10 }, `card ${c.code}`); ch.push(`card ${c.code}`); continue; }
      const p = {};
      if (blank(it.titleEn) || old?.en.some((o) => isOld(it.titleEn, o))) if (it.titleEn !== c.titleEn) p.titleEn = c.titleEn;
      if (blank(it.titleAr) || old?.ar.some((o) => isOld(it.titleAr, o))) if (it.titleAr !== c.titleAr) p.titleAr = c.titleAr;
      if (Object.keys(p).length) { await patchItem(it, p, `card ${c.code}`); ch.push(`card ${c.code} wording`); }
    }
  });
  await block('EVENT_SPONSORSHIP', async (s, ch) => {
    if (!s.mediaId) { await patchSection(s, { mediaId: ids[G.sponsorship.asset] }, 'sponsorship PDF'); ch.push('sponsorship PDF'); }
  });
  return out;
}

/** like must() but keeps the response (for the revalidation header) */
function must2(r, what) {
  if (r.status >= 300) throw new Error(`${what}: HTTP ${r.status} ${r.json?.error?.code ?? ''}`);
  return r;
}
