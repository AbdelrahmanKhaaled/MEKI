// MEKI client edits — "MEKI Website Content (Programs) SHORTENED" (25 Nov 2026): applies the approved programme copy to an EXISTING
// database through the audited admin API (never SQL). Called by the Nov-25 runner with a context built from the same helpers as
// deploy/staging/apply-nov23-client-edits.mjs. Data: programmes.data.json (generated from the website dictionaries by
// build-programmes-data.mjs — a test fails when it is stale).
//
// Safety (same rules as the Nov-23 script):
//  - a database value is replaced ONLY when it still equals a previously seeded/approved value ("old"); an editor's value is kept;
//  - empty fields are filled; nothing is deleted;
//  - area descriptions are written only together with their titles (never next to titles an editor changed);
//  - programmes have no working copy (status only): a DRAFT programme stays a draft; the live website refreshes through the API's
//    own revalidation after each change;
//  - a homepage CMS section is republished ONLY when it was PUBLISHED with no other pending edits before this module touched it
//    (otherwise the change stays in the working copy for an editor to review and publish).
// Requires content.manage, content.publish, programmes.manage (HTTP 403 stops the run; nothing is forced).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA = JSON.parse(readFileSync(join(HERE, 'programmes.data.json'), 'utf8'));

/** @param {{call:Function,must:Function,write:Function,DRY:boolean,isOld:Function,blank:Function,report:object}} ctx */
export async function applyProgrammes(ctx) {
  const { call, must, write, DRY, isOld, blank } = ctx;
  const out = { sections: [], programmes: [], enabling: [] };
  ctx.report.programmes25 = out;
  const oldAny = (v, olds) => (olds ?? []).some((o) => isOld(v, o));
  const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => isOld(x, b[i]));
  const listOldAny = (v, lists) => (lists ?? []).some((l) => sameList(v, l));
  const eqList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => String(x).trim() === String(b[i]).trim());

  // ───────── homepage sections (PROGRAMMES labels + intro; ABOUT legacy) ─────────
  const home = must(await call('GET', '/admin/cms/pages/home'), 'home page');
  for (const [key, spec] of Object.entries(DATA.sections)) {
    const s = home.sections.find((x) => x.key === key);
    if (!s) { out.sections.push({ key, missing: true }); continue; }
    const cleanPublished = s.status === 'PUBLISHED' && !s.hasUnpublishedChanges;
    const changes = [];
    const patch = {};
    for (const field of ['titleEn', 'titleAr', 'bodyEn', 'bodyAr']) {
      const v = spec[field];
      if (v && oldAny(s[field], v.old) && s[field] !== v.new) { patch[field] = v.new; changes.push({ field, to: v.new }); }
    }
    const le = { ...(s.labelsEn ?? {}) };
    const la = { ...(s.labelsAr ?? {}) };
    let labelsTouched = false;
    for (const [k, v] of Object.entries(spec.labels ?? {})) {
      if (oldAny(le[k], v.en.old) && le[k] !== v.en.new) { le[k] = v.en.new; labelsTouched = true; changes.push({ label: `${k}.en`, to: v.en.new }); }
      if (oldAny(la[k], v.ar.old) && la[k] !== v.ar.new) { la[k] = v.ar.new; labelsTouched = true; changes.push({ label: `${k}.ar`, to: v.ar.new }); }
    }
    for (const [k, val] of Object.entries(spec.addLabels?.en ?? {})) if (blank(le[k])) { le[k] = val; labelsTouched = true; changes.push({ label: `${k}.en (added)`, to: val }); }
    for (const [k, val] of Object.entries(spec.addLabels?.ar ?? {})) if (blank(la[k])) { la[k] = val; labelsTouched = true; changes.push({ label: `${k}.ar (added)`, to: val }); }
    if (labelsTouched) { patch.labelsEn = le; patch.labelsAr = la; }
    if (Object.keys(patch).length) await write('PATCH', `/admin/cms/sections/${s.id}`, patch, `section ${key}`);
    for (const [i, ni] of (spec.addItems ?? []).entries()) {
      if ((s.items ?? []).some((x) => x.code === ni.code)) continue;
      changes.push({ addItem: ni.code });
      await write('POST', `/admin/cms/sections/${s.id}/items`, { ...ni, sortOrder: (i + 1) * 10, provenance: 'VERIFIED_SOURCE' }, `add ${ni.code}`);
    }
    let republished = false;
    if (changes.length && cleanPublished && !DRY) {
      const r = await call('POST', `/admin/cms/sections/${s.id}/publish`);
      must(r, `publish ${key}`);
      republished = r.revalidation ?? true;
    }
    out.sections.push({ key, status: s.status, hadPendingEdits: !!s.hasUnpublishedChanges, changes, republished, ...(DRY ? { wouldRepublish: changes.length > 0 && cleanPublished } : {}), leftForEditor: changes.length > 0 && !cleanPublished });
  }

  // ───────── programmes + enabling functions ─────────
  const list = [];
  for (const kind of ['PROGRAMME', 'ENABLING_FUNCTION']) list.push(...(must(await call('GET', `/admin/programmes?kind=${kind}&pageSize=100`), `programmes ${kind}`) ?? []));

  for (const spec of DATA.programmes) {
    const p = list.find((x) => x.code === spec.code);
    if (!p) { out.programmes.push({ code: spec.code, missing: true }); continue; }
    const patch = {};
    for (const L of ['En', 'Ar']) {
      for (const f of ['shortDesc', 'summary', 'mandate']) {
        const v = spec[`${f}${L}`];
        const cur = p[`${f}${L}`];
        if ((blank(cur) || oldAny(cur, v.old)) && cur !== v.new) patch[`${f}${L}`] = v.new;
      }
      const fa = spec[`focusAreas${L}`];
      const titlesAreOld = blank(p[`focusAreas${L}`]) || listOldAny(p[`focusAreas${L}`], fa.old);
      const titlesNow = titlesAreOld ? fa.new : p[`focusAreas${L}`];
      if (titlesAreOld && !eqList(p[`focusAreas${L}`], fa.new)) patch[`focusAreas${L}`] = fa.new;
      // descriptions only next to the approved titles, and only when empty or unchanged
      const det = spec[`focusAreaDetails${L}`];
      if (eqList(titlesNow, fa.new) && blank(p[`focusAreaDetails${L}`])) patch[`focusAreaDetails${L}`] = det.new;
      const oc = spec[`outcomes${L}`];
      if ((blank(p[`outcomes${L}`]) || listOldAny(p[`outcomes${L}`], oc.old)) && !eqList(p[`outcomes${L}`], oc.new)) patch[`outcomes${L}`] = oc.new;
      const pt = spec[`pageTitle${L}`];
      if (pt && blank(p[`pageTitle${L}`])) patch[`pageTitle${L}`] = pt.new;
    }
    if (Object.keys(patch).length) await write('PATCH', `/admin/programmes/${p.id}`, patch, `programme ${spec.code}`);
    out.programmes.push({ code: spec.code, status: p.status, changes: Object.keys(patch) });
  }

  for (const spec of DATA.enabling) {
    const p = list.find((x) => x.code === spec.code);
    if (!p) { out.enabling.push({ code: spec.code, missing: true }); continue; }
    const patch = {};
    for (const L of ['En', 'Ar']) {
      for (const f of ['name', 'shortDesc', 'summary']) {
        const v = spec[`${f}${L}`];
        const cur = p[`${f}${L}`];
        // a name is replaced only when it is the previous approved one (never filled from blank: the Arabic name column may be intentionally empty)
        if (f === 'name' ? oldAny(cur, v.old) : blank(cur) || oldAny(cur, v.old)) if (cur !== v.new) patch[`${f}${L}`] = v.new;
      }
    }
    if (Object.keys(patch).length) await write('PATCH', `/admin/programmes/${p.id}`, patch, `enabling ${spec.code}`);
    out.enabling.push({ code: spec.code, status: p.status, changes: Object.keys(patch) });
  }
  return out;
}
