// Offline tests of nov25/site.mjs (menus + site settings) and nov25/images.mjs (photo delivery) against an in-memory admin API.
// Run: node --test deploy/staging/nov25/site-images.test.mjs
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { applySite, isLegacyAnchor, MENUS } from "./site.mjs";
import { applyImages, MANIFEST, mediaSpec } from "./images.mjs";

const ok = (data) => ({ status: 200, json: { data }, revalidation: "revalidated" });
const blank = (v) => v == null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
const STATIC = { url: "/images/work/hero-field.webp" };

function world() {
  let n = 0;
  const w = {
    writes: [],
    published: [],
    site: { contactEmail: null, socialLinks: [{ network: "instagram", url: "https://www.instagram.com/meki.intr/" }] },
    home: {
      sections: [
        { id: "hero", key: "HERO", status: "PUBLISHED", hasUnpublishedChanges: false, mediaId: "old-hero", media: STATIC, labelsEn: {}, labelsAr: {}, items: [] },
        { id: "gal", key: "GALLERY", status: "PUBLISHED", hasUnpublishedChanges: false, items: Array.from({ length: 7 }, (_, i) => ({ id: `g${i}`, code: null, isVisible: true, titleEn: `Seeded ${i}`, media: STATIC })) },
        {
          id: "foot", key: "FOOTER", status: "PUBLISHED", hasUnpublishedChanges: false,
          items: [
            ...["#who-we-are", "#programmes", "#impact", "#campaigns", "#giving", "#faq"].map((h, i) => ({ id: `n${i}`, code: `nav-${i + 1}`, sortOrder: i, isVisible: true, titleEn: `Old ${i}`, href: h })),
            ...["#give", "#giving", "#faq"].map((h, i) => ({ id: `v${i}`, code: `giving-${i + 1}`, sortOrder: 20 + i, isVisible: true, titleEn: `Old giving ${i}`, href: h })),
          ],
        },
      ],
    },
    programmes: ["social-solidarity", "health", "education", "economic-empowerment", "housing", "wash", "emergency-response", "heritage-culture", "scientific-research"].map((slug) => ({ id: `p-${slug}`, slug, coverMediaId: null, coverMedia: null, gallery: [] })),
  };
  const find = (id) => w.home.sections.flatMap((s) => s.items ?? []).find((i) => i.id === id) ?? w.home.sections.find((s) => s.id === id);
  w.call = async (method, path) => {
    let m;
    if (path === "/admin/cms/pages/home") return ok(w.home);
    if (path === "/admin/settings/site") return ok(w.site);
    if (path.startsWith("/admin/programmes?")) return ok(w.programmes);
    if ((m = /^\/admin\/programmes\/([^/]+)$/.exec(path))) return ok(w.programmes.find((p) => p.id === m[1]));
    if ((m = /^\/admin\/cms\/sections\/([^/]+)\/publish$/.exec(path))) {
      const s = find(m[1]);
      Object.assign(s, { status: "PUBLISHED", hasUnpublishedChanges: false });
      w.published.push(s.key);
      return ok({});
    }
    return { status: 404, json: null };
  };
  w.write = async (method, path, body) => {
    w.writes.push([method, path, body]);
    let m;
    if ((m = /^\/admin\/cms\/sections\/([^/]+)\/items$/.exec(path))) {
      const s = find(m[1]);
      const it = { id: `new${++n}`, isVisible: true, ...body };
      if (body.mediaId) it.media = { url: "https://api/media/x.webp" };
      s.items.push(it);
      s.hasUnpublishedChanges = true;
    } else if ((m = /^\/admin\/cms\/items\/(.+)$/.exec(path))) {
      const it = find(m[1]);
      Object.assign(it, body);
      if (body.mediaId) it.media = { url: "https://api/media/x.webp" };
    } else if ((m = /^\/admin\/cms\/sections\/(.+)$/.exec(path))) {
      const s = find(m[1]);
      Object.assign(s, body);
      if (body.mediaId) s.media = { url: "https://api/media/x.webp" };
      s.hasUnpublishedChanges = true;
    } else if (path === "/admin/settings/site") Object.assign(w.site, body);
    else if ((m = /^\/admin\/programmes\/([^/]+)\/gallery$/.exec(path))) w.programmes.find((p) => p.id === m[1]).gallery = body.mediaIds.map((id) => ({ id }));
    else if ((m = /^\/admin\/programmes\/([^/]+)$/.exec(path))) {
      const p = w.programmes.find((x) => x.id === m[1]);
      Object.assign(p, body);
      if (body.coverMediaId) p.coverMedia = { url: "https://api/media/c.webp" };
    }
    return {};
  };
  return w;
}
const ctx = (w, DRY = false, extra = {}) => ({ call: w.call, must: (r, what) => { if (r.status >= 300) throw new Error(what); return r.json?.data; }, write: DRY ? async () => null : w.write, DRY, blank, ...extra });
const uploads = () => {
  const seen = new Map();
  return { seen, uploadMedia: async (spec) => { const had = seen.has(spec.key); if (!had) seen.set(spec.key, spec); return { id: `m-${spec.key}`, state: had ? "reused" : "uploaded" }; } };
};

test("bug 1: legacy #anchor menus are rewritten to the website's real navigation and the footer is republished (clean section only)", async () => {
  const w = world();
  const r = await applySite(ctx(w));
  const items = w.home.sections.find((s) => s.key === "FOOTER").items;
  const nav = items.filter((i) => i.code.startsWith("nav-")).sort((a, b) => a.sortOrder - b.sortOrder);
  assert.deepEqual(nav.map((i) => [i.titleEn, i.href, i.isVisible]), MENUS["nav-"].map((d) => [d.en, d.href, true]));
  assert.deepEqual(nav.map((i) => i.titleAr), MENUS["nav-"].map((d) => d.ar));
  const giving = items.filter((i) => i.code.startsWith("giving-")).sort((a, b) => a.sortOrder - b.sortOrder);
  assert.deepEqual(giving.map((i) => [i.titleEn, i.href, i.isVisible]), [["Give", "/give", true], ["FAQ", "/faq", true], ["Old giving 2", "#faq", false]]); // extra entry hidden, never deleted
  assert.deepEqual(w.published, ["FOOTER"]);
  assert.equal(r.site.contactEmail, "set to Inquiries@meki-us.org");
  assert.equal(w.site.contactEmail, "Inquiries@meki-us.org");
  assert.deepEqual(w.site.socialLinks.map((l) => l.network).sort(), ["facebook", "instagram", "linkedin"]);
  assert.equal(w.site.socialLinks.find((l) => l.network === "instagram").url, "https://www.instagram.com/meki.intr/"); // earlier / editor value kept
});

test("menus: second run changes nothing; an editor-managed menu and an editor's contact e-mail are never overwritten", async () => {
  const w = world();
  await applySite(ctx(w));
  const before = w.writes.length;
  w.published.length = 0;
  await applySite(ctx(w));
  assert.equal(w.writes.length, before, "idempotent");
  assert.deepEqual(w.published, []);
  const e = world();
  e.home.sections[2].items.find((i) => i.code === "nav-2").href = "/about"; // an editor already fixed one entry → not all legacy anchors
  e.site.contactEmail = "editor@example.org";
  const r = await applySite(ctx(e));
  assert.ok(r.menus.some((m) => m.menu === "nav-" && /kept/.test(m.state)));
  assert.equal(e.site.contactEmail, "editor@example.org");
  assert.ok(!e.home.sections[2].items.some((i) => i.code === "nav-1" && i.href === "/"), "editor-managed menu untouched");
});

test("menus: a footer section with pending editor edits is left for the editor to publish", async () => {
  const w = world();
  w.home.sections[2].hasUnpublishedChanges = true;
  const r = await applySite(ctx(w));
  assert.deepEqual(w.published, []);
  assert.equal(r.menus.at(-1).leftForEditor, true);
});

test("dry run writes nothing", async () => {
  const w = world();
  const r = await applySite(ctx(w, true));
  assert.equal(w.writes.length, 0);
  assert.equal(r.menus.at(-1).wouldPublish, true);
  assert.ok(isLegacyAnchor("#faq") && !isLegacyAnchor("/faq"));
});

test("images: all 102 delivered photos are uploaded once; hero, covers, program galleries and the homepage gallery are filled; seeded photos only hidden", async () => {
  const w = world();
  const up = uploads();
  const r = await applyImages(ctx(w, false, { uploadMedia: up.uploadMedia }), { root: "/none" });
  assert.equal(r.total, 102);
  assert.equal(up.seen.size, 102);
  assert.equal(new Set([...up.seen.values()].map((s) => s.filename)).size, 102, "unique derivative names (reuse key)");
  const hero = w.home.sections[0];
  assert.equal(hero.mediaId, "m-hero-family");
  assert.equal(hero.items.find((i) => i.code === "hero-secondary-image").mediaId, "m-hero-school");
  assert.ok(hero.labelsEn.mainImageAlt && hero.labelsAr.mainImageAlt);
  for (const p of w.programmes) {
    assert.equal(p.coverMediaId, `m-program-${p.slug}`, p.slug);
    assert.ok(p.gallery.length >= 2, p.slug);
  }
  const gal = w.home.sections[1].items;
  const added = gal.filter((i) => i.code?.startsWith("g25-"));
  assert.equal(added.length, 9 + 1 + 16); // covers + water photo + curated gallery photos
  assert.ok(added.every((i) => i.titleEn && i.titleAr && i.textEn && i.textAr && i.mediaId && i.provenance === "PROPOSED"));
  assert.equal(gal.filter((i) => !i.code).every((i) => i.isVisible === false), true, "seeded photos hidden, not deleted");
  assert.equal(gal.length, 7 + added.length);
  assert.deepEqual(w.published.sort(), ["GALLERY", "HERO"]);
  assert.equal(added.find((i) => i.code === "g25-water-pipeline").href, "/programs/wash");
});

test("images: second run is idempotent; editor choices (hero photo, program gallery, captions) are kept", async () => {
  const w = world();
  const up = uploads();
  await applyImages(ctx(w, false, { uploadMedia: up.uploadMedia }), { root: "/none" });
  const writes = w.writes.length;
  const r = await applyImages(ctx(w, false, { uploadMedia: up.uploadMedia }), { root: "/none" });
  assert.equal(w.writes.length, writes, "no writes on the second run");
  assert.equal(r.reused, 102);
  const e = world();
  e.home.sections[0].mediaId = "editor-photo";
  e.home.sections[0].media = { url: "https://api/media/editor.webp" };
  e.programmes[1].gallery = [{ id: "x" }];
  e.programmes[2].coverMediaId = "editor-cover";
  e.programmes[2].coverMedia = { url: "https://api/media/editor-cover.webp" };
  await applyImages(ctx(e, false, { uploadMedia: up.uploadMedia }), { root: "/none" });
  assert.equal(e.home.sections[0].mediaId, "editor-photo");
  assert.deepEqual(e.programmes[1].gallery, [{ id: "x" }]);
  assert.equal(e.programmes[2].coverMediaId, "editor-cover");
});

test("images: a gallery section with pending editor edits is not republished", async () => {
  const w = world();
  w.home.sections[1].hasUnpublishedChanges = true;
  const r = await applyImages(ctx(w, false, { uploadMedia: uploads().uploadMedia }), { root: "/none" });
  assert.equal(r.gallery.leftForEditor, true);
  assert.ok(!w.published.includes("GALLERY"));
});

test("images: derivatives keep quality (<= 2560 px, WebP) and the checksum guard rejects a different file", async (t) => {
  const root = join(import.meta.dirname, "../../../references/client-edits-2026-11-23/08-client-delivery-originals");
  const e = MANIFEST.entries.find((x) => x.key === "hero-family");
  if (!existsSync(join(root, MANIFEST.source, e.rel))) return t.skip("delivery files not on this machine");
  const buf = await mediaSpec(e, root).load();
  const sharp = createRequire(join(import.meta.dirname, "../../../apps/web/package.json"))("sharp");
  const meta = await sharp(buf).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(Math.max(meta.width, meta.height), 2560);
  await assert.rejects(() => mediaSpec({ ...e, sha256: "0".repeat(64) }, root).load(), /not the file MEKI supplied/);
});
