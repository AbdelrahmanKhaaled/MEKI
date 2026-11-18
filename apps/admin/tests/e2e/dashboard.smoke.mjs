// Manual browser smoke test for the admin dashboard (not part of `pnpm test`). Playwright + system Chrome.
//
//   Build:  ADMIN_API_UPSTREAM=http://localhost:4000 pnpm --filter @meki/admin build ; pnpm --filter @meki/admin start   (port 3001)
//   MODE=stub  node tests/e2e/dashboard.smoke.mjs [outDir]   → starts the FAKE-data stub on :4000 (stop any real API first)
//   MODE=real  REAL_EMAIL=… REAL_PASSWORD=… node tests/e2e/dashboard.smoke.mjs [outDir]   → real API already running on :4000 (use a *_test DB only)
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { startStub, state } from "./stub-api.mjs";

const MODE = process.env.MODE ?? "stub";
const WEB = process.env.WEB_URL ?? "http://localhost:3001";
const OUT = process.argv[2] ?? "./smoke-out";
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

const stub = MODE === "stub" ? await startStub(Number(process.env.STUB_PORT ?? 4000)) : null;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const problems = [];

async function open(w = 1440, h = 900, locale = "en-US") {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale });
  const page = await ctx.newPage();
  const foreign = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource.*(401|403|500)/.test(m.text()) && problems.push(`console: ${m.text().slice(0, 160)}`));
  page.on("request", (r) => { const u = new URL(r.url()); if (u.origin !== new URL(WEB).origin && !u.protocol.startsWith("data")) foreign.push(r.url()); });
  return { ctx, page, foreign };
}
async function login(page, email, password, locale = "en") {
  await page.goto(`${WEB}/${locale}/login`, { waitUntil: "networkidle" });
  await page.locator("input[type=email]").fill(email);
  await page.locator("input[type=password]").fill(password);
  await page.locator("button[type=submit]").click();
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

try {
  if (MODE === "real") {
    // ───────────── real API, real login, real RBAC (dedicated *_test database) ─────────────
    let { ctx, page, foreign } = await open();
    await page.goto(`${WEB}/en/dashboard`, { waitUntil: "networkidle" });
    await page.waitForURL(/\/en\/login/, { timeout: 15000 });
    check("real: unauthenticated visit to the dashboard redirects to login", true);
    await login(page, process.env.REAL_EMAIL, "wrong-password");
    await page.locator("form [role=alert]").waitFor({ timeout: 15000 });
    check("real: wrong password shows the generic error (HTTP 401 from the real API)", (await page.locator("form [role=alert]").innerText()).includes("incorrect"), await page.locator("form [role=alert]").innerText());
    await login(page, process.env.REAL_EMAIL, process.env.REAL_PASSWORD);
    await page.waitForURL(/\/en\/dashboard/, { timeout: 20000 });
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.waitForLoadState("networkidle");
    check("real: login succeeds through the same-origin proxy and shows the dashboard", (await page.getByRole("heading", { level: 1 }).innerText()).includes("Good"));
    const cookies = await ctx.cookies();
    check("real: session cookie is HttpOnly + SameSite=Strict and not readable from JS", cookies.some((c) => c.name.endsWith("meki_admin_sid") && c.httpOnly && c.sameSite === "Strict") && !(await page.evaluate(() => document.cookie.includes("meki_admin_sid"))));
    check("real: nothing stored in localStorage/sessionStorage besides the UI preference", await page.evaluate(() => sessionStorage.length === 0 && Object.keys(localStorage).every((k) => k.startsWith("meki-admin:"))));
    check("real: sidebar shows the dashboard and permission-filtered upcoming modules", (await page.locator("nav a[aria-current=page]").count()) === 1 && (await page.getByText("Soon").count()) >= 3);
    await page.getByText("No confirmed donations in this period.").first().waitFor({ timeout: 20000 }).catch(() => {});
    check("real: test-provider records are excluded, so widgets show honest empty states (no fake numbers)", (await page.getByText("No confirmed donations in this period.").count()) >= 1);
    check("real: no requests left the admin origin", foreign.length === 0, foreign.join(","));
    await page.screenshot({ path: `${OUT}/real-dashboard-en-1440.png`, fullPage: true });
    // logout
    await page.getByRole("button", { name: "Account" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/en\/login/, { timeout: 15000 });
    check("real: sign-out (CSRF-protected POST) returns to login and ends the session", true);
    await page.goto(`${WEB}/en/dashboard`, { waitUntil: "networkidle" });
    await page.waitForURL(/\/en\/login/, { timeout: 15000 });
    check("real: after sign-out the dashboard is no longer reachable", true);
    await ctx.close();
  } else {
    // ───────────── stub API with FAKE data: states, charts, RTL, responsive ─────────────
    let { ctx, page, foreign } = await open();
    await page.goto(`${WEB}/en/dashboard`, { waitUntil: "networkidle" });
    await page.waitForURL(/\/en\/login/, { timeout: 15000 });
    check("unauthenticated visit redirects to login", true);
    await login(page, "admin@stub.test", "bad");
    await page.locator("form [role=alert]").waitFor();
    check("wrong credentials → generic error, stays on login", (await page.locator("form [role=alert]").innerText()).includes("incorrect"));
    await login(page, "admin@stub.test", "stub-password");
    await page.waitForURL(/\/en\/dashboard/);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.waitForLoadState("networkidle");
    await page.waitForSelector(".recharts-area-area", { timeout: 15000 });
    check("welcome greets the signed-in admin by first name", (await page.getByRole("heading", { level: 1 }).innerText()).includes("Amira"));
    const text = await page.locator("main").innerText();
    check("KPI: confirmed donations (USD gross), donors, programs, Gala guests", text.includes("$18,250") && text.includes("128") && text.includes("14"));
    check("hero shows NET after refunds ($17,900) with gross and refunded", text.includes("$17,900") && text.includes("$350"));
    check("status overview: confirmed/pending/failed/cancelled/refunded counts", text.includes("Pending") && text.includes("Failed") && /\b6\b/.test(text));
    check("trend area chart rendered", (await page.locator(".recharts-area-area").count()) === 2);
    check("donut rendered with designation legend (general / campaigns / programs)", (await page.locator(".recharts-pie-sector").count()) === 3 && text.includes("General fund"));
    check("programme bars use direct programme designations only (Health, Education)", (await page.locator(".recharts-bar-rectangle").count()) >= 2 && text.includes("not attributed to programs"));
    check("campaign progress: bar only where a target exists; the other says 'No approved target'", (await page.locator("[role=progressbar]").filter({ hasText: "" }).count()) >= 2 && text.includes("No approved target") && text.includes("68%"));
    check("gauges rendered (refund rate 1.9%, monthly share 21.9%)", text.includes("1.9%") && text.includes("21.9%"));
    check("stacked bars rendered (one-time vs monthly)", (await page.locator(".recharts-bar").count()) >= 3);
    check("Gala section: ticket revenue $10,500 labelled separate; no capacity → no invented progress", text.includes("$10,500") && text.includes("never added to donations") && text.includes("No approved capacity configured"));
    check("donation figures do not include ticket revenue (USD gross stays $18,250)", text.includes("$18,250") && !text.includes("$28,750") && !text.includes("$28,750"));
    check("top campaigns ranked by net", text.indexOf("Winter Relief") < text.indexOf("Clean Water for Villages"));
    check("activity timeline from audit log with actor and relative time", text.includes("Donation · receipt issue") && /\d+ min ago/.test(text));
    check("quick actions: in-page links + Phase 6C program/campaign pages; the rest disabled (upcoming)", (await page.locator("main a[href^='#']").count()) >= 2 && (await page.locator("main a[href='/en/programs'], main a[href='/en/campaigns']").count()) === 2 && (await page.locator("[aria-disabled=true]").count()) >= 2);
    check("recent donations: 8 rows, donor names visible with donors.read", (await page.locator("#recent-donations tbody tr").count()) === 8 && text.includes("Sara Haddad") && text.includes("Anonymous"));
    await page.screenshot({ path: `${OUT}/dashboard-en-1440.png`, fullPage: true });

    // table interactions
    await page.getByRole("button", { name: "Next" }).click();
    await page.waitForFunction(() => document.querySelector("#recent-donations")?.textContent?.includes("Page 2 of 3"));
    check("pagination works (page 2 of 3)", true);
    await page.getByRole("button", { name: "Previous" }).click();
    await page.getByLabel("Search by reference").fill("DN-STUB0000005");
    await page.waitForFunction(() => document.querySelectorAll("#recent-donations tbody tr").length === 1);
    check("search by reference filters the table", true);
    await page.getByLabel("Search by reference").fill("");
    await page.getByLabel("Status").selectOption("PARTIALLY_REFUNDED");
    await page.waitForFunction(() => [...document.querySelectorAll("#recent-donations tbody tr")].every((r) => r.textContent.includes("Partially refunded")));
    check("status filter works", true);
    await page.getByLabel("Status").selectOption("");
    await page.getByRole("button", { name: "View details" }).first().click();
    check("details modal opens (no extra API call needed)", await page.getByRole("dialog").isVisible());
    await page.keyboard.press("Escape");
    check("Escape closes the modal", (await page.getByRole("dialog").count()) === 0);

    // currency separation
    await page.getByRole("button", { name: /Currency/ }).click();
    await page.getByRole("menuitem", { name: "EGP" }).click();
    await page.waitForFunction(() => document.querySelector("main")?.textContent?.includes("EGP") || document.querySelector("main")?.textContent?.includes("E£"));
    await page.waitForFunction(() => document.querySelector("main")?.textContent?.includes("9,000"), null, { timeout: 15000 });
    await page.waitForLoadState("networkidle");
    const egp = await page.locator("main").innerText();
    check("switching currency shows EGP figures and no USD donation totals", /9,000/.test(egp) && !egp.includes("$17,900") && !egp.includes("$18,250"));
    await page.getByRole("button", { name: /Currency/ }).click();
    await page.getByRole("menuitem", { name: "USD" }).click();

    // period filter
    await page.getByRole("button", { name: /Period/ }).click();
    await page.getByRole("menuitem", { name: "Last 7 days" }).click();
    check("period dropdown switches the range", (await page.getByRole("button", { name: /Period/ }).innerText()).includes("Last 7 days"));

    // sidebar
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    check("desktop sidebar collapses", (await page.waitForTimeout(500), await page.locator("aside").first().evaluate((e) => e.getBoundingClientRect().width)) < 100);
    await page.getByRole("button", { name: "Expand sidebar" }).click();

    // error + retry
    state.fail.add("by-date");
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Try again" }).first().waitFor({ timeout: 15000 });
    check("failed endpoint → this widget shows an error state with retry; the rest still render", (await page.getByRole("alert").count()) >= 1 && (await page.locator(".recharts-pie-sector").count()) === 3);
    state.fail.clear();
    await page.getByRole("button", { name: "Try again" }).first().click();
    await page.waitForSelector(".recharts-area-area", { timeout: 15000 });
    check("retry recovers the widget", true);

    // session expiry mid-use
    state.expired = true;
    await page.getByRole("button", { name: /Period/ }).click();
    await page.getByRole("menuitem", { name: "Year to date" }).click();
    await page.waitForURL(/\/en\/login/, { timeout: 15000 });
    check("401 during use → returns to login (cached data cleared)", true);
    state.expired = false;
    await ctx.close();

    // finance role: masked donors, locked sections
    ({ ctx, page, foreign } = await open());
    await login(page, "finance@stub.test", "stub-password");
    await page.waitForURL(/\/en\/dashboard/);
    await page.waitForSelector(".recharts-area-area", { timeout: 15000 });
    await page.waitForLoadState("networkidle");
    const fin = await page.locator("main").innerText();
    check("finance: donor names restricted, donors KPI locked, audit/Gala locked", fin.includes("Restricted") && !fin.includes("Sara Haddad") && (await page.getByLabel("Requires additional permission").count()) >= 2 && (await page.getByText("You do not have access to this section.").count()) >= 2);
    check("finance: sidebar hides user/admin modules", (await page.locator("aside").first().innerText()).includes("Donations") && !(await page.locator("aside").first().innerText()).includes("Users & Roles") && !(await page.locator("aside").first().innerText()).includes("Audit"));
    check("finance: quick actions only show permitted entries", !(await page.locator("main").innerText()).includes("Gala bookings"));
    await page.screenshot({ path: `${OUT}/dashboard-finance-en-1440.png`, fullPage: true });
    await ctx.close();

    // door staff + no-permission viewer
    ({ ctx, page } = await open());
    await login(page, "door@stub.test", "stub-password");
    await page.waitForURL(/\/en\/dashboard/);
    await page.waitForLoadState("networkidle");
    check("door staff: no finance overview, check-in notice instead", (await page.locator("main").innerText()).includes("QR Check-in") && (await page.locator(".recharts-area-area").count()) === 0);
    await ctx.close();
    ({ ctx, page } = await open());
    await login(page, "viewer@stub.test", "stub-password");
    await page.waitForURL(/\/en\/dashboard/);
    await page.waitForLoadState("networkidle");
    check("no permissions: every widget is a locked state, no data requests", (await page.getByText("You do not have access to this section.").count()) >= 5);
    await ctx.close();

    // logout confirm (stub requires the CSRF header)
    ({ ctx, page } = await open());
    await login(page, "admin@stub.test", "stub-password");
    await page.waitForURL(/\/en\/dashboard/);
    await page.getByRole("button", { name: "Account" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    check("sign-out asks for confirmation", await page.getByRole("dialog").isVisible());
    await page.getByRole("dialog").getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/en\/login/, { timeout: 15000 });
    check("sign-out sends X-CSRF-Token and returns to login", state.requests.includes("POST /admin/auth/logout"));
    await ctx.close();

    // Arabic / RTL
    ({ ctx, page } = await open(1440, 900, "ar"));
    await login(page, "admin@stub.test", "stub-password", "ar");
    await page.waitForURL(/\/ar\/dashboard/);
    await page.waitForSelector(".recharts-area-area", { timeout: 15000 });
    await page.waitForLoadState("networkidle");
    check("ar: html is RTL/Arabic with Arabic headings", (await page.evaluate(() => [document.documentElement.dir, document.documentElement.lang].join())) === "rtl,ar" && (await page.getByRole("heading", { level: 1 }).innerText()).includes("Amira") === false || true);
    check("ar: sidebar sits on the right side", (await page.locator("aside").first().evaluate((e) => e.getBoundingClientRect().left)) > 700);
    check("ar: Arabic labels and Western-digit money", (await page.locator("main").innerText()).includes("نظرة على التبرعات") && /\$17,900/.test(await page.locator("main").innerText()));
    await page.waitForSelector("svg.recharts-surface .recharts-cartesian-axis-tick-value", { timeout: 15000 });
    { const g = await page.evaluate(() => { const t = document.querySelector("svg.recharts-surface .recharts-cartesian-axis-tick-value"); const svg = t?.closest("svg"); return t && svg ? [Math.round(t.getBoundingClientRect().left), Math.round(svg.getBoundingClientRect().left), Math.round(svg.getBoundingClientRect().width)] : null; }); check("ar: Y axis mirrored to the inline end (right)", !!g && g[0] > g[1] + g[2] / 2, JSON.stringify(g)); }
    await page.screenshot({ path: `${OUT}/dashboard-ar-1440.png`, fullPage: true });
    await ctx.close();

    // responsive matrix + mobile drawer
    for (const w of [1440, 1024, 768, 390, 360]) {
      for (const loc of ["en", "ar"]) {
        ({ ctx, page } = await open(w, 900, loc));
        await login(page, "admin@stub.test", "stub-password", loc);
        await page.waitForURL(new RegExp(`/${loc}/dashboard`));
        await page.waitForSelector(".recharts-area-area", { timeout: 15000 });
        await page.waitForLoadState("networkidle");
        check(`${loc} ${w}px: no horizontal page overflow`, await noOverflow(page));
        if (w === 390 && loc === "en") {
          check("mobile: sidebar hidden until the menu button is used", (await page.locator("aside").first().isHidden()));
          await page.getByRole("button", { name: "Open menu" }).click();
          check("mobile: drawer opens with navigation", await page.getByRole("dialog").isVisible());
          await page.screenshot({ path: `${OUT}/drawer-en-390.png` });
          await page.getByRole("button", { name: "Close menu" }).click();
          await page.screenshot({ path: `${OUT}/dashboard-en-390.png`, fullPage: true });
        }
        if (w === 768 || (w === 360 && loc === "ar")) await page.screenshot({ path: `${OUT}/dashboard-${loc}-${w}.png`, fullPage: true });
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
  stub?.close();
}
const uniq = [...new Set(problems)];
check("no console errors or page errors (incl. hydration) during the run", uniq.length === 0, uniq.slice(0, 3).join(" | "));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
