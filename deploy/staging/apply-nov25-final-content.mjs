#!/usr/bin/env node
// MEKI final client-content integration (25 Nov 2026) — applies the approved content and the 24 Nov 2026 photo delivery to an
// EXISTING database through the audited admin API (never SQL), after apply-nov23-client-edits.mjs. Phases (each in nov25/*.mjs):
//   site        navigation menus aligned with the real website menu; confirmed inquiries e-mail + social accounts
//   programmes  the "Programs (SHORTENED)" Word copy: landing, nine program pages, enabling functions (EN + AR)
//   images      all 102 delivered photos → Media Library; Home P → hero; program covers + galleries; homepage gallery
//   gala        host photo published (approval granted), Bokra / The Waterway partner entries (hidden, no logo), contact e-mail
//
// Safety: a value is replaced only while it still equals the previous seeded / approved text; editor changes are kept; new fields are
// only added when empty; sections are republished only if they were published without pending edits; nothing is deleted; every
// publish reports the website refresh result (X-Meki-Revalidation). DRY_RUN=1 is the default — nothing is written until DRY_RUN=0.
//
//   export ADMIN_URL=https://admin.example ADMIN_EMAIL=<publisher account>
//   node deploy/staging/apply-nov25-final-content.mjs            # dry run; the password is asked with hidden input
//   DRY_RUN=0 node deploy/staging/apply-nov25-final-content.mjs  # apply, after reviewing the dry-run report
//   ONLY=site,images node …                                       # run selected phases
// Env: DELIVERY_DIR = folder holding "TransferNow-…/5-Pic Sit" (+ "_converted/IMG_1746.jpg", see nov25/convert-heic.ps1);
//      GALA_ASSET_DIR = 06-gala-assets. Defaults are under references/client-edits-2026-11-23/.
// Never put the password on the command line. Local staging may use deploy/staging/.env.staging-admin (git-ignored).
// Requires content.manage, content.publish, programmes.manage, settings.manage, media.upload, events.manage and events.publish.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySite } from './nov25/site.mjs';
import { applyProgrammes } from './nov25/programmes.mjs';
import { applyImages } from './nov25/images.mjs';
import { applyGala } from './nov25/gala.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ADMIN = (process.env.ADMIN_URL ?? 'http://localhost:3201').replace(/\/$/, '');
const DRY = process.env.DRY_RUN !== '0';
const ONLY = (process.env.ONLY ?? 'site,programmes,images,gala').split(',').map((s) => s.trim());
const DELIVERY_DIR = process.env.DELIVERY_DIR ?? join(HERE, '../../references/client-edits-2026-11-23/08-client-delivery-originals');
const GALA_DIR = process.env.GALA_ASSET_DIR ?? join(HERE, '../../references/client-edits-2026-11-23/06-gala-assets');

const uk = (s) => s.replace(/program(?!me)/g, 'programme').replace(/Program(?!me)/g, 'Programme').replace(/labor/g, 'labour').replace(/Labor/g, 'Labour').replace(/stabiliz/g, 'stabilis');
export const isOld = (v, old) => typeof v === 'string' && typeof old === 'string' && (v.trim() === old.trim() || v.trim() === uk(old).trim());
export const blank = (v) => v == null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

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
  return { status: res.status, json: await res.json().catch(() => null), revalidation: res.headers.get('x-meki-revalidation') };
};
const must = (r, what) => {
  if (r.status >= 300) throw new Error(`${what}: HTTP ${r.status} ${r.json?.error?.code ?? ''}`);
  return r.json?.data;
};
const write = async (method, path, body, what) => (DRY ? null : must(await call(method, path, body), what));

// ───────── Media Library (POST /admin/media — the endpoint the Admin uses; de-duplicated by checksum) ─────────
let library = null;
async function loadLibrary() {
  if (library) return library;
  library = { byName: new Map(), bySha: new Map() };
  for (let page = 1; page < 200; page++) {
    const rows = must(await call('GET', `/admin/media?page=${page}&pageSize=100`), 'media list') ?? [];
    for (const m of rows) {
      if (m.deletedAt) continue;
      if (m.originalName) library.byName.set(m.originalName, m);
      if (m.checksum) library.bySha.set(m.checksum, m);
    }
    if (rows.length < 100) break;
  }
  return library;
}
/**
 * spec: { key, filename, mimeType?, category, consentStatus, provenance, altEn, altAr, captionEn, captionAr, credit, sourceFolder } plus
 *       either `load()` (async → Buffer; only called when an upload is really needed) or `file` (relative to the Gala asset folder,
 *       checked against `sha256`). A file already in the library (same checksum, else same filename) is reused.
 * returns { id, state: 'uploaded' | 'reused' | 'would upload' }
 */
async function uploadMedia(spec) {
  const lib = await loadLibrary();
  let buf = null;
  let sha = spec.sha256 ?? null;
  if (spec.file) {
    buf = readFileSync(join(GALA_DIR, spec.file));
    sha = createHash('sha256').update(buf).digest('hex');
    if (spec.sha256 && sha !== spec.sha256) throw new Error(`${spec.file}: not the file MEKI supplied (checksum differs)`);
  }
  const filename = spec.filename ?? basename(spec.file);
  const found = (sha && lib.bySha.get(sha)) || lib.byName.get(filename);
  if (found) return { id: found.id, state: 'reused' };
  if (DRY) return { id: `(new:${spec.key})`, state: 'would upload' };
  buf ??= await spec.load();
  sha ??= createHash('sha256').update(buf).digest('hex');
  const form = new FormData();
  for (const k of ['category', 'consentStatus', 'provenance', 'altEn', 'altAr', 'captionEn', 'captionAr', 'credit', 'sourceFolder']) if (spec[k]) form.append(k, spec[k]);
  const type = spec.mimeType ?? (/\.png$/i.test(filename) ? 'image/png' : /\.pdf$/i.test(filename) ? 'application/pdf' : 'image/jpeg');
  form.append('file', new Blob([buf], { type }), filename);
  const res = await fetch(`${ADMIN}/api/v1/admin/media`, { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf }, body: form });
  const json = await res.json().catch(() => null);
  let m;
  if (res.status < 300) m = json.data;
  else if (res.status === 409 && json?.error?.code === 'DUPLICATE_MEDIA' && json.error.details?.id) m = { id: json.error.details.id, originalName: filename, checksum: sha };
  else throw new Error(`upload ${filename}: HTTP ${res.status} ${json?.error?.code ?? ''}`);
  lib.byName.set(filename, m);
  lib.bySha.set(sha, m);
  return { id: m.id, state: res.status < 300 ? 'uploaded' : 'reused' };
}
// the Gala module expects the media id only
const uploadMediaId = async (spec) => (await uploadMedia(spec)).id;

const login = await call('POST', '/admin/auth/login', { email: cred.ADMIN_BOOTSTRAP_EMAIL, password: cred.ADMIN_BOOTSTRAP_PASSWORD });
if (login.status !== 200) throw new Error(`login failed: HTTP ${login.status} ${login.json?.error?.code ?? ''}`);
csrf = login.json.data.csrfToken;

const report = { dryRun: DRY, phases: ONLY };
const base = { call, must, write, DRY, isOld, blank };
try {
  if (ONLY.includes('site')) report.site = await applySite({ ...base });
  if (ONLY.includes('programmes')) await applyProgrammes({ ...base, report }); // the module stores its result in report.programmes25
  if (ONLY.includes('images')) report.images = await applyImages({ ...base, uploadMedia }, { root: DELIVERY_DIR });
  if (ONLY.includes('gala')) report.gala = await applyGala({ ...base, uploadMedia: uploadMediaId, hostApproved: true });
} finally {
  await call('POST', '/admin/auth/logout');
}
console.log(JSON.stringify(report, null, 2));
