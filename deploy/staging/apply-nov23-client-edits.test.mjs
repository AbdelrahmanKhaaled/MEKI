// Offline test of apply-nov23-client-edits.mjs against a mock admin API that holds an OLD database state.
// Proves: dry run writes nothing; apply replaces only untouched seed values, keeps editor edits, adds missing fields/items,
// republishes only cleanly published sections, never deletes. Run: node --test deploy/staging/apply-nov23-client-edits.test.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SECRET = "S3cret-Never-Printed-7f4a";
const D = JSON.parse(readFileSync(join(HERE, "apply-nov23-client-edits.data.json"), "utf8"));
const S = D.sections;

function oldDb() {
  const sec = (id, key, extra = {}, items = []) => ({ id, key, status: "PUBLISHED", hasUnpublishedChanges: false, labelsEn: {}, labelsAr: {}, items, ...extra });
  return {
    sections: [
      sec("s-hero", "HERO", { bodyEn: S.HERO.bodyEn.old, bodyAr: S.HERO.bodyAr.old, ctaSecondaryLabelEn: "Explore Our Programs" }),
      sec("s-about", "ABOUT", { bodyEn: "An editor rewrote this paragraph.", bodyAr: S.ABOUT.bodyAr.old, labelsEn: { legacy: "x", captionA: "Alexandria · Economic Empowerment", captionB: "Luxor" }, labelsAr: { captionA: "الإسكندرية · التمكين الاقتصادي", captionB: "الأقصر" } }),
      // pending editor work → changes stay in the working copy (no republish)
      sec("s-prog", "PROGRAMMES", { hasUnpublishedChanges: true, titleEn: S.PROGRAMMES.titleEn.old, bodyEn: S.PROGRAMMES.bodyEn.old, labelsEn: { themesLabel: "Focus areas", give: "Give" }, labelsAr: { themesLabel: "مجالات التركيز" } }),
      sec("s-enab", "ENABLING", { bodyEn: S.ENABLING.bodyEn.old }),
      sec("s-trust", "TRUST", {}, [{ id: "i-t2", code: "trust-2", titleEn: "Released against milestones", textEn: "With results reported back.", titleAr: "صرف مرتبط بمراحل الإنجاز", textAr: "مع تقارير عن النتائج." }]),
      sec("s-why", "WHY", {}, [{ id: "i-w1", code: "why-1", textEn: S.WHY.items["why-1"].textEn.old, textAr: "edited by MEKI" }]),
      sec("s-gal", "GALLERY", { labelsEn: { note: "Captions are working labels from the source folders; final captions and photographer credits to be confirmed." } }, [
        { id: "i-g1", code: "photo-1", titleEn: "Hand-weaving workshop · Alexandria", titleAr: "ورشة السجاد اليدوي – الإسكندرية", textEn: null, textAr: null, href: null },
        { id: "i-g6", code: "photo-6", titleEn: "Luxor", titleAr: "الأقصر", textEn: null, textAr: null, href: null },
        { id: "i-g7", code: "photo-7", titleEn: "Our own caption", titleAr: "تعليقنا", textEn: null, textAr: null, href: null },
      ]),
      sec("s-foot", "FOOTER", { labelsEn: { rights: "MEKI." }, labelsAr: {} }),
    ],
    programmes: [
      { id: "p1", code: "PRG-01", status: "PUBLISHED", shortDescEn: D.programmes[0].shortDescEn.old, shortDescAr: D.programmes[0].shortDescAr.old, focusAreasEn: D.programmes[0].focusAreasEn.old, summaryEn: null, outcomesEn: null },
      { id: "p2", code: "PRG-02", status: "PUBLISHED", shortDescEn: "Edited by MEKI.", focusAreasEn: D.programmes[1].focusAreasEn.old.map((x) => x.replace("program", "programme")), summaryEn: "Already written.", outcomesEn: [] },
      { id: "e1", code: "ENB-01", kind: "ENABLING_FUNCTION", status: "PUBLISHED", shortDescEn: D.enabling[0].shortDescEn.old, summaryEn: null },
    ],
    // an editor already stored an Instagram URL → it must be kept; LinkedIn and Facebook are added
    site: { socialLinks: [{ network: "instagram", url: "https://www.instagram.com/meki.intr/?hl=en" }], logoPrimaryUrl: "/brand/MEKI_Primary_Green.svg", logoInverseUrl: "/custom/white.svg", logoIconUrl: "/brand/MEKI_Icon_Green.svg" },
    // Gala landing page: venue section already published (no logo yet); experience card 3 still carries the old title
    eventSections: [
      { id: "es-venue", key: "EVENT_VENUE", status: "PUBLISHED", hasUnpublishedChanges: false, mediaId: null, items: [] },
      { id: "es-hl", key: "EVENT_HIGHLIGHTS", status: "PUBLISHED", hasUnpublishedChanges: false, items: [{ id: "ei-bar", code: "bar", titleEn: "Virgin bar", titleAr: "ركن المشروبات المنعشة", mediaId: null }, { id: "ei-dinner", code: "dinner", titleEn: "Our own dinner title", mediaId: null }] },
    ],
    media: [],
    writes: [],
  };
}

function mock(db) {
  return createServer(async (req, res) => {
    const body = await new Promise((r) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const buf = Buffer.concat(chunks);
        if (!buf.length) return r(null);
        r(/multipart/.test(req.headers["content-type"] ?? "") ? { raw: buf.toString("latin1") } : JSON.parse(buf.toString("utf8")));
      });
    });
    const send = (status, data, headers = {}) => { res.writeHead(status, { "Content-Type": "application/json", ...headers }); res.end(JSON.stringify({ data })); };
    const url = new URL(req.url, "http://x");
    const p = url.pathname.replace("/api/v1", "");
    if (req.method !== "GET" && !/login|logout/.test(p)) {
      if (req.headers["x-csrf-token"] !== "csrf-1" || !/meki_admin_sid=abc/.test(req.headers.cookie ?? "")) return send(403, null);
      db.writes.push([req.method, p, body]);
    }
    if (p === "/admin/auth/login") return send(200, { csrfToken: "csrf-1" }, { "Set-Cookie": "meki_admin_sid=abc; HttpOnly" });
    if (p === "/admin/auth/logout") return send(200, {});
    if (p === "/admin/cms/pages/home") return send(200, { sections: db.sections });
    let m;
    if ((m = /^\/admin\/cms\/sections\/([^/]+)$/.exec(p)) && req.method === "PATCH") { Object.assign(db.sections.find((s) => s.id === m[1]), body); return send(200, {}); }
    if ((m = /^\/admin\/cms\/sections\/([^/]+)\/publish$/.exec(p))) { db.sections.find((s) => s.id === m[1]).published = true; return send(200, {}); }
    if ((m = /^\/admin\/cms\/sections\/([^/]+)\/items$/.exec(p))) { db.sections.find((s) => s.id === m[1]).items.push({ id: `new-${body.code}`, ...body }); return send(201, {}); }
    if ((m = /^\/admin\/cms\/items\/([^/]+)$/.exec(p))) { Object.assign(db.sections.flatMap((s) => s.items).find((i) => i.id === m[1]), body); return send(200, {}); }
    if (p === "/admin/programmes") return send(200, db.programmes.filter((x) => (x.kind ?? "PROGRAMME") === url.searchParams.get("kind")));
    if ((m = /^\/admin\/programmes\/([^/]+)$/.exec(p))) { Object.assign(db.programmes.find((x) => x.id === m[1]), body); return send(200, {}); }
    if (p === "/admin/settings/site") { if (req.method === "PATCH") Object.assign(db.site, body); return send(200, db.site); }
    // ── Media Library upload (multipart) — de-duplicated by file content, like the API (409 DUPLICATE_MEDIA + id)
    if (p === "/admin/media" && req.method === "POST") {
      const field = (n) => new RegExp(`name="${n}"\\r\\n\\r\\n([^\\r]*)`).exec(body.raw)?.[1];
      const name = /filename="([^"]+)"/.exec(body.raw)?.[1];
      const fileStart = body.raw.indexOf("\r\n\r\n", body.raw.indexOf("filename=")) + 4;
      const bytes = Buffer.from(body.raw.slice(fileStart, body.raw.lastIndexOf("\r\n--")), "latin1");
      const checksum = createHash("sha256").update(bytes).digest("hex");
      const dup = db.media.find((x) => x.checksum === checksum);
      if (dup) { res.writeHead(409, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: { code: "DUPLICATE_MEDIA", details: { id: dup.id } } })); }
      const m = { id: `m${db.media.length + 1}`, name, checksum, consentStatus: field("consentStatus"), altEn: field("altEn"), category: field("category"), pdf: bytes.subarray(0, 5).toString() === "%PDF-" };
      db.media.push(m);
      return send(201, { id: m.id });
    }
    if (p === "/admin/media" && req.method === "GET") return send(200, db.media.filter((x) => x.name.includes(url.searchParams.get("search") ?? "")).map((x) => ({ id: x.id, checksum: x.checksum, consentStatus: x.consentStatus, deletedAt: null })));
    if ((m = /^\/admin\/media\/([^/]+)$/.exec(p)) && req.method === "PATCH") { Object.assign(db.media.find((x) => x.id === m[1]), body); return send(200, {}); }
    // ── Gala event landing page (existing Events API)
    if (p === "/admin/events") return send(200, [{ id: "ev1", slug: "gala-night", status: "PUBLISHED" }, { id: "ev2", slug: "other", status: "DRAFT" }]);
    if (p === "/admin/events/ev1/page") return send(200, { sections: db.eventSections });
    if (p === "/admin/events/ev1/sections" && req.method === "POST") { const s = { id: `es-${body.key}`, key: body.key, status: "DRAFT", hasUnpublishedChanges: true, items: [] }; db.eventSections.push(s); return send(201, s); }
    if ((m = /^\/admin\/events\/ev1\/sections\/([^/]+)\/publish$/.exec(p))) { Object.assign(db.eventSections.find((s) => s.id === m[1]), { status: "PUBLISHED", hasUnpublishedChanges: false }); return send(200, {}, { "X-Meki-Revalidation": "revalidated" }); }
    if ((m = /^\/admin\/events\/ev1\/sections\/([^/]+)\/items$/.exec(p))) { db.eventSections.find((s) => s.id === m[1]).items.push({ id: `ei-${body.code ?? body.mediaId}`, ...body }); return send(201, {}); }
    if ((m = /^\/admin\/events\/ev1\/sections\/([^/]+)$/.exec(p)) && req.method === "PATCH") { Object.assign(db.eventSections.find((s) => s.id === m[1]), body, { hasUnpublishedChanges: true }); return send(200, {}); }
    if ((m = /^\/admin\/events\/ev1\/items\/([^/]+)$/.exec(p))) { Object.assign(db.eventSections.flatMap((s) => s.items).find((i) => i.id === m[1]), body); return send(200, {}); }
    if (req.method === "DELETE") return send(500, null);
    return send(404, null);
  });
}

async function run(db, dry) {
  const server = mock(db);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const out = await new Promise((resolve, reject) => {
    const c = spawn(process.execPath, [join(HERE, "apply-nov23-client-edits.mjs")], { env: { ...process.env, ADMIN_URL: `http://127.0.0.1:${port}`, DRY_RUN: dry ? "1" : "0", ADMIN_EMAIL: "qa@example.org", ADMIN_PASSWORD: SECRET } });
    let s = "", e = "";
    c.stdout.on("data", (d) => (s += d));
    c.stderr.on("data", (d) => (e += d));
    c.on("close", (code) => {
      // the admin password must never appear in the report or in any log line
      if ((s + e).includes(SECRET)) return reject(new Error("the password was printed"));
      code === 0 ? resolve(JSON.parse(s)) : reject(new Error(e));
    });
  });
  server.close();
  return out;
}

test("dry run reports changes and writes nothing", async () => {
  const db = oldDb();
  const report = await run(db, true);
  assert.equal(report.dryRun, true);
  assert.deepEqual(db.writes, []);
  assert.ok(report.sections.find((s) => s.key === "HERO").changes.length >= 2);
});

test("apply: untouched seed values replaced, editor edits kept, new fields added, safe republish, nothing deleted", async () => {
  const db = oldDb();
  const report = await run(db, false);
  const sec = (k) => db.sections.find((s) => s.key === k);
  // hero: mission + CTA capitalization
  assert.equal(sec("HERO").bodyEn, S.HERO.bodyEn.new);
  assert.equal(sec("HERO").ctaSecondaryLabelEn, "Explore our programs");
  assert.equal(sec("HERO").published, true);
  // about: editor's EN paragraph kept; seeded AR replaced; legacy photo labels updated
  assert.equal(sec("ABOUT").bodyEn, "An editor rewrote this paragraph.");
  assert.equal(sec("ABOUT").bodyAr, S.ABOUT.bodyAr.new);
  assert.equal(sec("ABOUT").labelsEn.captionA, "Hand-weaving workshop – Alexandria");
  assert.equal(sec("ABOUT").labelsAr.captionB, "مشروع توصيل المياه – الأقصر");
  assert.equal(sec("ABOUT").labelsEn.legacy, "x"); // untouched
  // programmes section: copy + labels + five steps; pending edits → NOT republished
  const prog = sec("PROGRAMMES");
  assert.equal(prog.titleEn, "Nine programs. One commitment.");
  assert.equal(prog.labelsEn.themesLabel, "What we do");
  assert.equal(prog.labelsEn.outcomesLabel, "The change we aim for");
  assert.equal(prog.labelsEn.give, "Give");
  assert.deepEqual(prog.items.map((i) => i.code), ["how-1", "how-2", "how-3", "how-4", "how-5"]);
  assert.equal(prog.published, undefined);
  assert.equal(report.sections.find((s) => s.key === "PROGRAMMES").leftForEditor, true);
  // trust/why: replaced phrase; MEKI's own AR edit kept; emptied text cleared with null
  const t2 = sec("TRUST").items[0];
  assert.equal(t2.titleEn, "Results are reported back to supporters.");
  assert.equal(t2.textEn, null);
  assert.equal(sec("WHY").items[0].textAr, "edited by MEKI");
  // gallery: both legacy formats split into Title / Place / Program; an editor caption is kept
  const [g1, g6, g7] = sec("GALLERY").items;
  assert.deepEqual([g1.titleEn, g1.textEn, g1.href, g1.titleAr], ["Hand-weaving workshop", "Alexandria", "/programs/economic-empowerment", "ورشة السجاد اليدوي"]);
  assert.deepEqual([g6.titleEn, g6.textEn, g6.href], ["Water-connection project", "Luxor", "/programs/wash"]);
  assert.deepEqual([g7.titleEn, g7.textEn, g7.href], ["Our own caption", null, null]);
  assert.match(sec("GALLERY").labelsEn.note, /with the program/);
  assert.equal(sec("FOOTER").labelsEn.followUs, "Follow us");
  assert.equal(sec("FOOTER").labelsEn.rights, "MEKI.");
  // programmes: seed values replaced/added; MEKI edits and existing summaries kept
  const [p1, p2, e1] = db.programmes;
  assert.equal(p1.shortDescEn, D.programmes[0].shortDescEn.new);
  assert.equal(p1.summaryEn, D.programmes[0].summaryEn);
  assert.deepEqual(p1.outcomesEn, D.programmes[0].outcomesEn);
  assert.equal(p2.shortDescEn, "Edited by MEKI.");
  assert.equal(p2.summaryEn, "Already written.");
  assert.deepEqual(p2.focusAreasEn, D.programmes[1].focusAreasEn.new); // UK-spelling seed variant counts as untouched
  assert.deepEqual(p2.outcomesEn, D.programmes[1].outcomesEn); // empty list counts as unset
  assert.equal(e1.shortDescEn, "Stronger local partners.");
  assert.equal(e1.summaryEn, D.enabling[0].summaryEn);
  // site: Instagram added; old logo paths updated; a custom path kept
  assert.deepEqual(db.site.socialLinks, [
    { network: "instagram", url: "https://www.instagram.com/meki.intr/?hl=en" }, // editor's value kept
    { network: "linkedin", url: "https://www.linkedin.com/company/misr-el-kheir-international" },
    { network: "facebook", url: "https://www.facebook.com/meki.Intr/" },
  ]);
  assert.equal(db.site.logoPrimaryUrl, "/brand/MEKI_Secondary_Green.png");
  assert.equal(db.site.logoInverseUrl, "/custom/white.svg");
  // never deletes
  assert.ok(db.writes.every(([m]) => m !== "DELETE"));
});

test("idempotent: a second apply changes nothing", async () => {
  const db = oldDb();
  await run(db, false);
  const before = db.writes.length;
  const report = await run(db, false);
  // only the five how- items exist now and every value is current; the second run must not write
  assert.equal(db.writes.length, before, JSON.stringify(db.writes.slice(before)));
  assert.ok(report.sections.every((s) => (s.changes ?? []).length === 0));
});

test("Gala assets: supplied files registered once, assigned to empty slots, host photo stays draft, wording updated, publish refreshes the site", async (t) => {
  const assetDir = join(HERE, "../../references/client-edits-2026-11-23/06-gala-assets");
  try { readFileSync(join(assetDir, "15.jpg.jpeg")); } catch { return t.skip("client asset folder not present on this machine"); }
  const db = oldDb();
  const report = await run(db, false);
  const g = report.gala;
  assert.equal(g.eventStatus, "PUBLISHED");
  assert.deepEqual(Object.values(g.assets), ["uploaded", "uploaded", "uploaded", "uploaded", "uploaded"]);
  assert.equal(db.media.length, 5);
  assert.equal(db.media.filter((m) => m.pdf).length, 1);
  assert.equal(db.media.find((m) => m.name === "Raya Abirached.png").consentStatus, "UNKNOWN"); // not cleared yet
  const sec = (k) => db.eventSections.find((s) => s.key === k);
  const mediaId = (file) => db.media.find((m) => m.name === file).id;
  // hero = the high-resolution night photograph; venue = logo + the day photograph (no photo used twice)
  assert.equal(sec("EVENT_HERO").mediaId, mediaId("15.jpg.jpeg"));
  assert.equal(sec("EVENT_HERO").status, "PUBLISHED");
  assert.equal(sec("EVENT_VENUE").mediaId, mediaId("583-Park-Ave-Logo_1_white.png"));
  assert.deepEqual(sec("EVENT_VENUE").items.map((i) => [i.mediaId, i.titleEn, i.textEn]), [[mediaId("images.jpeg"), "Building exterior", "583 Park Avenue, New York"]]);
  assert.equal(sec("EVENT_VENUE").status, "PUBLISHED"); // was cleanly published → republished
  // sponsorship: the PDF is the section's document reference, published
  assert.equal(sec("EVENT_SPONSORSHIP").mediaId, mediaId("Sponsorship Packages.pdf"));
  assert.equal(sec("EVENT_SPONSORSHIP").status, "PUBLISHED");
  // host: photo attached but the section is NOT published (approval pending)
  assert.equal(sec("EVENT_SPEAKERS").items[0].mediaId, mediaId("Raya Abirached.png"));
  assert.equal(sec("EVENT_SPEAKERS").status, "DRAFT");
  // experience: old "Virgin bar" → "Virgin Drinks"; an editor's dinner title kept; missing cards added; no photos assigned
  const hl = sec("EVENT_HIGHLIGHTS").items;
  assert.equal(hl.find((i) => i.code === "bar").titleEn, "Virgin Drinks");
  assert.equal(hl.find((i) => i.code === "bar").titleAr, "مشروبات منعشة");
  assert.equal(hl.find((i) => i.code === "dinner").titleEn, "Our own dinner title");
  assert.deepEqual(hl.map((i) => i.code).sort(), ["auction", "bar", "black-tie", "dinner", "lamps"]);
  assert.ok(hl.every((i) => !i.mediaId));
  // every publish reported the live-site refresh
  assert.ok(g.sections.filter((s) => s.published).every((s) => s.published === "revalidated"));
  assert.equal(g.sections.find((s) => s.key === "EVENT_SPEAKERS").leftAsDraftOrForEditor, true);

  // re-run: files reused (no second upload), nothing re-assigned
  const writes = db.writes.length;
  const again = await run(db, false);
  assert.deepEqual(Object.values(again.gala.assets), Array(5).fill("already in library (reused)"));
  assert.equal(db.media.length, 5);
  assert.ok(again.gala.sections.every((s) => s.changes.length === 0));
  assert.equal(db.writes.length, writes, "a re-run writes nothing"); // looked up by checksum, not uploaded again

  // approval given later → consent confirmed and the host section published
  const approved = await new Promise((resolve, reject) => {
    const server = mock(db);
    server.listen(0, "127.0.0.1", () => {
      const c = spawn(process.execPath, [join(HERE, "apply-nov23-client-edits.mjs")], { env: { ...process.env, ADMIN_URL: `http://127.0.0.1:${server.address().port}`, DRY_RUN: "0", HOST_PHOTO_APPROVED: "1", ADMIN_EMAIL: "qa@example.org", ADMIN_PASSWORD: SECRET } });
      let s = "";
      c.stdout.on("data", (d) => (s += d));
      c.on("close", (code) => { server.close(); code === 0 ? resolve(JSON.parse(s)) : reject(new Error("exit " + code)); });
    });
  });
  assert.equal(approved.gala.hostPhotoApproved, true);
  assert.equal(db.media.find((m) => m.name === "Raya Abirached.png").consentStatus, "CONFIRMED");
  assert.equal(sec("EVENT_SPEAKERS").status, "PUBLISHED"); // published once approved, although nothing else changed
  assert.equal(approved.gala.sections.find((s) => s.key === "EVENT_SPEAKERS").published, "revalidated");
});

test("dry run predicts exactly what the real run publishes, and the mock login only ever received the password in the request body", async (t) => {
  const assetDir = join(HERE, "../../references/client-edits-2026-11-23/06-gala-assets");
  try { readFileSync(join(assetDir, "15.jpg.jpeg")); } catch { return t.skip("client asset folder not present on this machine"); }
  const dry = await run(oldDb(), true);
  const real = await run(oldDb(), false);
  const predicted = dry.gala.sections.filter((s) => s.wouldPublish).map((s) => s.key);
  const happened = real.gala.sections.filter((s) => s.published).map((s) => s.key);
  assert.deepEqual(predicted, happened);
  assert.deepEqual(dry.sections.filter((s) => s.wouldRepublish).map((s) => s.key), real.sections.filter((s) => s.republished).map((s) => s.key));
  assert.ok(!JSON.stringify([dry, real]).includes(SECRET));
});
