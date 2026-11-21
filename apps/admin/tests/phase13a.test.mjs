// Phase 13A — the admin's API proxy can never be compiled to localhost on a hosted build (docs/51 §2). Run: pnpm --filter @meki/admin test
import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { resolveApiUpstream } from "../next.config.ts";

describe("ADMIN_API_UPSTREAM (root cause of the deployed login 404)", () => {
  test("hosted builds (Vercel or MEKI_DEPLOY_ENV=staging|production) require an upstream", () => {
    assert.throws(() => resolveApiUpstream({ VERCEL: "1" }), /ADMIN_API_UPSTREAM is required/);
    assert.throws(() => resolveApiUpstream({ MEKI_DEPLOY_ENV: "staging" }), /required/);
    assert.throws(() => resolveApiUpstream({ MEKI_DEPLOY_ENV: "PRODUCTION" }), /required/);
  });
  test("hosted builds refuse http and localhost", () => {
    assert.throws(() => resolveApiUpstream({ VERCEL: "1", ADMIN_API_UPSTREAM: "http://api.staging.example.org" }), /https/);
    assert.throws(() => resolveApiUpstream({ VERCEL: "1", ADMIN_API_UPSTREAM: "https://localhost:4000" }), /localhost/);
    assert.throws(() => resolveApiUpstream({ VERCEL: "1", ADMIN_API_UPSTREAM: "https://127.0.0.1" }), /localhost/);
  });
  test("a trailing /api/v1 (which produced /api/v1/api/v1 → 404) is removed; the rewrite keeps /api/v1", () => {
    assert.equal(resolveApiUpstream({ VERCEL: "1", ADMIN_API_UPSTREAM: "https://api.staging.example.org/api/v1/" }), "https://api.staging.example.org");
    assert.equal(resolveApiUpstream({ VERCEL: "1", ADMIN_API_UPSTREAM: "https://api.staging.example.org" }), "https://api.staging.example.org");
    assert.equal(resolveApiUpstream({ VERCEL: "1", ADMIN_API_UPSTREAM: "https://example.org/meki-api" }), "https://example.org/meki-api");
  });
  test("credentials, queries and invalid URLs are refused everywhere", () => {
    assert.throws(() => resolveApiUpstream({ ADMIN_API_UPSTREAM: "https://u:p@api.example.org" }), /credentials/);
    assert.throws(() => resolveApiUpstream({ ADMIN_API_UPSTREAM: "https://api.example.org?x=1" }), /query/);
    assert.throws(() => resolveApiUpstream({ ADMIN_API_UPSTREAM: "api.example.org" }), /absolute URL/);
  });
  test("local builds keep the development fallback and allow a local http upstream (rehearsal)", () => {
    assert.equal(resolveApiUpstream({}), "http://localhost:4000");
    assert.equal(resolveApiUpstream({ ADMIN_API_UPSTREAM: "http://localhost:4200" }), "http://localhost:4200");
  });
});
