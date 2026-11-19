// Phase 9B cross-browser / responsive / accessibility smoke for the PUBLIC WEBSITE (manual; not part of `pnpm test`).
// Engines: Playwright Chromium, Firefox and WebKit (WebKit = Safari's engine on Windows — NOT a real Safari / iOS device).
//   API:  NODE_ENV=test PORT=4100 node dist/main.js       (apps/api — a *_test database; this script only sends GET requests)
//   Web:  NEXT_PUBLIC_API_URL=http://localhost:4100/api/v1 API_INTERNAL_URL=http://localhost:4100/api/v1 next build ; next start -p 3001
//   Run:  WEB_URL=http://localhost:3001 [BROWSERS=chromium,firefox,webkit] [AXE_PATH=…/axe-core/axe.min.js] node tests/e2e/crossbrowser.smoke.mjs [outDir]
//   Browsers: `npx playwright-core install firefox webkit` (Chromium = system Chrome; override with CHROME_PATH).
// Read-only: nothing is submitted to the API (the contact form is only submitted EMPTY to check client validation; the donate
// dialog is only opened and closed).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium, firefox, webkit } from "playwright-core";

const WEB = process.env.WEB_URL ?? "http://localhost:3001";
const OUT = process.argv[2] ?? "./smoke-out-crossbrowser";
const ENGINES = (process.env.BROWSERS ?? "chromium,firefox,webkit").split(",").map((s) => s.trim()).filter(Boolean);
const AXE = process.env.AXE_PATH ? readFileSync(process.env.AXE_PATH, "utf8") : null;
mkdirSync(OUT, { recursive: true });
const PAGES = ["", "/about", "/programs", "/events/gala-night", "/events/gala-night/book", "/give", "/faq", "/contact", "/privacy", "/terms", "/cookies", "/donation/return"];
const WIDTHS = [[360, 740], [390, 844], [768, 1024], [1024, 768], [1440, 900]];
const results = [];
const problems = [];
const axeFindings = [];
const check = (name, ok, extra = "") => { results.push({ name, ok: !!ok }); if (!ok || process.env.VERBOSE) console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const types = { chromium, firefox, webkit };
const launch = (name) => types[name].launch({ headless: true, ...(name === "chromium" ? { executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" } : {}) });

const overflow = (page) => page.evaluate(() => {
  const de = document.documentElement;
  const over = de.scrollWidth - de.clientWidth;
  if (over <= 1) return null;
  const vw = de.clientWidth;
  const culprits = [...document.querySelectorAll("body *")]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1); })
    .slice(-3).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
  return `${over}px wider than viewport; e.g. ${culprits.join(" | ")}`;
});

async function runAxe(page, label) {
  if (!AXE) return;
  // Let scroll-triggered reveal animations finish first: axe must measure the steady state, not a fading element.
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 90)); } window.scrollTo(0, 0); });
  await page.waitForTimeout(1600);
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(async () => {
    const res = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }, resultTypes: ["violations"] });
    return res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => ({ target: n.target.join(" "), summary: (n.failureSummary ?? "").slice(0, 220) })), count: v.nodes.length }));
  });
  for (const v of r) axeFindings.push({ where: label, ...v });
  check(`axe ${label}`, r.length === 0, r.map((v) => `${v.id}(${v.count})`).join(", "));
}

for (const engine of ENGINES) {
  const browser = await launch(engine);
  const version = browser.version();
  console.log(`\n=== ${engine} ${version} ===`);
  try {
    for (const [w, h] of WIDTHS) {
      const mobile = w < 1024;
      const ctxOpts = { viewport: { width: w, height: h }, hasTouch: mobile, ...(mobile && engine !== "firefox" ? { isMobile: true } : {}) };
      let ctx;
      // Pages are served with `stale-while-revalidate`: once Firefox's HTTP cache holds a page it serves it and revalidates in the
      // background. Playwright's Firefox driver reports that background document request as a main-frame navigation that never
      // commits, so later actions "wait for navigation to finish" forever. Users are unaffected (a fresh context makes exactly one
      // document request, with or without JS). Each interaction section therefore runs in a FRESH CONTEXT (empty cache).
      let page;
      const fresh = async () => {
        if (ctx) await ctx.close();
        ctx = await browser.newContext(ctxOpts);
        page = await ctx.newPage();
        const pg = page;
        pg.on("pageerror", (e) => problems.push(`${engine} ${w} pageerror ${pg.url()}: ${e.message}`));
        pg.on("console", (m) => m.type() === "error" && !/status of 404|Failed to load resource/.test(m.text()) && problems.push(`${engine} ${w} console ${pg.url()}: ${m.text().slice(0, 160)}`));
        pg.on("response", (r) => { if (r.status() >= 500) problems.push(`${engine} ${w} HTTP ${r.status()}: ${r.url()}`); });
        return pg;
      };
      await fresh();
      for (const loc of ["en", "ar"]) {
        for (const p of PAGES) {
          const res = await page.goto(`${WEB}/${loc}${p}`, { waitUntil: "load" });
          await page.waitForTimeout(250);
          const label = `${engine} ${w}px /${loc}${p}`;
          check(`${label} HTTP 200`, res?.status() === 200, String(res?.status()));
          const dir = await page.evaluate(() => document.documentElement.dir);
          check(`${label} dir`, dir === (loc === "ar" ? "rtl" : "ltr"), dir);
          const o = await overflow(page);
          check(`${label} no horizontal overflow`, !o, o ?? "");
          if (AXE && (w === 1440 || w === 390) && (engine === "chromium" || p === "" || p === "/give")) await runAxe(page, `${engine} ${w}px /${loc}${p}`);
        }
        // mobile menu
        if (mobile) {
          await fresh();
          await page.goto(`${WEB}/${loc}`, { waitUntil: "load" });
          const btn = page.locator('button[aria-controls="mobile-menu"]');
          await page.waitForTimeout(500);
          await btn.tap({ timeout: 10000 });
          const opened = await page.locator("#mobile-menu").isVisible();
          check(`${engine} ${w}px /${loc} mobile menu opens (tap)`, opened && (await btn.getAttribute("aria-expanded")) === "true");
          const o = await overflow(page);
          check(`${engine} ${w}px /${loc} open menu: no horizontal overflow`, !o, o ?? "");
          const linkVisible = await page.locator("#mobile-menu a").first().isVisible();
          check(`${engine} ${w}px /${loc} menu links visible`, linkVisible);
          await page.keyboard.press("Escape");
          await page.waitForTimeout(100);
          check(`${engine} ${w}px /${loc} Escape closes menu`, !(await page.locator("#mobile-menu").isVisible()) && (await btn.getAttribute("aria-expanded")) === "false");
        }
      }
      // keyboard + focus indicators (desktop), contact validation and donate dialog (every width)
      for (const loc of ["en", "ar"]) {
        await fresh();
        if (w === 1440 || w === 390) {
          await page.goto(`${WEB}/${loc}`, { waitUntil: "load" });
          const seen = [];
          for (let i = 0; i < 14; i++) {
            await page.keyboard.press(engine === "webkit" ? "Alt+Tab" : "Tab");
            seen.push(await page.evaluate(() => {
              const el = document.activeElement;
              if (!el || el === document.body) return { tag: "body" };
              const cs = getComputedStyle(el);
              const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none");
              const r = el.getBoundingClientRect();
              return { tag: el.tagName.toLowerCase(), text: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30), ring, visible: r.width > 0 && r.height > 0 };
            }));
          }
          if (engine === "webkit") {
            // Safari/WebKit skips links on Tab unless "Press Tab to highlight each item" is on (or Option+Tab is used): the first stop is
            // a button by design of the engine. Verify the skip link itself: focusable, becomes visible, and targets #main.
            const skip = page.locator('a[href="#main"]');
            await skip.focus();
            const box = await skip.boundingBox();
            const target = await page.evaluate(() => !!document.getElementById("main"));
            check(`${engine} ${w}px /${loc} skip link focusable + visible on focus + #main exists (Safari Tab-to-links setting noted)`, !!box && box.width > 20 && target, JSON.stringify(box));
          } else check(`${engine} ${w}px /${loc} first Tab = skip link`, /skip|تخط|انتقل/i.test(seen[0]?.text ?? ""), seen[0]?.text);
          const noRing = seen.filter((s) => s.tag !== "body" && (!s.ring || !s.visible));
          check(`${engine} ${w}px /${loc} visible focus indicator on first 14 tab stops`, noRing.length === 0, JSON.stringify(noRing));
        }
        await fresh();
        await page.goto(`${WEB}/${loc}/contact`, { waitUntil: "load" });
        const submit = page.locator("form button[type=submit]");
        if (await submit.count()) {
          if (await submit.isDisabled()) check(`${engine} ${w}px /${loc}/contact form disabled (no endpoint)`, true);
          else {
            await submit.click();
            await page.waitForTimeout(150);
            const inv = await page.locator('form [aria-invalid="true"]').count();
            const described = await page.evaluate(() => [...document.querySelectorAll('form [aria-invalid="true"]')].every((el) => { const id = el.getAttribute("aria-describedby"); return id && id.split(" ").every((x) => document.getElementById(x)?.textContent?.trim()); }));
            check(`${engine} ${w}px /${loc}/contact empty submit → errors announced`, inv >= 4 && described, `invalid=${inv} describedby=${described}`);
          }
        }
        await fresh();
        await page.goto(`${WEB}/${loc}/give`, { waitUntil: "load" });
        const give = page.locator("main button").filter({ hasText: loc === "en" ? /donate|give/i : /تبرع/ }).first();
        if (await give.count()) {
          await give.scrollIntoViewIfNeeded();
          await give.click();
          const dlg = page.locator("dialog[open]");
          const open = await dlg.count().then((n) => n > 0);
          if (open) {
            const inside = await page.evaluate(() => !!document.activeElement?.closest("dialog[open]"));
            const o = await overflow(page);
            const named = await page.evaluate(() => { const d = document.querySelector("dialog[open]"); return !!(d.getAttribute("aria-labelledby") || d.getAttribute("aria-label")); });
            await page.keyboard.press("Escape");
            await page.waitForTimeout(150);
            const closed = (await dlg.count()) === 0;
            check(`${engine} ${w}px /${loc}/give donate dialog: focus inside, named, no overflow, Escape closes`, inside && named && !o && closed, `inside=${inside} named=${named} overflow=${o} closed=${closed}`);
          } else check(`${engine} ${w}px /${loc}/give donate button opens a dialog`, false);
        }
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}

writeFileSync(`${OUT}/axe-web.json`, JSON.stringify(axeFindings, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed; ${problems.length} runtime problems; ${axeFindings.length} axe violation groups`);
for (const p of [...new Set(problems)].slice(0, 40)) console.log("PROBLEM", p);
process.exit(failed.length || problems.length ? 1 : 0);
