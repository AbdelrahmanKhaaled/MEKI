// Phase 6C browser smoke test against the REAL API (manual, not part of `pnpm test`). Playwright + system Chrome.
//
//   API:    NODE_ENV=test PORT=4100 node dist/main.js   (apps/api — a *_test database; never development or production)
//   Admin:  ADMIN_API_UPSTREAM=http://localhost:4100 next build ; next start -p 3003
//   Run:    WEB_URL=http://localhost:3003 TAG=… PW=… FIXTURES=<dir> node tests/e2e/content.smoke.mjs [outDir]
//           accounts p6c-{admin,campaign,content,door}-<TAG>@meki.test must exist in the test database (ADMINISTRATOR,
//           CAMPAIGN_MANAGER, CONTENT_MANAGER, EVENT_CHECKIN_STAFF).
// It creates its own records (codes contain E2E + TAG), walks them through the lifecycle and deletes them again. It never opens
// donations (the test database has payments disabled) and never touches seeded/official records except to read them.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const WEB = process.env.WEB_URL ?? "http://localhost:3003";
const TAG = process.env.TAG;
const PW = process.env.PW;
const FX = process.env.FIXTURES;
const OUT = process.argv[2] ?? "./smoke-out-6c";
mkdirSync(OUT, { recursive: true });
const U = TAG.toUpperCase();
/** fixtures are generated fresh for every run (random noise) and prefixed, so the server never sees them as duplicates of an earlier run */
const P = `e2e-${process.env.RUN}-`;
const R = process.env.RUN.toUpperCase(); // record codes are unique per run too
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const problems = [];
const calls = [];
const apiErrors = []; // failed mutations (status + body), printed when a step fails
let step = "start";
const until = async (fn, timeout = 15000) => { const end = Date.now() + timeout; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* retry */ } await new Promise((r) => setTimeout(r, 150)); } return false; };

async function open(w = 1440, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource.*(401|403|404|409|413|415|422|ERR_CONNECTION_REFUSED)/.test(m.text()) && problems.push(`console: ${m.text().slice(0, 160)}`));
  page.on("response", async (r) => { if (r.url().includes("/api/v1/") && r.request().method() !== "GET" && r.status() >= 400) apiErrors.push(`${r.request().method()} ${new URL(r.url()).pathname} → ${r.status()} ${(await r.text().catch(() => "")).slice(0, 200)}`); });
  page.on("requestfailed", (r) => { if (!new URL(r.url()).port.startsWith("3000") && !/ERR_ABORTED/.test(r.failure()?.errorText ?? "")) problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`); });
  page.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/v1/") || u.pathname.startsWith("/media/")) calls.push(`${r.method()} ${u.pathname}${u.search}`); if (u.origin !== new URL(WEB).origin && !u.protocol.startsWith("data") && !u.port.startsWith("300")) problems.push(`foreign request: ${r.url()}`); });
  return { ctx, page };
}
async function login(page, who, locale = "en") {
  await page.goto(`${WEB}/${locale}/login`, { waitUntil: "networkidle" });
  await page.locator("input[type=email]").fill(`p6c-${who}-${TAG}@meki.test`);
  await page.locator("input[type=password]").fill(PW);
  await page.locator("button[type=submit]").click();
  await page.waitForURL(new RegExp(`/${locale}/dashboard`), { timeout: 20000 });
}
const waitUrl = async (page, re, timeout = 20000) => { if (!(await until(() => re.test(page.url()), timeout))) throw new Error(`URL ${page.url()} never matched ${re}`); };
const main = (page) => page.locator("main").innerText();
const group = (page, name) => page.getByRole("group", { name, exact: true });
const en = (page, name) => group(page, name).getByLabel(/^English/);
const arField = (page, name) => group(page, name).getByLabel(/^Arabic/);
const save = async (page) => { await page.getByRole("button", { name: "Save changes" }).click(); };
const saved = (page) => until(async () => (await page.getByRole("region", { name: "Save changes" }).innerText()).includes("Saved — the record shown"));
const confirm = async (page, label) => { const d = page.getByRole("dialog"); await d.getByRole("button", { name: label, exact: true }).click(); await until(async () => (await page.getByRole("dialog").count()) === 0); };
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const ids = {};

try {
  // ───────────── administrator: full workflow ─────────────
  let { ctx, page } = await open();
  await login(page, "admin");
  const side = await page.locator("aside").first().innerText();
  check("sidebar: Programs, Causes, Campaigns and Media Library are live links", (await page.locator("aside a[href='/en/programs'], aside a[href='/en/causes'], aside a[href='/en/campaigns'], aside a[href='/en/media']").count()) === 4 && /soon/i.test(side));

  step = "programs list";
  await page.goto(`${WEB}/en/programs?kind=PROGRAMME&provenance=VERIFIED_SOURCE`, { waitUntil: "networkidle" });
  await page.locator("main table tbody tr").first().waitFor();
  let t = await main(page);
  const NINE = ["Social Solidarity & Household Resilience", "Health Access, Coverage & Quality", "Education", "Economic Empowerment & Labour Market Activation", "Housing & Safe Living Conditions", "WASH, Environment & Climate Resilience" /* brief: "W.A.S.H, …" — stored spelling, reported for MEKI */, "Emergency Response", "Heritage, Culture & Identity", "Scientific Research & Research Ecosystem"];
  const missing = NINE.filter((n) => !t.includes(n));
  check("programs: the nine official programs are listed (verified source, kind Program)", missing.length === 0 && t.includes("9 records"), missing.join(" | "));
  check("programs: provenance badges + cover thumbnail (image or placeholder) on every row", (await page.locator("main table [data-provenance=VERIFIED_SOURCE]").count()) === 9 && (await page.locator("main table tbody tr td:first-child :is(img, span[aria-hidden=true])").count()) >= 9);
  check("programs: kind + provenance filters reach the API", calls.some((c) => c.includes("/admin/programmes?") && c.includes("kind=PROGRAMME") && c.includes("provenance=VERIFIED_SOURCE")));

  step = "official program detail";
  await page.locator("main table tbody tr").filter({ hasText: "Health Access, Coverage & Quality" }).getByRole("link").first().click();
  await waitUrl(page, /\/en\/programs\/[^/?]+/);
  await page.getByRole("heading", { name: "Lifecycle" }).waitFor();
  ids.prg02 = page.url().split("/programs/")[1].split("?")[0];
  t = await main(page);
  check("official program: Brand-name warning, verified notice, bilingual fields side by side", t.includes("one of the nine official programs") && t.includes("VERIFIED_SOURCE: taken from client-supplied material") && (await en(page, "Name").getAttribute("dir")) === "ltr" && (await arField(page, "Name").getAttribute("dir")) === "rtl");
  check("official program: published → Delete disabled with the reason", (await page.getByRole("button", { name: "Delete" }).isDisabled()) && t.includes("Unpublish it first."));
  check("back link keeps the list filters", (await page.locator("main").getByRole("link", { name: "Programs" }).first().getAttribute("href")).includes("kind=PROGRAMME"));

  step = "create DEMO program";
  await page.goto(`${WEB}/en/programs/new`, { waitUntil: "networkidle" });
  await page.getByLabel(/^Code/).fill(`PRG-E2E${R}`);
  await en(page, "Name").fill(`E2E demo program ${R}`);
  await arField(page, "Name").fill("برنامج تجريبي");
  await page.getByLabel(/^Provenance/).selectOption("DEMO");
  await save(page);
  await waitUrl(page, /\/en\/programs\/(?!new)[^/?]+$/, 20000);
  await page.getByRole("heading", { name: "Lifecycle" }).waitFor();
  t = await main(page);
  check("program created through the API as a DRAFT; DEMO notice shown", t.includes("Draft") && t.includes("DEMO content: for previews only"));
  check("DEMO program: Publish disabled with the backend reasons (DEMO, missing summary)", (await page.getByRole("button", { name: "Publish", exact: true }).isDisabled()) && t.includes("DEMO content cannot be approved or published.") && t.includes("The English summary is required."));
  await en(page, "Summary").fill("Edited summary");
  check("save bar counts unsaved changes", (await page.getByRole("region", { name: "Save changes" }).innerText()).includes("1 unsaved changes"));
  await save(page);
  check("program update saved (PATCH with changed fields only)", await saved(page) && calls.some((c) => c.startsWith("PATCH /api/v1/admin/programmes/")));
  await page.getByRole("button", { name: "Delete" }).click();
  await confirm(page, "Delete");
  await waitUrl(page, /\/en\/programs$/);
  check("draft program without campaigns soft-deleted after confirmation", calls.some((c) => c.startsWith("DELETE /api/v1/admin/programmes/")));

  step = "media uploads";
  await page.goto(`${WEB}/en/media`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Upload images" }).click();
  const input = page.locator("input[type=file]");
  await input.setInputFiles(`${FX}/${P}a.png`);
  check("upload: small PNG uploaded (progress → success)", await until(async () => (await main(page)).includes(`${P}a.png uploaded.`)));
  await input.setInputFiles(`${FX}/${P}a.png`);
  check("upload: the same image again → duplicate detected by the server, no second record", await until(async () => (await main(page)).includes(`${P}a.png is already in the library.`)));
  await input.setInputFiles([`${FX}/${P}b.jpg`, `${FX}/${P}c.webp`]);
  check("upload: JPEG + WebP multi-select uploaded sequentially", await until(async () => { const s = await main(page); return s.includes(`${P}b.jpg uploaded.`) && s.includes(`${P}c.webp uploaded.`); }));
  const before = calls.filter((c) => c === "POST /api/v1/admin/media").length;
  await input.setInputFiles(`${FX}/${P}over.png`);
  await until(async () => (await main(page)).includes("larger than 10 MB"));
  check("upload: > 10 MB rejected client-side with a clear message (never sent)", (await main(page)).includes("The file is larger than 10 MB.") && calls.filter((c) => c === "POST /api/v1/admin/media").length === before);
  await input.setInputFiles(`${FX}/${P}fake.png`);
  check("upload: a fake PNG is refused by the server's magic-byte check", await until(async () => (await main(page)).includes("not a supported or valid image")));
  await input.setInputFiles(`${FX}/${P}near.png`);
  check("upload: 9.7 MB image passes the same-origin proxy (multipart) and is stored", await until(async () => (await main(page)).includes(`${P}near.png uploaded.`), 60000));
  const status413 = await page.evaluate(async () => {
    const csrf = (await (await fetch("/api/v1/admin/auth/csrf")).json()).data.csrfToken;
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(10.5 * 1024 * 1024)], { type: "image/png" }), "big.png");
    return (await fetch("/api/v1/admin/media", { method: "POST", body: fd, headers: { "X-CSRF-Token": csrf } })).status;
  });
  check("upload: the API itself refuses > 10 MB through the proxy (413)", status413 === 413, String(status413));

  step = "media library + detail";
  await page.goto(`${WEB}/en/media?q=${P}a`, { waitUntil: "networkidle" });
  await page.locator("main ul a[href*='/media/']").first().waitFor();
  check("media grid: search + preview served through the admin's /media proxy", (await page.locator("main ul img").first().getAttribute("src")).startsWith("/media/uploads/") && (await page.locator("main ul img").first().evaluate((i) => i.complete && i.naturalWidth > 0)));
  await page.getByRole("button", { name: "List" }).click();
  await waitUrl(page, /view=list/);
  check("media list view", (await page.locator("main table tbody tr").count()) >= 1);
  await page.locator("main table tbody tr").first().getByRole("link").last().click();
  await waitUrl(page, /\/en\/media\/[^/?]+/);
  await page.getByRole("heading", { name: "In use by" }).waitFor();
  ids.mediaA = page.url().split("/media/")[1].split("?")[0];
  await en(page, "Alternative text").fill(`E2E alt ${TAG}`);
  await page.getByLabel(/^Consent status/).selectOption("CONFIRMED");
  await save(page);
  check("media metadata edited (alt text + consent)", await saved(page));
  t = await main(page);
  check("media detail: file info, unused, delete allowed", t.includes("Not used by any content.") && (await page.getByRole("button", { name: "Delete" }).isEnabled()));

  step = "cause create";
  await page.goto(`${WEB}/en/programs/${ids.prg02}`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "New cause" }).click();
  await waitUrl(page, /\/en\/causes\/new\?programmeId=/);
  await page.getByLabel(/^Code/).fill(`PRJ-E2E${R}`);
  await en(page, "Name").fill(`E2E cause ${R}`);
  check("cause editor: parent program preselected from the program page", await until(async () => (await page.getByRole("combobox", { name: /^Parent program/ }).inputValue()) === ids.prg02));
  await save(page);
  await waitUrl(page, /\/en\/causes\/(?!new)[^/?]+$/, 20000);
  await page.getByRole("heading", { name: "Campaigns of this cause" }).waitFor();
  ids.cause = page.url().split("/causes/")[1];
  t = await main(page);
  check("cause created under the program; no fake publish/delete controls; no-media note", t.includes("Health Access, Coverage & Quality") && (await page.getByRole("button", { name: /^(Publish|Delete)$/ }).count()) === 0 && t.includes("no publish/delete operation for causes"));

  step = "campaign create";
  await page.getByRole("link", { name: "New campaign for this cause" }).click();
  await waitUrl(page, /\/en\/campaigns\/new\?programmeId=.*projectId=/);
  await page.getByLabel(/^Code/).fill(`CMP-E2E${R}`);
  await en(page, "Title").fill(`E2E campaign ${R}`);
  await arField(page, "Title").fill("حملة تجريبية");
  await en(page, "Summary").fill("A proposed campaign created by the browser smoke test.");
  await page.getByRole("tab", { name: "Program & cause" }).click();
  check("campaign: program and cause prefilled from the cause page", (await page.getByRole("combobox", { name: /^Programs*$/ }).inputValue()) === ids.prg02 && (await page.getByLabel(/^Cause/).inputValue()) === ids.cause);
  await page.getByRole("tab", { name: "Fundraising" }).click();
  await page.getByLabel(/^Fundraising target/).fill("1.555");
  check("fundraising: more than 2 decimals rejected in the form", (await main(page)).includes("at most 2 decimals"));
  await page.getByLabel(/^Fundraising target/).fill("1500.50");
  await page.getByLabel(/^Suggested amounts/).fill("100, 25, 50");
  await save(page);
  await waitUrl(page, /\/en\/campaigns\/(?!new)[^/?]+$/, 20000);
  ids.campaign = page.url().split("/campaigns/")[1];
  await page.getByRole("tab", { name: "Fundraising" }).click();
  check("campaign created as draft; exact decimal target round-trips ($1,500.50)", (await page.getByLabel(/^Fundraising target/).inputValue()) === "1500.5" && (await page.getByLabel(/^Suggested amounts/).inputValue()) === "25, 50, 100");
  check("collected comes from the finance report (per currency, $0 for a new campaign)", (await page.locator("[data-testid=campaign-collected]").innerText()).includes("$0"));

  step = "hierarchy";
  await page.getByRole("tab", { name: "Program & cause" }).click();
  const other = await page.getByRole("combobox", { name: /^Programs*$/ }).locator("option").evaluateAll((os, cur) => os.map((o) => o.value).find((v) => v && v !== cur), ids.prg02);
  await page.getByRole("combobox", { name: /^Programs*$/ }).selectOption(other);
  check("hierarchy: changing the program clears a cause of another program (never mismatched)", (await page.getByLabel(/^Cause/).inputValue()) === "");
  await page.getByRole("button", { name: "Discard" }).click();
  check("discard restores the saved values", (await page.getByLabel(/^Cause/).inputValue()) === ids.cause);

  step = "cover + gallery via picker";
  await page.getByRole("tab", { name: "Media" }).click();
  await page.getByRole("button", { name: "Choose cover" }).click();
  let dlg = page.getByRole("dialog");
  await dlg.getByPlaceholder("File name, alt text or folder").fill(`${P}a`);
  await dlg.locator(`ul button[title^="${P}a"]`).waitFor();
  await dlg.locator(`ul button[title^="${P}a"]`).click();
  await dlg.getByRole("button", { name: "Use selection" }).click();
  await save(page);
  check("media picker: existing asset selected as cover and saved (coverMediaId)", await saved(page) && calls.some((c) => c.startsWith("PATCH /api/v1/admin/campaigns/")));
  await page.getByRole("button", { name: "Choose gallery images" }).click();
  dlg = page.getByRole("dialog");
  for (const name of [`${P}b`, `${P}c`]) {
    await dlg.getByPlaceholder("File name, alt text or folder").fill(name);
    await dlg.locator(`ul button[title^="${name}"]`).waitFor();
    await dlg.locator(`ul button[title^="${name}"]`).click();
  }
  check("media picker: ordered multi-select across searches", (await dlg.innerText()).includes("2 selected"));
  await dlg.getByRole("button", { name: "Use selection" }).click();
  await page.getByRole("button", { name: "Save gallery" }).click();
  check("gallery saved with PUT …/gallery (ids only, nothing re-uploaded)", await until(() => calls.some((c) => c.startsWith("PUT /api/v1/admin/campaigns/") && c.endsWith("/gallery"))) && await until(async () => (await page.locator("main ol li img").count()) === 2));

  step = "media in use";
  await page.goto(`${WEB}/en/media/${ids.mediaA}`, { waitUntil: "networkidle" });
  await page.locator("[data-testid=media-usage]").waitFor();
  t = await main(page);
  check("media detail: 'In use by' shows the campaign cover; delete blocked (MEDIA_IN_USE mirror)", t.includes("Campaign covers") && (await page.getByRole("button", { name: "Delete" }).isDisabled()) && t.includes("It is used by other content"));

  step = "cause locked";
  await page.goto(`${WEB}/en/causes/${ids.cause}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Campaigns of this cause" }).waitFor();
  check("cause with campaigns: program locked (PROJECT_HAS_CAMPAIGNS mirror) and campaign listed", (await page.getByRole("combobox", { name: /^Parent program/ }).isDisabled()) && (await main(page)).includes(`E2E campaign ${R}`));

  step = "publishing";
  await page.goto(`${WEB}/en/campaigns/${ids.campaign}`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Publishing & approval" }).click();
  await page.getByRole("heading", { name: "Publishing checklist" }).waitFor();
  t = await main(page);
  check("checklist: approval missing; Publish disabled with the exact reason", t.includes("MEKI approval is not recorded.") && (await page.locator("[data-action=publish]").isDisabled()));
  check("donations: platform payments disabled → Open donations disabled with reasons", (await page.locator("[data-testid=payments-state]").innerText()).includes("disabled") && (await page.getByRole("button", { name: "Open donations" }).isDisabled()) && t.includes("Online payments are not enabled for the platform"));
  await page.getByRole("button", { name: "Record approval" }).click();
  dlg = page.getByRole("dialog");
  check("approval needs a reference (≥ 5 characters)", await dlg.getByRole("button", { name: "Record approval" }).isDisabled());
  await dlg.getByLabel(/^Approval reference/).fill(`E2E smoke approval reference ${TAG}`);
  await confirm(page, "Record approval");
  await until(async () => (await main(page)).includes("Approved by"));
  check("approval recorded by the server (who/when/reference)", (await main(page)).includes(`E2E smoke approval reference ${TAG}`));
  await page.locator("[data-action=publish]").click();
  await confirm(page, "Publish");
  check("published after approval (status from server)", await until(async () => (await page.locator("main header, main section").first().innerText()).includes("Published")));
  t = await main(page);
  check("live: revoke blocked (unpublish first); Open donations still blocked (payments disabled)", (await page.getByRole("button", { name: "Revoke approval" }).isDisabled()) && (await page.getByRole("button", { name: "Open donations" }).isDisabled()));
  await page.getByRole("tab", { name: "Fundraising" }).click();
  await page.getByLabel(/^Fundraising target/).fill("2000");
  check("live campaign: changing the target is blocked before saving (LIVE_CAMPAIGN_FINANCIAL_CHANGE mirror)", (await main(page)).includes("This campaign is live") && (await page.getByRole("button", { name: "Save changes" }).isDisabled()));
  await page.getByRole("button", { name: "Discard" }).click();
  await page.getByRole("tab", { name: "Publishing & approval" }).click();
  await page.locator("[data-action=unpublish]").click();
  await confirm(page, "Unpublish");
  await until(async () => (await page.locator("main header, main section").first().innerText()).includes("Draft"));
  await page.getByRole("tab", { name: "Fundraising" }).click();
  await page.getByLabel(/^Fundraising target/).fill("2000");
  check("approved draft: target change warns that approval will be removed", (await main(page)).includes("MEKI approval will be removed"));
  await page.getByRole("button", { name: "Discard" }).click();
  await page.getByRole("tab", { name: "Publishing & approval" }).click();
  await page.getByRole("button", { name: "Revoke approval" }).click();
  await confirm(page, "Revoke approval");
  check("approval revoked (draft, not live)", await until(async () => (await main(page)).includes("MEKI approval is not recorded.")));
  await page.locator("[data-action=archive]").click();
  await confirm(page, "Archive");
  check("archived → editing locked with the reason", await until(async () => (await main(page)).includes("Archived campaigns cannot be edited.")));
  await page.getByRole("tab", { name: "Activity" }).click();
  check("activity tab: audit history from the API (create/approve/publish…)", await until(async () => /Campaign · (approve|publish|create)/.test(await main(page))));
  await page.screenshot({ path: `${OUT}/campaign-activity-en.png`, fullPage: true });
  await ctx.close();

  // ───────────── role checks ─────────────
  step = "campaign manager";
  ({ ctx, page } = await open());
  await login(page, "campaign");
  await page.goto(`${WEB}/en/programs`, { waitUntil: "networkidle" });
  await page.locator("main table tbody tr").first().waitFor();
  check("campaign manager: programs readable, no 'New program'", (await page.getByRole("link", { name: "New program" }).count()) === 0);
  await page.goto(`${WEB}/en/programs/${ids.prg02}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Lifecycle" }).waitFor();
  check("campaign manager: program editor read-only (no save bar, publish disabled for permission)", (await main(page)).includes("You can view this record but not change it.") && (await page.getByRole("region", { name: "Save changes" }).count()) === 0);
  await page.goto(`${WEB}/en/campaigns/${ids.campaign}`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Publishing & approval" }).click();
  await page.getByRole("heading", { name: "MEKI approval" }).waitFor();
  check("campaign manager: approval disabled (campaigns.approve missing)", (await page.getByRole("button", { name: "Record approval" }).isDisabled()) && (await main(page)).includes("Your role does not include this permission."));
  await ctx.close();

  step = "content manager";
  ({ ctx, page } = await open());
  await login(page, "content");
  await page.goto(`${WEB}/en/campaigns/new`, { waitUntil: "networkidle" });
  check("content manager: cannot create campaigns (no campaigns.manage)", (await main(page)).includes("You do not have access to this section."));
  await page.goto(`${WEB}/en/media/${ids.mediaA}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "In use by" }).waitFor();
  check("content manager: media metadata editable, delete disabled (no media.delete)", (await page.getByRole("region", { name: "Save changes" }).count()) === 1 && (await page.getByRole("button", { name: "Delete" }).isDisabled()));
  await ctx.close();

  step = "door staff";
  ({ ctx, page } = await open());
  await login(page, "door");
  const n = calls.length;
  for (const p of ["/en/programs", "/en/causes", "/en/campaigns", "/en/media"]) {
    await page.goto(`${WEB}${p}`, { waitUntil: "networkidle" });
    check(`door staff: ${p} → no-access state`, (await main(page)).includes("You do not have access to this section."));
  }
  check("door staff: no content request was sent", !calls.slice(n).some((c) => /admin\/(programmes|projects|campaigns|media)/.test(c)));
  const api403 = await page.evaluate(async () => (await fetch("/api/v1/admin/programmes")).status);
  check("door staff: the API itself answers 403", api403 === 403, String(api403));
  await ctx.close();

  // ───────────── Arabic + responsive ─────────────
  step = "arabic";
  ({ ctx, page } = await open());
  await login(page, "admin", "ar");
  await page.goto(`${WEB}/ar/campaigns/new`, { waitUntil: "networkidle" });
  await page.getByRole("tab").first().waitFor();
  t = await main(page);
  check("ar: RTL page with Arabic labels; Arabic field RTL, English field LTR", (await page.evaluate(() => document.documentElement.dir)) === "rtl" && t.includes("حملة جديدة") && (await group(page, "العنوان").getByLabel(/^العربية/).getAttribute("dir")) === "rtl" && (await group(page, "العنوان").getByLabel(/^الإنجليزية/).getAttribute("dir")) === "ltr");
  await page.goto(`${WEB}/ar/programs?kind=PROGRAMME&provenance=VERIFIED_SOURCE`, { waitUntil: "networkidle" });
  await page.locator("main table tbody tr").first().waitFor();
  check("ar: programs list in Arabic with provenance badges", (await main(page)).includes("مصدر موثّق") && (await page.locator("aside").first().evaluate((e) => e.getBoundingClientRect().left)) > 700);
  await page.screenshot({ path: `${OUT}/programs-ar-1440.png`, fullPage: true });
  // the Arabic admin session is reused for all widths, both locales and the cleanup (the API rate-limits logins per IP)
  step = "responsive";
  for (const loc of ["en", "ar"]) {
    for (const w of [1440, 768, 390]) {
      await page.setViewportSize({ width: w, height: 860 });
      for (const p of ["/programs", `/programs/${ids.prg02}`, "/causes", `/causes/${ids.cause}`, "/campaigns", `/campaigns/${ids.campaign}`, "/campaigns/new", "/media", `/media/${ids.mediaA}`]) {
        await page.goto(`${WEB}/${loc}${p}`, { waitUntil: "networkidle" });
        await page.getByRole("heading", { level: 1 }).waitFor();
        check(`${loc} ${w}px ${p.replace(/\/[a-z0-9]{20,}$/, "/:id")}: no horizontal overflow`, await noOverflow(page));
      }
      if (w === 390) await page.screenshot({ path: `${OUT}/media-detail-${loc}-390.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // ───────────── cleanup through the UI (same session) ─────────────
  step = "cleanup";
  await page.goto(`${WEB}/en/campaigns/${ids.campaign}`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Publishing & approval" }).click();
  await page.getByRole("button", { name: "Delete" }).last().click();
  await confirm(page, "Delete");
  await waitUrl(page, /\/en\/campaigns$/);
  check("cleanup: archived campaign soft-deleted after confirmation", true);
  await page.goto(`${WEB}/en/media/${ids.mediaA}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "In use by" }).waitFor();
  await until(async () => (await page.getByRole("button", { name: "Delete" }).isEnabled()));
  await page.getByRole("button", { name: "Delete" }).click();
  await confirm(page, "Delete");
  await waitUrl(page, /\/en\/media$/);
  check("cleanup: media no longer used (deleted campaign) → soft-deleted after confirmation", true);
  await ctx.close();
} catch (e) {
  check(`unexpected error at step "${step}": ${e.message.split("\n").slice(0, 3).join(" | ")}`, false);
  console.log("recent failed API mutations:", apiErrors.slice(-4));
}

const uniq = [...new Set(problems)];
check("no console errors, page errors or off-origin requests during the run", uniq.length === 0, uniq.slice(0, 3).join(" | "));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed (real API, test database)`);
await browser.close();
process.exit(failed.length ? 1 : 0);
