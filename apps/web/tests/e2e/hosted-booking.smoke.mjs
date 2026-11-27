// Phase 12 manual browser smoke: SDI-hosted Gala booking (not part of `pnpm test`).
// A STUB API in zeffy_hosted mode (no backend, no Zeffy, nothing is paid). The SDI form URL below is the one SDI supplied;
// the browser never opens it (the test reads the link's href only).
//
//   1. build:  NEXT_PUBLIC_API_URL=http://localhost:4556 pnpm --filter @meki/web build
//   2. serve:  API_INTERNAL_URL=http://localhost:4556 pnpm --filter @meki/web start      (port 3000)
//   3. run:    node tests/e2e/hosted-booking.smoke.mjs [outDir]          (BROWSER=firefox|webkit for other engines)
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { chromium, firefox, webkit } from "playwright-core";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const OUT = process.argv[2] ?? "./smoke-out-hosted";
const ENGINE = process.env.BROWSER ?? "chromium";
mkdirSync(OUT, { recursive: true });
const FORM = "https://givebutter.com/c/SDI-Misr-El-Kheir";
const TOKEN = "stub-hosted-token-0123456789abcdef";
const REF = "EB-HSTD00000001";

const state = { posts: 0, lastBody: null, checkouts: 0, formUrl: FORM };
const gate = () => ({ available: true, formUrl: state.formUrl, referenceQuestion: "MEKI Booking Reference", referenceFormat: "EB-XXXXXXXXXXXX", ticketsIssuedBy: "ZEFFY", referencePrefill: false });
const TICKETING = () => ({
  event: { slug: "gala-night", name: "Every Light Counts", dateLabel: "Saturday, December 12, 2026", venue: "583 Park Avenue, New York, USA" },
  ticket: { name: "Individual ticket", type: "INDIVIDUAL", price: "750.00", currency: "USD", tablesAvailable: false, perGuest: true },
  classification: "EVENT_TICKET_PAYMENT", salesOpen: true, soldOut: false, maxTicketsPerBooking: 6, checkoutAvailable: false,
  calendar: { available: false, reason: "SCHEDULE_PENDING" }, mode: "zeffy_hosted", hosted: gate(),
});
const STATUS = (ref, confirmed) => ({
  reference: ref, bookingStatus: confirmed ? "CONFIRMED" : "PENDING", paymentStatus: confirmed ? "PAID" : "UNPAID", confirmed, message: confirmed ? "confirmed_by_sdi" : "awaiting_sdi_report",
  ticketCount: 2, totalAmount: "1500.00", currency: "USD", classification: "EVENT_TICKET_PAYMENT", event: TICKETING().event, calendar: { available: false, reason: "SCHEDULE_PENDING" },
  tickets: [], ticketIssuer: "ZEFFY", hosted: confirmed ? null : gate(),
});

const api = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", WEB);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Booking-Token, Idempotency-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  const p = new URL(req.url, "http://x").pathname.replace(/^\/api\/v1/, "");
  const json = (code, data, err) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(err ? { error: { statusCode: code, code: err } } : { data })); };
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.method === "GET" && p === "/public/events/gala-night/ticketing") return json(200, TICKETING());
    if (req.method === "POST" && p === "/public/events/gala-night/hosted-bookings") {
      state.posts += 1;
      state.lastBody = JSON.parse(body);
      return setTimeout(() => json(201, { reference: REF, accessToken: TOKEN, bookingStatus: "PENDING", paymentStatus: "UNPAID", ticketCount: state.lastBody.ticketCount, unitPrice: "750.00", totalAmount: `${750 * state.lastBody.ticketCount}.00`, currency: "USD", classification: "EVENT_TICKET_PAYMENT", isTest: true, hosted: gate() }), 300);
    }
    if (/\/checkout$/.test(p)) { state.checkouts += 1; return json(422, null, "PAYMENT_ON_HOSTED_FORM"); }
    const m = p.match(/^\/public\/bookings\/(EB-[0-9A-Z]{12})\/status$/);
    if (req.method === "GET" && m) return req.headers["x-booking-token"] === TOKEN ? json(200, STATUS(m[1], m[1].endsWith("CONF"))) : json(404, null, "NOT_FOUND");
    if (req.method === "GET" && p.startsWith("/public/")) return json(404, null, "NOT_FOUND"); // everything else: closed / not published
    json(404, null, "NOT_FOUND");
  });
});
await new Promise((r) => api.listen(4556, r));

const browser = ENGINE === "chromium"
  ? await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true })
  : await { firefox, webkit }[ENGINE].launch({ headless: true });
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const newPage = async (w = 1440, h = 900, locale = "en-US") => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale, ...(ENGINE === "chromium" ? { permissions: ["clipboard-read", "clipboard-write"] } : {}) });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check(`no page error (${page.url()})`, false, e.message));
  return { ctx, page };
};

try {
  // ── EN flow, desktop ──
  let { ctx, page } = await newPage();
  await page.goto(`${WEB}/en/events/gala-night/book`, { waitUntil: "networkidle" });
  check("hosted mode: intro names SDI's Givebutter form", await page.getByText(/hosted by Givebutter/).isVisible());
  check("hosted mode: steps are Tickets / Your details / Pay on SDI's form", await page.getByText("Pay on SDI's form").isVisible());
  await page.getByRole("button", { name: "More tickets" }).click();
  check("quantity 2 → estimated total $1,500", (await page.locator("aside").innerText()).includes("$1,500"));
  await page.getByRole("button", { name: "Continue to your details" }).click();
  check("details step asks only name + e-mail (no phone, no guest list)", (await page.locator("input[type=tel]").count()) === 0 && (await page.locator("#h-name").count()) === 1 && (await page.locator("#h-email").count()) === 1);
  await page.getByRole("button", { name: "Get my booking reference" }).click();
  check("empty submit shows errors and sends nothing", (await page.getByText("This field is required.").count()) >= 1 && state.posts === 0);
  await page.fill("#h-name", "Amira Hassan");
  await page.fill("#h-email", "amira@example.org");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Get my booking reference" }).click();
  await page.getByText("Your MEKI booking reference").first().waitFor();
  check("request is reference-only (no price / guests / phone)", JSON.stringify(state.lastBody) === JSON.stringify({ purchaser: { fullName: "Amira Hassan", email: "amira@example.org" }, ticketCount: 2, locale: "en", privacyConsent: true }));
  check("reference is displayed", (await page.locator("output[aria-label='Your MEKI booking reference']").innerText()) === REF);
  check("instructions name the exact custom question", await page.getByText("“MEKI Booking Reference”").isVisible());
  const link = page.getByRole("link", { name: /Open SDI's secure form/ });
  const href = await link.getAttribute("href");
  check("SDI form link is the API URL verbatim (no reference pre-filled)", href === FORM && !href.includes(REF));
  check("SDI link opens safely in a new tab", (await link.getAttribute("target")) === "_blank" && (await link.getAttribute("rel")) === "noopener noreferrer");
  if (ENGINE === "chromium") {
    await page.getByRole("button", { name: "Copy reference" }).click();
    await page.getByText("Copied").first().waitFor();
    check("Copy puts the reference on the clipboard", (await page.evaluate(() => navigator.clipboard.readText())) === REF);
  }
  check("hosted flow never calls MEKI checkout", state.checkouts === 0);
  await page.screenshot({ path: `${OUT}/hosted-reference-en-${ENGINE}.png`, fullPage: true });

  // status page (same tab: token is in sessionStorage)
  await page.getByRole("link", { name: "View my booking status" }).click();
  await page.getByText("Complete your purchase on SDI's form").waitFor();
  check("pending status: SDI instructions, no pay button, no tickets", (await page.getByRole("button", { name: "Continue to payment" }).count()) === 0 && (await page.getByRole("heading", { name: "Your tickets", exact: true }).count()) === 0);
  check("pending status: SDI form link present", (await page.getByRole("link", { name: /Open SDI's secure form/ }).getAttribute("href")) === FORM);
  await ctx.close();

  // confirmed status (token via secure link)
  ({ ctx, page } = await newPage(390, 844));
  const CONF = "EB-HSTD0000CONF";
  await page.goto(`${WEB}/en/events/gala-night/booking/${CONF}#token=${TOKEN}`, { waitUntil: "networkidle" });
  await page.getByText("Booking confirmed by SDI").waitFor();
  check("confirmed by SDI: no MEKI ticket list or downloads", (await page.getByText("Download ticket").count()) === 0 && (await page.getByText("Use the tickets sent by Givebutter").count()) === 1);
  check("mobile 390px: no horizontal scroll", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: `${OUT}/hosted-confirmed-mobile-${ENGINE}.png`, fullPage: true });
  await ctx.close();

  // ── untrusted URL from the API is never shown ──
  state.formUrl = "https://evil.example/zeffy";
  ({ ctx, page } = await newPage());
  await page.goto(`${WEB}/en/events/gala-night/book`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Continue to your details" }).click();
  await page.fill("#h-name", "Amira Hassan");
  await page.fill("#h-email", "amira2@example.org");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Get my booking reference" }).click();
  await page.getByText("Your MEKI booking reference").first().waitFor();
  check("a non-Zeffy URL is not linked; 'form unavailable' shown instead", (await page.getByRole("link", { name: /Open SDI's secure form/ }).count()) === 0 && (await page.getByText("SDI's form is not available right now").count()) === 1);
  state.formUrl = FORM;
  await ctx.close();

  // ── Arabic RTL ──
  ({ ctx, page } = await newPage(1440, 900, "ar"));
  await page.goto(`${WEB}/ar/events/gala-night/book`, { waitUntil: "networkidle" });
  check("Arabic: RTL document", (await page.evaluate(() => document.documentElement.dir)) === "rtl");
  check("Arabic: hosted intro shown", await page.getByText(/المستضاف على Givebutter/).isVisible());
  await page.getByRole("button", { name: "المتابعة إلى بياناتك" }).click();
  await page.fill("#h-name", "أميرة حسن");
  await page.fill("#h-email", "amira3@example.org");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "احصل على رقم الحجز" }).click();
  await page.getByText("رقم حجزك لدى MEKI").first().waitFor();
  check("Arabic: reference rendered LTR inside RTL page", (await page.locator("output[dir=ltr]").first().innerText()) === REF);
  check("Arabic: request locale = ar", state.lastBody.locale === "ar");
  await page.screenshot({ path: `${OUT}/hosted-reference-ar-${ENGINE}.png`, fullPage: true });
  await ctx.close();
} catch (e) {
  check("smoke run completed", false, e.message);
} finally {
  await browser.close();
  api.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed (${ENGINE})`);
process.exit(failed ? 1 : 0);
