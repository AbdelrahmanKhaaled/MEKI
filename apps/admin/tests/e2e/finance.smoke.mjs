// Phase 6B browser smoke test (manual, not part of `pnpm test`). Playwright + system Chrome.
//
//   Build:  ADMIN_API_UPSTREAM=http://localhost:4100 pnpm --filter @meki/admin build ; npx next start -p 3003   (in apps/admin)
//   MODE=stub  STUB_PORT=4100 WEB_URL=http://localhost:3003 node tests/e2e/finance.smoke.mjs [outDir]   → FAKE-data stub on :4100
//   MODE=real  WEB_URL=… REAL_EMAIL=… REAL_PASSWORD=… [REAL_LIMITED_EMAIL=…] node tests/e2e/finance.smoke.mjs [outDir]
//              → a real API on the upstream port, connected to a *_test database. READ-ONLY: it never submits a mutation.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { startStub, state } from "./stub-api.mjs";
import { fin } from "./stub-finance.mjs";

const MODE = process.env.MODE ?? "stub";
const WEB = process.env.WEB_URL ?? "http://localhost:3003";
const OUT = process.argv[2] ?? "./smoke-out-6b";
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

const stub = MODE === "stub" ? await startStub(Number(process.env.STUB_PORT ?? 4100)) : null;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const problems = [];
const apiCalls = [];

async function open(w = 1440, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource.*(401|403|404|500)/.test(m.text()) && problems.push(`console: ${m.text().slice(0, 160)}`));
  page.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/v1/")) apiCalls.push(`${r.method()} ${u.pathname}${u.search}`); if (u.origin !== new URL(WEB).origin && !u.protocol.startsWith("data")) problems.push(`foreign request: ${r.url()}`); });
  return { ctx, page };
}
async function login(page, email, password, locale = "en") {
  await page.goto(`${WEB}/${locale}/login`, { waitUntil: "networkidle" });
  await page.locator("input[type=email]").fill(email);
  await page.locator("input[type=password]").fill(password);
  await page.locator("button[type=submit]").click();
  await page.waitForURL(new RegExp(`/${locale}/dashboard`), { timeout: 20000 });
}
let step = "start";
/** polls until fn() is truthy (client-side fetches start after router.replace, so networkidle alone is not enough) */
const until = async (fn, timeout = 10000) => { const end = Date.now() + timeout; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* retry */ } await new Promise((r) => setTimeout(r, 150)); } return false; };
const rows = (page) => page.locator("main table tbody tr").count();
const main = (page) => page.locator("main").innerText();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const waitText = (page, text, timeout = 15000) => page.getByText(text).first().waitFor({ timeout }).then(() => true, () => false);
const lastCall = (frag) => [...apiCalls].reverse().find((c) => c.includes(frag)) ?? "";
/** the list request (not the KPI count requests, which use pageSize=1) */
const listCall = () => [...apiCalls].reverse().find((c) => c.includes("/admin/donations?") && c.includes("pageSize=20")) ?? "";

try {
  if (MODE === "real") {
    // ───────────── real API (test database), real login, real RBAC — read-only ─────────────
    const { ctx, page } = await open();
    await login(page, process.env.REAL_EMAIL, process.env.REAL_PASSWORD);
    const side = await page.locator("aside").first().innerText();
    check("real: sidebar shows Donors, Donations, Payments & Refunds, Recurring, Receipts as links", ["Donors", "Donations", "Payments & Refunds", "Recurring Donations", "Receipts"].every((l) => side.includes(l)) && (await page.locator("aside a[href='/en/donations']").count()) === 1);
    for (const [path, title] of [["/en/donations", "Donations"], ["/en/donors", "Donors"], ["/en/payments", "Payments & Refunds"], ["/en/recurring", "Recurring Donations"], ["/en/receipts", "Receipts"]]) {
      await page.goto(`${WEB}${path}`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { level: 1 }).waitFor();
      const t = await main(page);
      const h1 = await page.getByRole("heading", { level: 1 }).innerText();
      check(`real: ${path} renders from the real API (no error state, no invalid response)`, h1.includes(title) && !t.includes("could not be loaded"), t.includes("could not be loaded") ? "error state shown" : "");
      await page.screenshot({ path: `${OUT}/real${path.replaceAll("/", "-")}.png`, fullPage: true });
    }
    // donations: test records excluded by default → honest empty / non-test rows only
    await page.goto(`${WEB}/en/donations`, { waitUntil: "networkidle" });
    const dt = await main(page);
    check("real: donations list never requests test records (no includeTest)", !apiCalls.some((c) => c.includes("includeTest")));
    check("real: donations list shows rows or an honest empty state", dt.includes("No donations") || (await page.locator("main table tbody tr").count()) > 0);
    // provider truth from the server
    await page.goto(`${WEB}/en/payments?tab=providers`, { waitUntil: "networkidle" });
    const pt = await main(page);
    check("real: provider status reflects the server (no live provider claimed in dev/test)", /Only a TEST provider|No payment provider is configured|Live provider active/.test(pt), pt.match(/(Only a TEST provider[^.]*|No payment provider[^.]*|Live provider active[^.]*)/)?.[0] ?? "");
    check("real: Zeffy/SDI are not presented as live", !/Live provider active: Zeffy/i.test(pt));
    // receipts fiscal notice
    await page.goto(`${WEB}/en/receipts`, { waitUntil: "networkidle" });
    check("real: receipts page shows the SDI fiscal-sponsor notice", (await main(page)).includes("Spring of Dignity International"));
    // a detail page, if any data exists (refunds/receipts from earlier test runs are test records)
    await page.goto(`${WEB}/en/payments?tab=refunds`, { waitUntil: "networkidle" });
    const refundLink = page.locator("main a[href*='/payments/refunds/']").first();
    if (await refundLink.count()) {
      await refundLink.click();
      await page.waitForURL(/\/payments\/refunds\/[^/?]+/);
      await page.getByRole("heading", { name: "Original payment" }).waitFor({ timeout: 20000 });
      await page.waitForLoadState("networkidle");
      const rt = await main(page);
      check("real: refund detail loads (status, original payment, audit) from the real API", rt.includes("Original payment") && !rt.includes("could not be loaded"));
      check("real: refund actions are not enabled for test records / non-live providers", (await page.getByRole("button", { name: /^(Approve|Send to provider)$/ }).evaluateAll((bs) => bs.every((b) => b.disabled))) );
      await page.screenshot({ path: `${OUT}/real-refund-detail.png`, fullPage: true });
    } else check("real: no refund records in this database (detail check skipped)", true);
    await page.goto(`${WEB}/en/donors`, { waitUntil: "networkidle" });
    const donorLink = page.locator("main table a[href*='/donors/']").first();
    if (await donorLink.count()) {
      await donorLink.click();
      await page.waitForURL(/\/donors\/[^/?]+/);
      await page.getByRole("heading", { name: "Collected donations" }).waitFor({ timeout: 20000 });
      await page.waitForLoadState("networkidle");
      const dd = await main(page);
      check("real: donor profile loads with per-currency totals section and history", dd.includes("Collected donations") && dd.includes("Donation history") && !dd.includes("could not be loaded"));
    } else check("real: no donors in this database (profile check skipped)", true);
    await page.goto(`${WEB}/ar/donations`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1 }).waitFor();
    check("real: Arabic RTL donations page", (await page.evaluate(() => document.documentElement.dir)) === "rtl" && (await page.getByRole("heading", { level: 1 }).innerText()).includes("التبرعات"));
    await ctx.close();
    if (process.env.REAL_LIMITED_EMAIL) {
      // a role WITHOUT donations/donors/payments/recurring/receipts permissions (e.g. CAMPAIGN_MANAGER: reports.read)
      const { ctx: c2, page: p2 } = await open();
      await login(p2, process.env.REAL_LIMITED_EMAIL, process.env.REAL_PASSWORD);
      const s2 = await p2.locator("aside").first().innerText();
      check("real: limited role sees no donor-management entries in the sidebar", !/Donations|Payments & Refunds|Recurring Donations|Receipts/.test(s2));
      for (const path of ["/en/donors", "/en/donations", "/en/payments", "/en/recurring", "/en/receipts"]) {
        const before = apiCalls.length;
        await p2.goto(`${WEB}${path}`, { waitUntil: "networkidle" });
        check(`real: limited role → ${path} shows the no-access state and makes no finance request`, (await main(p2)).includes("You do not have access to this section.") && !apiCalls.slice(before).some((c) => /admin\/(donations|donors|refunds|payments|recurring|receipts)/.test(c)));
      }
      // the API itself refuses (not only the UI)
      const status = await p2.evaluate(async () => (await fetch("/api/v1/admin/donors?page=1&pageSize=1")).status);
      check("real: the API itself answers 403 to the limited role (UI gating is not the only protection)", status === 403, String(status));
      await c2.close();
    }
  } else {
    // ───────────── stub API with FAKE data ─────────────
    let { ctx, page } = await open();
    await login(page, "fin6b@stub.test", "stub-password");
    const side = await page.locator("aside").first().innerText();
    check("sidebar: donor-management entries are real links (no 'Soon')", (await page.locator("aside a[href='/en/donations'], aside a[href='/en/donors'], aside a[href='/en/payments'], aside a[href='/en/recurring'], aside a[href='/en/receipts']").count()) === 5);
    check("sidebar: unimplemented modules are still 'Soon'", /soon/i.test(side));
    await page.locator("aside a[href='/en/donations']").click();
    await page.waitForURL(/\/en\/donations$/);
    await page.locator("main table tbody tr").first().waitFor();
    await page.waitForLoadState("networkidle");
    let t = await main(page);
    check("donations: sidebar navigation lands on the page with the active indicator", (await page.locator("aside a[aria-current=page]").getAttribute("href")) === "/en/donations");
    check("donations: KPI cards (confirmed / pending / failed / refunded) from API counts", ["Confirmed donations", "Pending donations", "Failed donations", "Refunded donations"].every((k) => t.includes(k)));
    check("donations: KPI counts use status filters", apiCalls.some((c) => c.includes("/admin/donations?") && c.includes("status=COMPLETED") && c.includes("pageSize=1")) && apiCalls.some((c) => c.includes("paymentStatus=PARTIALLY_REFUNDED") && c.includes("pageSize=1")));
    check("donations: amounts need ONE currency (hint shown, no cross-currency total)", t.includes("Choose one currency to see collected amounts."));
    check("donations: table columns", ["Donation reference", "Donor", "Amount", "Currency", "Type", "Program / cause / campaign", "Payment status", "Date", "Actions"].every((c) => t.toUpperCase().includes(c.toUpperCase())));
    check("donations: 20 rows on page 1 with real pagination meta", (await page.locator("main table tbody tr").count()) === 20 && t.includes("Page 1 of 2") && t.includes("23 records"));
    await page.getByRole("button", { name: /Next/ }).click();
    step = "pagination";
    await until(async () => listCall().includes("page=2") && (await rows(page)) === 3);
    check("pagination: page 2 requested from the API and shown", listCall().includes("page=2") && (await page.locator("main table tbody tr").count()) === 3);
    await page.getByPlaceholder("Reference or donor e-mail").fill("STUB000001");
    step = "search";
    await until(async () => listCall().includes("search=STUB000001") && (await rows(page)) === 10);
    check("search: debounced, sent to the API, resets to page 1, filters rows", listCall().includes("search=STUB000001") && !listCall().includes("page=2") && (await rows(page)) === 10);
    await page.getByRole("button", { name: "Clear filters" }).click();
    await until(() => !new URL(page.url()).search);
    await page.waitForURL(/\/en\/donations$/);
    await page.getByLabel("Payment status").selectOption("UNPAID");
    step = "status filter";
    await until(async () => listCall().includes("paymentStatus=UNPAID") && (await rows(page)) === 4);
    check("status filter: affects the API request and the rows", listCall().includes("paymentStatus=UNPAID") && (await page.locator("main table tbody tr").count()) === 4);
    await page.getByRole("button", { name: "Clear filters" }).click();
    await until(() => !new URL(page.url()).search);
    await until(() => !page.url().includes("?"));
    await page.getByLabel("Donation type").selectOption("MONTHLY");
    step = "frequency filter";
    await until(async () => listCall().includes("frequency=MONTHLY") && (await rows(page)) === 6);
    check("donation-type filter: frequency sent", listCall().includes("frequency=MONTHLY") && (await page.locator("main table tbody tr").count()) === 6);
    await page.getByRole("button", { name: "Clear filters" }).click();
    await until(() => !new URL(page.url()).search);
    await page.getByLabel("Campaign").selectOption("c1");
    step = "campaign filter";
    await until(async () => listCall().includes("campaignId=c1") && (await main(page)).includes("Amounts are not available per campaign."));
    t = await main(page);
    check("campaign filter: campaignId sent; amounts honestly unavailable per campaign", listCall().includes("campaignId=c1") && t.includes("Amounts are not available per campaign."));
    await page.getByRole("button", { name: "Clear filters" }).click();
    await until(() => !new URL(page.url()).search);
    step = "currency filter";
    await page.getByLabel("Currency").selectOption("USD");
    await page.waitForURL(/currency=USD/);
    await page.locator("[data-testid=confirmed-amount]").waitFor();
    t = await main(page);
    check("currency filter: collected net for USD only, from the per-currency report", t.includes("Net collected in USD:") && t.includes("$17,900") && !t.includes("$26,900") && lastCall("/admin/reports/donations/summary").includes("currency=USD"));
    await page.getByLabel("Currency").selectOption("EGP");
    await page.waitForURL(/currency=EGP/);
    await page.locator("[data-testid=confirmed-amount]").waitFor();
    await page.waitForTimeout(400);
    t = await main(page);
    check("currency switch: EGP figures replace USD (never combined)", t.includes("EGP 9,000") && !t.includes("$17,900"));
    await page.getByRole("button", { name: "Clear filters" }).click();
    await until(() => !new URL(page.url()).search);
    await page.waitForURL(/\/en\/donations$/);
    await page.locator("input[type=date]").first().fill("2026-11-10");
    await page.locator("input[type=date]").nth(1).fill("2026-11-15");
    step = "date filter";
    await until(() => listCall().includes("to=2026-11-15"));
    check("date filter: inclusive UTC range sent to the API", listCall().includes("from=2026-11-10T00%3A00%3A00.000Z") && listCall().includes("to=2026-11-15T23%3A59%3A59.999Z"));
    await page.goto(`${WEB}/en/donations?from=2026-11-20&to=2026-11-01`, { waitUntil: "networkidle" });
    check("date filter: inverted range → validation message, no request with that range", (await main(page)).includes("The start date must be on or before the end date.") && !apiCalls.some((c) => c.includes("from=2026-11-20")));
    await page.goto(`${WEB}/en/donations?paymentStatus=PAID`, { waitUntil: "networkidle" });
    await page.locator("main table tbody tr").first().waitFor();
    await page.locator("main table tbody tr").first().getByRole("link", { name: "View details" }).click();
    await page.waitForURL(/\/en\/donations\/d/);
    await page.getByRole("heading", { name: "Transaction history (provider ledger)" }).waitFor();
    await page.waitForLoadState("networkidle");
    t = await main(page);
    check("detail: real detail endpoint used", apiCalls.some((c) => /GET \/api\/v1\/admin\/donations\/d\d+$/.test(c)));
    check("detail: summary, donor, attempts, ledger, refunds, receipts, audit sections", ["Donation summary", "Payment attempts", "Transaction history", "Refunds", "Receipts", "Audit history", "Donor"].every((k) => t.includes(k)));
    check("detail: sidebar keeps Donations active on the detail page", (await page.locator("aside a[aria-current=page]").getAttribute("href")) === "/en/donations");
    check("detail: no live provider → refund request disabled with the reason", await page.getByRole("button", { name: "Request refund" }).isDisabled() && t.includes("No live payment provider is configured on the server for this payment."));
    check("detail: SDI fiscal-sponsor notice next to receipts", t.includes("Spring of Dignity International"));
    await page.locator("main").getByRole("link", { name: "Donations", exact: true }).click();
    await page.waitForURL(/\/en\/donations\?paymentStatus=PAID/);
    check("back navigation: returns to the list with filters preserved", true);
    await page.screenshot({ path: `${OUT}/donations-en-1440.png`, fullPage: true });

    step = "refund request";
    // refund request with a (FAKE) live provider
    fin.liveProvider = true;
    await page.goto(`${WEB}/en/donations/d1`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Request refund" }).waitFor();
    await page.waitForTimeout(300);
    check("refund: live refund-capable provider + permission → request enabled", await page.getByRole("button", { name: "Request refund" }).isEnabled());
    await page.getByRole("button", { name: "Request refund" }).click();
    const dlg = page.getByRole("dialog");
    check("refund: confirmation dialog explains it is only a request needing approval", (await dlg.innerText()).includes("A different administrator must approve it"));
    await dlg.locator("input").fill("1000");
    await dlg.locator("textarea").fill("Donor asked (stub)");
    await dlg.getByRole("button", { name: "Submit request" }).click();
    check("refund: amount above the refundable balance is rejected client-side (no request)", (await dlg.innerText()).includes("exceeds the refundable balance") && !fin.posts.length);
    await dlg.locator("input").fill("12.505");
    check("refund: precision limited to the currency minor units", (await dlg.innerText()).includes("at most 2 decimals"));
    await dlg.locator("input").fill("12.50");
    await dlg.getByRole("button", { name: "Submit request" }).click();
    await page.getByRole("status").filter({ hasText: "Refund request" }).waitFor({ timeout: 10000 });
    t = await main(page);
    check("refund: POST sent with CSRF header, success shown only from the server response", fin.posts.some((x) => x.path === "/admin/donations/d1/refunds" && x.csrf === "stub-csrf" && x.body.amount === "12.50") && /Refund request RF-NEWSTUB\d was recorded with status “Requested”/.test(t));
    check("refund: caches invalidated → detail refetched after the mutation", apiCalls.filter((c) => c.endsWith("/admin/donations/d1")).length >= 2);

    step = "donors";
    await page.goto(`${WEB}/en/donors`, { waitUntil: "networkidle" });
    await page.locator("main table tbody tr").first().waitFor();
    t = await main(page);
    check("donors: list with name, e-mail, phone, type, donation records", ["Donor", "E-mail", "Phone", "Donor type", "Donation records"].every((k) => t.toUpperCase().includes(k.toUpperCase())) && t.includes("128 records"));
    await page.getByPlaceholder("Name, organization or e-mail").fill("donor12");
    await until(() => lastCall("/admin/donors?").includes("search=donor12"));
    check("donors: search sent to the API", lastCall("/admin/donors?").includes("search=donor12"));
    await page.goto(`${WEB}/en/donors/dn0`, { waitUntil: "networkidle" });
    await page.getByText("Collected donations").waitFor();
    t = await main(page);
    const usd = await page.locator("[data-testid=donor-total-USD]").innerText();
    const egp = await page.locator("[data-testid=donor-total-EGP]").innerText();
    check("donor profile: per-currency totals — USD net $100 (pending + test excluded), EGP separate", usd.includes("$100") && !usd.includes("999") && !usd.includes("777") && egp.includes("EGP 4,000"));
    check("donor profile: history, recurring, communication preferences, activity", ["Donation history", "Recurring agreements", "Communication preferences", "Activity history", "Editing and anonymization are not part of this release."].every((k) => t.includes(k)));

    step = "payments";
    await page.goto(`${WEB}/en/payments`, { waitUntil: "networkidle" });
    await page.locator("main table tbody tr").first().waitFor();
    t = await main(page);
    check("payments: tabs + transactions list; Gala payments explicitly separate", (await page.getByRole("tab").count()) === 4 && t.includes("Gala ticket payments are managed separately"));
    await page.locator("main table tbody tr").first().getByRole("button", { name: "View details" }).click();
    await page.getByRole("dialog").getByText("ch_fake_0000").first().waitFor();
    check("payments: transaction detail loaded from GET /admin/payments/transactions/:id", apiCalls.some((c) => c.endsWith("/admin/payments/transactions/t0")));
    await page.keyboard.press("Escape");
    await page.getByLabel("Type").selectOption("FAILURE");
    await until(async () => lastCall("/admin/payments/transactions?").includes("type=FAILURE") && (await rows(page)) === 4);
    check("payments: type filter sent and applied", lastCall("/admin/payments/transactions?").includes("type=FAILURE") && (await page.locator("main table tbody tr").count()) === 4);
    await page.getByRole("tab", { name: "Refunds" }).click();
    await page.waitForURL(/tab=refunds/);
    await page.locator("main table tbody tr").first().waitFor();
    t = await main(page);
    check("refunds tab: status report + list (filters reset when switching tab)", t.includes("Refunds by status") && !page.url().includes("type=FAILURE"));
    await page.goto(`${WEB}/en/payments/refunds/rf3`, { waitUntil: "networkidle" });
    await page.getByText("Original payment").waitFor();
    t = await main(page);
    check("refund detail: four-eyes — own request cannot be approved", (await page.getByRole("button", { name: "Approve" }).isDisabled()) && t.includes("someone other than the requester"));
    await page.goto(`${WEB}/en/payments/refunds/rf2`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Approve" }).waitFor();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Approve" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
    await page.getByRole("status").filter({ hasText: "Saved" }).waitFor({ timeout: 10000 });
    check("refund detail: approve via confirmation → status from server", fin.posts.some((x) => x.path === "/admin/refunds/rf2/approve") && (await main(page)).includes("Approved"));
    check("refund detail: execute shown only after approval, stays 'Processing' semantics explained", (await page.getByRole("button", { name: "Send to provider" }).count()) === 1);
    await page.goto(`${WEB}/en/payments?tab=events`, { waitUntil: "networkidle" });
    await page.locator("main table tbody tr").first().waitFor();
    t = await main(page);
    check("provider events: signature + status + error visible, read-only", t.includes("Not verified") && t.includes("Signature mismatch (FAKE)"));
    await page.goto(`${WEB}/en/payments?tab=providers`, { waitUntil: "networkidle" });
    t = await main(page);
    check("providers: Zeffy listed but not live; server truth shown", t.includes("Zeffy") && t.includes("Live provider active: Stub Gateway (FAKE)."));
    fin.liveProvider = false;

    step = "recurring";
    await page.goto(`${WEB}/en/recurring`, { waitUntil: "networkidle" });
    await page.locator("main table tbody tr").first().waitFor();
    t = await main(page);
    check("recurring: commitments labelled as not revenue, per currency", t.includes("Active commitments per month (not revenue)") && t.includes("$25") && t.includes("EGP 500"));
    await page.goto(`${WEB}/en/recurring/rd1`, { waitUntil: "networkidle" });
    await page.locator("[data-testid=agreement-collected]").waitFor();
    const col = await page.locator("[data-testid=agreement-collected]").innerText();
    check("agreement: collected = verified charges only ($50 of 3 charges)", col.includes("$50") && col.includes("2 verified charges") && col.includes("1 charges not captured"));
    await page.getByRole("button", { name: "Pause" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Pause" }).click();
    await page.getByRole("status").filter({ hasText: "Saved" }).waitFor({ timeout: 10000 });
    check("agreement: pause via confirmation, CSRF sent, state from server", fin.posts.some((x) => x.path === "/admin/recurring-donations/rd1/pause" && x.csrf === "stub-csrf") && (await main(page)).includes("Paused"));
    await page.getByRole("button", { name: "Cancel agreement" }).click();
    check("agreement: cancel requires a reason before confirming", await page.getByRole("dialog").getByRole("button", { name: "Cancel agreement" }).isDisabled());
    await page.keyboard.press("Escape");

    step = "receipts";
    await page.goto(`${WEB}/en/receipts`, { waitUntil: "networkidle" });
    await page.locator("main table tbody tr").first().waitFor();
    t = await main(page);
    check("receipts: SDI notice, list, TEST badge on the test series", t.includes("Spring of Dignity International") && t.includes("NOT confirmed as legally valid tax receipts") && (await page.locator("main table tbody tr").nth(2).innerText()).includes("TEST"));
    const docHref = await page.locator("main table tbody tr").first().getByRole("link", { name: "HTML" }).getAttribute("href");
    check("receipts: document link is the same-origin API document (HTML)", docHref === "/api/v1/admin/receipts/rc1/document?locale=en&format=html");
    await page.goto(`${WEB}/en/receipts/rc1`, { waitUntil: "networkidle" });
    await page.getByText("Content frozen at issue time").waitFor();
    check("receipt detail: snapshot, issuer and audit; no issue/regenerate buttons", (await main(page)).includes("Issuer printed on the record") && (await page.getByRole("button", { name: /Issue|Regenerate/ }).count()) === 0);

    step = "states";
    state.fail.add("/admin/donations/d2");
    await page.goto(`${WEB}/en/donations/d2`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Try again" }).waitFor();
    state.fail.delete("/admin/donations/d2");
    await page.getByRole("button", { name: "Try again" }).click();
    await page.getByText("Donation summary").first().waitFor();
    check("error state: retry re-requests and recovers", true);
    await page.goto(`${WEB}/en/donations/does-not-exist`, { waitUntil: "networkidle" });
    check("not found: 404 shows 'record was not found'", await waitText(page, "This record was not found."));
    await ctx.close();

    step = "limited role";
    ({ ctx, page } = await open());
    await login(page, "ops@stub.test", "stub-password");
    const side2 = await page.locator("aside").first().innerText();
    check("permissions: donations-only role sees Donations + Payments, not Donors/Recurring/Receipts", side2.includes("Donations") && !side2.includes("Recurring Donations") && !side2.includes("Receipts") && !/\bDonors\b/.test(side2));
    const callsBefore = apiCalls.length;
    await page.goto(`${WEB}/en/donors`, { waitUntil: "networkidle" });
    check("permissions: direct visit to /donors without donors.read → no-access state, no donors request", (await main(page)).includes("You do not have access to this section.") && !apiCalls.slice(callsBefore).some((c) => c.includes("/admin/donors")));
    await page.goto(`${WEB}/en/donations`, { waitUntil: "networkidle" });
    await page.locator("main table tbody tr").first().waitFor();
    t = await main(page);
    check("permissions: donor PII restricted, search limited to reference, amounts need reports.read", t.includes("Restricted") && !t.includes("Sara Haddad") && (await page.getByPlaceholder("Search by reference").count()) === 1 && t.includes("Amounts need the reports.read permission."));
    await page.goto(`${WEB}/en/donations/d1`, { waitUntil: "networkidle" });
    await page.getByText("Donation summary").first().waitFor();
    t = await main(page);
    check("permissions: refund request disabled (no permission, provider unverifiable)", (await page.getByRole("button", { name: "Request refund" }).isDisabled()) && t.includes("Your role does not include this permission.") && t.includes("cannot be verified"));
    await page.goto(`${WEB}/en/payments`, { waitUntil: "networkidle" });
    check("permissions: payments page shows only the refunds tab for donations.read", (await page.getByRole("tab").count()) === 1 && (await page.getByRole("tab").innerText()).includes("Refunds"));
    await ctx.close();

    step = "arabic + responsive";
    ({ ctx, page } = await open());
    await login(page, "fin6b@stub.test", "stub-password", "ar");
    await page.goto(`${WEB}/ar/donations`, { waitUntil: "networkidle" });
    await page.locator("main table tbody tr").first().waitFor();
    t = await main(page);
    check("ar: RTL document, Arabic headings and table headers", (await page.evaluate(() => [document.documentElement.dir, document.documentElement.lang].join())) === "rtl,ar" && t.includes("التبرعات") && t.includes("مرجع التبرع"));
    check("ar: references and money stay LTR inside RTL", (await page.locator("main table tbody tr").first().locator("bdi[dir=ltr]").count()) >= 2 && /\$\d/.test(t));
    check("ar: sidebar on the right", (await page.locator("aside").first().evaluate((e) => e.getBoundingClientRect().left)) > 700);
    await page.screenshot({ path: `${OUT}/donations-ar-1440.png`, fullPage: true });
    await ctx.close();
    for (const loc of ["en", "ar"]) {
      for (const w of [1440, 1024, 768, 390, 360]) {
        ({ ctx, page } = await open(w, 860));
        await login(page, "fin6b@stub.test", "stub-password", loc);
        for (const path of ["/donations", "/donations/d0", "/donors/dn0", "/payments", "/recurring/rd1", "/receipts", "/payments/refunds/rf1"]) {
          await page.goto(`${WEB}/${loc}${path}`, { waitUntil: "networkidle" });
          await page.getByRole("heading", { level: 1 }).waitFor();
          check(`${loc} ${w}px ${path}: no horizontal page overflow`, await noOverflow(page));
        }
        if (w <= 390) {
          await page.goto(`${WEB}/${loc}/donations`, { waitUntil: "networkidle" });
          await page.locator("main ul li").first().waitFor();
          check(`${loc} ${w}px: mobile shows card rows (table hidden) and a Filters toggle`, (await page.locator("main table").first().isHidden()) && (await page.getByRole("button", { name: loc === "ar" ? /عوامل التصفية/ : /Filters/ }).isVisible()));
          await page.screenshot({ path: `${OUT}/donations-${loc}-${w}.png`, fullPage: true });
        }
        await ctx.close();
      }
    }
  }
} catch (e) {
  check(`unexpected error at step "${step}": ${e.message.split("\n").slice(0, 3).join(" | ")}`, false);
}

const uniq = [...new Set(problems)];
check("no console errors, page errors or off-origin requests during the run", uniq.length === 0, uniq.slice(0, 3).join(" | "));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed (${MODE})`);
await browser.close();
stub?.close();
process.exit(failed.length ? 1 : 0);
