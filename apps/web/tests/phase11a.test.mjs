// Phase 11A — single programme pages (docs/46). Run: pnpm --filter @meki/web test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const src = (p) => readFileSync(join(import.meta.dirname, "../src", p), "utf8");
const page = src("app/[locale]/programs/[slug]/page.tsx");
const sections = src("components/programme/ProgrammeSections.tsx");
const donate = src("components/programme/ProgrammeDonate.tsx");

test("routing: only the nine approved programmes (dynamicParams=false); API 404 (unpublished/DEMO) → page 404", () => {
  assert.match(page, /export const dynamicParams = false;/);
  assert.match(page, /en\.programmes\.items\.map\(\(p\) => \(\{ locale, slug: p\.slug \}\)\)/);
  assert.match(page, /if \(res\.status === "not_found"\) notFound\(\);/);
  assert.match(page, /canonical: path, languages: \{ en: `\/en\/programs\/\$\{slug\}`, ar: `\/ar\/programs\/\$\{slug\}`/);
});

test("fundraising: progress only from the API's approved goal; no goal → designed state; API down → 'unavailable', never a guessed figure", () => {
  assert.match(sections, /const pr = fundraising\?\.progress \?\? null;/);
  assert.match(sections, /\{unavailable \? \(/);
  assert.match(sections, /p\.funding\.noGoalTitle/);
  assert.match(page, /unavailable=\{!d\}/);
  assert.match(sections, /role="progressbar"/);
  assert.match(sections, /aria-valuetext=/);
  // the page never computes money itself: it only formats the API's decimal strings
  assert.doesNotMatch(sections, /reduce\(\(a, ?b\) => a ?\+ ?b|parseFloat\(.*collected|\* 100\)/);
});

test("donation designation is fixed to this programme by slug; no fake success; monthly only when the live config allows it", () => {
  assert.match(donate, /designation: "PROGRAMME",\s*slug,/);
  assert.match(donate, /source: "programme-page"/);
  assert.match(donate, /const monthlyAllowed = live && config\.frequencies\.includes\("MONTHLY"\);/);
  assert.match(donate, /if \(!live \|\| !currency\) \{\s*open\(\{ amount: formatUSD\(value, locale\), frequency: freqLabel, destination: name \}\);/);
  assert.doesNotMatch(donate, /checkoutUrl|window\.location|fetch\(/);
  const provider = src("components/DonateProvider.tsx");
  assert.match(provider, /attribution: \{ source: choice\.source \?\? "landing-quick-donate" \}/); // homepage default unchanged
});

test("API media URLs go through toMediaRef/resolveMedia (curated photos stay local; uploads stay on the API origin)", () => {
  assert.match(page, /const ref = toMediaRef\(m\);/);
  assert.match(sections, /const ref = toMediaRef\(c\.cover\);/);
});

test("campaign lists are never silently truncated (first six + native 'show all' disclosure)", () => {
  assert.match(sections, /items\.slice\(0, 6\)/);
  assert.match(sections, /<details className="group mt-5">/);
});

test("the homepage does not import any programme-page component", () => {
  const home = src("app/[locale]/page.tsx");
  assert.doesNotMatch(home, /components\/programme\//);
});

test("programs listing links every card to its programme page; sitemap lists programme pages", () => {
  assert.match(src("components/pages/ProgramsGrid.tsx"), /href=\{hrefFor\(item\.slug\)\}/);
  assert.match(src("app/sitemap.ts"), /programmeSitemapEntries\(siteOrigin\(\), en\.programmes\.items\.map\(\(p\) => p\.slug\)\)/);
});
