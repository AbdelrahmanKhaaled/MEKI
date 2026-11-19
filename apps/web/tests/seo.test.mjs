// Phase 7 — robots / sitemap / indexing switch. Run with: pnpm --filter @meki/web test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test, { describe } from "node:test";
import { PRIVATE_PATHS, SITEMAP_PAGES, robotsRules, sitemapEntries } from "../src/lib/seo.ts";
import { PAGE_PATH } from "../src/content/pages.ts";
import { contentFailureLevel } from "../src/lib/content-failure.ts";

const origin = new URL("https://meki.example");
const src = (p) => readFileSync(join(import.meta.dirname, "../src", p), "utf8");

describe("robots and sitemap", () => {
  test("before launch approval everything is disallowed and no sitemap is advertised", () => {
    assert.deepEqual(robotsRules(false, origin), { rules: { userAgent: "*", disallow: "/" } });
  });
  test("after approval: public pages allowed, booking / status / return pages and the API never", () => {
    const r = robotsRules(true, origin);
    assert.equal(r.rules.allow, "/");
    for (const p of ["/*/events/gala-night/book", "/*/events/gala-night/booking", "/*/donation/return", "/api/"]) assert.ok(r.rules.disallow.includes(p), p);
    assert.equal(r.sitemap, "https://meki.example/sitemap.xml");
    assert.deepEqual(PRIVATE_PATHS.length, 4);
  });
  test("sitemap: every public page with EN + AR alternates; nothing transactional; no URL without a known origin", () => {
    const s = sitemapEntries(origin, PAGE_PATH);
    assert.equal(s.length, SITEMAP_PAGES.length);
    assert.ok(s.some((e) => e.url === "https://meki.example/en" && e.alternates.languages.ar === "https://meki.example/ar"));
    assert.ok(s.some((e) => e.url === "https://meki.example/en/events/gala-night"));
    assert.ok(!s.some((e) => /book|booking|return/.test(e.url)));
    assert.deepEqual(sitemapEntries(undefined, PAGE_PATH), []);
    assert.deepEqual([...SITEMAP_PAGES].sort(), Object.keys(PAGE_PATH).sort());
  });
  test("one indexing switch: public pages use publicRobots; transactional pages stay noindex", () => {
    assert.match(src("lib/site.ts"), /export const PUBLIC_INDEXING = false;/);
    for (const f of ["app/[locale]/layout.tsx", "lib/page-meta.ts", "app/[locale]/events/gala-night/page.tsx"]) assert.match(src(f), /robots: publicRobots/, f);
    for (const f of ["app/[locale]/events/gala-night/book/page.tsx", "app/[locale]/events/gala-night/booking/page.tsx", "app/[locale]/events/gala-night/booking/[reference]/page.tsx", "app/[locale]/donation/return/page.tsx"]) {
      assert.match(src(f), /robots: \{ index: false, follow: false \}/, f);
    }
  });
});

describe("CMS fetch failures are never silent (Phase 7)", () => {
  test("missing core endpoints, network failures and 5xx are errors; other 4xx are warnings", () => {
    assert.equal(contentFailureLevel("/public/home?locale=en", 404), "error"); // e.g. NEXT_PUBLIC_API_URL without /api/v1
    assert.equal(contentFailureLevel("/public/site", 404), "error");
    assert.equal(contentFailureLevel("/public/faqs", 0), "error");
    assert.equal(contentFailureLevel("/public/faqs", 503), "error");
    assert.equal(contentFailureLevel("/public/pages/privacy?locale=en", 404), "warn"); // unpublished legal page
  });
  test("the example environment documents the /api/v1 prefix", () => {
    for (const f of ["../../../.env.example", "../.env.example"]) assert.match(readFileSync(join(import.meta.dirname, f), "utf8"), /NEXT_PUBLIC_API_URL=http:\/\/localhost:4000\/api\/v1/, f);
  });
});
