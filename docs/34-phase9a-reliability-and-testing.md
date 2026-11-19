# 34 — Phase 9A: Reliability and testing report

Date: 2026-11-18. All mutating tests ran against **`meki_test`** with mock or fixture providers. `meki_dev` received only the reviewed Phase 8A migration (after a backup) and read-only requests.

## 1. Test inventory (run 2026-11-18)

| Suite | Command | Result |
|---|---|---|
| API unit + integration (25 suites) | `cd apps/api && npx jest --runInBand` | **399 / 399** |
| Admin unit | `pnpm --filter @meki/admin test` | **158 / 158** |
| Web unit | `pnpm --filter @meki/web test` | **52 / 52** |
| Workspace | `pnpm turbo run typecheck lint build --force --concurrency=1` | **10 / 10 tasks**, 0 errors (3 pre-existing lint warnings each in admin/web) |

**Browser smokes** are manual and run against built apps; the latest results are in their phase docs:

| Smoke | Result |
|---|---|
| Public site, real test API (doc 29) | 250/250 |
| Booking UI, stub API | 58/58 |
| Gala admin, real test API (doc 28) | 101/101 |
| CMS admin (doc 27) | 74/74 |

## 2. Requested scenarios → where they are tested

| Scenario | Test(s) | Level |
|---|---|---|
| Concurrent bookings / overselling | `gala.e2e-spec.ts` "capacity: seats are held transactionally; concurrent bookings cannot oversell" | test DB |
| Concurrent check-in / duplicate scans | `phase7-integration` (5 parallel scans → exactly 1 VALID); `gala-6e.e2e-spec.ts` history | test DB |
| Webhook duplicates | `gala.e2e-spec.ts` (duplicate delivery), `zeffy.e2e-spec.ts` (3 concurrent identical deliveries + a second event for the same payment) | test DB, mock/fixtures |
| Out-of-order events | `zeffy.e2e-spec.ts` (older snapshot after a newer state; id-only update), `gala.e2e-spec.ts` (refund/failure ordering) | test DB, fixtures |
| Background-job retries | `gala-qa.e2e-spec.ts` (memory mail transport `failNext`, back-off, FAILED after max attempts, requeue) | test DB |
| PDF / e-mail failure recovery | `gala-qa.e2e-spec.ts` (storage and mail failures, regenerate missing PDFs, resend); `zeffy.e2e-spec.ts` (retry of failed PDF/e-mail jobs) | test DB |
| Payment reconciliation | `zeffy.spec.ts` (30) + `zeffy.e2e-spec.ts` (15), with documented-shape fixtures | fixtures |
| Test payments never affect real reports | `donations.e2e-spec.ts` (test-provider donations excluded from reports); `gala*.e2e` (`includeTest` default false); `phase7-integration` (ticket money creates no `Donation`/`PaymentTransaction`) | test DB |
| English and Arabic | Arabic guest names through booking → PDF (embedded Arabic font) → export (`gala-qa`, `phase7-integration`, `zeffy`). CMS Arabic content (`cms-6d`, `content`). EN/AR layout smokes (docs 27–29). Admin/web i18n parity unit tests. | test DB / built apps |
| Health / monitoring (new) | `phase9-ops.e2e-spec.ts`: readiness, liveness, hung-DB fast 503, system-status RBAC/alerts/no secrets | test DB |

The existing coverage already addressed every requested reliability scenario, so Phase 9A added tests only for new behaviour (§3) instead of duplicating suites.

## 3. Reliability changes in Phase 9A

| Change | Why | Test |
|---|---|---|
| `/health`: 3 s database probe timeout | A hung database stalled probes for about 10 s | phase9-ops |
| `/health/live` (no database) | Process managers must not restart a healthy process because the database blipped | phase9-ops |
| `GET /admin/system/status` (`audit.read`) | One view of DB latency, job backlog (FAILED, overdue > 5 min), webhook FAILED/stuck RECEIVED per provider, storage writability, mail transport, payment flags, last Zeffy reconciliation, and an `alerts[]` list. Counts only; no secrets. | phase9-ops |
| `LOG_FORMAT=json` (opt-in) | One JSON object per line for log collectors (Nest `ConsoleLogger({ json: true })`) | typecheck/build |

## 4. Incidents investigated

- **The dev API stopped after a full build.**
  - **Cause, reproduced:** the Turbo build runs `nest build` (`deleteOutDir`), which empties `dist/` while `nest start --watch` restarts. The watcher crashes with `Cannot find module dist/main` and ignores timestamp-only touches.
  - **Procedure:** stop the watcher before full builds and restart it afterwards (doc 37). Production is unaffected: it builds once, then starts.
- **API "Database unavailable" after a MySQL restart.**
  - **Cause:** MySQL 8 `caching_sha2_password` cache plus a non-TLS driver connection (doc 29 §4).
  - **Production requirement:** TLS to MySQL (doc 36).

## 5. Backup and restore

- **Backup:** a full `mysqldump --single-transaction --routines --triggers` of `meki_dev` taken before the Phase 8A migration.
- **Integrity verified:**
  - **Tables:** 44 `CREATE TABLE` statements (live has 45 = 44 + the Phase 8A table).
  - **Triggers:** 14, matching the live count.
  - **Completeness:** the dump has its completion marker.
- **Not verified — a full restore.** The application database user correctly lacks `CREATE DATABASE`. A restore drill needs an operator account and is a runbook step (doc 37 §6).

## 6. Not verified (and why)

- **Real provider data:** real Zeffy API responses, webhook deliveries and money movements — awaiting SDI (doc 32).
- **Real e-mail delivery:** no provider approved.
- **Physical devices and printing:** camera scanning on door devices (now permitted by the header fix), printed-ticket scanning, handheld scanners.
- **Browsers:** Safari, Firefox, real phones and screen readers.
- **Production infrastructure:** multi-instance rate limiting and job polling — single-instance assumption.
