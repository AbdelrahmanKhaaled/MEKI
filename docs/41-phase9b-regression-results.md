# 41 — Phase 9B: Regression results and operational validation

Date: 2026-11-18. **Rules followed:**

- Every test that writes data used **`meki_test`**, with the mock provider, fixture providers or the stub APIs.
- `meki_dev` was only **read** (row counts for the restore drill).
- No real payment was attempted, no sales were opened, and no `.env` file was changed.

## 1. Automated suites

| Suite | Command | Result |
|---|---|---|
| API integration + unit (25 suites) | `cd apps/api && npx jest --runInBand` | **399 / 399** (25 suites), re-run with nothing else touching `meki_test` |
| Admin unit | `pnpm --filter @meki/admin test` | **164 / 164** (158 + 6 new accessibility regressions) |
| Web unit | `pnpm --filter @meki/web test` | **55 / 55** (52 + 3 new accessibility regressions) |
| Workspace | `pnpm turbo run typecheck lint build --force --concurrency=1` | **10 / 10 tasks**, exit 0. Warnings: only the 3 pre-existing ones in each of admin and web; the 2 my scripts introduced were removed and those files re-linted clean. |

**Incident during the first API run (harness, not product).**

- **Symptom:** 12 tests in 4 Gala suites failed (`INVALID` where `VALID` was expected).
- **Cause:** the separately running browser-QA test API had its Gala **job poller on** (`GALA_JOBS_INTERVAL_SECONDS=3`) against the same `meki_test` database. It picked up jobs the Jest suites had created and re-issued their tickets, rotating the QR tokens under the tests.
- **Fix:** test API restarted with the poller off.
- **Result:**
  - The 4 suites alone: **62/62**.
  - The full suite was then re-run (above).
- **Lesson** (added to doc 37 / §5): never run two pollers against one database; in tests, only the suite under test may process jobs.

## 2. Critical journeys

| Journey | Covered by | Result |
|---|---|---|
| Public visitor navigation (10 pages × EN/AR × 5 widths × 3 engines) | `apps/web/tests/e2e/crossbrowser.smoke.mjs`, real test API | All functional checks pass (doc 39) |
| Donation flow (preview mode; payments disabled) | Donate dialog in 3 engines (doc 39); `donations.e2e-spec.ts` (mock provider: intents, verified webhooks, receipts, refunds, test-donation exclusion) | Pass |
| Recurring donation | `donations.e2e-spec.ts` (monthly intents + provider events); admin `/recurring` loads in 3 engines × EN/AR | Pass. **Live recurring billing is not verifiable** until SDI/Zeffy (doc 38) |
| Gala booking + guest registration | `booking.smoke.mjs` (stub API: validation, guests, idempotency, checkout host allow-list, sold-out / closed states) | **58/58 in Chromium, Firefox and WebKit** |
| Gala booking, payment → tickets (server) | `gala.e2e-spec.ts`, `phase7-integration.e2e-spec.ts` (mock provider, verified webhook only) | Pass |
| Ticket PDF generation | `gala-qa.e2e-spec.ts` (Arabic font, QR decodes, storage failure + regenerate); ticket PDF **download** through the admin proxy in 3 engines (`%PDF-` … `%%EOF`, filename) | Pass |
| QR validation + check-in | `gala*.e2e` (concurrency: 25 scans → 1 VALID); admin smoke in 3 engines: manual/handheld entry → VALID / ALREADY_CHECKED_IN, REVOKED, live-region announcement, camera fallback alert | Pass |
| Admin donor management | `donations.e2e-spec.ts`, `rbac.e2e-spec.ts`; `/donors` loads in 3 engines × EN/AR × widths | Pass |
| Campaign and programme management | `campaigns.e2e-spec.ts`, `content*.e2e-spec.ts`, `platform.e2e-spec.ts`; admin routes in 3 engines | Pass |
| CMS publishing | `cms-6d.e2e-spec.ts` (draft → publish → public, revisions, RBAC) | Pass |
| Media library upload | `media.e2e-spec.ts` (magic bytes, SVG refused, re-encode); **real upload through the admin proxy in 3 engines** | Pass |
| Exports (CSV with BOM + Arabic, XLSX) | Admin smoke, 3 engines | Pass |
| Refund workflows | `donations.e2e-spec.ts`, `gala.e2e-spec.ts` (REFUND_PENDING → verified refund), `zeffy.e2e-spec.ts` | Pass |
| Zeffy webhook + reconciliation | `zeffy.spec.ts` + `zeffy.e2e-spec.ts` (documented-shape fixtures; signature, replay, out-of-order, idempotency) | Pass. **Real Zeffy traffic not verifiable** (doc 32) |
| Authentication + RBAC | `auth.e2e-spec.ts`, `rbac.e2e-spec.ts`; browser: login, reload persistence, second tab, `HttpOnly` cookie, door-staff role in 3 engines | Pass |
| Dashboard charts with data | `dashboard.smoke.mjs` (stub) **53/53**; chart accessibility check, 3 engines × EN/AR, **27/27** | Pass after fixes (doc 40) |
| Finance screens | `finance.smoke.mjs` (stub) **134/134** | Pass |

## 3. Bugs found by regression in this phase

| # | Bug | Found by | Fixed |
|---|---|---|---|
| R1 | My new chart data tables (doc 40 A2) caused page-level horizontal overflow on the dashboard at 360 and 390 px (EN and AR): a `<table>` ignores `sr-only`'s `width: 1px`. | `dashboard.smoke.mjs` (4 overflow failures) | `sr-only` moved to a wrapping `<div>`; 53/53 |
| R2 | Recharts 3 makes chart SVGs and the Pie layer keyboard-focusable; inside `aria-hidden` that is an axe `aria-hidden-focus` violation (keyboard users would land on an invisible-to-AT stop). | Chart check (stub data) | `accessibilityLayer={false}` on all 4 charts, `rootTabIndex={-1}` on the Pie; 27/27 |
| R3 | Admin modal Tab trap let focus escape in WebKit (Safari skips links on Tab, so the browser's own next stop was outside the drawer). | Admin cross-browser run (WebKit 360/390/768) | The hook now moves focus itself on every Tab |

## 4. Operational validation

| Area | Finding |
|---|---|
| **Backup / restore** | **Real drill in a disposable container** (doc 37 §6). The raw `mysqldump` **does not restore**: 11 of the 14 triggers have a trailing `;` → `ERROR 1064`, and only 3 of 44 tables were restored. After the documented normalization step: 44 tables, 14 triggers, counts equal to `meki_dev`, triggers enforce, `migrate deploy` OK, API healthy on the restored copy, ≈ 1 minute recovery. The container was removed afterwards. |
| **Multi-instance** | **Correction to doc 36:** `RATE_LIMIT_STORE=redis` is *not implemented*; the API refuses to start with it. Launch on **one API instance**. Instance-safe already: DB sessions, CSRF, lockout (DB), webhook idempotency (unique constraint), job claims (conditional UPDATE + lease). Not shared: the in-memory rate limit; local storage needs a shared volume; Zeffy reconciliation should run on one instance. |
| **Background-job recovery** | Lease-based claiming, back-off, FAILED after max attempts, admin requeue (tested in `gala-qa`). The incident in §1 is the proof that **two pollers on one database interfere**: only one poller per environment. |
| **Webhook retries** | Unique `(provider, eventId)`. Duplicates / replays / out-of-order are tested. Admin retry of FAILED events works for the donation provider; Zeffy uses reconciliation. |
| **Session security** | Server header verified: `Set-Cookie: meki_admin_sid=…; HttpOnly; SameSite=Strict` (+ `Secure`, `__Host-` in staging/production — doc 33). WebKit's Windows build *reports* `SameSite=None` in its cookie jar; that is an engine reporting limitation, not the header. |
| **CSP / HSTS** | Present on both apps (doc 33). No browser in the 3-engine runs logged a CSP violation. |
| **Logging / monitoring** | `/health`, `/health/live`, `/admin/system/status` (doc 34). Used during the drill: the restored API answered `status: ok`. |
| **Production environment** | Docs 36/37 updated: one instance; dump normalization + DEFINER user before restore. |

## 5. Not verified (needs people, devices or third parties)

Real Safari / iOS / Android devices, screen readers, real payments / refunds / recurring billing via SDI-Zeffy, real e-mail delivery, door hardware (cameras, handheld scanners, printed tickets), production-size data and a restore on the production host. All are listed in doc 42.
