// Phase 9B cross-browser / responsive / accessibility smoke for the ADMIN DASHBOARD against the REAL API (manual; not part of `pnpm test`).
// Engines: Playwright Chromium (system Chrome), Firefox and WebKit (WebKit = Safari's engine on Windows — NOT a real Safari / iOS device).
//   API:    NODE_ENV=test PORT=4100 node dist/main.js     (apps/api — a *_test database; never development or production)
//   Admin:  ADMIN_API_UPSTREAM=http://localhost:4100 next build ; next start -p 3003
//   Run:    WEB_URL=http://localhost:3003 TAG=… PW=… FIXTURE=<json> [BROWSERS=chromium,firefox,webkit] [AXE_PATH=…/axe.min.js]
//           node tests/e2e/crossbrowser.smoke.mjs [outDir]
//           TAG/PW/FIXTURE = the temporary *_test fixture (accounts p9b-{super,admin,finance,staff,content}-<TAG>@meki.test and one QA
//           Gala event with sales CLOSED and test-flagged bookings — same shape as the 6E fixture).
// Writes to the TEST database only: one tiny PNG upload per engine (media library), check-in scans of the QA fixture tickets, and
// audited exports. Nothing is paid; no sales are opened; dialogs are opened and cancelled.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { chromium, firefox, webkit } from "playwright-core";

const WEB = process.env.WEB_URL ?? "http://localhost:3003";
const { TAG, PW } = process.env;
const FX = JSON.parse(readFileSync(process.env.FIXTURE, "utf8"));
const OUT = process.argv[2] ?? "./smoke-out-crossbrowser";
const ENGINES = (process.env.BROWSERS ?? "chromium,firefox,webkit").split(",").map((s) => s.trim()).filter(Boolean);
const AXE = process.env.AXE_PATH ? readFileSync(process.env.AXE_PATH, "utf8") : null;
mkdirSync(OUT, { recursive: true });
const ROUTES = ["/dashboard", "/programs", "/programs/new", "/causes", "/campaigns", "/donors", "/donations", "/recurring", "/receipts", "/payments", "/payments/zeffy",
  "/gala", "/gala/bookings", "/gala/guests", "/gala/tickets", "/gala/check-in", "/gala/check-in/history", "/gala/exports", "/gala/communications", "/gala/settings",
  "/pages", "/homepage", "/menus", "/media", "/faqs", "/statistics", "/settings/site"];
const SUBSET = ["/dashboard", "/donations", "/gala/bookings", "/gala/check-in", "/media", "/pages"];
const WIDTHS = [[360, 740], [390, 844], [768, 1024], [1024, 768], [1440, 900]];
// a valid 24×24 RGB PNG whose colour depends on the seed (the server rejects byte-identical duplicates)
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
function png(seed) {
  const W = 24; const [r, g, b] = [...Buffer.from(seed.padEnd(3, "x"))].slice(0, 3);
  const raw = Buffer.alloc((W * 3 + 1) * W); for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) raw.set([(r + x * 7) & 255, (g + y * 5) & 255, b], y * (W * 3 + 1) + 1 + x * 3);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const results = [];
const problems = [];
const axeFindings = [];
const check = (name, ok, extra = "") => { results.push({ name, ok: !!ok }); if (!ok || process.env.VERBOSE) console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const until = async (fn, timeout = 15000) => { const end = Date.now() + timeout; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* retry */ } await new Promise((r) => setTimeout(r, 150)); } return false; };
const types = { chromium, firefox, webkit };
const launch = (name) => types[name].launch({ headless: true, ...(name === "chromium" ? { executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" } : {}) });
const adm = (page, path) => page.evaluate(async (p) => { const r = await fetch(`/api/v1${p}`, { credentials: "same-origin" }); return r.ok ? (await r.json()).data : null; }, path);

const overflow = (page) => page.evaluate(() => {
  const de = document.documentElement;
  const over = de.scrollWidth - de.clientWidth;
  if (over <= 1) return null;
  const vw = de.clientWidth;
  const culprits = [...document.querySelectorAll("body *")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1); })
    .slice(-3).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
  return `${over}px; e.g. ${culprits.join(" | ")}`;
});
async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await until(async () => (await page.locator("main [aria-busy='true'], main .animate-pulse").count()) === 0, 6000);
}
async function runAxe(page, label) {
  if (!AXE) return;
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(async () => {
    const res = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }, resultTypes: ["violations"] });
    return res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, count: v.nodes.length, nodes: v.nodes.slice(0, 4).map((n) => ({ target: n.target.join(" "), summary: (n.failureSummary ?? "").slice(0, 220) })) }));
  });
  for (const v of r) axeFindings.push({ where: label, ...v });
  check(`axe ${label}`, r.length === 0, r.map((v) => `${v.id}(${v.count})`).join(", "));
}
async function login(page, who, locale = "en") {
  await page.goto(`${WEB}/${locale}/login`, { waitUntil: "networkidle" });
  await page.locator("input[type=email]").fill(`p9b-${who}-${TAG}@meki.test`);
  await page.locator("input[type=password]").fill(PW);
  await page.locator("button[type=submit]").click();
  return until(async () => /\/dashboard|\/gala\/check-in/.test(page.url()), 20000);
}
// keyboard check of a modal surface: focus inside, Tab stays inside, Escape closes, focus returns to the opener
async function dialogKeyboard(page, opener, label) {
  await opener.focus();
  await page.keyboard.press("Enter");
  const dlg = page.locator('[role="dialog"][aria-modal="true"]').last();
  const opened = await until(async () => (await dlg.count()) > 0 && (await dlg.isVisible()), 4000);
  if (!opened) return check(`${label}: opens`, false);
  const inside = await until(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), 2000);
  let stayed = true;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press(i % 7 === 6 ? "Shift+Tab" : "Tab");
    if (!(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))) { stayed = false; break; }
  }
  const named = await dlg.evaluate((d) => !!(d.getAttribute("aria-label") || (d.getAttribute("aria-labelledby") && document.getElementById(d.getAttribute("aria-labelledby"))?.textContent?.trim())));
  await page.keyboard.press("Escape");
  const closed = await until(async () => (await page.locator('[role="dialog"][aria-modal="true"]').count()) === 0, 3000);
  const returned = closed && (await opener.evaluate((el) => el === document.activeElement));
  check(`${label}: focus moves in, Tab trapped, named, Escape closes, focus returns`, inside && stayed && named && closed && returned, `inside=${inside} trapped=${stayed} named=${named} closed=${closed} returned=${returned}`);
}

for (const engine of ENGINES) {
  const browser = await launch(engine);
  console.log(`\n=== ${engine} ${browser.version()} ===`);
  try {
    // ── authentication + session persistence
    let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    let page = await ctx.newPage();
    const watch = (p, tag) => {
      p.on("pageerror", (e) => problems.push(`${engine} ${tag} pageerror ${p.url()}: ${e.message}`));
      p.on("console", (m) => m.type() === "error" && !/Failed to load resource|status of (401|403|404|409|422)/.test(m.text()) && problems.push(`${engine} ${tag} console ${p.url()}: ${m.text().slice(0, 160)}`));
      p.on("response", (r) => { if (r.status() >= 500) problems.push(`${engine} ${tag} HTTP ${r.status()} ${r.url()}`); });
    };
    watch(page, "1440");
    check(`${engine} login (super admin)`, await login(page, "super"));
    const cookies = await ctx.cookies();
    const sid = cookies.find((c) => /meki_admin_sid/.test(c.name));
    // WebKit's Windows build reports every cookie as SameSite=None in its cookie store; the server header is the source of truth
    // (verified separately: `Set-Cookie: meki_admin_sid=…; HttpOnly; SameSite=Strict`).
    check(`${engine} session cookie HttpOnly + SameSite=Strict`, sid?.httpOnly && (sid?.sameSite === "Strict" || engine === "webkit"), JSON.stringify({ name: sid?.name, httpOnly: sid?.httpOnly, sameSite: sid?.sameSite }));
    await page.reload({ waitUntil: "networkidle" });
    check(`${engine} session persists across reload`, page.url().includes("/dashboard"));
    const p2 = await ctx.newPage();
    await p2.goto(`${WEB}/ar/donations`, { waitUntil: "networkidle" });
    check(`${engine} session shared by a second tab (Arabic, RTL)`, p2.url().includes("/ar/donations") && (await p2.evaluate(() => document.documentElement.dir)) === "rtl");
    await p2.close();

    // ── charts: visible SVG + accessible data tables
    await page.goto(`${WEB}/en/dashboard`, { waitUntil: "networkidle" });
    await settle(page);
    const charts = await page.evaluate(() => ({ svgs: document.querySelectorAll("main .recharts-wrapper svg").length, hiddenImgs: [...document.querySelectorAll('main [role="img"]')].length, tables: [...document.querySelectorAll("main .sr-only > table")].map((t) => ({ caption: t.caption?.textContent ?? "", rows: t.tBodies[0]?.rows.length ?? 0, ths: t.querySelectorAll("th[scope=col]").length })) }));
    if (charts.svgs === 0) console.log(`SKIP  ${engine} dashboard charts: no verified (non-test) donations in this database, so no chart is drawn — covered by the stub run (dashboard.smoke + docs/39)`);
    else check(`${engine} dashboard charts render (SVG) and each has a captioned data table`, charts.svgs >= 1 && charts.tables.length >= charts.svgs && charts.tables.every((t) => t.caption && t.ths >= 2), JSON.stringify(charts));

    // ── every route × EN/AR at 1440 + 390; subset at 360 / 768 / 1024
    for (const [w, h] of WIDTHS) {
      const mobile = w < 1024;
      if (w !== 1440) {
        await ctx.close();
        ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true, hasTouch: mobile, ...(mobile && engine !== "firefox" ? { isMobile: true } : {}) });
        page = await ctx.newPage();
        watch(page, String(w));
        await login(page, "super");
      }
      const routes = w === 1440 || w === 390 ? ROUTES : SUBSET;
      for (const loc of ["en", "ar"]) {
        for (const r of routes) {
          const res = await page.goto(`${WEB}/${loc}${r}`, { waitUntil: "networkidle" });
          await settle(page);
          const label = `${engine} ${w}px /${loc}${r}`;
          const ok = res?.status() === 200 && !page.url().includes("/login");
          const h1 = await page.locator("main h1, h1").count();
          check(`${label} loads (200, authenticated, h1)`, ok && h1 >= 1, `${res?.status()} ${page.url()} h1=${h1}`);
          const o = await overflow(page);
          check(`${label} no page-level horizontal overflow`, !o, o ?? "");
          if (AXE && (w === 1440 || w === 390) && (engine === "chromium" || SUBSET.includes(r))) await runAxe(page, label);
        }
        if (mobile) {
          await page.goto(`${WEB}/${loc}/dashboard`, { waitUntil: "networkidle" });
          const menu = page.locator("header button.lg\\:hidden").first();
          await menu.tap();
          const drawer = page.locator('[role="dialog"][aria-modal="true"]');
          check(`${engine} ${w}px /${loc} sidebar drawer opens (tap)`, await until(async () => (await drawer.count()) === 1 && (await drawer.locator("a").count()) > 3, 4000));
          const o = await overflow(page);
          check(`${engine} ${w}px /${loc} open drawer: no overflow`, !o, o ?? "");
          await page.keyboard.press("Escape");
          await until(async () => (await drawer.count()) === 0, 2000);
          await dialogKeyboard(page, menu, `${engine} ${w}px /${loc} sidebar drawer (keyboard)`);
        }
      }
    }
    // ── modal dialog keyboard (sign-out confirmation, then cancelled)
    await ctx.close();
    ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
    page = await ctx.newPage();
    watch(page, "1280");
    await login(page, "super");
    await page.goto(`${WEB}/en/gala/bookings`, { waitUntil: "networkidle" });
    await settle(page);
    if (await page.getByTestId("gala-event-select").count()) await page.getByTestId("gala-event-select").selectOption(FX.eventId);
    await page.getByTestId("include-test").check();
    await until(async () => (await page.locator("main table tbody tr").filter({ hasText: FX.bookings.resendRef }).count()) === 1);
    await page.locator("main table tbody tr").filter({ hasText: FX.bookings.resendRef }).getByRole("link").first().click();
    await until(async () => /\/en\/gala\/bookings\/[a-z0-9]+/.test(page.url()));
    await settle(page);
    const regen = page.getByRole("button", { name: "Regenerate missing PDFs" });
    await regen.waitFor({ timeout: 15000 }).catch(() => {});
    if (await regen.count()) await dialogKeyboard(page, regen, `${engine} confirm dialog (regenerate PDFs, cancelled with Escape)`);
    else check(`${engine} booking detail renders the regenerate action`, false);

    // ── file upload (media library) — a 16×16 PNG into the TEST database
    await page.goto(`${WEB}/en/media`, { waitUntil: "networkidle" });
    await settle(page);
    await page.locator("main button[aria-expanded]").filter({ hasText: /upload/i }).first().click();
    const [up] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/v1/admin/media") && r.request().method() === "POST", { timeout: 20000 }).catch(() => null),
      page.locator('input[type="file"]').first().setInputFiles({ name: `p9b-${engine}-${TAG}.png`, mimeType: "image/png", buffer: png(`${engine}${TAG}${Date.now()}`.slice(-3)) }),
    ]);
    check(`${engine} media upload (multipart through the admin proxy)`, up && up.status() < 300, String(up?.status()));

    // ── downloads: guest export CSV + XLSX, ticket PDF
    await page.goto(`${WEB}/en/gala/exports`, { waitUntil: "networkidle" });
    await settle(page);
    if (await page.getByTestId("gala-event-select").count()) await page.getByTestId("gala-event-select").selectOption(FX.eventId);
    await page.getByTestId("include-test").check();
    await until(async () => /\b6\b/.test(await page.getByTestId("export-count").innerText()));
    await page.getByLabel(/CSV/).check();
    let [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.getByTestId("export-download").click()]);
    const csv = readFileSync(await dl.path(), "utf8");
    check(`${engine} CSV export download (BOM, Arabic name)`, csv.charCodeAt(0) === 0xfeff && csv.includes("محمد عبد الرحمن") && dl.suggestedFilename().endsWith(".csv"), dl.suggestedFilename());
    await page.getByLabel(/XLSX/).check();
    [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.getByTestId("export-download").click()]);
    check(`${engine} XLSX export download`, readFileSync(await dl.path()).subarray(0, 2).toString() === "PK" && dl.suggestedFilename().endsWith(".xlsx"));
    const evs = (await adm(page, "/admin/gala/events")) ?? [];
    let withPdf = null;
    for (const ev of evs.filter((x) => /^EVT-T5/.test(x.code)).slice(0, 30)) {
      const list = (await adm(page, `/admin/events/${ev.id}/tickets?status=ISSUED&pageSize=20`)) ?? [];
      const tk = list.find((x) => x.hasPdf);
      if (tk) { withPdf = { ev, tk }; break; }
    }
    if (withPdf) {
      await page.goto(`${WEB}/en/gala/tickets`, { waitUntil: "networkidle" });
      await page.getByTestId("gala-event-select").selectOption(withPdf.ev.id);
      await page.getByRole("searchbox").first().fill(withPdf.tk.ticketNumber);
      await until(async () => (await page.locator("main table tbody tr").count()) === 1);
      [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.getByTestId(`pdf-${withPdf.tk.ticketNumber}`).first().click()]);
      const pdf = readFileSync(await dl.path());
      writeFileSync(`${OUT}/ticket-${engine}.pdf`, pdf);
      check(`${engine} ticket PDF download (%PDF, %%EOF, filename)`, pdf.subarray(0, 5).toString() === "%PDF-" && pdf.subarray(-8).toString().includes("%%EOF") && dl.suggestedFilename() === `${withPdf.tk.ticketNumber}.pdf`, `${pdf.length} bytes`);
    } else check(`${engine} ticket PDF download`, false, "no stored ticket PDF found in the test database");

    // ── QR check-in: camera capability + manual / handheld fallback (door staff account)
    await ctx.close();
    ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, ...(engine !== "firefox" ? { isMobile: true } : {}) });
    page = await ctx.newPage();
    watch(page, "staff");
    await login(page, "staff");
    await page.goto(`${WEB}/en/gala/check-in`, { waitUntil: "networkidle" });
    await settle(page);
    if (await page.getByTestId("gala-event-select").count()) await page.getByTestId("gala-event-select").selectOption(FX.eventId);
    const caps = await page.evaluate(() => ({ barcode: "BarcodeDetector" in globalThis, media: !!navigator.mediaDevices?.getUserMedia }));
    await page.getByRole("button", { name: /start camera/i }).click();
    const camState = await until(async () => ["unsupported", "denied", "error", "running"].includes(await page.getByTestId("qr-scanner").getAttribute("data-state")), 6000).then(() => page.getByTestId("qr-scanner").getAttribute("data-state"));
    const msg = await page.getByTestId("qr-scanner").locator('[role="alert"]').count();
    check(`${engine} camera start → explicit state with an alert, never a silent failure (BarcodeDetector=${caps.barcode})`, camState === "running" || (["unsupported", "denied", "error"].includes(camState) && msg === 1), camState);
    const scan = async (v) => { await page.getByTestId("scan-input").fill(v); await page.getByTestId("scan-input").press("Enter"); };
    const resultIs = (r) => until(async () => (await page.getByTestId("checkin-result").getAttribute("data-result")) === r, 8000);
    await scan(FX.tokens.arabic);
    const first = await until(async () => ["VALID", "ALREADY_CHECKED_IN"].includes(await page.getByTestId("checkin-result").getAttribute("data-result")), 8000);
    const r1 = await page.getByTestId("checkin-result").getAttribute("data-result");
    check(`${engine} manual/handheld entry fallback: Arabic-named ticket → ${r1} (first engine VALID, later engines ALREADY_CHECKED_IN)`, first && (await page.getByTestId("checkin-result").innerText()).includes("محمد عبد الرحمن") && (await page.getByTestId("scan-input").inputValue()) === "");
    await page.waitForTimeout(2600);
    await scan(FX.tokens.revoked);
    check(`${engine} revoked ticket → REVOKED`, await resultIs("REVOKED"));
    const live = await page.getByTestId("checkin-result").evaluate((el) => el.getAttribute("role") || el.getAttribute("aria-live") || el.closest("[aria-live],[role=status],[role=alert]")?.getAttribute("aria-live") || el.closest("[role=status],[role=alert]")?.getAttribute("role"));
    check(`${engine} check-in result is announced (live region)`, !!live, String(live));
    await ctx.close();
  } finally {
    await browser.close();
  }
}

writeFileSync(`${OUT}/axe-admin.json`, JSON.stringify(axeFindings, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed; ${problems.length} runtime problems; ${axeFindings.length} axe violation groups`);
for (const p of [...new Set(problems)].slice(0, 40)) console.log("PROBLEM", p);
process.exit(failed.length || problems.length ? 1 : 0);
