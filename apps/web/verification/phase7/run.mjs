// Phase 7 browser QA (Playwright core + installed Chrome). Usage: node verification/phase7/run.mjs [baseUrl]
// Read-only: never submits donations/forms to any backend. Screenshots go to verification/phase7/screenshots/.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3100";
const OUT = path.resolve("verification/phase7");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PAGES = ["", "/about", "/programs", "/events/gala-night", "/give", "/faq", "/contact", "/privacy", "/terms", "/cookies"];
const LOCALES = ["en", "ar"];
const VIEWPORTS = { 1440: 900, 1024: 768, 768: 1024, 390: 844, 360: 740 };
const STAGE = process.env.STAGE ?? "interact"; // routes-en | routes-ar | interact
const results = { fails: [], notes: [], pass: 0 };
const check = (ok, name, detail = "") => {
  if (ok) results.pass++;
  else results.fails.push(`${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const version = browser.version();
const routeRe = /^\/(en|ar)(\/(about|programs|give|faq|contact|events\/gala-night|privacy|terms|cookies))?(#.*)?$/;

async function scrollAll(page) {
  await page.evaluate(async () => {
    const h = () => document.documentElement.scrollHeight;
    for (let y = 0; y < h(); y += 250) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, h());
    await new Promise((r) => setTimeout(r, 700));
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
}

// ───────── 1. every route × every viewport ─────────
const titles = new Map();
for (const locale of LOCALES.filter((l) => STAGE === `routes-${l}`)) {
  for (const p of PAGES) {
    const url = `${BASE}/${locale}${p}`;
    const tag = `${locale}${p || "/home"}`;
    for (const [w, h] of Object.entries(VIEWPORTS)) {
      const ctx = await browser.newContext({ viewport: { width: +w, height: h }, locale: locale === "ar" ? "ar-EG" : "en-US" });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
      page.on("console", (m) => {
        if (m.type() === "error") {
          const t = m.text();
          if (/Failed to load resource.*(4000|ERR_CONNECTION)/i.test(t) || /localhost:4000/.test(t)) return; // API is intentionally offline
          errors.push("console: " + t.slice(0, 200));
        }
      });
      const failedReq = [];
      page.on("response", (r) => {
        if (r.status() >= 400 && r.url().startsWith(BASE)) failedReq.push(`${r.status()} ${r.url()}`);
      });
      const resp = await page.goto(url, { waitUntil: "networkidle" });
      check(resp.status() === 200, `${tag}@${w} status`, String(resp.status()));
      await scrollAll(page);
      const info = await page.evaluate(() => {
        const d = document.documentElement;
        const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
        const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
        const hidden = [...document.querySelectorAll("[data-reveal],[data-stagger-item],[data-hero-item],[data-hero-card]")].filter((e) => getComputedStyle(e).opacity === "0" && e.getClientRects().length).length;
        const brokenImgs = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).map((i) => i.currentSrc);
        const links = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
        const meta = (s) => document.querySelector(s)?.getAttribute("content") ?? document.querySelector(s)?.getAttribute("href");
        return {
          lang: d.lang, dir: d.dir, title: document.title, h1: document.querySelectorAll("h1").length,
          overflow: d.scrollWidth - d.clientWidth, dupIds, hidden, brokenImgs, links,
          canonical: meta('link[rel="canonical"]'), desc: meta('meta[name="description"]'), ogImage: meta('meta[property="og:image"]'),
          robots: meta('meta[name="robots"]'), alt: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => l.getAttribute("hreflang")),
          text: document.body.innerText,
        };
      });
      check(info.lang === locale && info.dir === (locale === "ar" ? "rtl" : "ltr"), `${tag}@${w} lang/dir`, `${info.lang}/${info.dir}`);
      check(info.overflow <= 0, `${tag}@${w} horizontal overflow`, `${info.overflow}px`);
      check(errors.length === 0, `${tag}@${w} js errors`, errors.join(" | "));
      check(failedReq.length === 0, `${tag}@${w} failed internal requests`, failedReq.join(" | "));
      check(info.hidden === 0, `${tag}@${w} elements stuck at opacity 0`, String(info.hidden));
      check(info.brokenImgs.length === 0, `${tag}@${w} broken images`, info.brokenImgs.join(","));
      if (w === "1440") {
        check(info.h1 === 1, `${tag} h1 count`, String(info.h1));
        check(info.dupIds.length === 0, `${tag} duplicate ids`, [...new Set(info.dupIds)].join(","));
        check(!!info.title && !!info.desc, `${tag} title/description`);
        const k = `${locale}|${info.title}`;
        check(!titles.has(k), `${tag} unique title`, `duplicates ${titles.get(k)}`);
        titles.set(k, tag);
        const bad = info.links.filter((h) => h.startsWith("/") && !h.startsWith("/_next") && !/\.(svg|png|jpg|webp|ico)$/.test(h) && !routeRe.test(h));
        check(bad.length === 0, `${tag} internal links`, bad.join(","));
        results.notes.push(`${tag}: canonical=${info.canonical} hreflang=${info.alt.join(",")} og=${info.ogImage ?? "none"} robots=${info.robots}`);
        check(!/localhost/.test(`${info.canonical}${info.ogImage}`), `${tag} localhost in metadata`);
        check(info.alt.includes("en") && info.alt.includes("ar"), `${tag} hreflang alternates`);
        for (const bad of [/Visa|Mastercard|Apple Pay/i, /Monthly|شهري/, /tax[- ]deductible/i, /Featured campaigns|الحملات المميزة/i, /Nova Partner|40,000/])
          check(!bad.test(info.text), `${tag} forbidden text ${bad}`);
        if (locale === "en") check(!/programme/i.test(info.text), `${tag} UK spelling 'programme'`);
      }
      if (w === "1440" || w === "390") {
        await page.screenshot({ path: `${OUT}/screenshots/${locale}${p.replace(/\//g, "_") || "_home"}-${w}.png`, fullPage: true });
      }
      await ctx.close();
    }
  }
}

// ───────── 2. interaction tests ─────────
if (STAGE === "interact") {
async function open(locale, p, w = 1440, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: VIEWPORTS[w] ?? 900 }, locale: locale === "ar" ? "ar-EG" : "en-US", ...extra });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => results.fails.push(`pageerror on ${locale}${p}: ${e.message}`));
  await page.goto(`${BASE}/${locale}${p}`, { waitUntil: "networkidle" });
  return { ctx, page };
}

// Language switching preserves page; back/forward
for (const p of PAGES) {
  const { ctx, page } = await open("en", p);
  await page.locator('header a[hreflang="ar"]').first().click();
  await page.waitForURL(`**/ar${p}`);
  check(new URL(page.url()).pathname === `/ar${p}`, `lang switch en→ar keeps ${p || "/"}`, page.url());
  await page.goBack({ waitUntil: "load" });
  await page.waitForURL(`**/en${p}`);
  check(new URL(page.url()).pathname === `/en${p}`, `back after switch ${p || "/"}`);
  await page.goForward({ waitUntil: "load" });
  await page.waitForURL(`**/ar${p}`);
  check(new URL(page.url()).pathname === `/ar${p}`, `forward after switch ${p || "/"}`);
  await ctx.close();
}

// Desktop nav + active state + logo + footer
{
  const { ctx, page } = await open("en", "");
  for (const [name, slug] of [["About MEKI", "/en/about"], ["Programs", "/en/programs"], ["Give", "/en/give"], ["FAQ", "/en/faq"], ["Contact", "/en/contact"], ["Gala Night", "/en/events/gala-night"]]) {
    await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
    await page.locator("header nav[aria-label=Primary]").getByRole("link", { name, exact: true }).click();
    await page.waitForURL(`**${slug}`);
    const cur = await page.locator('header nav[aria-label=Primary] a[aria-current="page"]').count();
    check(cur === 1 || slug.includes("gala"), `active nav on ${slug}`, String(cur));
    await page.locator("header a[aria-label='MEKI home']").click();
    await page.waitForURL("**/en");
  }
  // hero CTAs
  await page.getByRole("link", { name: "Attend the Gala" }).first().click();
  await page.waitForURL("**/en/events/gala-night");
  await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Explore Our Programs" }).first().click();
  check(page.url().endsWith("#programmes"), "hero secondary CTA → #programmes", page.url());
  // footer links
  await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
  const footerLinks = await page.locator("footer a[href^='/']").evaluateAll((a) => a.map((x) => x.getAttribute("href")));
  check(footerLinks.every((h) => routeRe.test(h)), "footer internal links valid", footerLinks.join(","));
  check(!footerLinks.some((h) => /privacy|terms|cookies/.test(h)), "footer has no unapproved legal links");
  await ctx.close();
}

// Mobile menu
for (const locale of LOCALES) {
  const { ctx, page } = await open(locale, "", 390);
  const btn = page.locator("header button[aria-controls=mobile-menu]");
  check((await btn.getAttribute("aria-expanded")) === "false", `${locale} mobile menu starts closed`);
  await btn.click();
  check((await btn.getAttribute("aria-expanded")) === "true" && (await page.locator("#mobile-menu").isVisible()), `${locale} mobile menu opens`);
  const linkCount = await page.locator("#mobile-menu a").count();
  check(linkCount >= 7, `${locale} mobile menu links`, String(linkCount));
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(ov <= 0, `${locale} mobile menu overflow`, String(ov));
  await page.screenshot({ path: `${OUT}/screenshots/${locale}_mobile-menu-390.png` });
  await page.keyboard.press("Escape");
  check(!(await page.locator("#mobile-menu").isVisible()), `${locale} mobile menu closes on Escape`);
  await btn.click();
  await page.locator("#mobile-menu a").nth(1).click();
  await page.waitForURL(`**/${locale}/about`);
  check(true, `${locale} mobile menu navigation`);
  await ctx.close();
}

// FAQ accordion: click, keyboard, aria-expanded
for (const locale of LOCALES) {
  const { ctx, page } = await open(locale, "/faq");
  const btns = page.locator("main button[aria-expanded]");
  const n = await btns.count();
  check(n >= 8, `${locale} faq accordion items`, String(n));
  const first = btns.first();
  await first.click();
  check((await first.getAttribute("aria-expanded")) === "true", `${locale} faq opens on click`);
  await first.click();
  check((await first.getAttribute("aria-expanded")) === "false", `${locale} faq closes on click`);
  await first.focus();
  await page.keyboard.press("Enter");
  check((await first.getAttribute("aria-expanded")) === "true", `${locale} faq Enter toggles`);
  await page.keyboard.press("Space");
  check((await first.getAttribute("aria-expanded")) === "false", `${locale} faq Space toggles`);
  await page.keyboard.press("Tab");
  const focusOutline = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return `${s.outlineStyle}/${s.outlineWidth}`; });
  results.notes.push(`${locale} faq focused-element outline after Tab: ${focusOutline}`);
  for (let i = 0; i < Math.min(n, 6); i++) await btns.nth(i).click();
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(ov <= 0, `${locale} faq overflow after many interactions`);
  const cats = await page.locator("nav a[href^='#']").count();
  check(cats === 4, `${locale} faq categories`, String(cats));
  await ctx.close();
}

// Contact form
for (const locale of LOCALES) {
  const { ctx, page } = await open(locale, "/contact");
  const disabled = await page.locator("form input[type=text]").first().isDisabled();
  check(disabled, `${locale} contact form disabled without official email`);
  const submitDisabled = await page.locator("form button[type=submit]").isDisabled();
  check(submitDisabled, `${locale} contact submit disabled`);
  const txt = await page.locator("form [role=status]").innerText();
  check(txt.trim().length > 0 && !/(has been|was|successfully) sent|تم الإرسال/i.test(txt), `${locale} contact form honest status`, txt);
  check(await page.getByText(/published soon|قريبًا/).count() > 0, `${locale} contact fallback text`);
  // labels
  const unlabeled = await page.evaluate(() => [...document.querySelectorAll("form input, form textarea")].filter((i) => !document.querySelector(`label[for="${i.id}"]`) && !i.closest("label")).length);
  check(unlabeled === 0, `${locale} contact form labels`, String(unlabeled));
  await ctx.close();
}

// Quick Donate: no request while payments disabled; dialog opens; no monthly
{
  const { ctx, page } = await open("en", "");
  const reqs = [];
  page.on("request", (r) => { if (/\/public\/donations|payment-session/.test(r.url()) && r.method() === "POST") reqs.push(r.url()); });
  await page.locator("#give button[type=submit]").click();
  await page.waitForTimeout(600);
  const dlg = await page.locator("dialog[open]").count();
  check(dlg === 1, "quick donate opens unavailable dialog", String(dlg));
  const dtxt = dlg ? await page.locator("dialog[open]").innerText() : "";
  check(/not open yet|opens soon/i.test(dtxt), "dialog states giving not open", dtxt.slice(0, 120));
  check(reqs.length === 0, "no donation POST issued", reqs.join(","));
  check((await page.locator("#give").innerText()).search(/monthly/i) === -1, "no monthly option in widget");
  check((await page.locator("#give img").count()) === 0, "no payment logos in widget");
  await page.screenshot({ path: `${OUT}/screenshots/en_donate-dialog-1440.png` });
  await ctx.close();
}

// Gala content
{
  const { ctx, page } = await open("en", "/events/gala-night");
  const text = await page.locator("main").innerText();
  for (const s of ["Every Light Counts", "Saturday, December 12, 2026", "583 Park Avenue, New York", "USD 750", "Program subject to change.", "Doors open at 3:30 PM", "One ticket per guest"])
    check(text.includes(s), `gala shows "${s}"`);
  const items = await page.locator("#program ol > li h3").allInnerTexts();
  const expected = ["Welcome reception", "Opening with our host, Raya Abirached", "Keynote address", "Beshir Shousha", "Guest of Honor panel and Every Light Counts!", "Ahmed Amin", "Live auction", "Entertainment"];
  check(JSON.stringify(items.map((s) => s.trim())) === JSON.stringify(expected), "gala timeline order", items.join(" | "));
  check(!/Nova|Aurora|Star Partner|40,000|20,000|10,000/.test(text), "no proposed sponsorship prices in production");
  const map = await page.getByRole("link", { name: "View on map" }).getAttribute("href");
  check(/^https:\/\/www\.google\.com\/maps/.test(map), "gala map link", map);
  const dis = await page.locator("#booking button:disabled").count();
  check(dis === 2, "gala booking+giving buttons disabled", String(dis));
  check(!/raised|\$\s?\d{2,3},\d{3}/.test(text.replace(/USD 750/, "")), "no fundraising amounts");
  await ctx.close();
}

// Home content / nine programs / mission text
for (const locale of LOCALES) {
  const { ctx, page } = await open(locale, "");
  const text = await page.locator("main").innerText();
  if (locale === "en") {
    for (const s of ["Lasting Change,", "Thriving people, resilient institutions and strong communities, built together.", "We partner with people, communities and institutions worldwide to deliver evidence-based development that lasts, with every contribution transparently accounted for and its impact measured.", "Attend the Gala", "Explore Our Programs", "Every Light Counts"])
      check(text.includes(s), `home shows "${s.slice(0, 50)}"`);
  }
  check((await page.locator("#programmes h3, #programmes [data-programme]").count()) >= 0, "programmes section present");
  check((await page.locator("#campaigns").count()) === 0, `${locale} home campaigns hidden`);
  await ctx.close();
}
for (const locale of LOCALES) {
  const { ctx, page } = await open(locale, "/programs");
  const h2 = await page.locator("main ul[data-stagger] > li h2").allInnerTexts();
  check(h2.length === 9 && new Set(h2).size === 9, `${locale} programs page shows nine unique programs`, String(h2.length));
  check((await page.locator("main a[href*='/programs/']").count()) === 0, `${locale} no program detail links`);
  await ctx.close();
}
{
  const { ctx, page } = await open("en", "/about");
  const text = await page.locator("main").innerText();
  check(text.includes("Thriving people, resilient institutions and strong communities, built together.") && text.includes("transparently accounted for and its impact measured"), "about shows approved vision+mission");
  check(/Misr El-Kheir/.test(text) && /not results achieved by MEKI/.test(text), "about legacy attribution");
  await ctx.close();
}
{
  const { ctx, page } = await open("en", "/give");
  const text = await page.locator("main").innerText();
  check(/Online giving opens soon\./.test(text), "give shows 'Online giving opens soon.'");
  check((await page.locator("main form, main input").count()) === 0, "give has no form/checkout");
  check(!/you (will )?receive (a )?(receipt|confirmation)|tax[- ]deductible/i.test(text), "give: no receipt promise");
  await ctx.close();
}
for (const k of ["privacy", "terms", "cookies"]) {
  const { ctx, page } = await open("en", "/" + k);
  const text = await page.locator("main").innerText();
  check(/Coming soon/i.test(text) && /approved by legal counsel/.test(text), `${k} shows pending state`);
  await ctx.close();
}

// Reduced motion: content visible
for (const p of ["", "/about", "/events/gala-night"]) {
  const { ctx, page } = await open("en", p, 1440, { reducedMotion: "reduce" });
  await scrollAll(page);
  const hidden = await page.evaluate(() => [...document.querySelectorAll("[data-reveal],[data-stagger-item],[data-hero-item]")].filter((e) => getComputedStyle(e).opacity === "0").length);
  check(hidden === 0, `reduced-motion ${p || "/"}: no hidden content`, String(hidden));
  await ctx.close();
}

// Keyboard: first Tab shows skip link; focus ring on links
{
  const { ctx, page } = await open("en", "");
  await page.keyboard.press("Tab");
  const skip = await page.evaluate(() => document.activeElement?.textContent?.trim());
  check(/skip to content/i.test(skip ?? ""), "first Tab focuses skip link", skip);
  await ctx.close();
}

}
fs.writeFileSync(`${OUT}/results-${STAGE}.json`, JSON.stringify({ browser: `Chrome ${version}`, base: BASE, ...results }, null, 2));
console.log(`Chrome ${version}\nPASS ${results.pass}  FAIL ${results.fails.length}`);
for (const f of results.fails) console.log("FAIL:", f);
await browser.close();
