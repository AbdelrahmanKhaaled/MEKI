// Runs the REAL apply-nov25-final-content.mjs (child process, real fetch/login/multipart code) against a mock admin API server.
// Dry run: nothing is written, every phase reports. Run: node --test deploy/staging/nov25/runner.test.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { join } from "node:path";
import test from "node:test";

const SCRIPT = join(import.meta.dirname, "../apply-nov25-final-content.mjs");
const ok = (data) => ({ data });

function mockAdmin() {
  const log = [];
  const home = {
    sections: [
      { id: "hero", key: "HERO", status: "PUBLISHED", hasUnpublishedChanges: false, mediaId: "old", media: { url: "/images/work/hero-field.webp" }, labelsEn: {}, labelsAr: {}, items: [] },
      { id: "gal", key: "GALLERY", status: "PUBLISHED", hasUnpublishedChanges: false, items: [] },
      { id: "foot", key: "FOOTER", status: "PUBLISHED", hasUnpublishedChanges: false, items: ["#a", "#b"].map((h, i) => ({ id: `n${i}`, code: `nav-${i + 1}`, sortOrder: i, isVisible: true, titleEn: "Old", href: h })) },
      { id: "prg", key: "PROGRAMMES", status: "PUBLISHED", hasUnpublishedChanges: false, items: [] },
      { id: "abt", key: "ABOUT", status: "PUBLISHED", hasUnpublishedChanges: false, items: [] },
    ],
  };
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const url = new URL(req.url, "http://x");
    log.push(`${req.method} ${url.pathname}${url.search}`);
    const send = (code, body, headers = {}) => { res.writeHead(code, { "Content-Type": "application/json", ...headers }); res.end(JSON.stringify(body)); };
    const p = url.pathname.replace("/api/v1", "");
    if (p === "/admin/auth/login") return send(200, ok({ csrfToken: "csrf" }), { "Set-Cookie": "meki_admin_sid=abc; Path=/" });
    if (p === "/admin/auth/logout") return send(200, ok({}));
    if (req.method !== "GET") return send(200, ok({ id: "new-id", originalName: "x.webp" }));
    if (p === "/admin/cms/pages/home") return send(200, ok(home));
    if (p === "/admin/settings/site") return send(200, ok({ contactEmail: null, socialLinks: [] }));
    if (p === "/admin/programmes") return send(200, ok([]));
    if (p === "/admin/media") return send(200, ok([]));
    if (p === "/admin/events") return send(200, ok([]));
    return send(404, { error: { code: "NOT_FOUND" } });
  });
  return { server, log };
}

async function run(env) {
  const { server, log } = mockAdmin();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const child = spawn(process.execPath, [SCRIPT], { env: { ...process.env, ADMIN_URL: `http://127.0.0.1:${port}`, ADMIN_EMAIL: "publisher@example.org", ADMIN_PASSWORD: "not-a-real-password", ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "", err = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (err += d));
  const code = await new Promise((r) => child.on("close", r));
  server.close();
  return { code, out, err, log };
}

test("dry run (default): every phase reports, nothing is written, the password never appears in output", async () => {
  const { code, out, err, log } = await run({ ONLY: "site,programmes,images,gala" });
  assert.equal(code, 0, err);
  const report = JSON.parse(out);
  assert.equal(report.dryRun, true);
  assert.ok(report.site && report.programmes25 && report.images && report.gala, Object.keys(report).join());
  assert.equal(report.images.total, 102);
  assert.equal(report.images.wouldUpload, 102, "dry run: all 102 photos would be uploaded to an empty library");
  assert.equal(report.images.uploaded, 0);
  assert.deepEqual(log.filter((l) => !l.startsWith("GET") && !/auth\/(login|logout)/.test(l)), [], "no write request in a dry run");
  assert.ok(!out.includes("not-a-real-password") && !err.includes("not-a-real-password"));
});

test("real mode, Site phase: menus rewritten, e-mail + social stored, footer published (writes go to the audited admin endpoints)", async () => {
  const { code, out, err, log } = await run({ ONLY: "site", DRY_RUN: "0" });
  assert.equal(code, 0, err);
  const report = JSON.parse(out);
  assert.equal(report.dryRun, false);
  assert.ok(log.includes("PATCH /api/v1/admin/settings/site"));
  assert.ok(log.includes("POST /api/v1/admin/cms/sections/foot/publish"));
  assert.ok(log.filter((l) => l.startsWith("PATCH /api/v1/admin/cms/items/")).length >= 2);
});

test("ONLY selects phases", async () => {
  const { code, out } = await run({ ONLY: "site" });
  assert.equal(code, 0);
  const r = JSON.parse(out);
  assert.deepEqual(Object.keys(r).sort(), ["dryRun", "phases", "site"]);
});

// Slow (derives all 102 photos, ~1–2 min): FULL_UPLOAD_TEST=1 node --test deploy/staging/nov25/runner.test.mjs
test("real mode, Images phase: all 102 derivatives are uploaded as multipart with their metadata", { skip: !process.env.FULL_UPLOAD_TEST }, async () => {
  const { code, out, err, log } = await run({ ONLY: "images", DRY_RUN: "0" });
  assert.equal(code, 0, err);
  const report = JSON.parse(out);
  assert.equal(report.images.uploaded, 102);
  assert.equal(log.filter((l) => l === "POST /api/v1/admin/media").length, 102);
});
