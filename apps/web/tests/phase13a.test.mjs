// Phase 13A — hosted website builds never bake a localhost/http API (docs/51 §2). Run: pnpm --filter @meki/web test
import assert from "node:assert/strict";
import test from "node:test";
import { checkPublicApiUrl } from "../next.config.ts";

test("hosted builds refuse a localhost or http API URL; local builds are unaffected", () => {
  assert.throws(() => checkPublicApiUrl({ VERCEL: "1", NEXT_PUBLIC_API_URL: "http://localhost:4000/api/v1" }), /https URL that is not localhost/);
  assert.throws(() => checkPublicApiUrl({ MEKI_DEPLOY_ENV: "staging", NEXT_PUBLIC_API_URL: "http://api.staging.example.org/api/v1" }), /https/);
  assert.equal(checkPublicApiUrl({ VERCEL: "1", NEXT_PUBLIC_API_URL: "https://api.staging.example.org/api/v1" }), "https://api.staging.example.org/api/v1");
  assert.equal(checkPublicApiUrl({ NEXT_PUBLIC_API_URL: "http://localhost:4000/api/v1" }), "http://localhost:4000/api/v1");
  assert.equal(checkPublicApiUrl({}), null); // local build without API: designed "unavailable" states
});
