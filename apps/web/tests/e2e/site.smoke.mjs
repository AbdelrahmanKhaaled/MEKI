// Phase 7 public-website smoke test against the REAL API (manual; not part of `pnpm test`). Playwright + system Chrome.
//   API:  NODE_ENV=test PORT=4100 node dist/main.js            (apps/api — *_test database; GET requests only from this test)
//   Web:  NEXT_PUBLIC_API_URL=http://localhost:4100 API_INTERNAL_URL=http://localhost:4100 next build ; next start -p 3001
//   Run:  WEB_URL=http://localhost:3001 API_URL=http://localhost:4100 node tests/e2e/site.smoke.mjs [outDir]
// Read-only: it never books, pays or opens sales.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const WEB = process.env.WEB_URL ?? "http://localhost:3001";
const API = `${process.env.API_URL ?? "http://localhost:4100"}/api/v1`;
const OUT = process.argv[2] ?? "./smoke-out-site";
mkdirSync(OUT, { recursive: true });
const PAGES = ["", "/about", "/programs", "/events/gala-night", "/give", "/faq", "/contact", "/privacy", "/terms", "/cookies"];
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const problems = [];
const until = async (fn, timeout = 10000) => { const end = Date.now() + timeout; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* retry */ } await new Promise((r) => setTimeout(r, 150)); } return false; };

async function open(w = 1440, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`pageerror ${page.url()}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/status of 404/.test(m.text()) && problems.push(`console ${page.url()}: ${m.text().slice(0, 160)}`));
  page.on("requestfailed", (r) => { if (!/ERR_ABORTED/.test(r.failure()?.errorText ?? "")) problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`); });
  page.on("response", (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  return { ctx, page };
}
const scrollAll = (page) => page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });

try {
  let { ctx, page } = await open();
  const links = new Set();
  const titles = new Map();
  for (const loc of ["en", "ar"]) {
    for (const p of PAGES) {
      const url = `${WEB}/${loc}${p}`;
      const res = await page.goto(url, { waitUntil: "networkidle" });
      await scrollAll(page);
      await page.waitForLoadState("networkidle");
      const m = await page.evaluate(() => {
        const meta = (sel) => document.querySelector(sel)?.getAttribute("content") ?? document.querySelector(sel)?.getAttribute("href") ?? null;
        const imgs = [...document.images];
        return {
          lang: document.documentElement.lang,
          dir: document.documentElement.dir,
          title: document.title,
          desc: meta('meta[name="description"]'),
          canonical: meta('link[rel="canonical"]'),
          hreflang: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => l.getAttribute("hreflang")).sort(),
          robots: meta('meta[name="robots"]'),
          ogTitle: meta('meta[property="og:title"]'),
          h1: document.querySelectorAll("h1").length,
          main: document.querySelectorAll("main").length,
          brokenImgs: imgs.filter((i) => i.complete && i.naturalWidth === 0 && !i.src.startsWith("data:")).map((i) => i.src),
          noAlt: imgs.filter((i) => !i.hasAttribute("alt")).map((i) => i.src),
          unnamedButtons: [...document.querySelectorAll("button")].filter((b) => !(b.innerText.trim() || b.getAttribute("aria-label") || b.getAttribute("aria-labelledby") || b.title)).length,
          unnamedLinks: [...document.querySelectorAll("a[href]")].filter((a) => !(a.innerText.trim() || a.getAttribute("aria-label") || a.querySelector("img[alt]:not([alt=''])") || a.title)).length,
          links: [...document.querySelectorAll("a[href^='/']")].map((a) => a.getAttribute("href")),
          demo: /\bDEMO\b/.test(document.body.innerText),
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        };
      });
      m.links.forEach((l) => links.add(l.split("#")[0]));
      titles.set(`${loc}${p}`, m.title);
      const name = `${loc} ${p || "/"}`;
      check(`${name}: 200, lang/dir`, res?.status() === 200 && m.lang === loc && m.dir === (loc === "ar" ? "rtl" : "ltr"));
      check(`${name}: title, description, canonical, hreflang en/ar/x-default, og:title`, m.title && m.desc && m.canonical?.endsWith(`/${loc}${p}`) && m.hreflang.join() === "ar,en,x-default" && m.ogTitle, `${m.canonical}`);
      check(`${name}: noindex until MEKI approves launch`, /noindex/.test(m.robots ?? ""));
      check(`${name}: one main landmark, an h1`, m.main === 1 && m.h1 >= 1);
      check(`${name}: images load and have alt; buttons/links have names`, m.brokenImgs.length === 0 && m.noAlt.length === 0 && m.unnamedButtons === 0 && m.unnamedLinks === 0, JSON.stringify({ b: m.brokenImgs.slice(0, 2), a: m.noAlt.slice(0, 2), ub: m.unnamedButtons, ul: m.unnamedLinks }));
      check(`${name}: no DEMO content shown as public information`, !m.demo);
    }
  }
  const uniqueTitles = new Set(titles.values());
  check("page titles are unique per page and language", uniqueTitles.size === titles.size, `${uniqueTitles.size}/${titles.size}`);

  // the pages really render CMS content from the API (a misconfigured API base would silently show built-in text)
  for (const loc of ["en", "ar"]) {
    const faqs = (await (await fetch(`${API}/public/faqs?locale=${loc}`)).json()).data ?? [];
    // the Programs page lists the official programmes (enabling functions are a homepage section)
    const progs = ((await (await fetch(`${API}/public/programmes?locale=${loc}`)).json()).data ?? []).filter((p) => p.kind === "PROGRAMME");
    await page.goto(`${WEB}/${loc}/faq`, { waitUntil: "networkidle" });
    const faqText = await page.locator("main").innerText();
    check(`${loc} faq: published CMS FAQs from the API are rendered (${faqs.length})`, faqs.length > 0 && faqs.slice(0, 3).every((f) => faqText.includes(f.question)), faqs[0]?.question);
    await page.goto(`${WEB}/${loc}/programs`, { waitUntil: "networkidle" });
    // English pages use US spelling (lib/content.ts americanize: "Labour" → "Labor"), an existing design decision
    const us = (s) => (loc === "en" ? s.replace(/our\b/g, "or") : s);
    const progText = us(await page.locator("main").innerText());
    check(`${loc} programs: published programmes from the API are rendered (${progs.length})`, progs.length > 0 && progs.every((p) => progText.includes(us(p.name))), progs.find((p) => !progText.includes(us(p.name)))?.name);
  }

  // internal links (header, footer, body) all resolve
  const bad = [];
  for (const l of links) {
    const r = await fetch(`${WEB}${l}`, { redirect: "manual" });
    if (r.status >= 400) bad.push(`${l} → ${r.status}`);
  }
  check(`internal links resolve (${links.size} unique)`, bad.length === 0, bad.slice(0, 5).join(" | "));

  // robots / sitemap
  const robots = await (await fetch(`${WEB}/robots.txt`)).text();
  check("robots.txt disallows crawling before launch", /User-Agent: \*/i.test(robots) && /Disallow: \/\s*$/m.test(robots));
  check("sitemap.xml served (empty without a configured public origin)", (await fetch(`${WEB}/sitemap.xml`)).status === 200);

  // Gala page: confirmed details only; closed sales → no booking link
  const info = await (await fetch(`${API}/public/events/gala-night/ticketing`)).json().catch(() => null);
  for (const loc of ["en", "ar"]) {
    await page.goto(`${WEB}/${loc}/events/gala-night`, { waitUntil: "networkidle" });
    const text = await page.locator("main").innerText();
    const bookLinks = await page.locator("a[href*='/events/gala-night/book']").count();
    const open_ = info?.data?.salesOpen && info?.data?.checkoutAvailable;
    check(`${loc} gala: booking CTA is a link only if the API says sales open AND checkout available (now: ${open_ ? "open" : "closed"})`, open_ ? bookLinks > 0 : bookLinks === 0);
    if (loc === "en") check("en gala: approved facts shown (Every Light Counts · December 12, 2026 · 583 Park Avenue · 750), no time beyond the client-briefed doors time (3:30 PM, to be confirmed — docs/12)", /Every Light Counts/i.test(text) && /December 12, 2026/.test(text) && /583 Park Avenue/.test(text) && /750/.test(text) && (text.match(/\b\d{1,2}:\d{2}\s?(AM|PM)\b/gi) ?? []).every((x) => x === "3:30 PM"));
    await page.goto(`${WEB}/${loc}/events/gala-night/book`, { waitUntil: "networkidle" });
    await until(async () => (await page.locator("main").innerText()).length > 50);
    check(`${loc} book page: not available while closed — no form, no payment button`, (await page.locator("main input").count()) === 0 && (await page.getByRole("button", { name: /payment|الدفع/i }).count()) === 0);
  }
  // booking status: reference alone → generic; token in the fragment is removed from the address bar; nothing confirmed
  await page.goto(`${WEB}/en/events/gala-night/booking/EB-AAAAAAAAAAAA`, { waitUntil: "networkidle" });
  await until(async () => /can.t show|cannot show|not available|couldn/i.test(await page.locator("main").innerText()));
  const t1 = await page.locator("main").innerText();
  check("status page with a reference only: generic message, no booking data, no 'confirmed'", !/confirmed/i.test(t1) && t1.length > 20);
  await page.goto(`${WEB}/en/events/gala-night/booking?reference=EB-AAAAAAAAAAAA#token=not-a-real-token`, { waitUntil: "networkidle" });
  await until(async () => !page.url().includes("token"));
  check("e-mail link format (#token=): token removed from the address bar, wrong token → generic", !page.url().includes("token") && !/confirmed/i.test(await page.locator("main").innerText()));

  // mobile navigation + language switch
  await ctx.close();
  ({ ctx, page } = await open(390, 844));
  await page.goto(`${WEB}/en`, { waitUntil: "networkidle" });
  const menu = page.locator("header button[aria-expanded]").first();
  await menu.click();
  await until(async () => (await menu.getAttribute("aria-expanded")) === "true");
  check("mobile navigation opens (aria-expanded) and shows page links", (await menu.getAttribute("aria-expanded")) === "true" && (await page.locator("a[href='/en/about']:visible").count()) >= 1);
  await page.keyboard.press("Escape");
  const sw = page.locator("a[href='/ar'], a[hreflang='ar']").first();
  check("language switch link to Arabic exists", (await sw.count()) === 1);
  await ctx.close();

  // responsive: no horizontal overflow at 5 widths, both languages
  for (const w of [1440, 1024, 768, 390, 360]) {
    ({ ctx, page } = await open(w, 900));
    for (const loc of ["en", "ar"]) {
      for (const p of [...PAGES, "/events/gala-night/book"]) {
        await page.goto(`${WEB}/${loc}${p}`, { waitUntil: "networkidle" });
        const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        check(`${loc} ${w}px ${p || "/"}: no horizontal overflow`, !over);
      }
      if (w === 360) await page.screenshot({ path: `${OUT}/gala-${loc}-360.png`, fullPage: false });
    }
    await ctx.close();
  }
  // unknown route → localized 404
  ({ ctx, page } = await open());
  for (const [loc, txt] of [["en", /Page not found/], ["ar", /الصفحة غير موجودة/]]) {
    const nf = await page.goto(`${WEB}/${loc}/does-not-exist/deeper`, { waitUntil: "networkidle" });
    check(`${loc}: unknown page → 404 with the branded, localized not-found page`, nf?.status() === 404 && txt.test(await page.locator("body").innerText()) && (await page.locator("main a").first().getAttribute("href")) === `/${loc}`);
  }
  await ctx.close();
} catch (e) {
  check(`unexpected error: ${e.message.split("\n").slice(0, 3).join(" | ")}`, false);
}
const uniq = [...new Set(problems)];
check("no console errors, page errors, failed requests or 5xx during the run", uniq.length === 0, uniq.slice(0, 4).join(" | "));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed (real API, test database, production build)`);
await browser.close();
process.exit(failed.length ? 1 : 0);
