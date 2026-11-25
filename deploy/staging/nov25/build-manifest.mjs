#!/usr/bin/env node
// Builds client-delivery.manifest.json from client-delivery.map.mjs + the delivered files (read-only):
// sha256 of every original, dimensions, and a coverage check — every supplied image must be mapped exactly once.
//   node deploy/staging/nov25/build-manifest.mjs [<folder holding "TransferNow-…/5-Pic Sit">]
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ENTRIES, SRC_SUBPATH } from './client-delivery.map.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2] ?? join(HERE, '../../../references/client-edits-2026-11-23/08-client-delivery-originals');
const base = join(ROOT, SRC_SUBPATH);
const sharp = createRequire(join(HERE, '../../../apps/web/package.json'))('sharp');

const all = [];
(function walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (!e.name.startsWith('._') && e.name !== '.DS_Store') all.push(relative(base, p).split(sep).join('/')); } })(base);

const mapped = ENTRIES.map((e) => `${e.folder}/${e.file}`);
const dup = mapped.filter((m, i) => mapped.indexOf(m) !== i);
const missing = all.filter((f) => !mapped.includes(f));
const ghost = mapped.filter((m) => !all.includes(m));
const keys = ENTRIES.map((e) => e.key);
const dupKeys = keys.filter((k, i) => keys.indexOf(k) !== i);
if (dup.length || missing.length || ghost.length || dupKeys.length) throw new Error(JSON.stringify({ duplicateMapping: dup, notMapped: missing, mappedButMissingOnDisk: ghost, duplicateKeys: dupKeys }, null, 1));

const out = [];
const bySha = new Map();
for (const e of ENTRIES) {
  const rel = `${e.folder}/${e.file}`;
  const original = readFileSync(join(base, rel));
  const sha256 = createHash('sha256').update(original).digest('hex');
  // HEIC cannot be decoded by sharp: the web/Media Library copy is made from the JPEG produced by convert-heic.ps1 (the original stays untouched)
  const converted = /.heic$/i.test(e.file) ? `_converted/${e.file.replace(/.heic$/i, '.jpg')}` : null;
  const buf = converted ? readFileSync(join(ROOT, converted)) : original;
  let width = null, height = null, readable = true;
  try { const m = await sharp(buf, { failOn: 'none', limitInputPixels: false }).metadata(); width = m.width; height = m.height; await sharp(buf, { failOn: 'none', limitInputPixels: false }).resize(32).raw().toBuffer(); } catch { readable = false; }
  if (e.role === 'unreadable' && readable) throw new Error(`${rel} is now readable — update its role`);
  if (e.role !== 'unreadable' && !readable) throw new Error(`${rel} cannot be decoded`);
  if (bySha.has(sha256)) throw new Error(`byte-identical duplicate: ${rel} = ${bySha.get(sha256)}`);
  bySha.set(sha256, rel);
  out.push({ ...e, rel, sha256, bytes: original.length, width, height, ...(converted ? { converted, convertedSha256: createHash('sha256').update(buf).digest('hex') } : {}) });
}
writeFileSync(join(HERE, 'client-delivery.manifest.json'), JSON.stringify({ source: SRC_SUBPATH, count: out.length, entries: out }, null, 1));
const roles = out.reduce((a, e) => ((a[e.role] = (a[e.role] ?? 0) + 1), a), {});
console.log(JSON.stringify({ files: out.length, roles, duplicatesByBytes: 0 }));
