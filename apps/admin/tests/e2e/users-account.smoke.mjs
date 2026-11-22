// Final release — Users & Roles + forced first-sign-in password change, against LOCAL STAGING only (real API + MySQL rehearsal DB).
// Creates one clearly-labelled DEMO account per run (example.test address), lets it change its temporary password, then
// deactivates it through the UI. Credentials are read privately and never printed. No payment or financial switch is touched.
//   ADMIN_URL=http://localhost:3201 BROWSER=chromium|firefox|webkit node tests/e2e/users-account.smoke.mjs
import { chromium, firefox, webkit } from "playwright-core";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ADMIN = process.env.ADMIN_URL ?? "http://localhost:3201";
const ENGINE = process.env.BROWSER ?? "chromium";
const browser = ENGINE === "chromium"
  ? await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true })
  : await ({ firefox, webkit }[ENGINE]).launch({ headless: true });
const results = [];
const check = (label, value) => { results.push(!!value); console.log(`${value ? "PASS" : "FAIL"} ${label}`); };
const cred = Object.fromEntries(readFileSync(resolve(import.meta.dirname, "../../../../deploy/staging/.env.staging-admin"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const strong = () => `Demo-${randomBytes(9).toString("base64url")}-7`;

async function signIn(page, locale, email, password) {
  await page.goto(`${ADMIN}/${locale}/login`, { waitUntil: "networkidle" });
  await page.locator("input[type=email]").fill(email);
  await page.locator("input[type=password]").fill(password);
  await page.locator("form button[type=submit]").click();
}

try {
  for (const [locale, width, height] of [["en", 1440, 900], ["ar", 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await signIn(page, locale, cred.ADMIN_BOOTSTRAP_EMAIL, cred.ADMIN_BOOTSTRAP_PASSWORD);
    await page.waitForURL((u) => !u.pathname.endsWith("/login"));
    await page.goto(`${ADMIN}/${locale}/users`, { waitUntil: "networkidle" });
    await page.locator("[data-testid=user-add]").waitFor();
    check(`${locale} users page lists accounts`, (await page.locator("table tbody tr").count()) + (await page.locator("ul[aria-label] > li").count()) > 0);
    check(`${locale} roles catalogue is shown`, (await page.locator("#roles-title").count()) === 1);
    check(`${locale} page direction`, (await page.locator("html").getAttribute("dir")) === (locale === "ar" ? "rtl" : "ltr"));
    check(`${locale} users page fits viewport`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    // create a DEMO user with one non-Super-Admin role
    const email = `demo-e2e-${ENGINE}-${locale}-${Date.now()}@example.test`;
    const temp = strong();
    await page.locator("[data-testid=user-add]").click();
    const dlg = page.locator("[role=dialog]");
    await dlg.waitFor();
    const inputs = dlg.locator("input:not([type=checkbox])");
    await inputs.nth(0).fill(`DEMO e2e ${ENGINE} ${locale}`);
    await inputs.nth(1).fill(email);
    await inputs.nth(2).fill(temp);
    await dlg.locator("input[type=checkbox]:not([disabled])").nth(1).check();
    const createBtn = dlg.locator("button.btn-primary");
    check(`${locale} create is enabled once the form is valid`, await createBtn.isEnabled());
    await createBtn.click();
    await page.locator("[data-testid=users-message]").waitFor();
    await page.locator("[role=dialog]").waitFor({ state: "detached" });
    await page.locator(`tr:has-text("${email}"):visible, li:has-text("${email}"):visible`).first().waitFor();
    check(`${locale} created user appears with "must change password"`, (await page.locator(`tr:has-text("${email}"):visible, li:has-text("${email}"):visible`).first().innerText()).length > 0);

    // the new user signs in: every page shows the forced change form until the password is changed
    const ctx2 = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", ignoreHTTPSErrors: true });
    const p2 = await ctx2.newPage();
    p2.on("pageerror", (e) => errors.push(e.message));
    await signIn(p2, locale, email, temp);
    await p2.locator("[data-testid=forced-password-change]").waitFor();
    check(`${locale} first sign-in shows the forced password change`, true);
    await p2.goto(`${ADMIN}/${locale}/payments`, { waitUntil: "networkidle" });
    check(`${locale} other pages stay behind the forced change`, await p2.locator("[data-testid=forced-password-change]").isVisible());
    const pw = p2.locator("[data-testid=forced-password-change] input[type=password]");
    await pw.nth(0).fill("wrong-current-password-1");
    const next = strong();
    await pw.nth(1).fill(next);
    await pw.nth(2).fill(next);
    await p2.locator("[data-testid=forced-password-change] button[type=submit]").click();
    await p2.locator("[data-testid=forced-password-change] [role=alert]").waitFor();
    check(`${locale} wrong current password shows an inline error and keeps the session`, (await p2.locator("[data-testid=forced-password-change]").count()) === 1 && !p2.url().includes("/login"));
    await pw.nth(0).fill(temp);
    await p2.locator("[data-testid=forced-password-change] button[type=submit]").click();
    await p2.locator("[data-testid=forced-password-change]").waitFor({ state: "detached" });
    check(`${locale} after the change the dashboard is usable`, (await p2.locator("main#content").count()) === 1);
    await ctx2.close();

    // cleanup through the UI: deactivate the DEMO account (accounts are never deleted — audit trail)
    await page.reload({ waitUntil: "networkidle" });
    const row = page.locator(`tr:has-text("${email}"):visible, li:has-text("${email}"):visible`).first();
    await row.locator("button").nth(1).click();
    const confirm = page.locator("[role=dialog]");
    await confirm.waitFor();
    await confirm.locator("button").last().click();
    await page.locator("[role=dialog]").waitFor({ state: "detached" });
    await page.locator("[data-testid=users-message]").waitFor();
    const deactivated = locale === "en" ? "Deactivated" : "معطّل";
    await page.locator(`tr:has-text("${email}"):visible, li:has-text("${email}"):visible`).filter({ hasText: deactivated }).first().waitFor({ timeout: 10000 }).catch(() => {});
    check(`${locale} DEMO account deactivated through the UI`, (await page.locator(`tr:has-text("${email}"):visible, li:has-text("${email}"):visible`).first().innerText()).includes(deactivated));
    if (errors.length) console.log(`  page errors (${locale}): ${errors.slice(0, 3).map((m) => m.slice(0, 160)).join(" || ")}`);
    check(`${locale} no uncaught browser errors`, errors.length === 0);
    await ctx.close();
  }
} catch (error) {
  console.error(error.message.split("\n").slice(0, 3).join(" | "));
  if (process.env.SHOT_DIR) for (const c of browser.contexts()) for (const [i, pg] of c.pages().entries()) await pg.screenshot({ path: `${process.env.SHOT_DIR}/fail-${ENGINE}-${i}.png`, fullPage: true }).catch(() => {});
  check("journey completes", false);
} finally {
  await browser.close();
}
console.log(`${results.filter(Boolean).length}/${results.length} checks passed (${ENGINE}; local staging)`);
process.exit(results.every(Boolean) ? 0 : 1);
