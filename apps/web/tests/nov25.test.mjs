// MEKI "Programs" Word document (MEKI Website Content (Programs) SHORTENED, 25 Nov 2026) — programme copy, EN + AR, CMS merge.
// Run: pnpm --filter @meki/web test
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const SRC = join(import.meta.dirname, "../src") + "/";
// content.ts uses the "@/" alias and the API client (parameter properties are not strip-types compatible): resolve the alias, stub the client.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === "@/lib/api") return { url: "data:text/javascript,export const fetchPublicContent=async()=>null;", shortCircuit: true };
    if (spec.startsWith("@/")) {
      const base = SRC + spec.slice(2);
      for (const ext of [".ts", ".tsx", "/index.ts"]) if (existsSync(base + ext)) return next(pathToFileURL(base + ext).href, ctx);
    }
    return next(spec, ctx);
  },
});
const { en } = await import("../src/content/en.ts");
const { ar } = await import("../src/content/ar.ts");
const { mergeContent } = await import(pathToFileURL(SRC + "lib/content.ts").href);
const { SUPERSEDED_PROGRAMMES } = await import("../src/content/superseded-programmes.ts");
const src = (p) => readFileSync(join(SRC, p), "utf8");

const AREAS = [2, 3, 3, 3, 3, 3, 3, 3, 3];
const OUTCOMES = [4, 5, 5, 5, 5, 5, 4, 4, 5];

test("nine programs × EN/AR: title, subtitle, summary, mandate, areas (title + description), outcomes are all present", () => {
  for (const [loc, d] of [["en", en], ["ar", ar]]) {
    assert.equal(d.programmes.items.length, 9);
    d.programmes.items.forEach((p, i) => {
      for (const k of ["name", "short", "summary", "mandate"]) assert.ok(p[k]?.trim(), `${loc} ${p.slug} ${k}`);
      assert.equal(p.themes.length, AREAS[i], `${loc} ${p.slug} areas`);
      assert.equal(p.areaTexts.length, AREAS[i], `${loc} ${p.slug} area texts`);
      assert.ok(p.themes.every(Boolean) && p.areaTexts.every(Boolean));
      assert.equal(p.outcomes.length, OUTCOMES[i], `${loc} ${p.slug} outcomes`);
      assert.ok(p.mandate.split("\n\n").length >= 2, `${loc} ${p.slug} mandate paragraphs`);
    });
  }
});

test("Arabic fields contain Arabic text; English fields do not", () => {
  const arabic = /[؀-ۿ]/;
  for (const p of ar.programmes.items) assert.ok(arabic.test(p.short + p.summary + p.mandate + p.themes.join("") + p.areaTexts.join("") + p.outcomes.join("")), p.slug);
  for (const p of en.programmes.items) assert.doesNotMatch(p.short + p.summary + p.mandate + p.themes.join("") + p.areaTexts.join("") + p.outcomes.join(""), arabic, p.slug);
});

test("approved English wording (spot checks against the Word document)", () => {
  const [social, health, edu, econ, housing, wash, emergency, heritage, science] = en.programmes.items;
  assert.equal(en.programmes.title, "Nine Programs. One Commitment.");
  assert.equal(en.programmes.intro.split("\n\n").length, 3);
  assert.match(en.programmes.intro, /^Building on 20 years of experience addressing the diverse needs of communities across Egypt, Misr El-Kheir champions/);
  assert.match(en.programmes.intro, /It is about what becomes possible for the people we serve\.$/);
  assert.equal(social.summary, "Protecting vulnerable individuals and households from severe hardship while alleviating basic needs gaps, strengthening household stability and preserving dignity.");
  assert.equal(health.short, "Making Healthcare More Accessible. Improving National Health Ecosystems.");
  assert.equal(edu.short, "Expanding Opportunity Through Supporting Learner’s Journey.");
  assert.equal(econ.themes[1], "Expanding Access to Productive Opportunities");
  assert.equal(housing.outcomes[4], "Stronger resilience among vulnerable families.");
  assert.equal(wash.short, "Safer Water. Healthier Communities. A More Resilient Future.");
  assert.equal(heritage.themes[0], "Preserving Heritage and Cultural Identity");
  assert.equal(science.outcomes[4], "Stronger connections between research, innovation, and societal needs.");
  assert.equal(emergency.name, "Emergency Response");
  assert.equal(emergency.pageTitle, "Emergency Response & Gaza Relief", "page title as in the Word document; no other programme has one");
  assert.deepEqual(en.programmes.items.filter((p) => p.pageTitle).map((p) => p.slug), ["emergency-response"]);
  assert.equal(ar.programmes.items.find((p) => p.pageTitle).pageTitle, "الاستجابة للطوارئ وإغاثة غزة");
});

test("no 'MEK' brand typo (MEK without the I) and no 'Gaza' misspelling in program, enabling and legacy copy", () => {
  const all = JSON.stringify([en.programmes, en.enabling, en.about.legacyParas, ar.programmes, ar.enabling, ar.about.legacyParas]);
  assert.doesNotMatch(all, /\bMEK\b(?!I)/);
  assert.doesNotMatch(all, /\bGaz\b|\bGazza\b|\bGhaza\b/);
  assert.match(JSON.stringify(en.programmes), /Gaza Relief/);
});

test("enabling functions and MEKI Legacy carry the Word document copy (EN + AR)", () => {
  assert.deepEqual(en.enabling.items.map((i) => i.name), ["NGO Engagement & Development", "Field Offices", "Business Intelligence"]);
  assert.match(en.enabling.items[0].text, /governance and capabilities of local nonprofit organizations enables development interventions to reach more communities effectively and sustainably through a network of 4000\+ development partners\.$/);
  assert.match(en.enabling.items[1].text, /^MEKI outreach and field base spans across all governorates/);
  assert.equal(en.about.legacyTitle, "MEKI Legacy");
  assert.equal(en.about.legacyTagline, "Building on 20 Years of Outreach and Impact. Creating Opportunities for Generations to Come.");
  assert.equal(en.about.legacyParas.length, 3);
  assert.equal(ar.about.legacyParas.length, 3);
  assert.match(en.about.legacyParas[0], /^Misr El-Kheir Foundation has stood on the forefront/);
});

test("the About page renders the legacy section and the programme page renders areas in order: mandate → areas → outcomes", () => {
  assert.match(src("app/[locale]/about/page.tsx"), /t\.about\.legacyParas\.map/);
  const sec = src("components/programme/ProgrammeSections.tsx");
  assert.match(sec, /export function ProgrammeAreas/);
  assert.match(sec, /item\.areaTexts/);
  const page = src("app/[locale]/programs/[slug]/page.tsx");
  const order = ["<ProgrammeOverview", "<ProgrammeAreas", "<ProgrammeFundraising"].map((k) => page.indexOf(k));
  assert.ok(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), `section order ${order}`);
  assert.match(sec, /item\.pageTitle \|\| item\.name/);
});

const db = (overrides = {}) => ({
  page: { sections: [], seoTitle: null, seoDescription: null },
  programmes: en.programmes.items.map((p, i) => ({ id: `p${i}`, slug: p.slug, kind: "PROGRAMME", number: i + 1, name: p.name, shortDesc: null, mandate: null, description: null, focusAreas: null, summary: null, outcomes: null, icon: p.icon, cover: null, gallery: [], ...overrides })),
  campaigns: [], statistics: [], faqs: [], site: {},
});
const old = (loc) => SUPERSEDED_PROGRAMMES[loc].programmes;

for (const [loc, d] of [["en", en], ["ar", ar]]) {
  test(`merge (${loc}): database values still holding the 22–24 Nov copy never mask the new built-in copy`, () => {
    const home = db();
    home.programmes.forEach((p, i) => {
      const o = old(loc)[p.slug];
      Object.assign(p, { shortDesc: o.short[0], summary: o.summary[0], mandate: o.mandate[0], focusAreas: o.themes[0], outcomes: o.outcomes[0] });
    });
    const t = mergeContent(d, home);
    t.programmes.items.forEach((p, i) => {
      assert.deepEqual({ short: p.short, summary: p.summary, mandate: p.mandate, themes: p.themes, areaTexts: p.areaTexts, outcomes: p.outcomes }, { short: d.programmes.items[i].short, summary: d.programmes.items[i].summary, mandate: d.programmes.items[i].mandate, themes: d.programmes.items[i].themes, areaTexts: d.programmes.items[i].areaTexts, outcomes: d.programmes.items[i].outcomes }, p.slug);
    });
  });
}

test("merge: admin-edited values win; descriptions stay in step with the titles", () => {
  const home = db();
  home.programmes[0] = { ...home.programmes[0], shortDesc: "Admin subtitle", mandate: "Admin mandate.\n\nSecond paragraph.", focusAreas: ["Admin area"], focusAreaDetails: ["Admin description"], outcomes: ["Admin outcome"], summary: "Admin summary", pageTitle: "Admin page title" };
  // titles edited but no descriptions saved → no stale built-in descriptions next to them
  home.programmes[1] = { ...home.programmes[1], focusAreas: ["Edited one", "Edited two"], focusAreaDetails: null };
  const t = mergeContent(en, home);
  const p = t.programmes.items[0];
  assert.equal(p.short, "Admin subtitle");
  assert.equal(p.mandate, "Admin mandate.\n\nSecond paragraph.");
  assert.deepEqual(p.themes, ["Admin area"]);
  assert.deepEqual(p.areaTexts, ["Admin description"]);
  assert.deepEqual(p.outcomes, ["Admin outcome"]);
  assert.equal(p.summary, "Admin summary");
  assert.equal(p.pageTitle, "Admin page title");
  assert.deepEqual(t.programmes.items[1].areaTexts, ["", ""]);
  assert.equal(t.programmes.items[2].short, en.programmes.items[2].short, "empty database fields fall back to the built-in copy");
});

test("merge: CMS-managed legacy (ABOUT labels + items) and enabling functions", () => {
  const home = db();
  home.page.sections = [{ key: "ABOUT", eyebrow: null, title: null, subtitle: null, body: null, labels: { legacyTitle: "Our Legacy (edited)", legacyTagline: "Edited tagline" }, items: [{ code: "legacy-1", text: "Edited paragraph one" }, { code: "legacy-2", text: "Two" }], media: null }];
  home.programmes.push(...en.enabling.items.map((f, i) => ({ id: `e${i}`, slug: `e${i}`, kind: "ENABLING_FUNCTION", number: null, name: i === 0 ? "NGO Development" : f.name, shortDesc: i === 0 ? "Stronger local partners." : f.tagline, summary: i === 0 ? SUPERSEDED_PROGRAMMES.en.enabling[0].text[0] : "Admin text " + i, icon: f.icon, cover: null, gallery: [] })));
  const t = mergeContent(en, home);
  assert.equal(t.about.legacyTitle, "Our Legacy (edited)");
  assert.deepEqual(t.about.legacyParas, ["Edited paragraph one", "Two"]);
  assert.equal(t.enabling.items[0].name, "NGO Engagement & Development", "previous approved name is replaced");
  assert.equal(t.enabling.items[0].tagline, en.enabling.items[0].tagline);
  assert.equal(t.enabling.items[1].text, "Admin text 1", "admin text kept");
});
