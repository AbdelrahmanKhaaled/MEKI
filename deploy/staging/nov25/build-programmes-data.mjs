#!/usr/bin/env node
// Generates the data of the 25 Nov 2026 programme-copy update from the SAME source as the website (apps/web/src/content/en.ts / ar.ts):
//   deploy/staging/nov25/programmes.data.json            (read by programmes.mjs; "old" = values an untouched database may still hold)
//   apps/web/src/content/superseded-programmes.ts        (read by the website's merge: such DB values never mask the new built-in copy)
// "old" values = the 23/24 Nov approved dictionary (programmes.previous.json) + the pre-23-Nov seed values (apply-nov23-client-edits.data.json).
// Run after editing the copy:  node deploy/staging/nov25/build-programmes-data.mjs   (a test fails when the generated files are stale).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');
const { en } = await import(pathToFileURL(join(ROOT, 'apps/web/src/content/en.ts')).href);
const { ar } = await import(pathToFileURL(join(ROOT, 'apps/web/src/content/ar.ts')).href);
const prev = JSON.parse(readFileSync(join(HERE, 'programmes.previous.json'), 'utf8'));
const n23 = JSON.parse(readFileSync(join(ROOT, 'deploy/staging/apply-nov23-client-edits.data.json'), 'utf8'));
const uniq = (a) => [...new Set(a.filter((x) => x != null && x !== ''))];

const programmes = en.programmes.items.map((p, i) => {
  const a = ar.programmes.items[i];
  const pv = { en: prev.en.programmes[i], ar: prev.ar.programmes[i] };
  const code = `PRG-${p.n}`;
  const old23 = n23.programmes.find((x) => x.code === code) ?? {};
  const o = (loc) => ({
    shortDesc: uniq([pv[loc].short, old23[`shortDesc${loc === 'en' ? 'En' : 'Ar'}`]?.old]),
    summary: uniq([pv[loc].summary]),
    mandate: uniq([pv[loc].mandate]),
    focusAreas: [pv[loc].themes, old23[`focusAreas${loc === 'en' ? 'En' : 'Ar'}`]?.old].filter(Boolean),
    outcomes: [pv[loc].outcomes],
  });
  const row = { code, slug: p.slug };
  for (const [loc, L, d] of [['en', 'En', p], ['ar', 'Ar', a]]) {
    const old = o(loc);
    row[`shortDesc${L}`] = { old: old.shortDesc, new: d.short };
    row[`summary${L}`] = { old: old.summary, new: d.summary };
    row[`mandate${L}`] = { old: old.mandate, new: d.mandate };
    row[`focusAreas${L}`] = { old: old.focusAreas, new: d.themes };
    row[`focusAreaDetails${L}`] = { new: d.areaTexts };
    row[`outcomes${L}`] = { old: old.outcomes, new: d.outcomes };
    if (d.pageTitle) row[`pageTitle${L}`] = { new: d.pageTitle };
  }
  return row;
});

const enabling = en.enabling.items.map((f, i) => {
  const code = `ENB-0${i + 1}`;
  const old23 = n23.enabling.find((x) => x.code === code) ?? {};
  const row = { code };
  for (const [loc, L, d] of [['en', 'En', f], ['ar', 'Ar', ar.enabling.items[i]]]) {
    const pv = prev[loc].enabling[i];
    row[`name${L}`] = { old: uniq([pv.name]), new: d.name };
    row[`shortDesc${L}`] = { old: uniq([pv.tagline, old23[`shortDesc${L}`]?.old]), new: d.tagline };
    row[`summary${L}`] = { old: uniq([pv.text]), new: d.text };
  }
  return row;
});

const data = {
  generatedFrom: 'apps/web/src/content/en.ts + ar.ts (build-programmes-data.mjs) — do not edit by hand',
  sections: {
    PROGRAMMES: {
      titleEn: { old: uniq([prev.en.programmesSection.title]), new: en.programmes.title },
      bodyEn: { old: uniq([prev.en.programmesSection.intro]), new: en.programmes.intro },
      bodyAr: { old: uniq([prev.ar.programmesSection.intro]), new: ar.programmes.intro },
      labels: {
        mandateLabel: { en: { old: ['Mandate'], new: en.programmes.mandateLabel }, ar: { old: ['التكليف'], new: ar.programmes.mandateLabel } },
        themesLabel: { en: { old: ['What we do', 'Focus areas'], new: en.programmes.themesLabel }, ar: { old: ['ما نقوم به', 'مجالات التركيز'], new: ar.programmes.themesLabel } },
        outcomesLabel: { en: { old: ['The change we aim for'], new: en.programmes.outcomesLabel }, ar: { old: ['التغيير الذي نسعى إليه'], new: ar.programmes.outcomesLabel } },
      },
    },
    ABOUT: {
      addLabels: { en: { legacyTitle: en.about.legacyTitle, legacyTagline: en.about.legacyTagline }, ar: { legacyTitle: ar.about.legacyTitle, legacyTagline: ar.about.legacyTagline } },
      addItems: en.about.legacyParas.map((t, i) => ({ code: `legacy-${i + 1}`, textEn: t, textAr: ar.about.legacyParas[i] })),
    },
  },
  programmes,
  enabling,
};
writeFileSync(join(HERE, 'programmes.data.json'), JSON.stringify(data, null, 1) + '\n');

// ── website: superseded values (per locale), used by mergeContent ──
const sup = (loc) => {
  const L = loc === 'en' ? 'En' : 'Ar';
  return {
    programmes: Object.fromEntries(programmes.map((p) => [p.slug, {
      short: p[`shortDesc${L}`].old, summary: p[`summary${L}`].old, mandate: p[`mandate${L}`].old,
      themes: p[`focusAreas${L}`].old, outcomes: p[`outcomes${L}`].old,
    }])),
    enabling: enabling.map((f) => ({ name: f[`name${L}`].old, tagline: f[`shortDesc${L}`].old, text: f[`summary${L}`].old })),
  };
};
const header = `/* GENERATED by deploy/staging/nov25/build-programmes-data.mjs — do not edit.
 * Programme copy a database may still hold from before the 25 Nov 2026 Programs Word document (the 22–24 Nov approved copy and the
 * original seed). A published CMS value equal to one of these was never edited by an admin, so the new built-in copy wins;
 * any other (admin-written) value is shown as written. */
export type SupersededProgrammeCopy = {
  programmes: Record<string, { short: string[]; summary: string[]; mandate: string[]; themes: string[][]; outcomes: string[][] }>;
  enabling: { name: string[]; tagline: string[]; text: string[] }[];
};
`;
writeFileSync(join(ROOT, 'apps/web/src/content/superseded-programmes.ts'), `${header}export const SUPERSEDED_PROGRAMMES: Record<"en" | "ar", SupersededProgrammeCopy> = ${JSON.stringify({ en: sup('en'), ar: sup('ar') }, null, 2)};\n`);
console.log('written', programmes.length, 'programmes,', enabling.length, 'enabling');
