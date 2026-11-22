# FINAL — Production readiness report

**Date:** 2026-11-22 · **Base:** `6b37e9c` plus uncommitted changes (nothing committed, pushed or deployed) · **Status keys:** PASS / FIXED / BLOCKED_EXTERNAL / FAIL / NOT_APPLICABLE

## 1. Verdict

**The code and configuration are ready for a first VPS deployment with all financial collection closed.** All local tests and browser journeys pass, and every frontend call maps to a real backend route.

**It is not yet verified in production, and it is not ready to collect money.** Two things are missing:
- the VPS deployment itself (DNS, TLS, environment values, first admin) has not been performed or observed;
- every financial switch is intentionally off, pending SDI/MEKI decisions (§5).

## 2. What changed in this pass

| Area | Change | Status |
|---|---|---|
| Official Zeffy forms | Labelled hand-off to the two exact official URLs on book/donate. It works with the API offline, has independent switches (default OFF), keeps the reference flow preferred, and uses honest EN/AR copy | FIXED |
| Admin first login | Forced password-change screen (`AccountGate`). Previously the bootstrap Super Admin could not use the dashboard at all | FIXED |
| Admin user management | Users & Roles page: create with temporary password and roles, edit roles, (de)activate, role catalogue. Required to create the second approver for four-eyes payment verification | FIXED |
| Admin 401 handling | A wrong current password no longer signs the user out | FIXED |
| VPS hosting | PM2 for 3 apps (loopback 6666/3000/3001), nginx for meki-us.org/admin/api plus .com/.net redirects, ACME bootstrap, build-time vs runtime env templates, HTTPS-Git `deploy.sh` / `rollback.sh`, runbook | FIXED (config only) |
| Turborepo | `build.env` declares `NEXT_PUBLIC_*`, `ADMIN_API_UPSTREAM`, `API_INTERNAL_URL`, `MEKI_DEPLOY_ENV`, so the monorepo build receives them | FIXED |
| Dependencies | `effect` (high, via Prisma config) and `uuid` (moderate, via exceljs) fixed by narrow pnpm overrides; `pnpm audit --prod` is clean | FIXED |
| Client documents | `docs/client-requirements/` git-ignored | FIXED |
| Integration check | `scripts/api-integration-matrix.mjs` (reusable) | NEW |

## 3. Verification results (exact)

| Check | Command / method | Result |
|---|---|---|
| API unit + integration | `pnpm --filter @meki/api test` (test MySQL `meki_test`) | **490/490**, 35 suites |
| Website unit | `pnpm --filter @meki/web test` | **117/117** |
| Admin unit | `pnpm --filter @meki/admin test` | **227/227** |
| Typecheck + lint | `pnpm turbo run typecheck lint --force` | **7/7 tasks**, 0 errors; 5 warnings in older files (unused vars in e2e stubs, `<img>` in TrustAbout, anonymous default export in postcss config) |
| Builds | `next build` web (switches off; switches on with API unreachable) and admin (staging upstream); `nest build` via `openapi:export` | All succeeded |
| OpenAPI freshness | `openapi:export` → `git diff` | No diff (217 paths) |
| Integration matrix | `node scripts/api-integration-matrix.mjs` | 230 call sites, **0 without a backend route** |
| Empty MySQL 8 | Disposable `mysql:8.0` (8.0.46) container, least-privilege migrator, then removed | 15/15 migrations, 53 tables, 18 triggers, no schema drift, re-deploy no-op, seed via DML-only user is idempotent; 0 admins, 0 transactions, 0 published campaigns |
| Destructive SQL | grep of all migrations | No `DROP`, `TRUNCATE` or `DELETE` |
| nginx | `nginx:1.24` container, temporary certificates, `nginx -t`, curl | Bootstrap and full config OK; .com/.net/www → `https://meki-us.org` with path and query preserved; http → https; ACME served; unknown API paths 404 |
| Secret scan | gitleaks 8.24.2 on git history (8 commits) and tracked files | 3 findings, all obvious test fixtures (`zeffy.spec.ts`, `test/zeffy-env.ts`); no `.env`, keys or credentials tracked; env templates contain empty values only |
| Staging smoke | `STAGING_NO_PASSWORD_ROTATION=1 node deploy/staging/smoke.mjs` (real API container + MySQL + `next start`) | **56/56** |
| Users & password journey | `apps/admin/tests/e2e/users-account.smoke.mjs`, EN 1440×900 + AR 390×844 | Chromium **24/24**, Firefox **24/24**, WebKit **24/24** (WebKit over a loopback-only HTTPS QA proxy, because WebKit refuses Secure cookies on http) |
| Official-form hand-off, API offline | `apps/web/tests/e2e/official-forms.smoke.mjs` (switches ON, API on a closed port; zeffy.com requests blocked) | Chromium **26/26**, Firefox **26/26**, WebKit **26/26** |
| Phase 14B regression (closed gates, CTAs, private finance UI) | `apps/web/tests/e2e/phase14b.smoke.mjs` | Chromium **40/40**, Firefox **40/40**, WebKit **38/40** — see §3.1 |

No test was skipped. No browser interaction was forced. Browser page errors count as failures.

### 3.1 Open: WebKit 38/40 on the Phase 14B journey

All 38 functional checks pass in WebKit. The 2 failing checks are "no uncaught browser errors" (EN and AR). The recorded errors are WebKit's cancelled-request notices, `<url> due to access control checks`:

- for the API calls `/public/donations/config`, `/public/giving/options` and `/public/events/gala-night/ticketing`;
- for one Next.js RSC prefetch.

They are emitted when a navigation aborts in-flight requests. Every one of these calls is wrapped in `.catch` (`DonateProvider`, `BookingFlow`), and `clientApi` converts network failures into `ApiRequestError`. None of these code paths changed in this pass. The failure reproduced on a second run.

The test was **not** changed to ignore them. Status: **FAIL (non-functional, WebKit only)**. Next step: run the same journey over HTTPS on the deployed domain (same-origin TLS, as in doc 64) and confirm whether the notices persist; if they do, look into aborting the effects' fetches on unmount with an `AbortController`.

## 4. Security review summary

- **Admin:**
  - Session cookie `__Host-` with HttpOnly, Secure and SameSite=Strict.
  - CSRF header on mutations.
  - Same-origin `/api/v1` through nginx.
  - Strict CSP `frame-ancestors 'none'`, HSTS, noindex.
- **Website:** CSP frame-ancestors/base-uri/object-src/form-action, HSTS, `X-Frame-Options DENY`.
- **API:**
  - Startup refuses localhost/http origins, `PAYMENTS_ENABLED`, the mock provider and `ZEFFY_GALA_AUTO_CONFIRM` in production.
  - Rate limits are unchanged.
  - Throttling and guards were not relaxed to make any test pass.
- **Database:** append-only triggers protect evidence, transactions and audit; separate migrator and runtime accounts.
- **Zeffy webhook:** stays disabled. Zeffy documents no signature, and the Phase 8A signature assumption is flagged.
- **Known operational risk:** SSR calls from 127.0.0.1 share the 300 requests/min API limit (runbook §10). Monitor at launch.

## 5. Externally blocked (cannot be completed from code)

| Item | Owner | Unblocks |
|---|---|---|
| Written confirmation that both official Zeffy forms are open for collection | SDI | `NEXT_PUBLIC_GALA_{TICKET,DONATION}_FORM_HANDOFF=true` |
| Embed iframe snippets (only if embedding is wanted) | SDI (Zeffy dashboard) | Embedded forms (plus a CSP `frame-src`) |
| "MEKI Booking/Donation Reference" questions on the forms and a sample export | SDI | Reference-first flows: `GALA_HOSTED_SALES_ENABLED`, `SDI_DONATION_REFERENCE_CONFIRMED`, `SDI_GALA_GIVING_ENABLED` |
| Daily report format and sender, or a Zeffy API key | SDI | `SDI_REPORT_APPLY_ENABLED` / `ZEFFY_RECONCILIATION_ENABLED` |
| Authentic confirmation-e-mail sample | SDI | Consideration of `SDI_MANUAL_CONFIRMATION_ENABLED` |
| Approval and publication of the Gala event, legal copy and campaigns; venue photos upload | MEKI | Public Gala content beyond the built-in approved facts |
| DNS for the 8 hostnames; VPS access | MEKI / operator | TLS issuance and deployment |
| Production verification of the former admin login 404 | Operator, after deployment | Runbook §7 check (must return 400, not 404) |

## 6. Exact next steps

1. Review the uncommitted diff (`git status`: 19 modified files plus new files and directories), then commit it yourself. Do not commit `docs/client-requirements/`.
2. Create a release tag.
3. Follow `FINAL_PRODUCTION_DEPLOYMENT_RUNBOOK.md`:
   - §1 DNS;
   - §2–3 system and MySQL users;
   - §4 env files (all switches false);
   - §5 Certbot;
   - §6 `deploy.sh <tag>` + reviewed migrations + seed + `admin:bootstrap`.
4. Sign in and change the temporary password (now enforced). Create the second finance approver in Users & Roles.
5. Run the runbook §7 health checks. Record the admin login check as **400, not 404**.
6. Set the Gala ticket config (500.00 / 350) and the schedule in the admin. Upload and publish the venue photos when approved.
7. When SDI confirms in writing, enable the official-form hand-off switches and redeploy the same tag. Re-run the runbook §7 checks.
