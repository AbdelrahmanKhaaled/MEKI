# 14 — Phase 5B Pre-Implementation Audit (Gala booking, guests & ticketing)

Date: 2026-11-16 · Method: read of the actual repository (nothing assumed from earlier reports).

## 0. Files verified

| Requested | Present? | Note |
|---|---|---|
| `CLAUDE.md` | yes | Guardrails applied (no invented data, never reset DB, payments gated, DEMO vs verified) |
| `AGENTS.md` | **no** | Not present — `CLAUDE.md` is the source of truth |
| `apps/api/README.md` | yes | Safe-migration workflow, conventions, commands |
| `docs/02`, `03`, `04`, `09`, `10`, `11`, `12`, `13` | yes | `13-phase7-qa-report.md` exists |
| `apps/api/prisma/schema.prisma` | yes | 1 220 lines, 4 migrations (phase1_core, phase2_events, phase3_donations, phase3_idempotency_hash) |
| `packages/api-client/` | yes | `openapi.json` + `src/generated/schema.d.ts` (openapi-typescript), `src/public.ts` hand-written public types |
| `client-resources/` | gitignored, local only | Not read: nothing in this phase depends on it (client requirements were supplied in the brief) |

Environment: MySQL 8.4 container `meki-mysql` (port 3307) was stopped at the start of the session and was started (only that container). `meki_dev` and `meki_test` were both "up to date" on migrations. Baseline test run before any change: **14 suites / 193 tests passed**.

## 1. Existing functionality

**Events (Phase 2).** `Event` (bilingual content, `startsAt/endsAt/timezone`, venue, approval, publish snapshots through a 1:1 CMS `Page`), `EventMedia`, `EventCampaign` (promotion link only). Registration modes: only `NONE` and `EXTERNAL_LINK`; they collect no personal data. Seeded `EVT-GALA-NIGHT` / `gala-night` is a **DRAFT skeleton** titled "MEKI Gala Night" with `startsAt = null`, no venue.

**Payments (Phase 3).** Provider-agnostic port `PaymentProviderAdapter` + `PaymentProviderRegistry` (only `mock`, dev/test only, refused in staging/production). `PaymentWebhookEvent` (unique `(provider, providerEventId)`), `WebhooksService` (raw-body signature verify → store → transactional state-guarded handling → idempotent). Money helpers: `Decimal(18,3)`, decimal strings in the API, ISO-4217 minor units, `Currency` table. Ledger `PaymentTransaction` is append-only (DB triggers). `Donation`, `Refund`, `DonationReceipt` cannot be deleted (triggers).

**RBAC / audit.** Permission catalog (`permissions.catalog.ts`) seeded create-only; apply-once `PERMISSION_GRANTS` for existing roles; global guards (throttle → session → CSRF → permissions); `@RequirePermissions`; `AuditService.record(actor, action, entityType, entityId, metadata, tx?)` (append-only table, triggers block UPDATE/DELETE; inside a transaction a failed audit write rolls back).

**Tests.** Jest: unit (`src/**/*.spec.ts`) and integration (`test/*.e2e-spec.ts`, Supertest, `meki_test` only, guard in `load-test-env.ts`, `migrate deploy` + create-only seed in `global-setup.ts`, unique-named rows, no truncation). Existing receipts have a `RECEIPT_PDF_RENDERER` port bound to "not configured".

## 2. Missing functionality (confirmed by grep: no Booking/Guest/Ticket/QR/Check-in/Export code exists)

- Booking, guest, ticket, QR token, check-in, guest-list export, ticket PDF, ICS calendar, booking e-mail templates, private file storage, gala permissions.
- No PDF/QR/XLSX libraries were installed (`pdfkit`, `qrcode`, `exceljs`, `xlsx`, `pdf-lib` all absent). `sharp` is present (used to rasterise the approved SVG logo for the PDF).

## 3. Reuse vs. extend vs. new

| Concern | Decision |
|---|---|
| Event / venue / schedule | **Reuse** `Event` (slug `gala-night`, status PUBLISHED required for sales). Not modified. |
| Provider port, registry, webhook intake, `PaymentWebhookEvent`, idempotency pattern, money helpers, audit, RBAC, throttling, storage conventions | **Reuse** |
| `PaymentAttempt`, `PaymentTransaction`, `Donation`, `Refund` | **Cannot be reused for tickets**: they are keyed by a mandatory `donationId`, and the brief forbids tickets as `Donation` records. Making `donationId` nullable would alter an append-only ledger and risk mixing ticket revenue into donation totals. → parallel **booking-keyed** attempt + ledger tables that reuse the same enums, provider port and webhook table. |
| `PaymentWebhookEvent` | Extended only by a Prisma back-relation (no column change). |
| `WebhooksService` | Extended by a tiny **handler hook** (`registerExternalHandler`) so the gala module handles events whose `attemptReference` starts with `BA-`; donation behaviour is unchanged. |
| Permission catalog / seed | Extended (8 `gala.*` keys, new apply-once grant version, new `EVENT_CHECKIN_STAFF` role). |
| Env validation | Extended with optional vars only. |

**New models:** `EventTicketConfig`, `EventBooking`, `EventBookingGuest`, `EventTicket`, `EventBookingPaymentAttempt`, `EventBookingTransaction`; new enums `EventBookingStatus`, `BookingPaymentStatus`, `TicketStatus`, `FinancialClassification`.

## 4. Relationships

```
Event 1─1 EventTicketConfig            (price, currency, limits, display labels, salesEnabled=false by default)
Event 1─* EventBooking 1─* EventBookingGuest 1─1 EventTicket
EventBooking 1─* EventBookingPaymentAttempt
EventBooking 1─* EventBookingTransaction (append-only ledger; classification = EVENT_TICKET_PAYMENT)
PaymentWebhookEvent 1─* EventBookingTransaction
```
Ticket price lives only in `EventTicketConfig` (server-controlled). Donation totals/reports read only `Donation`/`PaymentTransaction`, so ticket revenue is excluded **by construction**; the gala financial summary reads only the booking ledger and carries the explicit classification. No FMV/tax-deductible field exists and none is invented. No tax receipt is generated for tickets.

## 5. Security considerations

Server-side price; idempotency key + request hash; unguessable references (60-bit CSPRNG) and HMAC-derived booking access token (hash stored) so public status never needs PII; QR = opaque 256-bit random token, only SHA-256 stored; check-in is one conditional `UPDATE … WHERE status='ISSUED'` (atomic); webhook handling mirrors the donation hardening (signature, attempt/session/amount/currency match, unique ledger rows, state guards); tickets issued only inside the payment-confirmation transaction; private PDF storage with server-generated keys, authenticated/token-gated download; CSV formula-injection neutralisation; every admin ticket/booking/export/check-in action audited; PII-free logs; rate limits on all public endpoints; strict event scoping on every admin endpoint (IDOR).

## 6. Migration impact

Additive only: 6 `CREATE TABLE`, new enums inline, FKs `ON DELETE RESTRICT`, append-only triggers on the new ledger and delete-blocking triggers on bookings/guests/tickets. No existing table or row is altered. Applied to `meki_test` and `meki_dev` with `prisma migrate deploy` only (no reset).

## 7. Libraries

Added: `pdfkit` (PDF, ~maintained, pure JS), `qrcode` (QR PNG/matrix). XLSX **not** added (`exceljs` is large and the brief limited it to "if existing dependencies support it"); CSV with UTF-8 BOM opens directly in Excel.
