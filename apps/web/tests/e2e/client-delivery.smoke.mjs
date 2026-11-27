// Build with NEXT_PUBLIC_SITE_URL set to the local server origin and the public API offline.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import photos from "../../src/content/delivery-gallery.json" with { type: "json" };
import { mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const origin = process.env.WEB_URL ?? "http://127.0.0.1:3799";
const shots = path.join(os.tmpdir(), "meki09-screenshots");
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Exercise client-side queues without transmitting page views or conversions to advertising accounts.
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin || url.protocol === "data:") return route.continue();
    if (route.request().resourceType() === "script") return route.fulfill({ contentType: "text/javascript", body: "" });
    return route.abort();
  });
  const programs = [...new Set(photos.map((photo) => photo.program))];
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const locale of ["en", "ar"]) {
      for (const route of ["", "/events/gala-night", ...programs.map((slug) => "/programs/" + slug)]) {
        const response = await page.goto(origin + "/" + locale + route, { waitUntil: "domcontentloaded" });
        assert.equal(response.status(), 200, route);
        await page.locator("main h1").first().waitFor();
        // A static page can be painted before React attaches its gallery and menu handlers.
        await page.waitForFunction(() => typeof window.gtag === "function");
        assert.equal(await page.locator("html").getAttribute("dir"), locale === "ar" ? "rtl" : "ltr");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), locale + route + " overflow at " + width);
        assert.ok(await page.locator("header").count());
        assert.ok(await page.locator("footer a[href='mailto:Inquiries@meki-us.org']").count());
        await page.locator("main img, header img, footer img").evaluateAll((images) =>
          Promise.all(images.map(async (img) => {
            img.loading = "eager";
            await img.decode();
            if (!img.naturalWidth) throw new Error("Missing image: " + img.currentSrc);
          }))
        );
        if (!route) {
          for (const key of ["hero-family", "hero-school", "water-pipeline"]) {
            assert.ok(await page.locator(`main img[src*='${key}']`).count(), key);
          }
          const headerVariant = (variant) => page.waitForFunction((name) => {
            const img = document.querySelector('header img[src*="Secondary_' + name + '"]');
            return img && Number(getComputedStyle(img.parentElement).opacity) > 0.99;
          }, variant);
          await headerVariant("White");
          if (width < 1024) {
            const toggle = page.locator("header [aria-controls='mobile-menu']");
            await toggle.click();
            await headerVariant("Green");
            assert.ok(await page.locator(`#mobile-menu a[href='/${locale}/events/gala-night']`).isVisible());
            await toggle.click();
          }
          await page.locator("footer").scrollIntoViewIfNeeded();
          await headerVariant("Green");
          assert.ok(await page.locator("footer img[src$='MEKI_Secondary_White.png']").isVisible());
          assert.ok(await page.locator("link[rel='icon'][href*='MEKI_Icon_Approved']").count());
          assert.match(await page.locator("meta[property='og:image']").first().getAttribute("content"), /meki-og-approved-logo\.jpg$/);
          await page.waitForFunction(() => window.fbq && window.ttq && window.gtag);
          assert.equal(await page.evaluate(() => window.fbq.queue.filter((a) => a[0] === "init").length), 1);
          assert.equal(await page.evaluate(() => window.ttq.filter((a) => a[0] === "page").length), 1);
          const album = page.locator("section[aria-labelledby='gallery-title']");
          await album.locator("summary").click();
          assert.equal(await album.locator("figure:visible").count(), 26);
          await album.locator("summary").click();
        } else if (route.includes("gala-night")) {
          assert.equal(await page.locator("#experience li").count(), 5);
          assert.equal(await page.locator("#experience li .p10-icon").count(), 4);
          assert.equal(await page.locator("#experience img[src*='venue-exterior-day']").count(), 1);
          assert.equal(await page.locator("#purpose img").count(), 0);
          assert.equal(await page.locator("#program h3[id^='act-']").count(), 4);
          assert.match(await page.getByTestId("gala-venue-address").innerText(), /10065/);
          const exterior = await page.getByTestId("gala-venue-photos").locator("img").boundingBox();
          assert.ok(exterior && exterior.width <= 547 && Math.abs(exterior.height - exterior.width * 365 / 547) < 1);
          assert.ok(await page.locator(`#booking a[href='/${locale}/events/gala-night/book']`).count());
          await page.locator("#experience").screenshot({ path: path.join(shots, `${locale}-${width}-experience.png`) });
          const photo = page.getByTestId("gala-host-photo").locator("img");
          await photo.scrollIntoViewIfNeeded();
          await photo.evaluate((img) => img.decode());
          assert.equal(await page.getByTestId("gala-sponsor-now").getAttribute("href"), "https://givebutter.com/c/misr-el-kheir-foundation-spring-of-dignity-gala-new-york-sponsors");
          assert.equal(await page.getByTestId("gala-partners").count(), 0);
        } else {
          const items = page.locator("#gallery li button");
          assert.equal(await items.count(), photos.filter((photo) => route.endsWith("/" + photo.program)).length);
          await items.last().scrollIntoViewIfNeeded();
          await items.last().click();
          assert.ok(await page.locator("#gallery dialog").evaluate((dialog) => dialog.open), `${locale}${route} lightbox at ${width}px`);
          await page.locator("dialog[open] img").evaluate((img) => img.decode());
          assert.ok(await page.locator("dialog[open] figcaption").innerText());
          await page.keyboard.press("Escape");
        }
        if (!route || route.includes("gala-night") || route.endsWith("/health")) {
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
          await page.locator("main section").first().locator("img").evaluateAll((imgs) => Promise.all(imgs.map((img) => { img.loading = "eager"; return img.decode(); })));
          await page.screenshot({ path: path.join(shots, [locale, width, route.split("/").pop() || "home"].join("-") + ".png") });
        }
      }
      console.log(locale, width, "home, Gala, nine programs passed");
    }
  }
  // Browser-only fixtures. No real booking, payment or ad request is made.
  for (const route of ["/en/events/gala-night/book", "/ar/events/gala-night/donate", "/en/give", "/ar/about", "/en/contact"]) {
    assert.equal((await page.goto(origin + route)).status(), 200, route);
    await page.locator("main").waitFor();
  }
  const reference = "DN-TEST00000001";
  const status = { reference, intentType: "GENERAL_DONATION", classification: "SADAQAH", intendedAmount: "20", currency: "USD",
    designation: { name: null }, stage: "PENDING_EXTERNAL", verifiedAt: null };
  await page.route("**/public/donation-intents/*/status?*", (route) => route.fulfill({ json: { data: status } }));
  await page.evaluate((ref) => sessionStorage.setItem("meki.gift." + ref, "local-fixture"), reference);
  const returnPage = origin + "/en/give/status/" + reference;
  const conversions = () => page.evaluate(() => window.dataLayer.filter((a) => a[0] === "event" && a[1] === "conversion").map((a) => a[2]));
  await page.goto(returnPage);
  await page.locator('[data-testid="intent-status"][data-state="ok"]').waitFor();
  assert.deepEqual(await conversions(), []);
  Object.assign(status, { stage: "VERIFIED", verifiedAt: "2026-11-25T12:00:00Z" });
  await page.reload();
  await page.locator('[data-testid="intent-status"][data-state="ok"]').waitFor();
  assert.deepEqual(await conversions(), [{ send_to: "AW-11325728548/Hbz7CN6amN0YEKTOw5gq", value: 1, currency: "EGP", transaction_id: reference }]);
  await page.reload();
  await page.locator('[data-testid="intent-status"][data-state="ok"]').waitFor();
  assert.deepEqual(await conversions(), []);
  console.log("Hosted flow entry pages and simulated donation confirmation / replay passed");
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
