// Manual browser smoke test for the Gala booking UI (not part of `pnpm test`).
// It starts a STUB of the booking API (no real backend, no payment provider) and drives system Chrome with playwright-core.
//
//   1. build the web app against the stub:
//        NEXT_PUBLIC_API_URL=http://localhost:4555 NEXT_PUBLIC_CHECKOUT_ALLOWED_HOSTS=pay.example.test pnpm --filter @meki/web build
//   2. serve it:   API_INTERNAL_URL=http://localhost:4555 pnpm --filter @meki/web start     (port 3000)
//   3. run:        node tests/e2e/booking.smoke.mjs [outDir]
//
// Chrome path: CHROME_PATH or the default Windows location.
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const OUT = process.argv[2] ?? "./smoke-out";
mkdirSync(OUT, { recursive: true });
const TOKEN = "stub-booking-token-0123456789abcdef";

// ───────── stub API ─────────
const state = { mode: "open", posts: 0, lastBody: null, lastKey: null, checkouts: 0, checkout: "ok" };
const TICKETING = () => ({
  event: { slug: "gala-night", name: "Every Light Counts", dateLabel: "Saturday, December 12, 2026", venue: "583 Park Avenue, New York, USA" },
  ticket: { name: "Individual ticket", type: "INDIVIDUAL", price: "750.00", currency: "USD", tablesAvailable: false, perGuest: true },
  classification: "EVENT_TICKET_PAYMENT",
  salesOpen: state.mode === "open",
  soldOut: false,
  maxTicketsPerBooking: 6,
  checkoutAvailable: state.mode === "open",
  calendar: { available: false, reason: "SCHEDULE_PENDING" },
});
const STATUS = (ref, message, confirmed = false) => ({
  reference: ref, bookingStatus: confirmed ? "CONFIRMED" : "PENDING", paymentStatus: confirmed ? "PAID" : "UNPAID", confirmed, message, ticketCount: 2, totalAmount: "1500.00", currency: "USD",
  classification: "EVENT_TICKET_PAYMENT", event: TICKETING().event, calendar: { available: false, reason: "SCHEDULE_PENDING" },
  tickets: confirmed ? [{ ticketNumber: "TK-AAAAAAAAA1", status: "ISSUED", pdfReady: true, downloadPath: `/api/v1/public/bookings/${ref}/tickets/TK-AAAAAAAAA1/pdf` }, { ticketNumber: "TK-AAAAAAAAA2", status: "ISSUED", pdfReady: false, downloadPath: `/api/v1/public/bookings/${ref}/tickets/TK-AAAAAAAAA2/pdf` }] : [],
});
const REFS = { "EB-STUBBOOK0001": STATUS("EB-STUBBOOK0001", "awaiting_payment"), "EB-STATUSPROC01": STATUS("EB-STATUSPROC01", "processing"), "EB-STATUSCONF01": STATUS("EB-STATUSCONF01", "confirmed", true), "EB-STATUSCANC01": STATUS("EB-STATUSCANC01", "cancelled"), "EB-STATUSREFU01": STATUS("EB-STATUSREFU01", "refunded"), "EB-STATUSFAIL01": STATUS("EB-STATUSFAIL01", "payment_failed") };

const api = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", WEB);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Booking-Token, Idempotency-Key, X-Donation-Token");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  const url = new URL(req.url, "http://x");
  const json = (code, data, err) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(err ? { error: { statusCode: code, code: err } } : { data })); };
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const p = url.pathname.replace(/^\/api\/v1/, "");
    if (req.method === "GET" && p === "/public/events/gala-night/ticketing") return state.mode === "404" ? json(404, null, "NOT_FOUND") : json(200, TICKETING());
    if (req.method === "POST" && p === "/public/events/gala-night/bookings") {
      state.posts += 1;
      state.lastBody = JSON.parse(body);
      state.lastKey = req.headers["idempotency-key"];
      return setTimeout(() => json(201, { reference: "EB-STUBBOOK0001", accessToken: TOKEN, bookingStatus: "PENDING", paymentStatus: "UNPAID", ticketCount: state.lastBody.guests.length, unitPrice: "750.00", totalAmount: String(750 * state.lastBody.guests.length) + ".00", currency: "USD", classification: "EVENT_TICKET_PAYMENT", isTest: false }), 500);
    }
    let m = p.match(/^\/public\/bookings\/(EB-[0-9A-Z]{12})\/checkout$/);
    if (req.method === "POST" && m) {
      state.checkouts += 1;
      if (req.headers["x-booking-token"] !== TOKEN) return json(404, null, "NOT_FOUND");
      if (state.checkout === "down") return json(503, null, "PAYMENTS_UNAVAILABLE");
      const test = state.checkout === "test";
      return json(200, { attemptReference: "BA-STUB", checkoutUrl: state.checkout === "untrusted" ? "https://evil.example.com/pay" : test ? "https://pay.example.test/mock" : "https://pay.example.test/checkout/1", expiresAt: null, provider: test ? "mock" : "stub", isTest: test });
    }
    m = p.match(/^\/public\/bookings\/(EB-[0-9A-Z]{12})\/status$/);
    if (req.method === "GET" && m) return req.headers["x-booking-token"] === TOKEN && REFS[m[1]] ? json(200, REFS[m[1]]) : json(404, null, "NOT_FOUND");
    m = p.match(/^\/public\/bookings\/(EB-[0-9A-Z]{12})\/tickets\/(TK-[0-9A-Z]{10})\/pdf$/);
    if (req.method === "GET" && m) {
      if (req.headers["x-booking-token"] !== TOKEN) return json(404, null, "NOT_FOUND");
      res.writeHead(200, { "Content-Type": "application/pdf" });
      return res.end("%PDF-1.4 stub");
    }
    json(404, null, "NOT_FOUND");
  });
});
await new Promise((r) => api.listen(4555, r));
// STUB_ONLY=1: just serve the stub (e.g. while `next build` pre-renders the Gala page with sales open)
if (process.env.STUB_ONLY) await new Promise(() => {});
// GALA_CTA tells which state the statically generated Gala page was built in (it is ISR-cached for 5 minutes)
const CTA = process.env.GALA_CTA ?? "closed";

// ───────── browser ─────────
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const newPage = async (w = 1440, h = 900, locale = "en-US") => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check(`no page error (${page.url()})`, false, e.message));
  return { ctx, page };
};
const noOverflow = async (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

try {
  // 1. closed state (sales switch off) — Gala CTA disabled, booking page unavailable
  state.mode = "closed";
  let { ctx, page } = await newPage();
  await page.goto(`${WEB}/en/events/gala-night`, { waitUntil: "networkidle" });
  const closedBtn = page.locator("#booking button", { hasText: "Book Your Place" });
  const openLink = page.locator("#booking a[href$='/en/events/gala-night/book']");
  if (CTA === "closed") check("closed build: Gala booking action is a disabled button, no link", (await closedBtn.count()) === 1 && (await closedBtn.isDisabled()) && (await openLink.count()) === 0);
  else check("open build: Gala booking action is a link to the booking flow", (await openLink.count()) === 1 && (await closedBtn.count()) === 0);
  await page.goto(`${WEB}/en/events/gala-night/book`, { waitUntil: "networkidle" });
  check("closed: booking page says booking is not available yet", await page.getByText("Ticket booking is not available yet.").isVisible());
  check("closed: no form is rendered", (await page.locator("input").count()) === 0);
  await page.screenshot({ path: `${OUT}/closed-en-1440.png` });
  await ctx.close();

  // 2. open state
  state.mode = "open";
  ({ ctx, page } = await newPage());
  await page.goto(`${WEB}/ar/events/gala-night`, { waitUntil: "networkidle" }); // fresh ISR entry (locale not fetched while closed)
  const arLink = page.locator("#booking a[href$='/ar/events/gala-night/book']");
  check(`${CTA} build: Arabic Gala page CTA ${CTA === "open" ? "links to the booking flow" : "is disabled"}`, (await arLink.count()) === (CTA === "open" ? 1 : 0));
  await ctx.close();

  ({ ctx, page } = await newPage());
  await page.goto(`${WEB}/en/events/gala-night/book`, { waitUntil: "networkidle" });
  check("open: ticket step shows Individual Ticket and no table option", (await page.getByText("Individual Ticket").first().isVisible()) && (await page.getByText(/table/i).count()) === 1);
  check("open: default quantity 1, total $750", (await page.locator("output").innerText()) === "1" && (await page.locator("aside").innerText()).includes("$750"));
  await page.getByRole("button", { name: "More tickets" }).click();
  check("quantity 2 → total $1,500", (await page.locator("aside").innerText()).includes("$1,500"));
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "More tickets" }).click();
  check("quantity capped at the API maximum (6)", (await page.locator("output").innerText()) === "6");
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Fewer tickets" }).click();
  await page.screenshot({ path: `${OUT}/step1-en-1440.png` });
  await page.getByRole("button", { name: /Continue to guest details/ }).click();

  // validation
  await page.getByRole("button", { name: /Review booking/ }).click();
  check("empty guest step shows per-field errors", (await page.getByText("This field is required.").count()) >= 4);
  await page.locator("#p-name").fill("Amira Hassan");
  await page.locator("#p-email").fill("not-an-email");
  await page.locator("#p-phone").fill("123");
  await page.getByRole("button", { name: /Review booking/ }).click();
  check("invalid e-mail and phone are reported", (await page.getByText("Enter a valid email address.").count()) === 1 && (await page.getByText(/at least 7 digits/).count()) === 1);
  await page.locator("#p-email").fill("amira@example.org");
  await page.locator("#p-phone").fill("+1 212 555 0100");
  await page.locator("#g0-diet").fill("None");
  await page.locator("#g1-name").fill("李小龍");
  await page.locator("#g1-email").fill("guest2@example.org");
  await page.locator("#g1-phone").fill("+1 212 555 0111");
  await page.locator("#g1-diet").fill("Vegetarian");
  await page.getByRole("button", { name: /Review booking/ }).click();
  check("unsupported name characters get a specific, respectful message", (await page.getByText(/Latin or Arabic letters only/).count()) === 1);
  await page.locator("#g1-name").fill("محمد عبد الرحمن");
  await page.getByRole("button", { name: /Review booking/ }).click();
  check("consent is required", (await page.getByText("Please accept to continue.").count()) === 1);
  await page.screenshot({ path: `${OUT}/step2-en-1440.png`, fullPage: true });
  await page.locator("input[type=checkbox]").last().check();
  await page.getByRole("button", { name: /Review booking/ }).click();
  check("valid Arabic name accepted → review step", await page.getByRole("heading", { name: "Review your booking" }).isVisible());
  check("review shows each guest, total, SDI recipient and the not-a-donation note", (await page.locator("main").innerText()).includes("محمد عبد الرحمن") && (await page.locator("main").innerText()).includes("Spring of Dignity International") && (await page.locator("main").innerText()).includes("not a charitable donation") && (await page.locator("main").innerText()).includes("$1,500"));
  // back keeps data
  await page.getByRole("button", { name: "Back" }).click();
  check("going back keeps the entered data", (await page.locator("#p-name").inputValue()) === "Amira Hassan" && (await page.locator("#g1-name").inputValue()) === "محمد عبد الرحمن");
  await page.getByRole("button", { name: /Review booking/ }).click();
  await page.screenshot({ path: `${OUT}/review-en-1440.png`, fullPage: true });

  // submit: double click must create ONE booking, then follow the trusted checkout URL
  const nav = [];
  await ctx.route("https://pay.example.test/**", (r) => { nav.push(r.request().url()); return r.fulfill({ status: 200, contentType: "text/html", body: "<h1>hosted checkout stub</h1>" }); });
  await page.getByRole("button", { name: "Continue to secure payment" }).dblclick();
  await page.waitForURL("https://pay.example.test/**", { timeout: 15000 });
  check("double-click created exactly one booking", state.posts === 1);
  check("request had an Idempotency-Key and NO price/total", /^[A-Za-z0-9_-]{16,80}$/.test(state.lastKey ?? "") && !/price|total|amount|currency/i.test(JSON.stringify(state.lastBody)));
  check("request: purchaser and attendees separated; guest 1 is the purchaser", state.lastBody.guests[0].isPurchaser === true && state.lastBody.guests[1].fullName === "محمد عبد الرحمن" && state.lastBody.ticketCount === 2 && state.lastBody.privacyConsent === true);
  check("redirected only to the backend-provided trusted checkout URL", nav.length === 1 && nav[0] === "https://pay.example.test/checkout/1");
  check("no guest PII in the URL", !/Amira|example\.org|555/.test(page.url()));
  await ctx.close();

  // 3. untrusted / test / unavailable checkout → booking saved, status page, no redirect
  for (const [mode, label] of [["untrusted", "untrusted host"], ["test", "test/mock session in a production build"], ["down", "payment provider unavailable (503)"]]) {
    state.checkout = mode; state.posts = 0;
    ({ ctx, page } = await newPage(1024, 800));
    const external = [];
    await ctx.route(/pay\.example\.test|evil\.example\.com/, (r) => { external.push(r.request().url()); return r.abort(); });
    await page.goto(`${WEB}/en/events/gala-night/book`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Continue to guest details/ }).click();
    await page.locator("#p-name").fill("Amira Hassan"); await page.locator("#p-email").fill("amira@example.org"); await page.locator("#p-phone").fill("+1 212 555 0100");
    await page.locator("#g0-diet").fill("None");
    await page.locator("input[type=checkbox]").last().check();
    await page.getByRole("button", { name: /Review booking/ }).click();
    await page.getByRole("button", { name: "Continue to secure payment" }).click();
    await page.waitForURL(/\/booking\/EB-STUBBOOK0001/, { timeout: 15000 });
    await page.getByRole("heading", { name: "Payment not completed yet" }).waitFor();
    check(`${label}: no external redirect; booking page shows pending, not success`, external.length === 0 && !(await page.getByText("Booking confirmed").count()));
    check(`${label}: notice explains payment could not start`, (await page.getByRole("alert").count()) >= 1);
    await ctx.close();
  }
  state.checkout = "ok";

  // 4. status page states
  const sc = [["EB-STATUSPROC01", "Verifying your payment"], ["EB-STATUSCONF01", "Booking confirmed"], ["EB-STATUSCANC01", "Booking cancelled"], ["EB-STATUSREFU01", "Booking refunded"], ["EB-STATUSFAIL01", "Payment not completed"]];
  for (const [ref, title] of sc) {
    ({ ctx, page } = await newPage(390, 844));
    await page.addInitScript(([r, t]) => sessionStorage.setItem(`meki:booking:${r}`, t), [ref, TOKEN]);
    await page.goto(`${WEB}/en/events/gala-night/booking/${ref}`, { waitUntil: "networkidle" });
    check(`status ${ref}: "${title}"`, await page.getByRole("heading", { name: title }).isVisible());
    if (ref === "EB-STATUSCONF01") {
      check("confirmed: ticket list with download only where the PDF is ready", (await page.getByRole("button", { name: "Download ticket" }).count()) === 1 && (await page.getByText("The ticket PDF is being prepared.").count()) === 1);
      check("confirmed: calendar says pending (schedule not confirmed)", await page.getByText(/calendar invitation will be available/).isVisible());
      check("confirmed: no unverified e-mail promise", (await page.locator("main").innerText()).toLowerCase().includes("e-mail") === false);
      const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download ticket" }).click()]);
      check("confirmed: ticket PDF downloads through the authorised endpoint", dl.suggestedFilename() === "TK-AAAAAAAAA1.pdf");
      await page.screenshot({ path: `${OUT}/status-confirmed-en-390.png`, fullPage: true });
    }
    check(`status ${ref}: no horizontal overflow at 390px`, await noOverflow(page));
    await ctx.close();
  }
  // unauthorised: no token / wrong token / reference-only
  ({ ctx, page } = await newPage());
  await page.goto(`${WEB}/en/events/gala-night/booking/EB-STATUSCONF01`, { waitUntil: "networkidle" });
  check("reference alone shows nothing about the booking", (await page.getByRole("heading", { name: "We can't show this booking" }).isVisible()) && !(await page.getByText("Booking confirmed").count()));
  await page.goto(`${WEB}/en/events/gala-night/booking?reference=EB-STATUSCONF01&token=${TOKEN}`, { waitUntil: "networkidle" });
  check("secure link: token works once and is removed from the address bar", (await page.getByRole("heading", { name: "Booking confirmed" }).isVisible()) && !page.url().includes("token"));
  await page.goto(`${WEB}/en/events/gala-night/booking?reference=EB-STATUSCONF01&token=wrong`, { waitUntil: "networkidle" });
  check("wrong token → generic unavailable view", await page.getByRole("heading", { name: "We can't show this booking" }).isVisible());
  await page.goto(`${WEB}/en/events/gala-night/booking/not-a-reference`, { waitUntil: "networkidle" });
  check("malformed reference → generic view", await page.getByRole("heading", { name: "We can't show this booking" }).isVisible());
  await ctx.close();

  // 5. Arabic / RTL
  ({ ctx, page } = await newPage(390, 844, "ar"));
  await page.goto(`${WEB}/ar/events/gala-night/book`, { waitUntil: "networkidle" });
  check("ar: document is RTL with Arabic copy", (await page.evaluate(() => document.documentElement.dir)) === "rtl" && (await page.getByText("اختر تذاكرك").isVisible()));
  await page.screenshot({ path: `${OUT}/step1-ar-390.png`, fullPage: true });
  await page.getByRole("button", { name: "المتابعة إلى بيانات الضيوف" }).click();
  check("ar: phone and e-mail inputs stay LTR", (await page.locator("#p-phone").getAttribute("dir")) === "ltr" && (await page.locator("#p-email").getAttribute("dir")) === "ltr");
  await page.getByRole("button", { name: "مراجعة الحجز" }).click();
  check("ar: validation messages are Arabic", (await page.getByText("هذا الحقل مطلوب.").count()) >= 3);
  await page.screenshot({ path: `${OUT}/step2-ar-390.png`, fullPage: true });
  check("ar: no horizontal overflow at 390px", await noOverflow(page));
  await ctx.close();

  // 6. responsive widths
  for (const w of [1440, 1024, 768, 390, 360]) {
    for (const loc of ["en", "ar"]) {
      ({ ctx, page } = await newPage(w, 900, loc));
      await page.goto(`${WEB}/${loc}/events/gala-night/book`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: loc === "ar" ? "المتابعة إلى بيانات الضيوف" : /Continue to guest details/ }).click();
      await page.getByRole("button", { name: loc === "ar" ? "مراجعة الحجز" : /Review booking/ }).click(); // show errors (widest content)
      check(`${loc} ${w}px: no horizontal overflow on the guest step`, await noOverflow(page));
      if (w === 360 || w === 768) await page.screenshot({ path: `${OUT}/guests-${loc}-${w}.png`, fullPage: true });
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  api.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
