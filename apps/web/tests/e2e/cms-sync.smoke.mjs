// Website-side CMS data-flow check (built site, real HTTP, real Next.js revalidation) against the MOCK public API.
//   1. node apps/web/tests/e2e/mock-public-api.mjs                     (port 4777, leave running)
//   2. NEXT_PUBLIC_API_URL=http://127.0.0.1:4777/api/v1 NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3777 pnpm --filter @meki/web build
//   3. node --test apps/web/tests/e2e/cms-sync.smoke.mjs               (starts `next start` on 3777 itself)
// Proves: a PUBLISHED value the API serves is what visitors get (EN + AR), it survives reloads (cached), stays unchanged until the
// API's revalidation call, and the next request after /api/internal/revalidate shows the new value. It does NOT prove that Admin
// saved it in the database or that the real API publishes it — that needs MySQL (see docs/MEKI_CLIENT_EDIT_STATUS.md).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import test, { after, before } from "node:test";

const API = "http://127.0.0.1:4777";
const WEB = "http://127.0.0.1:3777";
const SECRET = randomBytes(24).toString("hex");
let server;

const html = async (path) => {
  const res = await fetch(`${WEB}${path}`, { redirect: "follow" });
  assert.equal(res.status, 200, `${path} → ${res.status}`);
  return res.text();
};
const setState = (patch) => fetch(`${API}/__state`, { method: "POST", body: typeof patch === "string" ? patch : JSON.stringify(patch) });
const revalidate = async (tags) => {
  const res = await fetch(`${WEB}/api/internal/revalidate`, { method: "POST", headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" }, body: JSON.stringify({ tags }) });
  return { status: res.status, body: await res.json() };
};
const text = (s) => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

before(async () => {
  await fetch(`${API}/__state`, { method: "POST", body: "reset" }); // fails loudly if the mock is not running
  server = spawn(process.execPath, [join(import.meta.dirname, "../../node_modules/next/dist/bin/next"), "start", "-p", "3777", "-H", "127.0.0.1"], {
    cwd: join(import.meta.dirname, "../.."),
    env: { ...process.env, NEXT_PUBLIC_API_URL: `${API}/api/v1`, MEKI_REVALIDATE_SECRET: SECRET, NODE_ENV: "production" },
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${WEB}/en`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("next start did not become ready");
});
after(() => server?.kill());

test("baseline (published state from the API): real navigation, built-in copyright with the current year, no invented contact details", async () => {
  const en = await html("/en");
  for (const label of ["Home", "About MEKI", "Programs", "Give", "FAQ", "Contact"]) assert.ok(text(en).includes(label), label);
  assert.match(en, /href="\/en\/about"/);
  const f = text(en);
  assert.match(f, new RegExp(`© ${new Date().getFullYear()} All Rights Reserved`));
  assert.ok(!f.includes("Contact details will be published soon."));
  assert.match(en, /mailto:Inquiries@meki-us\.org/);
});

test("changes published in the CMS: not visible until the API revalidates, then visible after a reload — EN and AR", async () => {
  const v2 = {
    nav: [["Start", "ابدأ", "/"], ["Our story", "قصتنا", "/about"]],
    copyright: ["© MEKI 2027 — Test Copyright", "© ميكي 2027 — حقوق الاختبار"],
    contactEmail: "Inquiries@meki-us.org",
    social: [{ network: "linkedin", url: "https://www.linkedin.com/company/misr-el-kheir-international" }, { network: "facebook", url: "https://www.facebook.com/meki.Intr/" }, { network: "instagram", url: "https://www.instagram.com/meki.intr/" }],
    heroImage: "hero-v2.webp",
    programmeName: { health: ["Health TEST Title", "عنوان الصحة التجريبي"] },
    programmeMandate: { health: ["TEST mandate sentence one.\n\nTEST mandate sentence two.", "نص الرسالة التجريبي الأول.\n\nنص الرسالة التجريبي الثاني."] },
    galleryCount: 12,
    galleryCaptions: Array.from({ length: 12 }, (_, k) => [`Caption TEST ${k + 1}`, `تعليق تجريبي ${k + 1}`, "Luxor", "الأقصر"]),
    footerText: ["Registered in New York. TEST footer text.", "مسجلة في نيويورك. نص التذييل التجريبي."],
  };
  await setState(v2);

  // cached: visitors still get the previous published page (ISR) — nothing changes without the revalidation call
  assert.ok(!text(await html("/en")).includes("Our story"), "stale until revalidated");

  // unauthorised / malformed revalidation is refused (the API's secret protects the cache)
  const bad = await fetch(`${WEB}/api/internal/revalidate`, { method: "POST", headers: { Authorization: "Bearer wrong", "Content-Type": "application/json" }, body: JSON.stringify({ tags: ["meki-public"] }) });
  assert.equal(bad.status, 401);
  assert.equal((await revalidate(["../../etc"])).status, 400);

  const r = await revalidate(["meki-public"]);
  assert.equal(r.status, 200);
  assert.equal(r.body.revalidated, true);

  for (const loc of ["en", "ar"]) {
    const page = await html(`/${loc}`);
    const t = text(page);
    // navigation label + URL
    assert.ok(t.includes(loc === "en" ? "Our story" : "قصتنا"), `${loc} nav label`);
    assert.match(page, new RegExp(`href="/${loc}/about"`));
    assert.ok(!t.includes(loc === "en" ? "About MEKI" : "عن MEKI"), `${loc} old nav label gone`);
    // copyright (shown as written; no frozen year, no built-in text)
    assert.ok(t.includes(loc === "en" ? "© MEKI 2027 — Test Copyright" : "© ميكي 2027 — حقوق الاختبار"), `${loc} copyright`);
    assert.ok(!t.includes("Qeema Tech") && !t.includes("جميع الحقوق محفوظة Qeema Tech"), `${loc} built-in copyright gone`);
    // footer text, contact e-mail, social links
    assert.ok(t.includes(loc === "en" ? "TEST footer text." : "نص التذييل التجريبي."), `${loc} footer text`);
    assert.match(page, /href="mailto:Inquiries@meki-us\.org"/);
    for (const u of ["https://www.linkedin.com/company/misr-el-kheir-international", "https://www.facebook.com/meki.Intr/", "https://www.instagram.com/meki.intr/"]) assert.ok(page.includes(`href="${u}"`), `${loc} ${u}`);
    // hero image from the CMS (next/image proxies the API media URL)
    assert.ok(page.includes(encodeURIComponent(`${API}/media/hero-v2.webp`)), `${loc} hero image`);
    // programme title edited in the CMS
    assert.ok(t.includes(loc === "en" ? "Health TEST Title" : "عنوان الصحة التجريبي"), `${loc} programme title on home`);
    // gallery: any number of published photos, with "Title – Place"
    assert.ok(t.includes(loc === "en" ? "Caption TEST 12 – Luxor" : "تعليق تجريبي 12 – الأقصر"), `${loc} gallery caption (12th photo)`);
    assert.ok((page.match(/<figure/g) ?? []).length >= 12, `${loc} gallery shows all 12 photos`);
  }

  // programme pages: landing page and the single program page
  const programs = text(await html("/en/programs"));
  assert.ok(programs.includes("Health TEST Title"));
  const detail = await html("/en/programs/health");
  assert.ok(text(detail).includes("Health TEST Title"));
  assert.ok(text(detail).includes("TEST mandate sentence one.") && text(detail).includes("TEST mandate sentence two."));
  const contact = await html("/en/contact");
  assert.match(contact, /href="mailto:Inquiries@meki-us\.org"/);

  // reload: the same values again (served from the refreshed cache)
  assert.ok(text(await html("/en")).includes("Our story"));
});

test("unpublishing (the API stops serving a value) + revalidation removes it; a second change shows on the very next request", async () => {
  await setState({ copyright: ["© MEKI second edit", "© ميكي تعديل ثان"], galleryCount: 0, contactEmail: null });
  assert.equal((await revalidate(["meki-public"])).status, 200);
  const en = await html("/en");
  assert.ok(text(en).includes("© MEKI second edit"));
  assert.match(en, /mailto:Inquiries@meki-us\.org/); // confirmed public fallback
  assert.ok(!text(en).includes("Caption TEST 1"));
  assert.ok(text(await html("/ar")).includes("© ميكي تعديل ثان"));
});
