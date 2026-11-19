// Phase 9A — admin response headers (next.config.ts). Run: pnpm --filter @meki/admin test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const cfg = readFileSync(join(import.meta.dirname, "../next.config.ts"), "utf8");
test("camera allowed for this origin only (QR check-in scanner); microphone and geolocation blocked", () => {
  assert.match(cfg, /Permissions-Policy", value: "camera=\(self\), microphone=\(\), geolocation=\(\)"/);
  assert.doesNotMatch(cfg, /value: "camera=\(\)/); // the header value (comments may mention the old one)
});
test("framing, base-uri, plugins and foreign form posts are blocked; HSTS present; no-store and noindex kept", () => {
  for (const d of ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'", "form-action 'self'"]) assert.ok(cfg.includes(d), d);
  assert.match(cfg, /Strict-Transport-Security", value: "max-age=31536000"/);
  assert.match(cfg, /X-Frame-Options", value: "DENY"/);
  assert.match(cfg, /Cache-Control", value: "no-store"/);
  assert.match(cfg, /X-Robots-Tag", value: "noindex, nofollow"/);
});
