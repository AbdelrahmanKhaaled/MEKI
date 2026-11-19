// Phase 7 — the admin's API calls must exist in the generated OpenAPI contract (packages/api-client/openapi.json).
// Guards against the drift found after Phase 6E (endpoints added to the API but missing from the generated client).
// Regenerate with: pnpm --filter @meki/api openapi:export && pnpm --filter @meki/api-client generate
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test, { describe } from "node:test";

const here = import.meta.dirname;
const spec = JSON.parse(readFileSync(join(here, "../../../packages/api-client/openapi.json"), "utf8"));
const norm = (p) => p.replace(/^\/api\/v1/, "").replace(/\$\{[^}]+\}/g, "{}").replace(/\{[^}]+\}/g, "{}");
const known = new Set(Object.keys(spec.paths).map(norm));

/** Every literal API path in src/services/*.ts; `${e(ev)}` is the Gala helper for /admin/events/{eventId}. */
function servicePaths() {
  const dir = join(here, "../src/services");
  const out = new Set();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    const src = readFileSync(join(dir, f), "utf8");
    for (const m of src.matchAll(/api(?:Get|List|Post|Patch|Put|Delete|Upload|Download|Count)\((["`])([^"`]+)\1/g)) {
      let p = m[2].replace(/^\$\{e\(ev\)\}/, "/admin/events/{}");
      if (/\$\{[^}]*\?/.test(p) || /\$\{(action|decision)\}/.test(p)) continue; // runtime-chosen action segment (checked below)
      out.add(norm(p));
    }
  }
  return [...out];
}

describe("admin ↔ OpenAPI contract", () => {
  test("every admin service path is documented in openapi.json", () => {
    const paths = servicePaths();
    assert.ok(paths.length > 60, `found ${paths.length} paths`);
    const missing = paths.filter((p) => !known.has(p));
    assert.deepEqual(missing, [], `missing from openapi.json (regenerate the client): ${missing.join(", ")}`);
  });
  test("Phase 6D/6E additions are in the generated client", () => {
    for (const p of ["/admin/gala/events", "/admin/events/{}/jobs", "/admin/events/{}/check-in/lookup", "/admin/events/{}/check-in/history"]) assert.ok(known.has(p), p);
    const q = (p) => (spec.paths[`/api/v1${p}`]?.get?.parameters ?? []).map((x) => x.name);
    assert.ok(q("/admin/events/{eventId}/bookings").includes("from") && q("/admin/events/{eventId}/bookings").includes("to"));
    assert.ok(spec.paths["/api/v1/admin/cms/pages"].post && spec.paths["/api/v1/admin/cms/sections/{id}"].delete);
    const generated = readFileSync(join(here, "../../../packages/api-client/src/generated/schema.d.ts"), "utf8");
    for (const p of ["/api/v1/admin/gala/events", "/api/v1/admin/events/{eventId}/check-in/lookup"]) assert.ok(generated.includes(`"${p}"`), p);
  });
  test("runtime-chosen action segments exist for every action the UI can send", () => {
    for (const p of ["/admin/campaigns/{}/publish", "/admin/campaigns/{}/archive", "/admin/refunds/{}/approve", "/admin/refunds/{}/reject", "/admin/recurring-donations/{}/pause", "/admin/cms/sections/{}/publish", "/admin/cms/sections/{}/unpublish", "/admin/faqs/{}/publish", "/admin/programmes/{}/publish"]) {
      assert.ok(known.has(p), p);
    }
  });
});
