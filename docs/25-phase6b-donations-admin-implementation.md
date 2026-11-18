# 25 — Phase 6B: Donations, donors & financial operations (admin)

Date: 2026-11-17 · Builds on [23](23-phase6a-admin-audit.md) / [24](24-phase6a-implementation.md). Nothing was committed, pushed or deployed. No schema change, no migration, no new dependency, and no change to payment, refund, donation or accounting behaviour.

## 1. Implemented routes (`apps/admin`, every route exists under `/en` and `/ar`)

| Route | Page | Sidebar entry |
|---|---|---|
| `/donations` | Donations list: 4 KPI counts, filters, server-paginated table | Donations |
| `/donations/[id]` | Donation detail: summary, donor, payment attempts, provider ledger, refunds (+ gated request), receipts, recurring link, audit history | — |
| `/donors` | Donors list: search, sort, anonymized toggle | Donors |
| `/donors/[id]` | Donor profile: collected totals **per currency**, history, recurring agreements, communication preferences, activity | — |
| `/payments` (`?tab=transactions\|refunds\|events\|providers`) | Payments & Refunds: provider transactions (+ detail modal), refunds (+ status report), provider webhook events, provider status | Payments & Refunds |
| `/payments/refunds/[id]` | Refund detail: amount, original payment, people, timestamps, reason, approve/reject/execute (gated), audit | — |
| `/recurring` | Recurring agreements + "commitments (not revenue)" report | Recurring Donations |
| `/recurring/[id]` | Agreement: commitment vs **collected (verified charges)**, payment history, pause/resume/cancel, audit | — |
| `/receipts` | Receipt records + SDI fiscal-sponsor notice | Receipts |
| `/receipts/[id]` | Receipt record, frozen snapshot, printed issuer, HTML document link, audit | — |

List filters live in the URL query, so they survive reloads and can be shared. Detail links carry the list query as `?back=…`, and the detail page's Back link restores it. Only a re-serialized query string is carried; the path is fixed, so this can't be used as an open redirect. Sidebar items stay active on their detail pages. Entries without a page (Analytics, Programs, Events, …) still show "Soon".

## 2. Components

* `components/finance/ui.tsx`: `Money` (decimal string → `Intl`, LTR-isolated), `Ref` (mono, LTR, wraps long ids), `DateText`, `StatusBadge` (tones from `lib/finance.statusTone`), `TestBadge`, `PageHeader` (back link, badges), `Notice`, `DetailGrid`, `DataTable` (real `<table>` from md upward; below md, card rows that keep every column), `Pagination`, `SearchFilter` (350 ms debounce), `SelectFilter`, `DateRangeFilter` (sends only the changed date), `FilterBar` (collapses behind a "Filters" button on phones, shows an active count and Clear), `GateNotice`, `ConfirmDialog` (built on the 6A `Modal`), `Tabs` (ARIA tabs with RTL-aware arrow keys), `useErrorText` (translated API error codes).
* `features/finance/FinancePage.tsx`: the 6A `AppShell` plus a permission gate and the password-change guard; `useHref`, `useDetailHref`, `useBackHref`.
* `features/finance/shared.tsx`: `CurrencyFilter`, `DonorCell`, `DesignationCell`, `AuditList` (6A timeline style), `ProviderStatus`.
* Pages: `features/finance/{donations,donors,payments,recurring,receipts}/*`.
* Data: `lib/finance-schemas.ts` (zod, written from the service code), `lib/finance.ts` (pure logic), `services/finance.ts` (one function per endpoint), `hooks/useFinanceData.ts` (TanStack Query hooks with stable `["fin", resource, params]` keys, plus mutations that invalidate the finance and dashboard caches), `hooks/useUrlState.ts`, and `lib/i18n-finance.ts` (EN/AR).
* 6A files touched (small, compatible changes): `lib/navigation.ts` (hrefs for the 5 entries; payments visible with `payments.read` **or** `donations.read`), `components/layout/Sidebar.tsx` (prefix-match active state), `components/common/States.tsx` (404 → "record was not found"), `lib/i18n.ts` (`fin` dictionary, `states.notFound`), `lib/api.ts` (`apiUrl` for same-origin document links). The dashboard page itself is unchanged.

## 3. Existing API endpoints used (all `/api/v1`, session cookie; CSRF on POST)

| Endpoint | Used for |
|---|---|
| `GET /admin/donations` (`search,status,paymentStatus,frequency,currency,campaignId,from,to,page,pageSize,sort`) | list; KPI counts via `meta.total` with `pageSize=1` |
| `GET /admin/donations/:id` | donation detail (attempts, ledger, refunds, receipts, recurring, UTM) |
| `POST /admin/donations/:id/refunds` | refund **request** (gated, see §4) |
| `GET /admin/donors`, `GET /admin/donors/:id` | donors list and profile |
| `GET /admin/refunds`, `GET /admin/refunds/:id` | refunds tab and detail |
| `POST /admin/refunds/:id/approve\|reject\|execute` | refund workflow (gated) |
| `GET /admin/payments/transactions[/:id]`, `/webhook-events`, `/providers`, `/currencies` | payments tabs, provider truth, currency list |
| `GET /admin/recurring-donations[/:id]`, `POST …/:id/pause\|resume\|cancel` | recurring pages and actions |
| `GET /admin/receipts[/:id]`, `GET /admin/receipts/:id/document?format=html` | receipts and the HTML document (opened as a same-origin link) |
| `GET /admin/reports/donations/summary`, `/reports/refunds`, `/reports/recurring` | per-currency collected amount, refund-status tiles, commitment tiles |
| `GET /admin/campaigns`, `GET /admin/audit-logs?entityType&entityId` | campaign filter options, entity audit history |

`includeTest` is never sent by the app, so the API's default excludes test records.

**Minimal backend change (additive, read-only, tested):** `GET /admin/refunds` and `GET /admin/receipts` list rows now also include `donation: { reference, isTest }`. Before this, the lists only had a raw `donationId`, so refunds and receipts of test-provider donations couldn't be told apart from real ones. There is no filter, behaviour or schema change, the receipt snapshot (PII) is still excluded, and the admin schemas treat the field as optional, so an older API still validates. Files: `refunds.service.ts`, `receipts.service.ts`, plus assertions in `test/donations.e2e-spec.ts`.

## 4. Permissions per page and action (UI mirrors the backend; the API decides)

| Page / action | Needs | Without it |
|---|---|---|
| Donations list/detail | `donations.read` | no-access state, no request |
| Donor names/e-mails in donations; e-mail search | `donors.read` (API omits `donor` otherwise) | "Restricted"; reference-only search |
| Collected amount on the donations page | `reports.read`, one currency selected, no campaign filter | explanatory hint |
| Campaign filter / currency list | `campaigns.read` / `settings.read` | filter hidden / ISO-code input |
| Donors pages | `donors.read` | no-access |
| Payments page | `payments.read` (transactions, events, providers) and/or `donations.read` (refunds) | only the permitted tabs |
| Request refund | `refunds.request` **and** donation PAID/PARTIALLY_REFUNDED **and** not a test record **and** refundable balance > 0 **and** a provider that is configured on the server, enabled, not a test provider and refund-capable (needs `payments.read` to verify) | button disabled + reasons listed |
| Approve refund | `refunds.approve`, REQUESTED, not your own request (four-eyes), non-test, live provider | disabled + reasons |
| Reject refund | `refunds.approve`, REQUESTED, not your own request (no money moves, so no provider check) | disabled + reasons |
| Execute refund | `refunds.execute`, APPROVED, non-test, live refund-capable provider | disabled + reasons |
| Recurring pages / actions | `recurring.read` / `recurring.manage` + state allows it (pause: ACTIVE, PAST_DUE · resume: PAUSED · cancel: PENDING_ACTIVATION, ACTIVE, PAUSED, PAST_DUE); the provider must support the action (API answers `NOT_SUPPORTED_BY_PROVIDER` otherwise) | buttons disabled / "no action possible" |
| Receipts pages | `receipts.read` | no-access |
| Audit sections | `audit.read` | locked note |

Every mutation goes through a confirmation dialog. The success message is built only from the server's response, and all finance and dashboard caches are refetched afterwards. A stale CSRF token (403 `CSRF_INVALID`) is refreshed once and the request retried. A 401 anywhere returns to login and clears the cache (6A behaviour).

**Receipt issue/regenerate (`receipts.issue`, `receipts.regenerate`) and donor edit/anonymize (`donors.manage`, `donors.anonymize`) are deliberately not exposed** (see §7).

## 5. Data transformations

Responses are validated with zod at the API boundary; a mismatch is shown as an error state, never as numbers. Donor name = organization name, otherwise first + last. Designation comes from the first allocation (campaign › programme › general fund). Statuses map to translated labels and tones; an unknown value is shown neutrally with its raw code. Frequency is shown as "Monthly" or "Every N months" from `interval`/`intervalCount`. Dates are shown in UTC with Western digits; the date filter sends an inclusive UTC day range and rejects an inverted range before any request. Test records are badged from the API's `isTest`, the additive `donation.isTest`, a provider's `isTestProvider`, or the backend's `TEST-` receipt-number series.

## 6. Financial calculation rules (in `lib/finance.ts`, unit-tested)

* Money stays a decimal **string**. Sums and differences use BigInt fixed-point (6 dp, output trimmed to 2–3 dp). No floats; a static test forbids `parseFloat` and `Number(x.amount)` in the finance pages.
* **Collected** means `PAID`/`PARTIALLY_REFUNDED`/`REFUNDED`, non-test, minus refunded. Pending, failed, cancelled and test records are never counted.
* **One currency at a time.** Donor totals are one card per currency. The donations page shows a collected amount only for the selected currency, from the per-currency report (confirmation-date basis, labelled as such). Report tiles list amounts per currency. Nothing is ever added across currencies.
* Refundable balance = amount − refunded − open refunds (REQUESTED/APPROVED/PROCESSING), the API's own formula.
* Recurring: the agreement amount is a **commitment**. "Collected" is the sum of verified charges in the agreement currency, and is `null` (labelled "no real money") for test agreements. The recurring report is titled "commitments (not revenue)".
* A donor profile uses the API's donation history, which is capped at 100. When that cap is reached, the totals are labelled partial.
* **Gala ticket money is not used anywhere in these pages** (a static test enforces it). The Payments page states that ticket payments are managed separately.
* KPI counts use the list's own filters (created-date basis); the card for each status ignores the status filter.

## 7. Backend gaps (recorded, not invented)

| ID | Gap | Effect in the UI | Proposed extension |
|---|---|---|---|
| B1 | Donor list has no total donated, last donation date, donation-history or date filters | columns and filters omitted; totals only on the profile | aggregate fields per currency (confirmed, non-test) + `lastDonationAt`, filters `hasDonations`, `createdFrom/To` |
| B2 | Donor detail returns ≤ 100 donations and no receipts | totals flagged partial; receipts reachable via each donation | paginated `GET /admin/donors/:id/donations`, receipts include |
| B3 | Recurring list has no donor name (endpoint needs only `recurring.read`) | "Open donor profile" link when `donors.read` | optional donor block when the caller has `donors.read` (as donations do) |
| B4 | Refund detail does not include `isTest` | page fetches the donation to learn it; if unknown it's treated as test (actions stay disabled) | add `donation.isTest` to refund detail |
| B5 | Webhook events have no test flag | badge derived from the provider's `isTestProvider` | `isTest` column |
| B6 | No donation-level audit entries (audits are on Refund/Receipt/RecurringDonation/Donor) | donation audit = merged history of its related entities | record `donation.*` events if needed |
| B7 | Donations list has no programme/designation filter; `from/to` is created date while reports use confirmation date | only campaign filter; labels state the basis | `programmeId`, `designation`, `dateField=confirmedAt` |
| B8 | Capability "pause recurring" is not exposed by `/payments/providers` | pause/resume shown by state; API refuses unsupported actions | add `supportsPauseRecurring` |
| B9 | No donation/refund export (6A G5) | none | follow the guest-export pattern |
| B10 | Receipt PDF not configured (501) | HTML document only | configure the renderer after the SDI decision |

**Product/legal decisions needed before enabling more:** receipt issuing via MEKI vs. SDI (fiscal sponsor) — the admin shows a notice that platform receipts are *not* confirmed as legally valid tax receipts, and the API's default issuer name is "MEKI", which needs review. Donor anonymization (irreversible) and editing need a privacy and approval process. Live refunds need the real provider (Zeffy/SDI), merchant account and end-to-end tests.

## 8. Tests run and results

| Check | Result |
|---|---|
| `pnpm --filter @meki/admin test` | **72/72** (35 existing 6A + 37 new): decimal arithmetic incl. 10 000 × 0.01, precision per currency, per-currency totals (pending/failed/test excluded, USD/EGP never combined), status tones + every enum labelled EN/AR, designation/donor naming, refund request/approve/reject/execute gates (permission, test record, test provider, seeded-but-unconfigured Zeffy, unverifiable provider, four-eyes, balance incl. open refunds), recurring transitions and collected-vs-commitment, receipt availability, date range/clean query/page clamp, zod mapping for all 6B shapes (floats rejected, optional additive fields), nav permissions + every enabled entry has a route file, EN/AR gate/error copy, SDI notice wording, static guards (no `includeTest`, no fake data, no float money, network only in `lib/api.ts`, no Gala finance, every mutation behind `ConfirmDialog`) |
| API `jest --runInBand` (meki_test; `migrate deploy` + idempotent seed only) | **333/333**, 18 suites (incl. new assertions for the additive list fields) |
| `tsc --noEmit` / ESLint (admin) | 0 errors; 2 warnings, both pre-existing in 6A test fixtures |
| `pnpm turbo run typecheck lint build --force --concurrency=1` | **10/10 tasks** |
| `tests/e2e/finance-contract.mjs` against the real API (meki_test, GET only) | **25/25**: every 6B schema against real rows (334 donations, 260 donors, 26 refunds, 234 transactions, 756 events, 25 agreements, 164 receipts), additive fields present, no snapshot in receipt lists, HTML document 200, PDF 501 |

## 9. Browser verification (Playwright + Chrome, production build)

* **Real backend** (`MODE=real`, `tests/e2e/finance.smoke.mjs`): a second API instance from the current code on :4100 with `NODE_ENV=test` → **meki_test** DB; two throwaway accounts (`p6b-admin-*@meki.test` ADMINISTRATOR, `p6b-limited-*@meki.test` CAMPAIGN_MANAGER) created only in meki_test, with a random password that was never printed. **23/23**: real login, all five pages render real data with no validation errors, no `includeTest`, provider status reads "Only a TEST provider is active" (no live claim; Zeffy not shown as live), SDI notice, refund detail and donor profile from real data, refund actions disabled on test data, Arabic RTL, and the limited role sees no entries, gets the no-access state on all five routes with **no finance request sent**, and the API itself answers 403. Read-only: no mutation was submitted against the real API.
* **Stub API with FAKE data** (`MODE=stub`, `tests/e2e/stub-finance.mjs`): **134/134**, run twice. Covers sidebar links/active state, KPI counts, every filter changing the request (search debounce, statuses, type, currency, campaign, date range, invalid range), pagination, URL-preserved Back, detail sections, refund request disabled without a live provider; with a FAKE live provider: request dialog validation (balance, precision) → POST with `X-CSRF-Token` → server-confirmed message → cache refetch; four-eyes; approve flow; transaction detail fetched by id; events/providers tabs; recurring collected $50 of 3 charges, pause flow, cancel needs a reason; receipts list/detail/doc link; error → retry; 404; donations-only role (PII restricted, no donors request, single refunds tab); Arabic RTL (LTR refs/money, sidebar right); **no horizontal overflow at 1440/1024/768/390/360 on 7 pages × EN/AR**; mobile card rows + Filters toggle; no console/page errors.
* **6A regression** (`dashboard.smoke.mjs`, stub): **53/53**.
* The final real-mode run came before the last UI fix (`DateRangeFilter` sends only the changed field). That fix touches only the date filter, which the stub suite covers (134/134 after it). Not verified: Safari/Firefox/real devices, screen-reader audit, the production hosting topology, and any live provider. No real payment or refund was executed.

Bugs found and fixed by the browser runs: Back from a detail page lost the list filters; two quick filter changes (e.g. from-date then to-date) could drop the first one, fixed by composing writes on the pending URL; the date filter sent a stale sibling value; on desktop the date inputs stretched to full width.

## 10. Files

*Added (admin):* `src/lib/finance.ts`, `src/lib/finance-schemas.ts`, `src/lib/i18n-finance.ts`, `src/services/finance.ts`, `src/hooks/useFinanceData.ts`, `src/hooks/useUrlState.ts`, `src/components/finance/ui.tsx`, `src/features/finance/{FinancePage,shared}.tsx`, `src/features/finance/donations/{DonationsListPage,DonationDetailPage}.tsx`, `…/donors/{DonorsListPage,DonorDetailPage}.tsx`, `…/payments/{PaymentsPage,RefundDetailPage}.tsx`, `…/recurring/{RecurringListPage,RecurringDetailPage}.tsx`, `…/receipts/{ReceiptsListPage,ReceiptDetailPage}.tsx`, 10 route files under `src/app/[locale]/(dashboard)/{donations,donors,payments,recurring,receipts}/…/page.tsx`, `tests/finance.test.mjs`, `tests/e2e/{finance.smoke,finance-contract,stub-finance}.mjs`; this document.
*Modified:* admin `src/lib/{navigation,i18n,api}.ts`, `src/components/layout/Sidebar.tsx`, `src/components/common/States.tsx`, `tests/dashboard.test.mjs` (route list), `tests/e2e/stub-api.mjs` (FAKE finance users, finance hook, extra donation filters; 6A results unchanged); API `src/modules/donations/{refunds,receipts}.service.ts`, `test/donations.e2e-spec.ts`; `docs/README.md`.
*Not changed:* Prisma schema, migrations, `.env*` files, auth/login, payment/webhook/refund/receipt/recurring logic, OpenAPI client, public web app, dependencies.
*Side effects:* `apps/api/dist` and `apps/admin/.next` were rebuilt by the build/Turbo runs. meki_test gained 4 `p6b-*@meki.test` admin accounts (2 from a first run whose password is gone), alongside the usual integration-test records. The development database was not touched.

## 11. Known limitations

The refund/recurring mutation UIs are verified only against the stub; against the real test API they correctly stay disabled, because only the mock provider exists. KPI counts are created-date based, while collected amounts come from the confirmation-date report (both labelled). Donor totals are partial above 100 donations (B2). Arabic copy is a technical draft pending MEKI review. Narrow columns wrap ("One-time"). Receipt issuing/regeneration and donor edit/anonymize are not available in the UI.

## 12. Suggested next phase

**6C — Campaigns & programmes content management** (the remaining urgent priority: editable campaigns/programmes/media/homepage), reusing these list/detail/filter/confirm patterns. In parallel, small backend tickets B1–B4 (donor aggregates, paginated donor donations, `isTest` on refund detail, optional donor block on recurring), then the SDI/Zeffy decision for receipts and live refunds. After that come Gala bookings/guests/QR check-in screens, and users/roles/audit.
