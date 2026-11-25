// Offline test of nov25/programmes.mjs against an in-memory admin API holding an OLD (22–24 Nov) database state.
// Proves: dry run writes nothing; apply replaces only untouched previous values, keeps editor edits, fills empty fields, adds the legacy
// items, republishes only cleanly published sections, is idempotent, and the generated data matches the website dictionaries.
// Run: node --test deploy/staging/nov25/programmes.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyProgrammes, DATA } from "./programmes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");
const { en } = await import(pathToFileURL(join(ROOT, "apps/web/src/content/en.ts")).href);
const { ar } = await import(pathToFileURL(join(ROOT, "apps/web/src/content/ar.ts")).href);
const PREV = JSON.parse(readFileSync(join(HERE, "programmes.previous.json"), "utf8"));

const uk = (s) => s.replace(/program(?!me)/g, "programme").replace(/Program(?!me)/g, "Programme").replace(/labor/g, "labour").replace(/Labor/g, "Labour").replace(/stabiliz/g, "stabilis");
const isOld = (v, old) => typeof v === "string" && typeof old === "string" && (v.trim() === old.trim() || v.trim() === uk(old).trim());
const blank = (v) => v == null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

/** Database as it was after the 22–24 Nov updates (the previous approved dictionary), with two published sections. */
function oldDb() {
  const programmes = PREV.en.programmes.map((p, i) => {
    const a = PREV.ar.programmes[i];
    return { id: `p${i + 1}`, code: `PRG-0${i + 1}`, kind: "PROGRAMME", status: "PUBLISHED", nameEn: p.name, nameAr: a.name, shortDescEn: p.short, shortDescAr: a.short, summaryEn: p.summary, summaryAr: a.summary, mandateEn: p.mandate, mandateAr: a.mandate, focusAreasEn: p.themes, focusAreasAr: a.themes, outcomesEn: p.outcomes, outcomesAr: a.outcomes, focusAreaDetailsEn: null, focusAreaDetailsAr: null, pageTitleEn: null, pageTitleAr: null };
  });
  const enabling = PREV.en.enabling.map((f, i) => ({ id: `e${i + 1}`, code: `ENB-0${i + 1}`, kind: "ENABLING_FUNCTION", status: "PUBLISHED", nameEn: f.name, nameAr: PREV.ar.enabling[i].name, shortDescEn: f.tagline, shortDescAr: PREV.ar.enabling[i].tagline, summaryEn: f.text, summaryAr: PREV.ar.enabling[i].text }));
  const sec = (id, key, extra) => ({ id, key, status: "PUBLISHED", hasUnpublishedChanges: false, labelsEn: {}, labelsAr: {}, items: [], ...extra });
  return {
    sections: [
      sec("s-prog", "PROGRAMMES", { titleEn: PREV.en.programmesSection.title, bodyEn: PREV.en.programmesSection.intro, bodyAr: PREV.ar.programmesSection.intro, labelsEn: { mandateLabel: "Mandate", themesLabel: "What we do", outcomesLabel: "The change we aim for" }, labelsAr: { mandateLabel: "التكليف", themesLabel: "ما نقوم به", outcomesLabel: "التغيير الذي نسعى إليه" } }),
      sec("s-about", "ABOUT", { labelsEn: { legacy: "x" } }),
    ],
    programmes: [...programmes, ...enabling],
  };
}

function api(db) {
  const log = [];
  const call = async (method, path, body) => {
    if (method !== "GET") log.push({ method, path, body });
    let m;
    if (method === "GET" && path === "/admin/cms/pages/home") return { status: 200, json: { data: { sections: db.sections } } };
    if ((m = /^\/admin\/cms\/sections\/([^/]+)$/.exec(path)) && method === "PATCH") { Object.assign(db.sections.find((s) => s.id === m[1]), body, { hasUnpublishedChanges: true }); return { status: 200, json: { data: {} } }; }
    if ((m = /^\/admin\/cms\/sections\/([^/]+)\/items$/.exec(path)) && method === "POST") { db.sections.find((s) => s.id === m[1]).items.push({ id: `i${log.length}`, ...body }); return { status: 201, json: { data: {} } }; }
    if ((m = /^\/admin\/cms\/sections\/([^/]+)\/publish$/.exec(path))) { Object.assign(db.sections.find((s) => s.id === m[1]), { status: "PUBLISHED", hasUnpublishedChanges: false }); return { status: 200, json: { data: {} }, revalidation: "revalidated" }; }
    if (method === "GET" && (m = /^\/admin\/programmes\?kind=(\w+)/.exec(path))) return { status: 200, json: { data: db.programmes.filter((p) => p.kind === m[1]) } };
    if ((m = /^\/admin\/programmes\/([^/]+)$/.exec(path)) && method === "PATCH") { Object.assign(db.programmes.find((p) => p.id === m[1]), body); return { status: 200, json: { data: {} } }; }
    return { status: 404, json: null };
  };
  const must = (r, what) => { if (r.status >= 300) throw new Error(`${what}: HTTP ${r.status}`); return r.json?.data; };
  return { call, must, log };
}
const run = async (db, DRY) => {
  const a = api(db);
  const report = {};
  const write = async (method, path, body, what) => (DRY ? null : a.must(await a.call(method, path, body), what));
  await applyProgrammes({ call: a.call, must: a.must, write, DRY, isOld, blank, report });
  return { log: a.log, report };
};

test("generated data matches the website dictionaries (EN + AR)", () => {
  assert.equal(DATA.programmes.length, 9);
  DATA.programmes.forEach((p, i) => {
    assert.equal(p.shortDescEn.new, en.programmes.items[i].short);
    assert.equal(p.summaryAr.new, ar.programmes.items[i].summary);
    assert.equal(p.mandateEn.new, en.programmes.items[i].mandate);
    assert.deepEqual(p.focusAreasEn.new, en.programmes.items[i].themes);
    assert.deepEqual(p.focusAreaDetailsAr.new, ar.programmes.items[i].areaTexts);
    assert.deepEqual(p.outcomesEn.new, en.programmes.items[i].outcomes);
  });
  assert.equal(DATA.sections.PROGRAMMES.bodyEn.new, en.programmes.intro);
  assert.deepEqual(DATA.sections.ABOUT.addItems.map((x) => x.textEn), en.about.legacyParas);
});

test("dry run writes nothing but reports the planned changes", async () => {
  const db = oldDb();
  const before = JSON.stringify(db);
  const { log, report } = await run(db, true);
  assert.equal(log.length, 0);
  assert.equal(JSON.stringify(db), before);
  assert.ok(report.programmes25.programmes.every((p) => p.changes.length > 0));
  assert.equal(report.programmes25.sections.find((s) => s.key === "PROGRAMMES").wouldRepublish, true);
});

test("apply: untouched old copy replaced; all nine programmes + three enabling functions carry the new copy; sections republished", async () => {
  const db = oldDb();
  const { report } = await run(db, false);
  db.programmes.filter((p) => p.kind === "PROGRAMME").forEach((p, i) => {
    const e = en.programmes.items[i];
    const a = ar.programmes.items[i];
    assert.equal(p.shortDescEn, e.short); assert.equal(p.shortDescAr, a.short);
    assert.equal(p.summaryEn, e.summary); assert.equal(p.mandateAr, a.mandate);
    assert.deepEqual(p.focusAreasEn, e.themes); assert.deepEqual(p.focusAreaDetailsEn, e.areaTexts); assert.deepEqual(p.focusAreaDetailsAr, a.areaTexts);
    assert.deepEqual(p.outcomesAr, a.outcomes);
    assert.equal(p.nameEn, PREV.en.programmes[i].name, "card names are never touched");
  });
  assert.equal(db.programmes.find((p) => p.code === "PRG-07").pageTitleEn, "Emergency Response & Gaza Relief");
  assert.equal(db.programmes.find((p) => p.code === "PRG-01").pageTitleEn, null);
  assert.equal(db.programmes.find((p) => p.code === "ENB-01").nameEn, "NGO Engagement & Development");
  assert.equal(db.programmes.find((p) => p.code === "ENB-03").summaryEn, en.enabling.items[2].text);
  const prog = db.sections.find((s) => s.key === "PROGRAMMES");
  assert.equal(prog.titleEn, "Nine Programs. One Commitment.");
  assert.equal(prog.bodyEn.split("\n\n").length, 3);
  assert.equal(prog.labelsEn.themesLabel, "Areas of work");
  assert.equal(prog.labelsAr.mandateLabel, ar.programmes.mandateLabel);
  assert.equal(prog.hasUnpublishedChanges, false, "clean published section was republished");
  const about = db.sections.find((s) => s.key === "ABOUT");
  assert.deepEqual(about.items.map((i) => i.code), ["legacy-1", "legacy-2", "legacy-3"]);
  assert.equal(about.labelsEn.legacy, "x", "existing label kept");
  assert.equal(about.labelsEn.legacyTitle, "MEKI Legacy");
  assert.ok(report.programmes25.sections.every((s) => s.republished));
});

test("editor changes are kept; details are never written next to edited titles; pending-edit sections are not republished", async () => {
  const db = oldDb();
  const p1 = db.programmes[0];
  p1.shortDescEn = "An editor wrote this subtitle.";
  p1.focusAreasEn = ["Editor area one", "Editor area two"];
  p1.mandateAr = "تفويض كتبه المحرر";
  db.sections.find((s) => s.key === "PROGRAMMES").hasUnpublishedChanges = true;
  db.sections.find((s) => s.key === "PROGRAMMES").bodyEn = "An editor rewrote the intro.";
  const { report } = await run(db, false);
  assert.equal(p1.shortDescEn, "An editor wrote this subtitle.");
  assert.deepEqual(p1.focusAreasEn, ["Editor area one", "Editor area two"]);
  assert.equal(p1.focusAreaDetailsEn, null, "no description next to edited titles");
  assert.equal(p1.mandateAr, "تفويض كتبه المحرر");
  assert.equal(p1.shortDescAr, ar.programmes.items[0].short, "the untouched Arabic subtitle is still updated");
  const prog = db.sections.find((s) => s.key === "PROGRAMMES");
  assert.equal(prog.bodyEn, "An editor rewrote the intro.");
  assert.equal(prog.hasUnpublishedChanges, true, "left for an editor to publish");
  assert.equal(report.programmes25.sections.find((s) => s.key === "PROGRAMMES").leftForEditor, true);
});

test("idempotent: a second run changes nothing", async () => {
  const db = oldDb();
  await run(db, false);
  const { log } = await run(db, false);
  assert.equal(log.length, 0, JSON.stringify(log.slice(0, 2)));
});
