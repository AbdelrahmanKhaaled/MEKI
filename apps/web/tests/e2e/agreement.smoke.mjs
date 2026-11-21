// Phase 12B manual browser smoke (not part of `pnpm test`): agreement scope on the public site, against a running web build
// (port 3000) and API. Checks programme pages are informational (no amounts, no payment button), /give has no checkout,
// and the Gala give panel shows no SDI link while giving is not authorized. Nothing is submitted or paid.
//   run: node tests/e2e/agreement.smoke.mjs [outDir]          (BROWSER=firefox|webkit for other engines)
import { mkdirSync } from "node:fs";
import { chromium, firefox, webkit } from "playwright-core";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const OUT = process.argv[2] ?? "./smoke-out-agreement";
const ENGINE = process.env.BROWSER ?? "chromium";
mkdirSync(OUT, { recursive: true });
const browser = ENGINE === "chromium"
  ? await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true })
  : await { firefox, webkit }[ENGINE].launch({ headless: true });
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

try {
  for (const [locale, w, h] of [["en", 1440, 900], ["ar", 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => check(`no page error (${page.url()})`, false, e.message));
    await page.goto(`${WEB}/${locale}/programs/health`, { waitUntil: "networkidle" });
    const panel = page.locator("[data-testid=programme-giving-closed]");
    await panel.waitFor({ timeout: 15000 });
    check(`${locale}: programme page shows the informational giving panel`, await panel.isVisible());
    check(`${locale}: no amount buttons, no submit/payment button, no external payment link in the panel`, (await panel.locator("button").count()) === 0 && (await panel.locator("a[target=_blank]").count()) === 0);
    check(`${locale}: panel links to the Gala page (information only)`, (await panel.locator(`a[href="/${locale}/events/gala-night"]`).count()) === 1);
    check(`${locale}: programme code shown`, /PRG-\d+/.test(await panel.innerText()));
    check(`${locale}: no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: `${OUT}/programme-${locale}-${ENGINE}.png`, fullPage: false });
    await panel.scrollIntoViewIfNeeded();
    await panel.screenshot({ path: `${OUT}/programme-panel-${locale}-${ENGINE}.png` });

    // Phase 14: the programme page offers a PREVIEW of a gift intention for this programme (internal link, no payment)
    check(`${locale}: programme panel links to the giving form with the programme preselected`, (await panel.locator(`a[href="/${locale}/give?programme=health#prepare"]`).count()) === 1);

    // Phase 14 (intended change from Phase 12B "no form"): /give now has the reusable giving form, but while SDI has not authorized
    // general/programme giving it is a PREVIEW — no reference can be issued, no SDI link, no submit button, no contact step.
    await page.goto(`${WEB}/${locale}/give?programme=health`, { waitUntil: "networkidle" });
    const gf = page.locator("[data-testid=giving-form]");
    check(`${locale}: /give shows the giving form as a preview; no SDI link, no checkout`, (await gf.getAttribute("data-preview")) === "true" && (await page.locator("a[href*='zeffy.com']").count()) === 0);
    check(`${locale}: /give links to the Gala campaign for information`, (await page.locator(`a[href="/${locale}/events/gala-night#booking"]`).count()) === 1);
    check(`${locale}: ?programme=health preselects the programme as the donor's intention`, (await page.locator("#g-dest").inputValue()) === "health");
    check(`${locale}: Zakat cannot be selected (nothing is Zakat-eligible by default)`, await page.locator("input[name=g-type][value=ZAKAT]").isDisabled());
    await page.locator("input[name=g-type][value=SADAQAH]").check();
    await page.locator("#g-amount").fill("50");
    await gf.locator("button[type=submit]").click();
    await page.locator("[data-testid=giving-closed]").waitFor({ timeout: 5000 });
    check(`${locale}: preview goes straight to review (no contact details collected) and cannot submit`, (await page.locator("#g-email").count()) === 0 && (await page.locator("[data-testid=giving-review]").isVisible()) && (await page.locator("[data-testid=donation-reference]").count()) === 0 && (await gf.getByRole("button", { name: /reference|المرجع/ }).count()) === 0);
    check(`${locale}: /give has no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await gf.screenshot({ path: `${OUT}/give-preview-${locale}-${ENGINE}.png` });

    // Gala donation page: not open (Gala giving not authorized) — no form URL, no payment path.
    await page.goto(`${WEB}/${locale}/events/gala-night/donate`, { waitUntil: "networkidle" });
    check(`${locale}: Gala donation page shows no SDI link while Gala giving is not authorized`, (await page.locator("a[href*='zeffy.com']").count()) === 0 && (await page.locator("[data-testid=donation-reference]").count()) === 0);
    // Return / status page: never confirms by itself.
    await page.goto(`${WEB}/${locale}/give/status/DN-AAAAAAAAAAAA`, { waitUntil: "networkidle" });
    check(`${locale}: status page says the payment is being verified and confirms nothing`, (await page.locator("[data-testid=being-verified]").isVisible()) && (await page.locator("[data-testid=intent-status]").getAttribute("data-state")) === "noToken");

    await page.goto(`${WEB}/${locale}/events/gala-night`, { waitUntil: "networkidle" });
    check(`${locale}: Gala page: no SDI donation link while giving is not authorized`, (await page.locator("a[href*='zeffy.com']").count()) === 0);
    check(`${locale}: Gala page: no approved-project note while not authorized`, (await page.locator("[data-testid=gala-project-note]").count()) === 0);
    // Nov 19 2026 MEKI update: USD 500, 3:30–8:30 PM New York time, four-act agenda, roles only (no speaker names)
    const galaText = await page.locator("main").innerText();
    check(`${locale}: Gala page shows the 3:30 – 8:30 hours`, galaText.includes("3:30 – 8:30"));
    check(`${locale}: Gala page shows four agenda acts with times (ends 8:15)`, (await page.locator("#program section h3").count()) === 4 && (await page.locator("#program time").count()) === 10 && galaText.includes("8:15"));
    check(`${locale}: Gala page shows USD 500 and never 750`, /500/.test(galaText) && !/\b750\b|٧٥٠/.test(galaText));
    check(`${locale}: no unconfirmed speaker names`, !/Raya|Abirached|Shousha|Ahmed Amin|رايا|شوشة|أحمد أمين/.test(galaText));
    check(`${locale}: no SDI-unapproved tax disclosure published`, (await page.locator("[data-testid=gala-website-disclosure]").count()) === 0 && !/fair market value|42-2797838/i.test(galaText));
    // Phase 13B — MEKI "Website Comments.docx" (21 Nov 2026). textContent also covers closed <details> answers.
    const galaAll = await page.locator("main").evaluate((m) => m.textContent ?? "");
    check(`${locale}: refreshments card replaces the alcohol-free card`, (locale === "en" ? galaAll.includes("Refined Refreshments") : galaAll.includes("ضيافة راقية")) && !/Alcohol-free|alcohol-free|بلا كحول|خالية من الكحول/.test(galaAll));
    check(`${locale}: no Arrival / Transfers content; address + map link kept`, !/Arrival|Transfers|transportation|معلومات الوصول|التنقل/.test(galaAll) && (await page.locator("#venue a[href*='maps']").count()) >= 1 && /583/.test(await page.locator("#venue").innerText()));
    check(`${locale}: dietary options listed`, locale === "en" ? /gluten-free, vegan, vegetarian, nut allergy and dairy-free/.test(galaAll) : /الغلوتين/.test(galaAll) && /المكسرات/.test(galaAll));
    const venuePhotos = await page.locator("[data-testid=gala-venue-photos] img").count();
    check(`${locale}: venue photos only when MEKI published them (found ${venuePhotos}); every one has a "Title – Place"-style caption`, venuePhotos === 0 || (await page.locator("[data-testid=gala-venue-photos] figcaption").count()) === venuePhotos);
    check(`${locale}: Gala page has no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    if (locale === "ar") await page.screenshot({ path: `${OUT}/gala-agenda-ar-${ENGINE}.png`, fullPage: true });
    await page.locator("#experience").scrollIntoViewIfNeeded();
    await page.locator("#experience").screenshot({ path: `${OUT}/gala-experience-${locale}-${ENGINE}.png` });
    await page.locator("#venue").scrollIntoViewIfNeeded();
    await page.locator("#venue").screenshot({ path: `${OUT}/gala-venue-${locale}-${ENGINE}.png` });

    await page.goto(`${WEB}/${locale}`, { waitUntil: "networkidle" });
    const heroText = await page.locator("main section").first().innerText();
    check(`${locale}: home: no "Luxor · WASH program" badge beside the Give today preview`, !/WASH program|Luxor ·|الأقصر ·|برنامج المياه والصرف/.test(heroText));
    const caps = await page.locator("section[aria-labelledby=gallery-title] figcaption").allInnerTexts();
    check(`${locale}: home gallery captions follow "Title – Place" (${caps.length})`, caps.length > 0 && caps.every((c) => / – /.test(c) && !/·/.test(c)), caps.filter((c) => !/ – /.test(c)).join(" | "));
    await ctx.close();
  }
} catch (e) {
  check("smoke run completed", false, e.message);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed (${ENGINE})`);
process.exit(failed ? 1 : 0);
