# 47 — Phase 12: SDI / Zeffy hosted forms — implementation

Date: 2026-11-19.

**What did not change:** nothing was committed, pushed or deployed. No live sales or payment flows were switched on. No `.env` file was edited. No database was reset and no booking, donation or payment record was deleted.

## 1. SDI's decision (source of truth for this phase)

SDI's e-mail (pasted into the Phase 12 brief) sets the integration model. Everything below follows from it:

| SDI decision | Consequence in MEKI |
|---|---|
| Payments happen **only** on SDI's Zeffy-hosted forms | MEKI never takes card data and never runs its own checkout for these flows. |
| Gala form: `https://www.zeffy.com/en-US/ticketing/misr-el-kheir-foundation-gala-new-york` (guests may add a donation on the same form) | The URL is configuration (`ZEFFY_GALA_TICKET_FORM_URL`), shown only while the hosted-sales switch is on. |
| No API key, no webhooks for MEKI | Confirmation comes **only** from SDI's daily reconciliation report, approved by a second administrator. The Phase 8A webhook/API code stays dormant. |
| Daily reconciliation report (booking reference, ticket type, amount, status, date; refunds and cancellations included) | A report importer with explicit column mapping; see [doc 48](48-phase12-reconciliation-and-financial-integrity.md). |
| Custom question **"MEKI Booking Reference"** on the form | MEKI issues the reference; the buyer copies it into that question. |
| Zeffy issues tickets, PDFs, QR codes, receipts and handles check-in | MEKI issues **no** tickets, PDFs, QR codes or ticket e-mails for these bookings. |
| Attendee list (names, ticket types, tables, custom answers) | Restricted read-only import; operational only, never proof of payment. |
| A small live purchase/refund test is pending | Applying real reports stays switched off until that test and a real sample file are verified. |

## 2. Integration switches (all OFF by default)

| Variable | Default | Effect | Guard (startup validation) |
|---|---|---|---|
| `GALA_TICKETING_MODE` | `zeffy_hosted` in staging/production, `meki` elsewhere | `zeffy_hosted` = reference-only booking + SDI form | `meki` is **refused** in staging/production |
| `GALA_HOSTED_SALES_ENABLED` | `false` | Booking page offers the reference + SDI form link | Requires `zeffy_hosted` and `ZEFFY_GALA_TICKET_FORM_URL` |
| `SDI_BOOKING_REFERENCE_QUESTION` | `MEKI Booking Reference` | Label shown to buyers | Pattern-validated |
| `SDI_GENERAL_GIVING_ENABLED` | `false` | Exposes the general donation form URL | Requires `ZEFFY_DONATION_FORM_URL` |
| `SDI_PROGRAMME_GIVING_ENABLED` | `false` | Exposes per-programme form URLs | Requires `SDI_PROGRAMME_DESIGNATION_CONFIRMED=true` **and** `SDI_PROGRAMME_FORM_URLS` |
| `SDI_PROGRAMME_FORM_URLS` | unset | JSON `{slug: url}` | https only, host must be on the Zeffy allow-list |
| `SDI_PROGRAMME_DESIGNATION_CONFIRMED` | `false` | Records that SDI confirmed how programme designation reaches MEKI | — |
| `SDI_REPORT_APPLY_ENABLED` | `false` | Lets an approved report change bookings | Apply returns `REPORT_APPLY_DISABLED` while off |
| `ZEFFY_GALA_AUTO_CONFIRM` (8A) | `false` | — | **Refused** together with `zeffy_hosted` |

Documented in `apps/api/.env.example`. The admin status card shows these as on/off and configured/missing only; it never shows a URL or secret.

## 3. Gala booking flow (hosted)

```
Visitor ── POST /public/events/:slug/hosted-bookings ──▶ MEKI: PENDING / UNPAID booking, ticketIssuer = ZEFFY
        ◀── reference EB-XXXXXXXXXXXX + access token ──   (no guests, no phone, no tickets, no capacity hold)
Visitor ── copies reference ──▶ opens SDI's Zeffy form (new tab) ──▶ pays; answers "MEKI Booking Reference"
Zeffy   ── tickets, QR codes, receipt ──▶ buyer's e-mail            (MEKI not involved)
SDI     ── daily report ──▶ MEKI admin: upload → preview → second admin approves → booking CONFIRMED / PAID
```

- **API.** `POST /public/events/:slug/hosted-bookings`: `Idempotency-Key` header, rate-limited, CSRF-exempt like other public booking calls. The body is name, e-mail, `ticketCount`, locale and privacy consent. No price, guest list or phone is accepted; extra fields → 400. The server computes the expected total from its own ticket configuration. That total is only used for reconciliation; it is never charged.
- **Refusals.** In `zeffy_hosted` mode the legacy `POST …/bookings` returns `HOSTED_BOOKING_REQUIRED`. `POST /public/bookings/:ref/checkout` returns `PAYMENT_ON_HOSTED_FORM`.
- **Ticket count.** The visitor's count is an *intention*. SDI's report is authoritative: on confirmation MEKI stores `reportedTicketCount` and updates `guestCount` and `totalAmount` to the paid quantity.
- **No URL pre-fill.** SDI has not confirmed that Zeffy accepts a pre-filled answer, so the reference is never added to the form URL (`referencePrefill: false`). The UI gives a Copy button and step-by-step instructions naming the exact question.
- **Redirects confirm nothing.** Status comes only from `GET /public/bookings/:ref/status`: `awaiting_sdi_report` until an approved report confirms it, then `confirmed_by_sdi`.
- **Web.** `HostedBookingFlow` has three steps: tickets → contact details → reference, copy, instructions and SDI form link. The booking status page for a Zeffy-owned booking shows the SDI instructions while pending and "confirmed by SDI — your tickets come from Zeffy" once confirmed. It never shows a pay button or a ticket list. The Gala page CTA opens only when the API reports `hosted.available`. Arabic and English copy, RTL-safe, with `noopener noreferrer` and no referrer on the external link. A link is shown only if the API returned it **and** it is `https://…zeffy.com` without credentials.

## 4. Ticket ownership: no second ticketing system

A new `EventBooking.ticketIssuer` (`MEKI` | `ZEFFY`, default `MEKI`) records who issues tickets. For `ZEFFY` bookings:

| Path | Behaviour |
|---|---|
| Confirmation (`BookingPaymentsService.succeeded`) | Booking → CONFIRMED / PAID, audit `gala.booking.confirmed {ticketIssuer: ZEFFY, ticketsIssued: 0}`. **No tickets, PDFs, QR codes or e-mail jobs.** |
| Refund (`…refund`) | Booking/payment state updated, audit recorded; no ticket rows touched, no e-mail. |
| `TicketsService.issueInTx`, `regenerateMissing`, admin regenerate, job requeue/resend | `409 TICKETS_OWNED_BY_ZEFFY` |
| Admin booking detail | Resend, regenerate, guest/ticket/PDF card hidden. Shows "Tickets issued by Zeffy", the paid ticket count from SDI's report, the linked SDI orders and the report rows. |
| QR check-in | Nothing to scan in MEKI: Zeffy-owned bookings have no MEKI ticket rows. |

Existing `MEKI` bookings keep every Phase 5B–8A behaviour unchanged (see the regression results in §8).

## 5. Programme and general giving

- `GET /public/hosted-forms` returns `{general:{available,url}, programmeDesignationConfirmed, programmes:[{slug, code, available, url}]}`. A URL appears **only** when its switch is on, and for programmes only when designation is also confirmed. Today every entry is `available:false, url:null`.
- Programme pages show the stable programme code (e.g. `PRG-…`) in the donation panel. While no hosted URL is available, the Phase 11A panel stays exactly as it was: an informational preview, nothing charged, no fake success. When SDI supplies an approved per-programme form and the switches are on, the panel becomes a single "Give on SDI's secure form" link. Amount, frequency (recurring only if SDI's form offers it), donor details and receipt are then all handled by Zeffy. MEKI never sees card data.
- The Phase 11A programme attribution rule, `programmeTotals` and the fundraising dashboard are unchanged. **Hosted gifts are not yet counted in MEKI totals**: SDI has not defined a donation report format (see doc 49, D-5).

## 6. Admin

| Screen | Route | Permission |
|---|---|---|
| SDI reconciliation: status, report list, upload | `/payments/sdi-reconciliation` | `sdi.reports.upload` |
| Report detail: column mapping, period, profiles, preview, rows, export, approve, reject | `/payments/sdi-reconciliation/[id]` | upload; apply and verify mapping need `sdi.reports.approve` and a different user |
| SDI attendee list (read-only) | `/gala/sdi-attendees` | `gala.guests.read` |
| Dashboard card (last report, awaiting, review backlog, missing business days) | `/dashboard` | `sdi.reports.upload` |
| Booking detail additions | `/gala/bookings/[id]` | existing |

New permissions are `sdi.reports.upload` (ADMINISTRATOR, FINANCE_MANAGER) and `sdi.reports.approve` (ADMINISTRATOR), granted by grant version `2026-11-19-phase12-sdi-reports`. The seed was applied to `meki_test` (automatically) and to `meki_dev` after a backup. It created 2 permissions and 1 grant version, and left everything else untouched.

## 7. Data model (additive migration `20261119200000_phase12_sdi_hosted_reconciliation`)

- `EventBooking` gains `ticketIssuer ENUM('MEKI','ZEFFY') DEFAULT 'MEKI'` and `reportedTicketCount INT NULL`. Existing rows become `MEKI`.
- New tables:
  - `ProviderReportImport`: one per uploaded file, unique on `(source, kind, fileSha256)`.
  - `ProviderReportRow`: evaluated rows plus match status and the applied flag.
  - `SdiAttendee`
  - `ProviderReportMapping`: column-mapping profiles with a verification attestation.
- Applied to `meki_test`, then `meki_dev`. `meki_dev` was backed up before both the migration and the seed:
  - `scratchpad/meki_dev-before-phase12-2026-11-19T14-46-54.sql`
  - `scratchpad/meki_dev-before-phase12-seed-2026-11-19T15-23-35.sql` (49 tables, completion marker present)

## 8. Verification

See doc 48 §7 for the full test matrix and recorded results.

## 9. Files

- **API:**
  - `prisma/schema.prisma`, the migration
  - `src/config/env.validation.ts` (`validateSdiHostedConfig`, `parseProgrammeFormUrls`)
  - `src/modules/gala/{bookings.service,booking-payments.service,tickets.service,gala-jobs.service,gala-support,gala.dto,gala.controllers}.ts`
  - `src/modules/sdi/{sdi-report.parser,sdi-reports.service,sdi.module}.ts`
  - `src/modules/public/public.module.ts`, `src/modules/programmes/programmes.service.ts`
  - `src/modules/users/permissions.catalog.ts`, `src/app.module.ts`, `.env.example`
- **API tests:** `test/sdi-env.ts`, `test/phase12-sdi.e2e-spec.ts`
- **Client:** `packages/api-client/openapi.json`, `src/generated/schema.d.ts` (regenerated), `src/public.ts`:
  - `HostedGalaGate`
  - `CreateHostedBookingRequest`
  - `CreatedHostedBooking`
  - `PublicHostedForms`
  - the status additions
- **Web:**
  - `components/booking/{HostedBookingFlow,BookingFlow,BookingStatus}.tsx`
  - `components/programme/ProgrammeDonate.tsx`
  - `app/[locale]/events/gala-night/page.tsx`, `app/[locale]/programs/[slug]/page.tsx`
  - `lib/booking.ts`, `content/booking.ts`, `content/pages.ts`
  - `tests/phase12.test.mjs`; `tests/phase10.test.mjs` (guard updated to the two-mode rule); `tests/e2e/hosted-booking.smoke.mjs` (browser smoke)
- **Admin:**
  - `lib/{sdi,sdi-schemas,i18n-sdi}.ts`, `services/sdi.ts`
  - `features/finance/sdi/*`
  - routes under `payments/sdi-reconciliation` and `gala/sdi-attendees`
  - `features/gala/bookings/BookingDetailPage.tsx`, `lib/gala-schemas.ts`, `lib/navigation.ts`, `lib/i18n.ts`
  - `components/layout/Sidebar.tsx`, `features/dashboard/DashboardPage.tsx`
  - `tests/phase12.test.mjs`; `tests/dashboard.test.mjs` (route list)
