// Phase 14B local staging only: closed financial gates, usable CTAs, private finance UI.
// No payment is initiated. Auth credentials are read privately and never printed or changed.
import { chromium, firefox, webkit } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = process.env.WEB_URL ?? 'http://localhost:3200';
const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:3201';
const ENGINE = process.env.BROWSER ?? 'chromium';
const OUT = resolve(process.env.PHASE14B_SCREENSHOTS ?? '.tmp/phase14b-browser');
mkdirSync(OUT, { recursive: true });
const browser = ENGINE === 'chromium'
  ? await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  : await ({ firefox, webkit }[ENGINE]).launch({ headless: true });
const results = [];
const check = (label, value) => { results.push(!!value); console.log(`${value ? 'PASS' : 'FAIL'} ${label}`); };
const cred = Object.fromEntries(readFileSync(resolve(import.meta.dirname, '../../../../deploy/staging/.env.staging-admin'), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));

try {
  for (const [locale, width, height] of [['en', 1440, 900], ['ar', 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${WEB}/${locale}`, { waitUntil: 'networkidle' });
    if (width < 600) await page.locator('header button[aria-controls=mobile-menu]').click();
    const give = page.locator('header button:visible').filter({ hasText: locale === 'en' ? /Give/ : /تبرّ?ع/ }).first();
    await give.click();
    await page.locator('dialog[open]').waitFor();
    check(`${locale} header/mobile Give explains disabled collection`, await page.locator('[data-testid=donate-dialog-preview]').isVisible());
    await page.locator('[data-testid=donate-dialog-preview]').click();
    await page.locator('[data-testid=giving-form]').waitFor();
    check(`${locale} header preview navigates to giving journey`, page.url().includes(`/${locale}/give`));
    check(`${locale} closed giving form collects no contact details`, await page.locator('[data-testid=giving-form] input[type=email]').count() === 0);
    check(`${locale} closed giving form offers no Zeffy checkout`, await page.locator('[data-testid=giving-form] a[href*=zeffy]').count() === 0);
    // Firefox + Playwright: re-visiting a URL identical to an earlier history entry triggers a duplicate, stalled load (bfcache
    // interaction; a direct /give → home navigation loads once). A distinct URL avoids it. Test plumbing only — the home page ignores it.
    await page.waitForLoadState('networkidle');
    await page.goto(`${WEB}/${locale}?journey=cards`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('load');
    await page.waitForFunction(() => document.readyState === 'complete');
    // Approved campaign cards appear only once MEKI approves campaigns; the programme card's Give button is always present.
    const campaignGive = page.locator('#campaigns article button');
    if (width < 600) {
      const firstHeader = page.locator('#programmes button[aria-controls]').first();
      await firstHeader.click();
      // Regression: scrolling a neighbouring row under the pointer must not change the mobile selection.
      await page.mouse.move(200, 580);
    }
    const cardGive = (await campaignGive.count()) ? campaignGive.first() : page.locator('#programmes button.btn-green:visible').first();
    await cardGive.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" })); // as a visitor would: mid-screen, clear of fixed header/notice
    if (width < 600) {
      check(`${locale} scrolling does not change the mobile accordion selection`, await page.locator('#programmes button[aria-controls]').first().getAttribute('aria-expanded') === 'true');
      check(`${locale} collapsed programme Give buttons are hidden and inert`, await page.locator('#programmes [aria-hidden=true][inert] button.btn-green:visible').count() === 0);
    }
    await cardGive.click();
    await page.locator('dialog[open]').waitFor();
    check(`${locale} homepage card Give preserves programme interest`, (await page.locator('[data-testid=donate-dialog-preview]').getAttribute('href'))?.includes('programme='));
    await page.locator('dialog[open] button').first().click();
    await page.locator('form#give select').selectOption('programme:health');
    await page.locator('form#give button[type=submit]').click();
    await page.locator('dialog[open]').waitFor();
    const preview = page.locator('[data-testid=donate-dialog-preview]');
    const href = await preview.getAttribute('href');
    check(`${locale} Quick Donate carries programme interest and amount`, href?.includes('programme=health') && href.includes('amount='));
    await preview.click();
    await page.locator('[data-testid=giving-form]').waitFor();
    check(`${locale} programme interest is preselected`, await page.locator('#g-dest').inputValue() === 'health');
    check(`${locale} Zakat remains unavailable`, await page.locator('input[value=ZAKAT]').isDisabled());
    await page.goto(`${WEB}/${locale}/events/gala-night`, { waitUntil: 'networkidle' });
    const book = page.locator(`#booking a[href='/${locale}/events/gala-night/book']`);
    const donate = page.locator(`#booking a[href='/${locale}/events/gala-night/donate']`);
    check(`${locale} Gala booking CTA has working internal navigation`, await book.count() === 1);
    check(`${locale} Gala donation CTA has working reference-first navigation`, await donate.count() === 1);
    await book.click();
    await page.waitForURL((u) => u.pathname.endsWith(`/${locale}/events/gala-night/book`));
    await page.waitForLoadState('networkidle');
    check(`${locale} closed booking offers no external checkout`, await page.locator('main a[href*=zeffy]').count() === 0);
    await page.goto(`${WEB}/${locale}/events/gala-night/donate`, { waitUntil: 'networkidle' });
    check(`${locale} Gala donation is not payable while disabled (preview form or truthful unavailable panel; no SDI link, no reference)`, ((await page.locator('[data-testid=giving-form]').count()) ? (await page.locator('[data-testid=giving-form]').getAttribute('data-preview')) === 'true' : await page.locator('[data-testid=gala-giving-unavailable]').isVisible()) && (await page.locator('main a[href*=zeffy]').count()) === 0 && (await page.locator('[data-testid=donation-reference]').count()) === 0);
    check(`${locale} giving page fits viewport`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${OUT}/giving-${locale}-${ENGINE}.png` });
    const login = await ctx.request.post(`${ADMIN}/api/v1/admin/auth/login`, { data: { email: cred.ADMIN_BOOTSTRAP_EMAIL, password: cred.ADMIN_BOOTSTRAP_PASSWORD } });
    check(`${locale} admin login through proxy succeeds`, login.ok());
    await page.goto(`${ADMIN}/${locale}/payments/sdi-evidence`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: locale === 'en' ? 'SDI payment evidence' : 'أدلة مدفوعات SDI', exact: true }).waitFor();
    check(`${locale} private evidence submission form renders`, await page.locator('form input').count() >= 14);
    check(`${locale} approval-disabled explanation is visible`, await page.locator('[data-testid=evidence-approval-disabled]').isVisible());
    check(`${locale} private evidence page fits viewport`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    check(`${locale} page direction is correct`, await page.locator('html').getAttribute('dir') === (locale === 'ar' ? 'rtl' : 'ltr'));
    await page.screenshot({ path: `${OUT}/evidence-${locale}-${ENGINE}.png` });
    if (errors.length) console.log(`  page errors (${locale}): ${errors.slice(0, 3).map((m) => m.slice(0, 160)).join(" || ")}`);
    check(`${locale} journeys have no uncaught browser errors`, errors.length === 0);
    await ctx.close();
  }
} catch (error) {
  console.error(error.message);
  check('journey completes', false);
} finally {
  await browser.close();
}
console.log(`${results.filter(Boolean).length}/${results.length} checks passed (${ENGINE}; local staging, collection disabled)`);
process.exit(results.every(Boolean) ? 0 : 1);
