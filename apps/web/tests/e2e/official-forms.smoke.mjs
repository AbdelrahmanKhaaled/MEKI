// Final release — official Zeffy form hand-off, against a LOCAL build made with both release switches ON and an UNREACHABLE API
// (NEXT_PUBLIC_API_URL pointing at a closed port): proves the book/donate pages stay useful when the backend is offline.
// The external forms are never opened (no request to zeffy.com is made by this test): only the links are checked.
//   WEB_URL=http://localhost:3200 BROWSER=chromium|firefox|webkit node tests/e2e/official-forms.smoke.mjs
import { chromium, firefox, webkit } from "playwright-core";

const WEB = process.env.WEB_URL ?? "http://localhost:3200";
const ENGINE = process.env.BROWSER ?? "chromium";
const TICKET = "https://www.zeffy.com/en-US/ticketing/misr-el-kheir-foundation-gala-new-york";
const DONATION = "https://www.zeffy.com/en-US/donation-form/misr-el-kheir-foundation-gala-new-york-donation";
const browser = ENGINE === "chromium"
  ? await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true })
  : await ({ firefox, webkit }[ENGINE]).launch({ headless: true });
const results = [];
const check = (label, value) => { results.push(!!value); console.log(`${value ? "PASS" : "FAIL"} ${label}`); };

try {
  for (const [locale, width, height] of [["en", 1440, 900], ["ar", 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(/zeffy\.com/, (r) => r.abort()); // never contact the real forms from a test

    for (const [path, kind, url] of [["book", "ticket", TICKET], ["donate", "donation", DONATION]]) {
      await page.goto(`${WEB}/${locale}/events/gala-night/${path}`, { waitUntil: "networkidle" });
      const panel = page.locator(`[data-testid=official-${kind}-handoff]`);
      await panel.waitFor({ timeout: 15000 });
      const link = page.locator(`[data-testid=official-${kind}-link]`);
      check(`${locale} ${path}: hand-off shown while the API is unreachable`, await panel.isVisible());
      check(`${locale} ${path}: link is exactly the official ${kind} form`, (await link.getAttribute("href")) === url);
      check(`${locale} ${path}: opens in a new tab without opener/referrer`, (await link.getAttribute("target")) === "_blank" && /noopener/.test(await link.getAttribute("rel")) && /noreferrer/.test(await link.getAttribute("rel")));
      check(`${locale} ${path}: no MEKI reference and no iframe`, (await page.locator("[data-testid=donation-reference], iframe").count()) === 0 && !/\b(EB|DN)-[A-Z0-9]{12}\b/.test(await page.locator("main").innerText()));
      check(`${locale} ${path}: honest confirmation note`, /SDI\/Zeffy/.test(await panel.innerText()));
      check(`${locale} ${path}: direction and viewport`, (await page.locator("html").getAttribute("dir")) === (locale === "ar" ? "rtl" : "ltr") && (await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)));
    }
    if (errors.length) console.log(`  page errors (${locale}): ${errors.slice(0, 3).map((m) => m.slice(0, 160)).join(" || ")}`);
    check(`${locale} no uncaught browser errors`, errors.length === 0);
    await ctx.close();
  }
} catch (error) {
  console.error(error.message.split("\n").slice(0, 3).join(" | "));
  check("journey completes", false);
} finally {
  await browser.close();
}
console.log(`${results.filter(Boolean).length}/${results.length} checks passed (${ENGINE}; switches ON, API unreachable)`);
process.exit(results.every(Boolean) ? 0 : 1);
