# 53 — Phase 13A: staging test results

Recorded 2026-11-19 on the developer machine.

- Integration tests ran against `meki_test`.
- Staging ran against the isolated `meki_staging` database.
- Synthetic data only. Nothing was paid or applied, and no real e-mail was sent.
- Exit codes below are the tools' **own** codes, not the exit code of a log filter.

## 1. Summary

| Check | Command | Result |
|---|---|---|
| API unit + integration (all suites) | `cd apps/api && npx jest --runInBand` | **32/32 suites, 452/452 tests passed** (290 s, Jest exit 0) |
| Website unit/static | `pnpm --filter @meki/web test` | **85/85** |
| Admin unit/static/OpenAPI contract | `pnpm --filter @meki/admin test` | **200/200** |
| Staging end-to-end smoke (admin origin + website + API) | `node deploy/staging/smoke.mjs` | **57/57** |
| Cross-browser smoke against the staging website | `WEB_URL=http://localhost:3200 BROWSER=chromium\|firefox\|webkit node apps/web/tests/e2e/agreement.smoke.mjs` | **Chromium 28/28, Firefox 28/28, WebKit 28/28** |
| Backup + isolated restore drill | `bash deploy/staging/restore-drill.sh` | **Passed** (exit 0, 25 s) |
| DB pool under load (rebuilt image, no URL override, cold start) | concurrent `GET /public/programmes/health/detail` | 1 → 0.40 s, 10 → 0.16 s, 30 → 0.30 s, 60 → 0.54 s; 0 pool timeouts (before the fix: 30 → 10.7 s) |
| Typecheck + lint + build, all packages | `pnpm turbo run typecheck lint build --force --concurrency=1` | **10/10 tasks successful** (3 min 39 s, exit 0). 6 lint warnings, all pre-existing and in files Phase 13A did not touch (`postcss.config.mjs`, `QuickDonate.tsx`, `TrustAbout.tsx`, three admin e2e scripts) |

## 2. Staging smoke — 57 checks (`deploy/staging/smoke.mjs`)

All passed on the third run. The first run failed on the pool timeouts (doc 51 D-2). The second failed because that earlier, half-applied password change had locked out the account (D-3). Both are fixed; the account was recovered with `admin:reset-password`.

| Group | Checks |
|---|---|
| Reachability | API readiness direct; readiness and liveness **through the admin origin** (`/api/v1` rewrite preserved) |
| Authentication | Wrong password → 401, no cookie; unauthenticated `/me` and protected route → 401; login via the admin origin → 200; cookie `__Host-` + HttpOnly + Secure + SameSite=Strict + Path=/ + no Domain; CSRF token returned |
| First login | Protected route refused (`PASSWORD_CHANGE_REQUIRED`); mutation without CSRF → 403; mandatory change → 200; re-login with the new password; `/me` Super Admin |
| Financial switches | SDI status: hosted mode, sales, giving, programme, general, report-apply OFF, no secrets/URLs; public donation config: payments disabled, no authorized designation; hosted forms: single-project scope, no channels; booking reference refused while closed / unpublished; synthetic SDI upload refused in staging; report list reachable |
| Admin reads | Programmes, causes, campaigns, media, CMS pages, FAQs, site settings, donations, donation report summary, Gala events, users, system status, audit log (13 × 200); mail transport `none` |
| RBAC | Super Admin creates a content manager; temporary password must be changed; content manager reads content; refused finance, SDI, users, guest list (4 × 403); idle-expired session → 401; test user deactivated (kept) |
| Logout | Cookie cleared; then `/me` → 401 |
| Website (same staging API) | 9 programmes published; **20 pages × EN and AR** render with the correct direction (home, about, programmes + 9 details, give, Gala, Gala booking, contact, FAQ, privacy, terms, cookies); no programme payment control; no SDI link on the Gala page |
| Headers | Admin (CSP, HSTS, DENY, nosniff, no-store, noindex); website (CSP, HSTS, DENY, no x-powered-by); API (helmet); CORS unknown origin refused; Swagger not served |
| Rate limit | Login → 429 after repeated failures |

## 3. Cross-browser smoke — 28 checks per engine (`apps/web/tests/e2e/agreement.smoke.mjs`)

Run in EN on desktop (1440×900) and AR on mobile (390×844):

- programme page in its informational state (no buttons, no external payment link, Gala info link, programme code, no horizontal scroll);
- `/give` without a form or checkout, with the Gala information link;
- Gala page without an SDI link or project note while not authorized;
- **Nov 19:** 3:30 – 8:30 hours shown; **four acts with 10 timed items ending 8:15**; USD 500 and never 750; no speaker names; no unapproved tax disclosure.

## 4. Integration tests added in Phase 13A / 19 Nov

| File | Tests | Covers |
|---|---|---|
| `apps/api/test/phase13a.e2e-spec.ts` | 2 | Atomic password change (failure → full rollback; success → all effects together) |
| `apps/api/test/nov19-client-updates.e2e-spec.ts` | 10 | Seed values (500/350/times, create-only), audited admin update path, legal-copy gate (amounts, four eyes, permissions, receipt never publishable, stale-price refusal, localized publication, edit unpublishes, price change hides), SDI amount matching at 500 (750-based row = mismatch) |
| `apps/api/src/config/deployment-urls.spec.ts` | 5 | No localhost/http public URLs or CORS origins in staging/production; rehearsal escape hatch staging-only |
| `apps/api/src/prisma/prisma.service.spec.ts` | 3 | Pool defaults added, explicit values win, malformed URL untouched |
| `apps/admin/tests/phase13a.test.mjs` | 5 | Hosted admin build requires an https, non-local `ADMIN_API_UPSTREAM`; `/api/v1` suffix handling |
| `apps/web/tests/phase13a.test.mjs` | 1 | Hosted website build refuses a localhost/http API URL |
| `apps/web/tests/nov19.test.mjs` | 5 | Price, hours, agenda structure and times, no speaker names, disclosures only from the API |
| `apps/admin/tests/nov19.test.mjs` | 7 | Approved details, legal amounts / publish blockers, contract, four eyes, pending-agreement record, EN/AR parity |

## 5. Failures found during the phase and their causes

| Observation | Cause | Resolution |
|---|---|---|
| 3 ticket-PDF unit tests failed in a run whose wrapper reported exit 0 | Six orphaned Nest watchers saturating the CPU (timeouts); the wrapper's exit code came from `tail`, not Jest | Watchers stopped; 177/177 unit tests on an idle machine, and included in the 452/452 full run |
| Staging password change HTTP 500, burst latency 10.7 s | MariaDB driver connect timeout (D-2) | Pool defaults; verified with the rebuilt image |
| Password change committed while reporting failure | Non-atomic writes (D-3) | Single transaction + regression test |
| Drill checksum "No such file" | Container path in the `.sha256` (D-6) | Bare file name; drill aborts on a mismatch |
| Drill `Access denied for user 'root'` | Readiness by ping during MySQL's temporary init server (D-7) | Wait for an authenticated query |

No test was changed to hide a failure. Two existing assertions were updated for **intended** rule changes:
- Phase 12: programme hosted giving now requires the separate-agreement switch first.
- `site.smoke.mjs`: the confirmed USD 500 and hours replace the old "750, no time" expectation.

## 6. Not tested here

- The live Vercel admin and website, and the VPS (no access): doc 54 §7 lists the verification requests.
- Upload body limits through Vercel rewrites; the client-IP chain through Vercel (doc 52 R-4, R-5).
- `pnpm audit --prod` (release gate in doc 54 §1).
