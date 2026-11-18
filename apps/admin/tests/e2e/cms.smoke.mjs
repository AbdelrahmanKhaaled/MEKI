// Phase 6D browser smoke test (website CMS) against the REAL API (manual, not part of `pnpm test`). Playwright + system Chrome.
//
//   API:    NODE_ENV=test PORT=4100 node dist/main.js   (apps/api — a *_test database; never development or production)
//   Admin:  ADMIN_API_UPSTREAM=http://localhost:4100 next build ; next start -p 3003
//   Run:    WEB_URL=http://localhost:3003 API_URL=http://localhost:4100 TAG=… PW=… RUN=… node tests/e2e/cms.smoke.mjs [outDir]
//           accounts p6d-{admin,content,campaign}-<TAG>@meki.test must exist in the test database (ADMINISTRATOR, CONTENT_MANAGER,
//           CAMPAIGN_MANAGER).
// Records it creates carry "E2E <RUN>" / "e2e-<run>" and are removed again (FAQ, statistic, menu entry, page blocks). The test page itself
// stays as an unpublished draft (the API has no page delete). The homepage "About" eyebrow is changed, published, and restored to
// its original text (and republished) — only when that section was live and clean before the run; otherwise only save/restore.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const WEB = process.env.WEB_URL ?? "http://localhost:3003";
const API = `${process.env.API_URL ?? "http://localhost:4100"}/api/v1`;
const { TAG, PW } = process.env;
const RUN = (process.env.RUN ?? Date.now().toString(36)).toLowerCase();
const OUT = process.argv[2] ?? "./smoke-out-6d";
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const problems = [];
const apiErrors = [];
let step = "start";
const until = async (fn, timeout = 15000) => { const end = Date.now() + timeout; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* retry */ } await new Promise((r) => setTimeout(r, 150)); } return false; };
const pub = async (path) => (await (await fetch(`${API}/public${path}`)).json().catch(() => null))?.data;

async function open(w = 1440, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource.*(401|403|404|409|422)/.test(m.text()) && problems.push(`console: ${m.text().slice(0, 160)}`));
  page.on("response", async (r) => { if (r.url().includes("/api/v1/") && r.request().method() !== "GET" && r.status() >= 400) apiErrors.push(`${r.request().method()} ${new URL(r.url()).pathname} → ${r.status()} ${(await r.text().catch(() => "")).slice(0, 200)}`); });
  page.on("request", (r) => { const u = new URL(r.url()); if (u.origin !== new URL(WEB).origin && !u.protocol.startsWith("data") && !u.port.startsWith("300")) problems.push(`foreign request: ${r.url()}`); });
  return { ctx, page };
}
async function login(page, who, locale = "en") {
  await page.goto(`${WEB}/${locale}/login`, { waitUntil: "networkidle" });
  await page.locator("input[type=email]").fill(`p6d-${who}-${TAG}@meki.test`);
  await page.locator("input[type=password]").fill(PW);
  await page.locator("button[type=submit]").click();
  await page.waitForURL(new RegExp(`/${locale}/dashboard`), { timeout: 20000 });
}
/** admin API through the same-origin proxy with the page's session (reads only) */
const adm = async (page, path) => (await (await page.request.get(`${WEB}/api/v1${path}`)).json())?.data;
const waitUrl = async (page, re, timeout = 20000) => { if (!(await until(() => re.test(page.url()), timeout))) throw new Error(`URL ${page.url()} never matched ${re}`); };
const main = (page) => page.locator("main").innerText();
const confirm = async (page, label) => { const d = page.getByRole("dialog").last(); await d.getByRole("button", { name: label, exact: true }).click(); await until(async () => (await page.getByRole("dialog").count()) === 0); };
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const field = (scope, group, lang = "English") => scope.getByRole("group", { name: group, exact: true }).getByLabel(new RegExp(`^${lang}`));
const ids = {};

try {
  let { ctx, page } = await open();
  await login(page, "admin");

  step = "sidebar";
  const links = ["homepage", "pages", "menus", "faqs", "statistics", "settings/site"];
  check("sidebar: Homepage, Pages, Menus, FAQs, Statistics and Site settings are live links", (await Promise.all(links.map((l) => page.locator(`aside a[href='/en/${l}']`).count()))).every((n) => n === 1));

  // ───────────── homepage: edit → draft not public → publish → public → restore ─────────────
  step = "homepage";
  await page.goto(`${WEB}/en/homepage`, { waitUntil: "networkidle" });
  await page.locator("#section-ABOUT").waitFor();
  check("homepage: every section editor is rendered (16) with the jump navigation", (await page.locator("main [id^=section-]").count()) === 16 && (await page.getByRole("navigation", { name: "Sections" }).count()) === 1);
  check("homepage: data sections link to their modules (statistics, campaigns approved+published only)", (await main(page)).includes("Campaigns (approved AND published only — never bypassed)"));
  const home = await adm(page, "/admin/cms/pages/home");
  const about = home.sections.find((s) => s.key === "ABOUT");
  // an aborted earlier run may have left its marker in the working copy: then the live (published) text is the original
  const leftover = /^E2E \S+ eyebrow$/.test(about.eyebrowEn ?? "");
  const original = leftover ? ((await pub("/home?locale=en")).page.sections.find((s) => s.key === "ABOUT")?.eyebrow ?? "") : (about.eyebrowEn ?? "");
  const canPublishAbout = about.status === "PUBLISHED" && (!about.hasUnpublishedChanges || leftover);
  const card = page.locator("#section-ABOUT");
  const marker = `E2E ${RUN} eyebrow`;
  await field(card, "Eyebrow").fill(marker);
  await card.getByRole("region", { name: "Save changes — About MEKI" }).getByRole("button", { name: "Save changes" }).click();
  await until(async () => (await card.getByTestId("dirty-badge").count()) === 1);
  const draftPublic = (await pub("/home?locale=en")).page.sections.find((s) => s.key === "ABOUT");
  check("homepage: saved working copy is NOT public (draft never leaks)", draftPublic?.eyebrow !== marker);
  if (canPublishAbout) {
    await card.getByRole("button", { name: "Publish section", exact: true }).click();
    await confirm(page, "Publish section");
    await until(async () => (await card.getByTestId("dirty-badge").count()) === 0);
    check("homepage: published section is served by the public API", (await pub("/home?locale=en")).page.sections.find((s) => s.key === "ABOUT")?.eyebrow === marker);
  } else console.log("SKIP  homepage publish (About section was not live and clean before the run)");
  step = "homepage restore";
  await field(card, "Eyebrow").fill(original);
  await card.getByRole("region", { name: "Save changes — About MEKI" }).getByRole("button", { name: "Save changes" }).click();
  await until(async () => (await card.getByRole("region", { name: "Save changes — About MEKI" }).innerText()).includes("Saved"));
  if (canPublishAbout) {
    await card.getByRole("button", { name: "Publish section", exact: true }).click();
    await confirm(page, "Publish section");
    await until(async () => (await card.getByTestId("dirty-badge").count()) === 0);
  }
  const restored = (await adm(page, "/admin/cms/pages/home")).sections.find((s) => s.key === "ABOUT");
  check("homepage: original eyebrow restored" + (canPublishAbout ? " and republished" : ""), (restored.eyebrowEn ?? "") === original && (!canPublishAbout || ((await pub("/home?locale=en")).page.sections.find((s) => s.key === "ABOUT")?.eyebrow ?? "") === original));
  await card.getByRole("button", { name: "Preview" }).click();
  check("homepage: preview shows working copy and live version", (await card.getByTestId("content-preview").innerText()).includes("Live version"));
  check("homepage: fixed-size list indicator (trust points = 4)", (await page.locator("#section-TRUST [data-testid=count-trust]").innerText()).includes("4"));

  // ───────────── pages: create → block → publish → public → hide → cleanup ─────────────
  step = "page create";
  const slug = `e2e-${RUN}`;
  await page.goto(`${WEB}/en/pages/new`, { waitUntil: "networkidle" });
  await page.getByLabel(/^URL slug/).fill(slug);
  await field(page, "Title").fill(`E2E ${RUN} page`);
  await page.getByRole("region", { name: "Save changes" }).getByRole("button", { name: "Save changes" }).click();
  await waitUrl(page, new RegExp(`/en/pages/${slug}$`));
  check("pages: new page created as draft, editor opened by slug", (await main(page)).includes(`E2E ${RUN} page`));
  step = "page block";
  await page.getByLabel(/^Block type/).selectOption("ABOUT");
  await page.getByRole("button", { name: "Add block" }).click();
  await page.getByRole("heading", { name: "About MEKI", level: 2 }).waitFor();
  const blockCard = page.locator("section[aria-labelledby^=sec-]").filter({ has: page.getByRole("heading", { name: "About MEKI", level: 2 }) });
  await field(blockCard, "Title").fill(`E2E ${RUN} block`);
  await field(blockCard, "Title", "Arabic").fill(`قسم تجريبي ${RUN}`);
  await blockCard.getByRole("region", { name: "Save changes — About MEKI" }).getByRole("button", { name: "Save changes" }).click();
  await until(async () => (await blockCard.getByRole("region", { name: "Save changes — About MEKI" }).innerText()).includes("Saved"));
  check("pages: unpublished page is not served publicly", (await fetch(`${API}/public/pages/${slug}?locale=en`)).status === 404);
  await blockCard.getByRole("button", { name: "Publish section", exact: true }).click();
  await confirm(page, "Publish section");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await confirm(page, "Publish");
  await until(async () => (await fetch(`${API}/public/pages/${slug}?locale=en`)).status === 200);
  const pubPage = await pub(`/pages/${slug}?locale=ar`);
  check("pages: published page + block served publicly (Arabic text with ?locale=ar)", pubPage?.sections?.some((s) => s.title === `قسم تجريبي ${RUN}`));
  step = "page draft edit";
  await field(blockCard, "Title").fill(`E2E ${RUN} block v2`);
  await blockCard.getByRole("region", { name: "Save changes — About MEKI" }).getByRole("button", { name: "Save changes" }).click();
  await until(async () => (await blockCard.getByRole("region", { name: "Save changes — About MEKI" }).innerText()).includes("Saved"));
  check("pages: a later draft edit does not change the live block", !(JSON.stringify(await pub(`/pages/${slug}?locale=en`))).includes("block v2"));
  step = "page block removal";
  check("pages: removing a published block is blocked (unpublish first)", await page.getByRole("button", { name: "Remove block" }).isDisabled());
  await blockCard.getByRole("button", { name: "Unpublish section", exact: true }).click();
  await confirm(page, "Unpublish section");
  await until(async () => page.getByRole("button", { name: "Remove block" }).isEnabled());
  await page.getByRole("button", { name: "Remove block" }).click();
  await confirm(page, "Remove block");
  await until(async () => (await page.getByRole("heading", { name: "About MEKI", level: 2 }).count()) === 0);
  await page.getByRole("button", { name: "Unpublish", exact: true }).click();
  await confirm(page, "Unpublish");
  await until(async () => (await fetch(`${API}/public/pages/${slug}?locale=en`)).status === 404);
  check("pages: block removed after unpublish; page unpublished → no longer public", (await fetch(`${API}/public/pages/${slug}?locale=en`)).status === 404);
  await page.goto(`${WEB}/en/pages`, { waitUntil: "networkidle" });
  const pagesText = await main(page);
  check("pages list: homepage first (routed to its editor), site pages before event landing pages", pagesText.includes("Edited in the Homepage module") && (await page.locator("main table tbody tr").first().innerText()).includes("Edited in the Homepage module"));

  // ───────────── FAQs ─────────────
  step = "faq create";
  await page.goto(`${WEB}/en/faqs/new`, { waitUntil: "networkidle" });
  const q = `E2E ${RUN} question?`;
  await field(page, "Question").fill(q);
  await field(page, "Question", "Arabic").fill(`سؤال تجريبي ${RUN}؟`);
  await field(page, "Answer").fill("E2E answer text.");
  await page.getByRole("region", { name: "Save changes" }).getByRole("button", { name: "Save changes" }).click();
  await waitUrl(page, /\/en\/faqs\/[a-z0-9]{20,}$/);
  ids.faq = page.url().split("/").pop();
  check("faqs: draft FAQ not public", !JSON.stringify(await pub("/faqs?locale=en")).includes(q));
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await confirm(page, "Publish");
  await until(async () => JSON.stringify(await pub("/faqs?locale=en")).includes(q));
  check("faqs: published FAQ public (EN) with its Arabic version (AR)", JSON.stringify(await pub("/faqs?locale=ar")).includes(`سؤال تجريبي ${RUN}`));
  await page.getByRole("button", { name: "Unpublish", exact: true }).click();
  await confirm(page, "Unpublish");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await confirm(page, "Delete");
  await waitUrl(page, /\/en\/faqs$/);
  check("faqs: unpublished and deleted → gone from public and admin", !JSON.stringify(await pub("/faqs?locale=en")).includes(q) && !(await main(page)).includes(q));

  // ───────────── statistics ─────────────
  step = "statistic create";
  await page.goto(`${WEB}/en/statistics`, { waitUntil: "networkidle" });
  check("statistics: attribution rule and homepage count notice", (await main(page)).includes("Misr El-Kheir (Egypt)") && (await page.getByTestId("stats-home-count").innerText()).includes("exactly 4"));
  await page.getByRole("button", { name: "New statistic" }).first().click();
  const dlg = page.getByRole("dialog");
  await field(dlg, "Label").fill(`E2E ${RUN} figure`);
  await dlg.getByLabel(/^Value/).fill("12.345");
  check("statistics: more than 2 decimals rejected in the form", (await dlg.innerText()).includes("at most 2 decimals") && (await dlg.getByRole("button", { name: "Save changes" }).isDisabled()));
  await dlg.getByLabel(/^Value/).fill("12.5");
  await dlg.getByLabel(/^Code/).fill(`e2e-${RUN}`);
  await dlg.getByLabel(/^Source reference/).fill("E2E test source (test database only)");
  await dlg.getByRole("button", { name: "Save changes" }).click();
  await until(async () => (await dlg.getByRole("button", { name: "Mark verified" }).count()) === 1);
  check("statistics: publish blocked until verified", await dlg.getByRole("button", { name: "Publish", exact: true }).isDisabled());
  await dlg.getByRole("button", { name: "Mark verified" }).click();
  await confirm(page, "Mark verified");
  await until(async () => dlg.getByRole("button", { name: "Publish", exact: true }).isEnabled());
  await dlg.getByRole("button", { name: "Publish", exact: true }).click();
  await confirm(page, "Publish");
  await until(async () => JSON.stringify(await pub("/statistics?locale=en")).includes(`e2e-${RUN}`));
  const ps = (await pub("/statistics?locale=en")).find((s) => s.code === `e2e-${RUN}`);
  check("statistics: verified + published figure is public, value kept exactly (12.5)", ps && Number(ps.value) === 12.5);
  await dlg.getByLabel(/^Value/).fill("13");
  check("statistics: changing a verified value warns that verification resets", (await dlg.innerText()).includes("resets its verification"));
  await dlg.getByLabel(/^Value/).fill(ps ? String(ps.value).replace(/\.?0+$/, "") : "12.5");
  await dlg.getByRole("button", { name: "Unpublish", exact: true }).click();
  await confirm(page, "Unpublish");
  await until(async () => dlg.getByRole("button", { name: "Delete", exact: true }).isEnabled());
  await dlg.getByRole("button", { name: "Delete", exact: true }).click();
  await confirm(page, "Delete");
  await until(async () => (await page.getByRole("dialog").count()) === 0);
  check("statistics: unpublished and deleted → no longer public", !JSON.stringify(await pub("/statistics?locale=en")).includes(`e2e-${RUN}`));

  // ───────────── menus ─────────────
  step = "menus";
  await page.goto(`${WEB}/en/menus`, { waitUntil: "networkidle" });
  const state = await page.getByTestId("menu-state-headerMenu").innerText();
  check("menus: website-usage indicator shown for the header menu", /uses this menu|keeps its built-in menu/.test(state), state);
  const giving = page.locator("[aria-labelledby=mn-givingMenu]");
  const before = await giving.locator("li").count();
  await giving.getByRole("button", { name: "Add entry" }).click();
  await until(async () => (await giving.locator("li").count()) === before + 1);
  const entry = giving.locator("li").last();
  await field(entry, "Label").fill(`E2E ${RUN}`);
  await entry.getByLabel(/^Link/).selectOption("/faq");
  await entry.getByRole("button", { name: "Save item" }).click();
  await until(async () => (await entry.innerText()).includes("Entry saved"));
  const footer = (await adm(page, "/admin/cms/pages/home")).sections.find((s) => s.key === "FOOTER");
  check("menus: new entry stored hidden by default with a valid page link", footer.items.some((i) => i.titleEn === `E2E ${RUN}` && i.href === "/faq" && i.isVisible === false));
  await entry.getByLabel(/^Link/).selectOption("__external");
  await entry.getByLabel(/^External address/).fill("http://insecure.example");
  check("menus: non-https external link cannot be saved", (await entry.getByRole("button", { name: "Save item" }).isDisabled()) && (await entry.innerText()).includes("https://"));
  await entry.getByRole("button", { name: "Discard" }).click();
  await entry.getByRole("button", { name: "Remove entry" }).click();
  await confirm(page, "Remove entry");
  await until(async () => (await giving.locator("li").count()) === before);
  check("menus: entry removed (working copy); Gala Night stays a fixed entry", (await main(page)).includes("Gala Night (header and footer)"));

  // ───────────── site settings ─────────────
  step = "settings";
  await page.goto(`${WEB}/en/settings/site`, { waitUntil: "networkidle" });
  const site = await adm(page, "/admin/settings/site");
  await page.getByRole("tab", { name: "Contact" }).click();
  await page.getByLabel(/^Official e-mail/).fill("not-an-email");
  check("settings: invalid e-mail blocks saving", (await page.getByRole("region", { name: "Save changes" }).getByRole("button", { name: "Save changes" }).isDisabled()));
  await page.getByLabel(/^Official e-mail/).fill(site.contactEmail ?? "");
  await page.getByRole("tab", { name: "General" }).click();
  const copyright = page.getByRole("group", { name: "Copyright", exact: true }).getByLabel(/^English/);
  await copyright.fill(`E2E ${RUN} ©`);
  await page.getByRole("region", { name: "Save changes" }).getByRole("button", { name: "Save changes" }).click();
  await until(async () => (await page.getByRole("region", { name: "Save changes" }).innerText()).includes("Settings saved"));
  check("settings: change saved and returned by the server (only changed fields sent)", (await adm(page, "/admin/settings/site")).copyrightEn === `E2E ${RUN} ©`);
  await copyright.fill(site.copyrightEn ?? "");
  await page.getByRole("region", { name: "Save changes" }).getByRole("button", { name: "Save changes" }).click();
  await until(async () => ((await adm(page, "/admin/settings/site")).copyrightEn ?? "") === (site.copyrightEn ?? ""));
  check("settings: original value restored", ((await adm(page, "/admin/settings/site")).copyrightEn ?? "") === (site.copyrightEn ?? ""));
  await page.getByRole("tab", { name: "Branding" }).click();
  check("settings: tabs (General/Contact/Social/SEO/Branding) and brand-file warning", (await page.getByRole("tab").count()) === 5 && (await main(page)).includes("Change only with MEKI approval"));

  // ───────────── Arabic RTL + responsive ─────────────
  step = "rtl";
  for (const loc of ["ar", "en"]) {
    for (const w of [1440, 768, 390]) {
      await page.setViewportSize({ width: w, height: 860 });
      for (const p of ["/homepage", "/pages", "/menus", "/faqs", "/statistics", "/settings/site"]) {
        await page.goto(`${WEB}/${loc}${p}`, { waitUntil: "networkidle" });
        await page.getByRole("heading", { level: 1 }).waitFor();
        check(`${loc} ${w}px ${p}: no horizontal overflow${loc === "ar" ? ", dir=rtl" : ""}`, (await noOverflow(page)) && (loc === "en" || (await page.evaluate(() => document.documentElement.dir)) === "rtl"));
      }
      if (w === 390) await page.screenshot({ path: `${OUT}/homepage-${loc}-390.png` });
    }
  }
  await ctx.close();

  // ───────────── roles ─────────────
  step = "content manager";
  ({ ctx, page } = await open());
  await login(page, "content");
  await page.goto(`${WEB}/en/settings/site`, { waitUntil: "networkidle" });
  check("content manager: site settings read-only (no settings.manage)", (await main(page)).includes("can view settings but not change them") && (await page.getByRole("region", { name: "Save changes" }).count()) === 0);
  await page.goto(`${WEB}/en/statistics`, { waitUntil: "networkidle" });
  const first = page.locator("main table tbody tr button").first();
  await first.click();
  check("content manager: cannot verify or publish statistics (no statistics.verify/publish)", (await page.getByRole("dialog").getByRole("button", { name: "Mark verified" }).isDisabled()) && (await page.getByRole("dialog").innerText()).includes("Your role does not include this permission."));
  await ctx.close();

  step = "campaign manager";
  ({ ctx, page } = await open());
  await login(page, "campaign");
  const side = await page.locator("aside").first().innerText();
  check("campaign manager: sees Homepage/Pages/Menus/Statistics (read permissions), not FAQs", (await page.locator("aside a[href='/en/homepage'], aside a[href='/en/statistics']").count()) === 2 && (await page.locator("aside a[href='/en/faqs']").count()) === 0, side.replace(/\s+/g, " ").slice(0, 120));
  await page.goto(`${WEB}/en/homepage`, { waitUntil: "networkidle" });
  await page.locator("#section-HERO").waitFor();
  check("campaign manager: homepage fields disabled, publish disabled", (await field(page.locator("#section-HERO"), "Title").isDisabled()) && (await page.getByRole("button", { name: "Publish all changes" }).isDisabled()));
  await page.goto(`${WEB}/en/faqs`, { waitUntil: "networkidle" });
  check("campaign manager: FAQs page refused (no faq.read)", /permission|not allowed|access/i.test(await main(page)));
  await ctx.close();
} catch (e) {
  check(`unexpected error at step "${step}": ${e.message.split("\n").slice(0, 3).join(" | ")}`, false);
  console.log("recent failed API mutations:", apiErrors.slice(-4));
}

const uniq = [...new Set(problems)];
check("no console errors, page errors or off-origin requests during the run", uniq.length === 0, uniq.slice(0, 3).join(" | "));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed (real API, test database)`);
await browser.close();
process.exit(failed.length ? 1 : 0);
