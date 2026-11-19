// Phase 9A — public website response headers (next.config.ts). Run: pnpm --filter @meki/web test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const cfg = readFileSync(join(import.meta.dirname, "../next.config.ts"), "utf8");
test("public site: no camera/mic/geo, no framing, script-neutral CSP directives, HSTS", () => {
  assert.match(cfg, /camera=\(\), microphone=\(\), geolocation=\(\)/);
  for (const d of ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'", "form-action 'self'"]) assert.ok(cfg.includes(d), d);
  assert.match(cfg, /Strict-Transport-Security", value: "max-age=31536000"/);
  assert.match(cfg, /X-Frame-Options", value: "DENY"/);
  assert.doesNotMatch(cfg, /value: "[^"]*script-src/); // a script CSP would need nonces for Next.js inline bootstrapping — deliberately not set
});

test("performance: brand fonts are not force-preloaded on every page (Phase 9A measurement: −90 to −255 KB per page)", () => {
  const fonts = readFileSync(join(import.meta.dirname, "../src/lib/fonts.ts"), "utf8");
  assert.equal((fonts.match(/preload: false/g) ?? []).length, 4); // Source Serif, Lato, both Arabic families
  assert.match(fonts, /SourceSerif4-Regular\.ttf/); // original brand files are still the source (never converted or replaced)
});
