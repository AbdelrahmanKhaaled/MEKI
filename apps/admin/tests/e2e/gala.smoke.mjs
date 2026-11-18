// Phase 6E browser smoke test (Gala operations) against the REAL API (manual, not part of `pnpm test`). Playwright + system Chrome.
//
//   API:    NODE_ENV=test PORT=4100 node dist/main.js   (apps/api — a *_test database; never development or production)
//   Admin:  ADMIN_API_UPSTREAM=http://localhost:4100 next build ; next start -p 3003
//   Run:    WEB_URL=http://localhost:3003 TAG=… PW=… FIXTURE=<json> node tests/e2e/gala.smoke.mjs [outDir]
//           FIXTURE = the JSON written by the temporary fixture script (one QA ticketed event "EVT-P6E-…" with test-flagged
//           bookings, sales CLOSED, QR tokens of its tickets) + accounts p6e-{admin,finance,staff,content}-<TAG>@meki.test.
// Real API + real database. Nothing is paid, no sales are opened (the "open sales" dialog is only opened and cancelled), and only
// the QA fixture event is written to (check-ins, one undo, one guest dietary correction, one job retry).
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const WEB = process.env.WEB_URL ?? "http://localhost:3003";
const { TAG, PW } = process.env;
const FX = JSON.parse(readFileSync(process.env.FIXTURE, "utf8"));
const OUT = process.argv[2] ?? "./smoke-out-6e";
const RUN = Date.now().toString(36);
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const problems = [];
const apiErrors = [];
const validateCalls = [];
let step = "start";
const until = async (fn, timeout = 15000) => { const end = Date.now() + timeout; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* retry */ } await new Promise((r) => setTimeout(r, 150)); } return false; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(w = 1440, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource.*(401|403|404|409|422)/.test(m.text()) && problems.push(`console: ${m.text().slice(0, 160)}`));
  page.on("response", async (r) => { if (r.url().includes("/api/v1/") && r.request().method() !== "GET" && r.status() >= 400) apiErrors.push(`${r.request().method()} ${new URL(r.url()).pathname} → ${r.status()} ${(await r.text().catch(() => "")).slice(0, 200)}`); });
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.endsWith("/check-in/validate")) validateCalls.push(Date.now());
    if (u.origin !== new URL(WEB).origin && !u.protocol.startsWith("data") && !u.protocol.startsWith("blob") && !u.port.startsWith("300")) problems.push(`foreign request: ${r.url()}`);
  });
  return { ctx, page };
}
async function login(page, who, locale = "en") {
  await page.goto(`${WEB}/${locale}/login`, { waitUntil: "networkidle" });
  await page.locator("input[type=email]").fill(`p6e-${who}-${TAG}@meki.test`);
  await page.locator("input[type=password]").fill(PW);
  await page.locator("button[type=submit]").click();
  await page.waitForURL(new RegExp(`/${locale}/dashboard`), { timeout: 20000 });
}
const adm = async (page, path) => (await (await page.request.get(`${WEB}/api/v1${path}`)).json())?.data;
const main = (page) => page.locator("main").innerText();
const confirm = async (page, label) => { const d = page.getByRole("dialog").last(); await d.getByRole("button", { name: label, exact: true }).click(); await until(async () => (await page.getByRole("dialog").count()) === 0); };
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
/** Navigate (full load → the chosen event resets to Gala Night) and select the QA fixture event. */
async function go(page, path, { fixture = true, locale = "en" } = {}) {
  await page.goto(`${WEB}/${locale}${path}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  if (fixture) {
    await page.getByTestId("gala-event-select").selectOption(FX.eventId);
    await until(async () => (await main(page)).includes(FX.eventCode));
  }
}
const E = `/admin/events/${FX.eventId}`;
const ticket = (k) => FX.tickets[k];

try {
  // ───────────── administrator ─────────────
  let { ctx, page } = await open();
  await login(page, "admin");
  step = "sidebar";
  const links = ["gala", "gala/bookings", "gala/guests", "gala/tickets", "gala/check-in", "gala/exports", "gala/communications", "gala/settings"];
  check("sidebar: all eight Gala operations pages are live links", (await Promise.all(links.map((l) => page.locator(`aside a[href='/en/${l}']`).count()))).every((n) => n === 1));

  step = "overview";
  await page.goto(`${WEB}/en/gala`, { waitUntil: "networkidle" });
  await page.getByTestId("kpi-total").waitFor();
  check("overview: Gala Night by default, sales closed, no donation figure shown, no tax value", (await main(page)).includes("EVT-GALA-NIGHT") && (await page.getByTestId("sales-state").innerText()) === "Sales closed" && (await page.getByTestId("no-donation-figure").count()) === 1);
  await page.getByTestId("gala-event-select").selectOption(FX.eventId);
  await until(async () => (await main(page)).includes(FX.eventCode));
  await page.getByTestId("include-test").check();
  await until(async () => (await page.getByTestId("kpi-total").innerText()).trim() === "4");
  const rev = await page.getByTestId("ticket-revenue").innerText();
  check("overview (QA event, TEST included): 4 bookings, 6 guests, 3 issued tickets", (await page.getByTestId("kpi-total").innerText()).trim() === "4" && (await page.getByTestId("kpi-guests").innerText()).trim() === "6" && (await page.getByTestId("kpi-issued").innerText()).trim() === "3");
  check("overview: ticket revenue 3,750 gross / 750 refunded / 3,000 net, labelled EVENT_TICKET_PAYMENT (separate from donations)", /\$3,750\b/.test(rev) && /\$750\b/.test(rev) && /\$3,000\b/.test(rev) && (await page.getByTestId("ticket-revenue").getAttribute("data-classification")) === "EVENT_TICKET_PAYMENT");
  await page.getByTestId("include-test").uncheck();
  await until(async () => (await page.getByTestId("kpi-total").innerText()).trim() === "0");
  check("overview: test-provider bookings are excluded by default (0 real bookings, no attendance %)", (await page.getByTestId("attendance-na").count()) === 1);

  step = "bookings";
  await go(page, "/gala/bookings");
  check("bookings: test bookings hidden by default", await until(async () => (await main(page)).includes("No bookings yet.")));
  await page.getByTestId("include-test").check();
  await until(async () => (await page.locator("main table tbody tr").count()) === 4);
  await page.getByLabel("Booking", { exact: true }).selectOption("CONFIRMED");
  await until(async () => (await page.locator("main table tbody tr").count()) === 2);
  check("bookings: status filter (Confirmed → 2) + TEST badges", (await page.locator("main table tbody tr").count()) === 2 && (await main(page)).includes("TEST"));
  await page.locator("main table tbody tr").filter({ hasText: FX.bookings.paidRef }).getByRole("link").first().click();
  await until(async () => /\/en\/gala\/bookings\/[a-z0-9]+/.test(page.url()));
  await page.getByTestId("booking-guests").waitFor();
  let t = await main(page);
  check("booking detail: guests with tickets (Arabic name), payment events classed EVENT_TICKET_PAYMENT, no tokens", t.includes("Layla Mansour") && t.includes("محمد عبد الرحمن") && t.includes(ticket("valid")) && (await page.locator("[data-classification=EVENT_TICKET_PAYMENT]").count()) >= 1 && !/mkt_/.test(await page.content()));
  check("booking detail: regenerate enabled only because PDFs are missing; cancel available; resend available", (await page.getByRole("button", { name: "Regenerate missing PDFs" }).isEnabled()) && (await page.getByRole("button", { name: "Cancel booking" }).isEnabled()));
  await page.getByRole("button", { name: "Edit guest" }).first().click();
  const dlg = page.getByRole("dialog");
  const diet = (await dlg.getByLabel(/^Dietary requirements/).inputValue()) === `Vegan ${RUN}` ? `Vegetarian ${RUN}` : `Vegan ${RUN}`;
  await dlg.getByLabel(/^Dietary requirements/).fill(diet);
  await dlg.getByRole("button", { name: "Save changes" }).click();
  await until(async () => (await page.getByRole("dialog").count()) === 0);
  await until(async () => (await main(page)).includes(diet));
  const audit = await adm(page, `/admin/audit-logs?entityType=EventBooking&entityId=${FX.bookings.paid}&pageSize=5`);
  check("booking detail: guest correction saved through the audited API (no QR rotation for a dietary change)", (await main(page)).includes(diet) && JSON.stringify(audit ?? []).includes("gala.booking.update"));

  step = "guests";
  await go(page, "/gala/guests");
  await page.getByTestId("include-test").check();
  await page.getByRole("searchbox").first().fill("محمد");
  await until(async () => (await page.locator("main table tbody tr").count()) === 1);
  await page.locator("main table tbody tr").first().getByRole("button").first().click();
  t = await page.getByTestId("guest-detail").innerText();
  check("guests: Arabic name search, guest detail with booking reference + ticket", t.includes("محمد عبد الرحمن") && t.includes(FX.bookings.paidRef) && t.includes(ticket("arabic")));
  await page.getByRole("dialog").getByRole("link", { name: "Open booking" }).click();
  await until(async () => page.url().includes(`/gala/bookings/${FX.bookings.paid}`));
  check("guests: navigates to the associated booking", page.url().includes(`/gala/bookings/${FX.bookings.paid}`));

  step = "tickets";
  await go(page, "/gala/tickets");
  await page.getByRole("searchbox").first().fill(ticket("revoked"));
  await until(async () => (await page.locator("main table tbody tr").count()) === 1);
  await page.locator("main table tbody tr").first().getByRole("button").first().click();
  await page.getByTestId("ticket-detail").waitFor();
  t = await page.getByTestId("ticket-detail").innerText();
  check("tickets: revoked ticket detail — PDF unavailable with reason, revoke / re-issue disabled", t.includes("Revoked") && (await page.getByTestId("ticket-pdf").isDisabled()) && t.includes("The ticket PDF is not available.") && (await page.getByRole("button", { name: "Revoke ticket" }).isDisabled()) && (await page.getByRole("button", { name: "Re-issue ticket" }).isDisabled()));
  await page.keyboard.press("Escape");
  // a real PDF: find any QA ticket in this test database that has one
  const evs = (await adm(page, "/admin/gala/events")) ?? [];
  let withPdf = null;
  for (const ev of evs.filter((x) => /^EVT-T5/.test(x.code)).slice(0, 25)) {
    const list = (await adm(page, `/admin/events/${ev.id}/tickets?status=ISSUED&pageSize=20`)) ?? [];
    const tk = list.find((x) => x.hasPdf);
    if (tk) { withPdf = { ev, tk }; break; }
  }
  if (withPdf) {
    await page.goto(`${WEB}/en/gala/tickets`, { waitUntil: "networkidle" });
    await page.getByTestId("gala-event-select").selectOption(withPdf.ev.id);
    await page.getByRole("searchbox").first().fill(withPdf.tk.ticketNumber);
    await until(async () => (await page.locator("main table tbody tr").count()) === 1);
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId(`pdf-${withPdf.tk.ticketNumber}`).first().click()]);
    const file = await dl.path();
    const head = readFileSync(file).subarray(0, 5).toString();
    check("tickets: A5 ticket PDF downloads through the authenticated proxy (real stored PDF)", head === "%PDF-" && dl.suggestedFilename() === `${withPdf.tk.ticketNumber}.pdf`);
  } else console.log("SKIP  ticket PDF download (no QA ticket with a stored PDF in this database)");

  step = "exports";
  await go(page, "/gala/exports");
  await page.getByTestId("include-test").check();
  await until(async () => (await page.getByTestId("export-count").innerText()).includes("6 guests"));
  check("exports: count reflects the active filters (6 guests incl. TEST)", (await page.getByTestId("export-count").innerText()).includes("6 guests"));
  await page.getByLabel(/CSV/).check();
  let [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-download").click()]);
  const csv = readFileSync(await dl.path(), "utf8");
  check("exports: CSV (BOM, header, Arabic name, dietary field) via the existing endpoint", csv.charCodeAt(0) === 0xfeff && csv.includes("Full Name") && csv.includes("محمد عبد الرحمن") && csv.includes(diet) && dl.suggestedFilename().endsWith(".csv"));
  await page.getByLabel(/XLSX/).check();
  [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-download").click()]);
  check("exports: XLSX workbook", readFileSync(await dl.path()).subarray(0, 2).toString() === "PK" && dl.suggestedFilename().endsWith(".xlsx"));
  const exportAudit = await adm(page, `/admin/audit-logs?action=gala.guests.export&pageSize=5`);
  check("exports: every export is audited", JSON.stringify(exportAudit ?? []).includes(FX.eventId));

  step = "communications";
  await go(page, "/gala/communications");
  await page.getByTestId("job-summary").waitFor();
  await until(async () => (await main(page)).includes(FX.bookings.resendRef));
  t = await main(page);
  check("communications: queue summary, sanitised errors, transport shown (memory = test only)", t.includes("QA: simulated storage outage") && t.includes("Development transport") && t.includes(FX.bookings.resendRef));
  await page.locator("main table tbody tr").filter({ hasText: "Failed" }).getByRole("button", { name: "Retry booking" }).click();
  await confirm(page, "Retry booking");
  await until(async () => (await main(page)).includes("re-queued"));
  const jobsAfter = await adm(page, `${E}/jobs?search=${FX.bookings.resendRef}`);
  check("communications: retry re-queues the booking's failed/parked jobs through the existing queue (no second queue)", (await main(page)).includes("re-queued") && jobsAfter.items.every((j) => j.status !== "FAILED" || j.attempts < 5));

  step = "settings";
  await go(page, "/gala/settings");
  await page.getByTestId("sales-enabled").waitFor();
  check("settings: sales closed, online payment unavailable/unknown, approved reference info shown (not applied)", (await page.getByTestId("sales-enabled").innerText()) === "Closed" && (await main(page)).includes("Every Light Counts · Date: Saturday, December 12, 2026"));
  await page.getByTestId("sales-toggle").click();
  const sd = page.getByRole("dialog");
  check("settings: opening sales needs typing OPEN (confirm disabled)", await sd.getByRole("button", { name: "Open ticket sales", exact: true }).isDisabled());
  await sd.getByRole("button", { name: /Cancel|Close/ }).first().click();
  check("settings: sales still closed on the server after cancelling", (await adm(page, `${E}/ticketing`)).salesEnabled === false);
  await page.getByLabel(/^Ticket price/).fill("800");
  await page.getByRole("region", { name: "Save changes" }).getByRole("button", { name: "Save changes" }).click();
  check("settings: a price change asks for confirmation first", (await page.getByRole("dialog").innerText()).includes("From 750.00 to 800 USD"));
  await page.getByRole("dialog").getByRole("button", { name: /Cancel|Close/ }).first().click();
  await page.getByRole("region", { name: "Save changes" }).getByRole("button", { name: "Discard" }).click();
  await page.getByLabel(/^Capacity/).fill("0");
  check("settings: invalid capacity blocks saving; price unchanged on the server", (await page.getByRole("region", { name: "Save changes" }).getByRole("button", { name: "Save changes" }).isDisabled()) && (await adm(page, `${E}/ticketing`)).ticketPrice === "750.00");
  await page.getByRole("region", { name: "Save changes" }).getByRole("button", { name: "Discard" }).click();

  // ───────────── RTL + responsive (Gala Night, all pages) ─────────────
  step = "layout";
  for (const loc of ["ar", "en"]) {
    for (const w of [1440, 768, 390]) {
      await page.setViewportSize({ width: w, height: 860 });
      for (const p of ["/gala", "/gala/bookings", "/gala/guests", "/gala/tickets", "/gala/check-in", "/gala/check-in/history", "/gala/exports", "/gala/communications", "/gala/settings"]) {
        await page.goto(`${WEB}/${loc}${p}`, { waitUntil: "networkidle" });
        await page.getByRole("heading", { level: 1 }).first().waitFor();
        check(`${loc} ${w}px ${p}: no horizontal overflow${loc === "ar" ? ", dir=rtl" : ""}`, (await noOverflow(page)) && (loc === "en" || (await page.evaluate(() => document.documentElement.dir)) === "rtl"));
      }
      if (w === 390) await page.screenshot({ path: `${OUT}/checkin-${loc}-390.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await ctx.close();

  // ───────────── door staff (EVENT_CHECKIN_STAFF): scanning ─────────────
  step = "staff";
  ({ ctx, page } = await open(820, 1180)); // tablet portrait
  await login(page, "staff");
  check("door staff: sidebar shows only the dashboard and QR check-in; dashboard links to the scanner", (await page.locator("aside a[href^='/en/gala']").count()) === 1 && (await page.locator("main a[href='/en/gala/check-in']").count()) === 1);
  await go(page, "/gala/check-in");
  const scan = async (value) => { await page.getByTestId("scan-input").fill(value); await page.getByTestId("scan-input").press("Enter"); };
  const resultIs = (r) => until(async () => (await page.getByTestId("checkin-result").getAttribute("data-result")) === r);
  await scan(FX.tokens.valid);
  check("check-in: valid QR → VALID, guest name shown, input cleared (token never displayed)", (await resultIs("VALID")) && (await page.getByTestId("checkin-result").innerText()).includes("Layla Mansour") && (await page.getByTestId("scan-input").inputValue()) === "" && !(await page.content()).includes(FX.tokens.valid));
  const n0 = validateCalls.length;
  await scan(FX.tokens.valid); // immediate repeat (camera sees the same code every frame)
  await sleep(600);
  check("check-in: an immediate repeat of the same code is not resent", validateCalls.length === n0);
  await sleep(2200);
  await scan(FX.tokens.valid);
  check("check-in: a later rescan → ALREADY_CHECKED_IN from the server (no second attendance record)", await resultIs("ALREADY_CHECKED_IN"));
  await scan(FX.tokens.revoked);
  check("check-in: cancelled ticket → REVOKED", await resultIs("REVOKED"));
  await scan(FX.tokens.refunded);
  check("check-in: refunded ticket → REFUNDED", await resultIs("REFUNDED"));
  await scan("TK-NOT-A-REAL-CODE");
  check("check-in: unknown code → INVALID", await resultIs("INVALID"));
  await page.getByTestId("verify-only").check();
  await scan(FX.tokens.arabic);
  await until(async () => (await page.getByTestId("checkin-result").innerText()).includes("Verified only"));
  check("check-in: verify-only looks up without checking in (Arabic name, RTL-safe)", (await page.getByTestId("checkin-result").innerText()).includes("محمد عبد الرحمن") && (await adm(page, `${E}/check-in/lookup?q=${encodeURIComponent("محمد")}`))[0].status === "ISSUED");
  await page.getByTestId("verify-only").uncheck();
  await until(async () => (await page.getByTestId("stat-arrived").innerText()).includes("1"));
  check("check-in: live statistics (1 arrived)", (await page.getByTestId("stat-arrived").innerText()).includes("1"));
  await page.getByTestId("door-lookup").fill("Layla");
  await page.getByTestId("door-lookup").press("Enter");
  await page.getByTestId("lookup-results").waitFor();
  t = await page.getByTestId("lookup-results").innerText();
  check("door lookup: minimal row (name, ticket, status); manual check-in locked for door staff", t.includes(ticket("valid")) && t.includes("Checked in") && !t.includes("@") && (await main(page)).includes("ask a supervisor") && (await page.getByTestId("lookup-results").getByRole("button").count()) === 0);
  await page.getByRole("button", { name: "Start camera" }).click();
  await until(async () => (await page.getByTestId("qr-scanner").getAttribute("data-state")) !== "starting");
  const camState = await page.getByTestId("qr-scanner").getAttribute("data-state");
  check("scanner: camera start handled (running / denied / unsupported → message + manual fallback)", ["running", "denied", "unsupported", "error"].includes(camState), camState);
  await page.goto(`${WEB}/en/gala/check-in/history`, { waitUntil: "networkidle" });
  await page.getByTestId("gala-event-select").selectOption(FX.eventId);
  await until(async () => (await page.locator("main table tbody tr").count()) >= 5);
  t = await main(page);
  check("history: QR check-in, already-used, revoked, refunded and invalid scans recorded by the server", ["QR check-in", "Already used", "Cancelled ticket", "Refunded ticket", "Invalid / not found"].every((s) => t.includes(s)));
  await page.goto(`${WEB}/en/gala/bookings`, { waitUntil: "networkidle" });
  check("door staff: bookings page refused (no gala.bookings.read)", (await main(page)).includes("access"));
  await ctx.close();

  // ───────────── administrator: manual check-in + undo ─────────────
  step = "manual";
  ({ ctx, page } = await open());
  await login(page, "admin");
  await go(page, "/gala/check-in");
  await page.getByTestId("door-lookup").fill("محمد");
  await page.getByTestId("door-lookup").press("Enter");
  await page.getByTestId("lookup-results").getByRole("button", { name: "Check in manually" }).click();
  await confirm(page, "Check in manually");
  await until(async () => (await page.getByTestId("lookup-results").innerText()).includes("Checked in"));
  check("supervisor: manual check-in (audited) after lookup", (await adm(page, `${E}/check-in/lookup?q=${encodeURIComponent("محمد")}`))[0].status === "CHECKED_IN");
  await page.getByTestId("lookup-results").getByRole("button", { name: "Undo check-in" }).click();
  await page.getByRole("dialog").getByLabel(/^Reason/).fill("QA: checked in the wrong guest");
  await confirm(page, "Undo check-in");
  await until(async () => (await adm(page, `${E}/check-in/lookup?q=${encodeURIComponent("محمد")}`))[0].status === "ISSUED");
  check("supervisor: undo with a reason restores the ticket", (await adm(page, `${E}/check-in/lookup?q=${encodeURIComponent("محمد")}`))[0].status === "ISSUED");
  await ctx.close();

  // ───────────── finance + content manager ─────────────
  step = "finance";
  ({ ctx, page } = await open());
  await login(page, "finance");
  check("finance: Gala overview/bookings/guests/tickets/communications/settings — no export, no check-in", (await page.locator("aside a[href='/en/gala/bookings']").count()) === 1 && (await page.locator("aside a[href='/en/gala/exports'], aside a[href='/en/gala/check-in']").count()) === 0);
  await go(page, "/gala/settings");
  check("finance: settings read-only, sales switch disabled (no events.approve)", (await main(page)).includes("can view but not change") && (await page.getByTestId("sales-toggle").isDisabled()));
  await go(page, "/gala/bookings");
  await page.getByTestId("include-test").check();
  await until(async () => (await page.locator("main table tbody tr").count()) === 4);
  await page.locator("main table tbody tr").filter({ hasText: FX.bookings.paidRef }).getByRole("link").first().click();
  await page.getByTestId("booking-guests").waitFor();
  check("finance: booking read-only (no edit, cancel or resend)", (await page.getByRole("button", { name: "Edit guest" }).count()) === 0 && (await page.getByRole("button", { name: "Cancel booking" }).isDisabled()) && (await page.getByRole("button", { name: "Resend confirmation & tickets" }).isDisabled()));
  await page.goto(`${WEB}/en/gala/exports`, { waitUntil: "networkidle" });
  check("finance: exports page refused", (await main(page)).includes("access"));
  await ctx.close();

  step = "content";
  ({ ctx, page } = await open());
  await login(page, "content");
  check("content manager: no Gala operations pages (no guest/booking/financial data)", (await page.locator("aside a[href^='/en/gala']").count()) === 0);
  await page.goto(`${WEB}/en/gala/guests`, { waitUntil: "networkidle" });
  check("content manager: guests page refused", (await main(page)).includes("access"));
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
