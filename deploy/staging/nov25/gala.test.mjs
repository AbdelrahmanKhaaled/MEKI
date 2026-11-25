// Offline test of deploy/staging/nov25/gala.mjs against an in-memory admin API (no network, no database).
// Run: node --test deploy/staging/nov25/gala.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { applyGala, GALA_DATA } from "./gala.mjs";

function world(sections, media = {}) {
  const w = { sections, media, writes: [], published: [] };
  const ok = (data) => ({ status: 200, json: { data }, revalidation: "revalidated" });
  const find = (id) => w.sections.flatMap((s) => s.items).find((i) => i.id === id);
  w.call = async (method, path, body) => {
    let m;
    if (path.startsWith("/admin/events?")) return ok([{ id: "ev1", slug: "gala-night", status: "PUBLISHED" }]);
    if (path === "/admin/events/ev1/page") return ok({ sections: w.sections });
    if ((m = /^\/admin\/media\/(.+)$/.exec(path)) && method === "GET") return ok(w.media[m[1]]);
    if (path === "/admin/events/ev1/sections" && method === "POST") { const s = { id: `s-${body.key}`, key: body.key, status: "DRAFT", hasUnpublishedChanges: true, items: [] }; w.sections.push(s); return ok(s); }
    if ((m = /^\/admin\/events\/ev1\/sections\/([^/]+)\/publish$/.exec(path))) { const s = w.sections.find((x) => x.id === m[1]); Object.assign(s, { status: "PUBLISHED", hasUnpublishedChanges: false, publishedAt: "now" }); w.published.push(s.key); return ok({}); }
    return { status: 404, json: null };
  };
  w.write = async (method, path, body) => {
    w.writes.push([method, path, body]);
    let m;
    if ((m = /^\/admin\/events\/ev1\/sections\/([^/]+)\/items$/.exec(path))) { const s = w.sections.find((x) => x.id === m[1]); s.items.push({ id: `i-${body.code}`, isVisible: true, ...body }); s.hasUnpublishedChanges = true; }
    else if ((m = /^\/admin\/events\/ev1\/items\/(.+)$/.exec(path))) Object.assign(find(m[1]), body);
    else if ((m = /^\/admin\/media\/(.+)$/.exec(path))) Object.assign(w.media[m[1]], body);
    return {};
  };
  return w;
}
const ctx = (w, DRY = false) => ({
  call: w.call,
  must: (r, what) => { if (r.status >= 300) throw new Error(what); return r.json?.data; },
  write: DRY ? async () => null : w.write,
  DRY,
  blank: (v) => v == null || (typeof v === "string" && v.trim() === ""),
  uploadMedia: async (spec) => (DRY ? `(new:${spec.key})` : `m-${spec.key}`),
});
const sec = (key, extra = {}, items = []) => ({ id: `s-${key}`, key, status: "PUBLISHED", hasUnpublishedChanges: false, publishedAt: "t", mediaId: null, items, ...extra });
const seedShell = (key) => ({ id: `s-${key}`, key, status: "DRAFT", hasUnpublishedChanges: true, publishedAt: null, mediaId: null, items: [] });

test("host photo is confirmed and the empty host section is published; partners stay hidden without logos", async () => {
  const w = world(
    [seedShell("EVENT_SPEAKERS"), sec("EVENT_SPONSORSHIP", { mediaId: "pdf" }), seedShell("EVENT_CONTACT"), sec("EVENT_HIGHLIGHTS", {}, [{ id: "i-bt", code: "black-tie", mediaId: null }, { id: "i-d", code: "dinner", mediaId: null }])],
    { "m-host-raya-abirached": { consentStatus: "UNKNOWN" } },
  );
  const out = await applyGala(ctx(w));
  assert.equal(w.media["m-host-raya-abirached"].consentStatus, "CONFIRMED");
  const speakers = w.sections.find((s) => s.key === "EVENT_SPEAKERS");
  assert.equal(speakers.status, "PUBLISHED");
  assert.equal(speakers.items[0].mediaId, "m-host-raya-abirached");
  // partners: created hidden, no logo, provenance PROPOSED
  const spon = w.sections.find((s) => s.key === "EVENT_SPONSORSHIP");
  assert.deepEqual(spon.items.map((i) => [i.code, i.titleEn, i.isVisible, i.mediaId ?? null, i.provenance]), [
    ["partner-bokra", "Bokra", false, null, "PROPOSED"],
    ["partner-waterway", "The Waterway", false, null, "PROPOSED"],
  ]);
  // contact e-mail
  assert.equal(w.sections.find((s) => s.key === "EVENT_CONTACT").items[0].href, "mailto:Inquiries@meki-us.org");
  // exterior only on the arrival card
  const cards = w.sections.find((s) => s.key === "EVENT_HIGHLIGHTS").items;
  assert.equal(cards.find((c) => c.code === "black-tie").mediaId, "m-venue-exterior-day");
  assert.equal(cards.find((c) => c.code === "dinner").mediaId, null);
  assert.ok(out.sections.some((s) => s.key === "EVENT_SPEAKERS" && s.published === "revalidated"));
});

test("idempotent: a second run changes nothing", async () => {
  const w = world([seedShell("EVENT_SPEAKERS"), sec("EVENT_SPONSORSHIP"), seedShell("EVENT_CONTACT"), sec("EVENT_HIGHLIGHTS", {}, [{ id: "i-bt", code: "black-tie", mediaId: null }])], { "m-host-raya-abirached": { consentStatus: "UNKNOWN" } });
  await applyGala(ctx(w));
  w.writes.length = 0;
  w.published.length = 0;
  const out = await applyGala(ctx(w));
  assert.deepEqual(w.writes, []);
  assert.deepEqual(w.published, []);
  assert.ok(out.sections.every((s) => s.changes.length === 0));
});

test("administrator values are kept; sections with pending edits are left for the editor", async () => {
  const w = world(
    [
      sec("EVENT_SPEAKERS", {}, [{ id: "i-host", code: "host", titleEn: "Edited name", mediaId: "own-photo", isVisible: true }]),
      sec("EVENT_SPONSORSHIP", { hasUnpublishedChanges: true }, [{ id: "i-b", code: "partner-bokra", titleEn: "Bokra (edited)", isVisible: true, mediaId: "logo" }]),
      sec("EVENT_CONTACT", {}, [{ id: "i-m", code: "email", href: "mailto:own@example.org" }]),
      sec("EVENT_HIGHLIGHTS", {}, [{ id: "i-bt", code: "black-tie", mediaId: "own-card-photo" }]),
    ],
    { "m-host-raya-abirached": { consentStatus: "CONFIRMED" } },
  );
  await applyGala(ctx(w));
  const items = (k) => w.sections.find((s) => s.key === k).items;
  assert.equal(items("EVENT_SPEAKERS")[0].mediaId, "own-photo");
  assert.equal(items("EVENT_SPEAKERS")[0].titleEn, "Edited name");
  assert.equal(items("EVENT_CONTACT")[0].href, "mailto:own@example.org");
  assert.equal(items("EVENT_HIGHLIGHTS")[0].mediaId, "own-card-photo");
  assert.equal(items("EVENT_SPONSORSHIP").find((i) => i.code === "partner-bokra").titleEn, "Bokra (edited)");
  // the sponsorship section had pending editor edits → not published by the script, and no partner was ever made visible
  assert.ok(!w.published.includes("EVENT_SPONSORSHIP"));
  assert.ok(items("EVENT_SPONSORSHIP").filter((i) => i.code === "partner-waterway").every((i) => i.isVisible === false));
});

test("dry run writes nothing and reports what would be published", async () => {
  const w = world([seedShell("EVENT_SPEAKERS"), sec("EVENT_SPONSORSHIP"), seedShell("EVENT_CONTACT"), sec("EVENT_HIGHLIGHTS", {}, [{ id: "i-bt", code: "black-tie", mediaId: null }])]);
  const out = await applyGala(ctx(w, true));
  assert.deepEqual(w.writes, []);
  assert.deepEqual(w.published, []);
  assert.equal(out.sections.find((s) => s.key === "EVENT_SPEAKERS").wouldPublish, true);
});

test("data: partners are Bokra and The Waterway, no logo field, e-mail as confirmed", () => {
  assert.deepEqual(GALA_DATA.partners.map((p) => p.titleEn), ["Bokra", "The Waterway"]);
  assert.ok(GALA_DATA.partners.every((p) => !("media" in p) && !("mediaId" in p) && !("logo" in p)));
  assert.equal(GALA_DATA.contactEmail, "Inquiries@meki-us.org");
  assert.equal(GALA_DATA.assets.host.consentStatus, "CONFIRMED");
});
