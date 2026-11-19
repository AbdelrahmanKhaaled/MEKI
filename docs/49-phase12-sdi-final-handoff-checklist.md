# 49 — Phase 12: SDI hosted forms — final handoff checklist

Date: 2026-11-19.

**Audience:** MEKI's project lead and finance owner, SDI's contact, and whoever operates the admin.

**Read with:**

- [doc 47](47-phase12-sdi-hosted-forms-implementation.md): what was built;
- [doc 48](48-phase12-reconciliation-and-financial-integrity.md): reconciliation rules and tests.

**Current state:** everything is built and tested, and **every live switch is off**. No sales, payment link, report application or hosted giving is active in any environment.

## 1. Remaining dependencies (blockers before go-live)

| # | Owner | Needed | Why it blocks |
|---|---|---|---|
| D-1 | SDI | A **real sample** of the daily reconciliation report (CSV or XLSX), ideally covering a paid order, a refund, a partial refund and a cancellation | Column names, status values, date format/time zone and refund representation are unknown. A mapping profile must be built **and verified against it** before any real report can be applied |
| D-2 | SDI + MEKI | The pending **small live purchase and refund test** on the Gala form, using a reference issued by MEKI staging, then importing that day's report in staging | Proves end-to-end that the custom-question answer reaches the report and that refunds appear as expected |
| D-3 | SDI | Confirm the custom question is labelled exactly **"MEKI Booking Reference"**, is **required**, and is asked **once per order** | Matching relies only on this answer. A different label means updating `SDI_BOOKING_REFERENCE_QUESTION` |
| D-4 | SDI | Whether Zeffy supports pre-filling that answer through the form URL | Until confirmed, buyers copy the reference by hand (`referencePrefill:false`); mistyped references land in `UNMATCHED` for follow-up |
| D-5 | SDI + MEKI finance | How **donations** made on SDI's forms are reported: Gala add-on donations, general giving, programme giving (format, cadence, designation field) | Hosted donations are **not** counted in MEKI totals or programme fundraising yet; Gala donation lines are held as `REQUIRES_REVIEW` |
| D-6 | SDI | Per-programme form URLs, **or** confirmation of another designation mechanism; then MEKI sets `SDI_PROGRAMME_DESIGNATION_CONFIRMED` | Programme giving stays disabled until designation is confirmed |
| D-7 | SDI | The general donation form URL (`ZEFFY_DONATION_FORM_URL`) | General hosted giving stays disabled |
| D-8 | SDI + MEKI | Confirm the **ticket price and ticket types on the Zeffy form** match the published MEKI ticket configuration (price, USD) | A different price → every row is `AMOUNT_MISMATCH` |
| D-9 | SDI | Confirm the **capacity limit** is enforced on the Zeffy form | Hosted bookings hold no MEKI capacity; Zeffy is the capacity authority |
| D-10 | SDI + MEKI | Report delivery: secure channel, daily cut-off time, time zone, business-day calendar, who sends it and who receives it | Determines the period dates entered on import and the "missing business days" alert |
| D-11 | SDI + MEKI | Attendee-list cadence and who at MEKI may see it (data protection) | The list contains guest names and answers; `gala.guests.read` only |
| D-12 | MEKI | Written approval to switch each flag on in production, and the values placed in the hosting secret store (never in git) | Switches are deliberately off |
| D-13 | MEKI legal / SDI | Review of the public wording (receipt and tax wording, "tickets are not donations", refund contact) in EN and AR | Copy is a technical draft; the Arabic needs MEKI review |

## 2. Go-live sequence (each step needs the previous one)

1. **Staging configuration** (secret store, not git): `GALA_TICKETING_MODE=zeffy_hosted` (already the staging default) and `ZEFFY_GALA_TICKET_FORM_URL=<SDI Gala form>`. Keep `GALA_HOSTED_SALES_ENABLED=false`.
2. Apply the Phase 12 migration and the seed in staging. Both are additive; take a database backup first.
3. Grant `sdi.reports.upload` to the finance importer(s) and `sdi.reports.approve` to at least **two** administrators. Four-eyes needs two different people.
4. Receive the real sample (D-1):
   1. Upload it in staging and build the mapping.
   2. Save it as a profile.
   3. A second administrator **verifies** the profile, naming the sample file and date.
5. Run the live test (D-2):
   1. Temporarily set `GALA_HOSTED_SALES_ENABLED=true` in staging.
   2. Create a reference, buy one ticket on the form with that reference, then refund it.
   3. Import the report(s) with the verified profile, preview, and approve with a second administrator. This needs `SDI_REPORT_APPLY_ENABLED=true` in staging.
   4. Expect the booking to go CONFIRMED → REFUNDED, with no MEKI tickets. The Zeffy ticket and receipt arrive by e-mail from Zeffy.
6. Close D-3, D-8, D-9, D-10 and D-13.
7. **Production:**
   1. Back up first, then apply the migration and seed.
   2. Set the form URL and `SDI_REPORT_APPLY_ENABLED=true`.
   3. Recreate and re-verify the mapping profile in production. Profiles are per database.
   4. Set `GALA_HOSTED_SALES_ENABLED=true` **only** on MEKI's written go-ahead (D-12).
8. **Daily operations:**
   1. Upload each report and enter its period.
   2. Preview, and resolve `UNMATCHED` / `AMBIGUOUS` / `AMOUNT_MISMATCH` / `REQUIRES_REVIEW` rows with SDI (never by editing data).
   3. A second administrator approves.
   4. Watch the dashboard card for missing business days.
9. **Donations (later):** after D-5, D-6 and D-7, design the donation report import (a separate phase). Only then enable `SDI_GENERAL_GIVING_ENABLED` / `SDI_PROGRAMME_GIVING_ENABLED`.

## 3. Operator rules

- A buyer returning from Zeffy, an e-mail from a buyer, or a screenshot **never** confirms a booking. Only an approved SDI report does.
- There is no "mark as paid" button, by design. A wrongly matched or missing order is corrected by SDI in a later report (or a corrected file). The superseded file is then rejected, and the reason recorded.
- Synthetic fixtures (badge "SYNTHETIC FIXTURE") exist only in development and test databases. They are refused in staging and production.
- Zeffy-owned bookings have no MEKI tickets. Questions about tickets, QR codes or receipts go to SDI/Zeffy.
- The attendee list is for seating and catering only. It is not proof of payment and must not be exported or shared outside the permitted roles.

## 4. Regression and risk notes

- **Legacy MEKI checkout, webhooks, MEKI tickets and QR check-in** remain for `meki`-mode bookings (development) and existing records. `meki` mode is refused in staging/production, so no second ticketing system can run there. The Phase 5B–8A suites still pass (see §5).
- **Phase 8A Zeffy API/webhook code** stays dormant: SDI provides no key or secret. `ZEFFY_GALA_AUTO_CONFIRM` is refused in hosted mode, so no second confirmation path exists.
- **Hosted bookings** that are never paid stay `PENDING/UNPAID` and do not hold capacity. A later cleanup policy (e.g. expiring old unpaid references) needs MEKI's decision; nothing is deleted automatically.
- **Out-of-order reports** are handled per order (`STALE`). A refund lower than one already recorded is never applied silently.

## 5. Verification record

Recorded at the end of the phase run (2026-11-19). The commands are in doc 48 §7.

| Check | Command | Result |
|---|---|---|
| Phase 12 API integration (11 tests, `meki_test`) | `cd apps/api && npx jest --runInBand test/phase12-sdi.e2e-spec.ts` | **11/11 passed**; the process exits normally |
| Full API suite: unit + integration, including Phase 5B–11A Gala, booking-webhook, MEKI-ticket, QR check-in, Zeffy 8A and donations suites | `cd apps/api && npx jest --runInBand` | **27/27 suites, 417/417 tests passed** (262 s) |
| Web unit/static | `pnpm --filter @meki/web test` | **75/75 passed** |
| Admin unit/static/OpenAPI contract | `pnpm --filter @meki/admin test` | **180/180 passed** |
| Browser smoke, hosted Gala flow (stub API in `zeffy_hosted` mode, production web build) | `node apps/web/tests/e2e/hosted-booking.smoke.mjs` with `BROWSER=chromium|firefox|webkit` | **Chromium 21/21, Firefox 20/20, WebKit 20/20** (the clipboard check is Chromium-only) |
| Typecheck + lint + build, all packages | `pnpm turbo run typecheck lint build --force --concurrency=1` (the dev API watcher was stopped first and restarted afterwards) | **10/10 tasks successful**. 6 lint warnings, all in files Phase 12 did not touch: `postcss.config.mjs`, `QuickDonate.tsx`, `TrustAbout.tsx` and three admin e2e scripts |
| OpenAPI contract | `node dist/openapi-export.js` + `npx openapi-typescript` | 193 paths; the admin contract test confirms every admin service path exists |
| `meki_dev` | backup → `prisma migrate deploy` → seed | Migration applied; seed created 2 permissions + 1 grant version; 0 bookings / 7 donations untouched |

One test-only issue was found and fixed during the run. It was not a product bug:

- A helper generated a new e-mail on every call, so the "idempotent replay" correctly returned 409.
- The test now also asserts `IDEMPOTENCY_KEY_REUSED` explicitly.

Fixes made during the run:

- **Attendees endpoint:** now returns an explicit `{import, items, meta}` envelope.
- **Phase 10 web guard:** updated to the two-mode booking rule.
- **Upload dialog:** now a `ConfirmDialog`, per the Phase 6B "every mutation is confirmed" rule.

**Earlier hang (cleared):** the very first Phase 12 run stayed open after its tests. Later runs, including the full suite, exited normally, and no leaked handle was reproduced.
