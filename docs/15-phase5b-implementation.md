# 15 — Phase 5B Implementation: Gala booking, guests & ticketing foundation

> **Updated by Phase 5B.1 ([19](19-phase5b1-implementation.md)):** Arabic/Unicode PDF names, XLSX export, retryable outbox jobs and a mail-transport port now exist; statements below that say “XLSX not implemented”, “non-Latin names print as `?`” or that e-mail has no retry describe the Phase 5B state.

Status: implemented in `apps/api/src/modules/gala`, migration `20261116100000_phase5b_gala_booking`. Audit: [14](14-phase5b-audit.md) · API: [16](16-phase5b-api-reference.md) · Tests: [17](17-phase5b-testing-report.md).

## 1. Architecture

```
public web (later phase) ──► /public/events/:slug/{ticketing,bookings,calendar.ics}
                             /public/bookings/:reference/{status,confirmation,checkout,tickets/:no/pdf}
admin dashboard  (later) ──► /admin/events/:eventId/{ticketing,bookings,guests,tickets,check-in,financials}

GalaModule (imports DonationsModule for the provider port + webhook pipeline only)
 ├─ BookingsService         create (idempotent, transactional), public status, checkout, admin list/get/patch/cancel, financials
 ├─ BookingPaymentsService  trusted payment confirmation — registered as an ExternalWebhookHandler (prefix "BA-")
 ├─ TicketsService          issue (in the payment transaction), PDF render+store, re-issue (QR rotation), revoke, list
 ├─ CheckInService          atomic scan/check-in, manual check-in, undo, statistics
 ├─ GuestsService           combined guest list + CSV export
 ├─ TicketConfigService     server-side price / limits / sales switch
 ├─ TicketPdfService        pdfkit + qrcode + sharp (approved logo rasterised from the official SVG)
 ├─ GalaEmailComposer       builds final messages (recipient, body, PDF attachment); sends nothing
 └─ calendar.ts, gala.rules.ts, gala-email.templates.ts, ticket-storage.ts  (pure / small adapters)
```

**Reused, not duplicated:** `PaymentProviderAdapter` + `PaymentProviderRegistry`, `PaymentWebhookEvent` (signature verification on the raw body, unique `(provider, eventId)`), the webhook transaction pipeline, `DonationConfigService.availability()` (same four payment gates), money helpers, `AuditService`, RBAC guards, throttling, response envelope, Idempotency-Key convention.

**Only change to existing donation code:** `WebhooksService` gained `registerExternalHandler()` — events whose `attemptReference` starts with `BA-` go to the booking handler inside the same pipeline; everything else follows the original path unchanged. `CreatePaymentSessionInput` gained an optional `classification`. `DonationsModule` additionally exports `DonationConfigService` and `WebhooksService`.

## 2. Database changes (additive; no existing table altered)

| Model | Purpose |
|---|---|
| `EventTicketConfig` | One per event: `ticketPrice` (Decimal 18,3), `currency`, `salesEnabled` (default **false**), `maxTicketsPerBooking`, `capacity` (null = unlimited, never invented), printed labels (`displayNameEn`, `eventDateLabelEn`, `venueLabelEn`, `checkInNoteEn`) |
| `EventBooking` | One checkout. `publicReference` (`EB-…`), `accessTokenHash`, idempotency key + request hash, purchaser fields, `guestCount`, `unitPrice`, `totalAmount`, `currency`, `classification` (default `EVENT_TICKET_PAYMENT`), `bookingStatus`, `paymentStatus`, provider refs, `refundedAmount`, `isTest` |
| `EventBookingGuest` | One row per guest ticket (name, e-mail, phone, dietary requirements, `isPurchaser`), `UNIQUE(bookingId, position)` |
| `EventTicket` | One per guest (`guestId` unique): `ticketNumber` (`TK-…`), `qrTokenHash` (SHA-256, unique, null until issued), `status`, `issuedAt`, `checkedInAt/ById`, `revokedAt/ById/Reason`, private `pdfStorageKey`, `tokenVersion` |
| `EventBookingPaymentAttempt` | Booking-keyed hosted-checkout attempt (reference `BA-…`) |
| `EventBookingTransaction` | **Append-only** ledger of verified ticket events, `classification` column |

Enums: `EventBookingStatus` (PENDING, CONFIRMED, CANCELLED, REFUND_PENDING, REFUNDED), `BookingPaymentStatus` (UNPAID, PENDING, PAID, FAILED, REFUNDED), `TicketStatus` (PENDING, ISSUED, CHECKED_IN, REVOKED, REFUNDED), `FinancialClassification` (CHARITABLE_DONATION, EVENT_TICKET_PAYMENT). Existing `PaymentAttemptStatus`, `PaymentTransactionType/Status` are reused.

Triggers (same pattern as Phase 3): `EventBookingTransaction` UPDATE/DELETE blocked; DELETE blocked on `EventBooking`, `EventBookingGuest`, `EventTicket`, `EventBookingPaymentAttempt`. All FKs `ON DELETE RESTRICT`.

Why not link `donorId` / `PaymentAttempt`: `PaymentAttempt`/`PaymentTransaction` require a `donationId`, and tickets must not be `Donation` rows (see audit §3). The booking keeps purchaser data itself; no `Donor` record is created.

**Applied** to `meki_test` then `meki_dev` with `prisma migrate deploy` (dev backup taken first). Both: 43 tables, 14 triggers, zero column differences. Production: apply the same migration with `migrate deploy` after a verified backup; no data migration is needed.

## 3. Booking lifecycle

```
POST /public/events/:slug/bookings   (Idempotency-Key)           booking PENDING / payment UNPAID / tickets PENDING
POST /public/bookings/:ref/checkout  (token)  [needs approved provider]   payment PENDING   (hosted checkout URL)
            │  browser returns — changes NOTHING
verified provider webhook payment.succeeded ──► (one DB transaction)
   attempt SUCCEEDED · ledger CAPTURE · booking PAID+CONFIRMED · tickets ISSUED (QR token + hash) · audit
   after commit: PDFs rendered + stored · notifications requested
payment.failed ─► payment FAILED (booking stays PENDING, retry allowed)
payment.cancelled ─► payment back to UNPAID (a cancelled checkout is not a failed payment)
admin cancel: unpaid → CANCELLED | paid → REFUND_PENDING   (tickets revoked)
refund.succeeded (full amount) ─► booking+payment REFUNDED, tickets REFUNDED, ledger REFUND
```

Safety rules in the handler: our attempt reference, stored provider session, exact amount **and** currency equal to the server-calculated total; duplicate event id → ignored; second event for an already-succeeded attempt → ignored; second capture on a paid booking and money arriving on a cancelled booking are recorded in the ledger, issue nothing and are flagged `REVIEW … refund required`. Only **full** refunds are supported; any other amount is rejected for manual review. Seat capacity (when configured) is serialised with `SELECT … FOR UPDATE` on the config row; unpaid holds expire after `EVENT_BOOKING_HOLD_MINUTES`.

## 4. Ticket & QR lifecycle

PENDING (created with the booking, no token) → ISSUED (inside the payment transaction: 256-bit CSPRNG token `mkt_…`, only SHA-256 stored) → CHECKED_IN | REVOKED | REFUNDED. The QR contains only the opaque token — no e-mail, phone, id or booking detail; it is never printed as text and never stored. **Re-issue** (admin, `gala.tickets.manage`, also automatic when an issued ticket's guest name is edited) writes a new hash first, so the old QR dies immediately, then regenerates the PDF. Check-in is one conditional `UPDATE … WHERE status='ISSUED' AND qrTokenHash=? AND booking is CONFIRMED+PAID`; of simultaneous scans exactly one succeeds (tested with 8 parallel scans). Results: `VALID`, `ALREADY_CHECKED_IN`, `INVALID` (malformed/unknown/other-event, no detail), `REVOKED`, `REFUNDED`, `PAYMENT_NOT_CONFIRMED`. Every check-in, rejection, manual check-in, undo, revoke and re-issue is audited with the staff member.

## 5. PDF tickets

A5-landscape, one per guest, built only after verified payment: official MEKI white logo (rasterised from `apps/api/assets/brand/MEKI_Primary_White.svg`, a byte-identical copy of the web brand file), "Every Light Counts", date, venue, guest name, ticket number, booking reference, QR, check-in instructions; deep green `#0b3b30` panel, MEKI green and restrained gold `#d6a146`. Stored in **private storage** (`PRIVATE_STORAGE_DIR`, server-generated unguessable keys, never served statically, keys never returned by any endpoint). Download: purchaser with booking token (confirmed + paid + valid ticket only) or admin with `gala.tickets.read`, always event-scoped.

Fonts: pdfkit's built-in Times/Helvetica/Courier (no font files are vendored). They cover Latin-1 only; guest names with other scripts print as `?` unless `TICKET_PDF_UNICODE_FONT_PATH` points to a TTF with the needed coverage (pure-RTL strings are reversed into visual order because pdfkit has no bidi support — **not visually verified**, see doc 17).

## 6. Guest list export

`GET …/guests` (JSON, paginated) and `GET …/guests/export` (CSV, UTF-8 BOM, CRLF, `Cache-Control: no-store`, attachment). Columns: Booking Reference, Guest Full Name, Email, Phone, Dietary Requirements, Ticket Number, Ticket Status, Payment Status, Check-in Status, Booking Date. Filters: payment status, ticket status, check-in status, search (name/e-mail/reference/ticket); scoped to one event; test-provider bookings excluded unless `includeTest=true`. Formula injection is neutralised (cells starting `= + - @ TAB CR LF` get a leading `'`; plain `+digits` phone numbers are left intact). Capped at 20 000 rows. Each export is audited (filters, row count). **XLSX is not implemented** (no spreadsheet library is installed; `format=xlsx` returns `422 FORMAT_NOT_SUPPORTED`). The CSV is designed to be merged manually with MEKI's invited-guest (RSVP) list; there is no RSVP integration.

## 7. E-mail foundation

Six English templates (`booking.pending`, `booking.confirmed`, `ticket.delivery`, `payment.failed`, `booking.cancelled`, `ticket.refunded`) in `gala-email.templates.ts`. "Confirmed" wording appears only in templates sent after verified payment, and the composer refuses to build them otherwise. The confirmation contains thank-you, reference, date, venue, calendar link (or a "calendar will follow" note while the schedule is pending), guests with ticket numbers and a secure token link; `ticket.delivery` attaches the guest's PDF. **No provider is configured**: the default `LogGalaNotifier` logs only `type + booking reference` and states `NOT SENT`; it never logs names, e-mails, phones, tokens or amounts. To go live, implement `GalaNotifier` (call `GalaEmailComposer.compose()`, then send via the chosen provider) and bind it to `GALA_NOTIFIER`. Arabic templates need MEKI-approved translations (not invented).

## 8. Calendar

`GET /public/events/:slug/calendar.ics` returns an RFC 5545 file in UTC with the confirmed IANA zone stated in the description. **Pending by design:** without `Event.startsAt` **and** `Event.timezone` it answers `409 CALENDAR_PENDING`; `DTEND` is omitted until `endsAt` is confirmed. Nothing is defaulted. The e-mail/confirmation payload reports `calendar.available=false` until then.

## 9. Permissions

| Permission | ADMINISTRATOR | FINANCE_MANAGER | EVENT_CHECKIN_STAFF (new) | CONTENT / CAMPAIGN MANAGER |
|---|:-:|:-:|:-:|:-:|
| `gala.bookings.read` (also financials) | ✓ | ✓ | | |
| `gala.bookings.manage` | ✓ | | | |
| `gala.guests.read` | ✓ | ✓ | | |
| `gala.guests.export` | ✓ | | | |
| `gala.tickets.read` | ✓ | ✓ | | |
| `gala.tickets.manage` | ✓ | | | |
| `gala.checkin.validate` | ✓ | | ✓ | |
| `gala.checkin.manage` | ✓ | | | |

SUPER_ADMIN bypasses as everywhere. Opening ticket sales (`salesEnabled`) additionally requires `events.approve`; price/limits/labels need `events.manage`. New role grants for **existing** databases use a new apply-once `PERMISSION_GRANTS` version (`2026-11-16-phase5b-gala`); admins' later role edits are never overwritten. Campaign Managers gain nothing (no gala, no refund approval).

## 10. Environment variables (all optional; see `.env.example`)

`EVENT_BOOKING_TOKEN_SECRET` (≥32 chars; falls back to `DONATION_TOKEN_SECRET`), `EVENT_BOOKING_RETURN_URL` (`{locale}`, `{slug}`), `EVENT_BOOKING_HOLD_MINUTES` (60), `PRIVATE_STORAGE_DIR` (`./storage/private`), `TICKET_PDF_UNICODE_FONT_PATH`. Ticket checkout additionally needs the existing payment gates: `PAYMENTS_ENABLED`, `PAYMENT_PROVIDER`, enabled `PaymentProvider` row, `DonationSetting.paymentsEnabled`. **The mock provider remains forbidden in staging/production** (unchanged env validation).

## 11. Deployment requirements

1. Backup, then `prisma migrate deploy` (additive). 2. `db:seed` (create-only): adds the 8 permissions, `EVENT_CHECKIN_STAFF`, the apply-once grant, and the Gala `EventTicketConfig` (USD 750, **sales closed**). 3. Persistent, non-public, backed-up `PRIVATE_STORAGE_DIR` volume (or implement the S3 adapter — `PrivateStoragePort` is the only seam). 4. Set a ≥32-char `EVENT_BOOKING_TOKEN_SECRET`. 5. Trust-proxy/rate-limit store as already required by Phase 3 (per-process memory limits are not shared across instances). 6. Choose and wire an e-mail provider. 7. Provider adapter + credentials (Zeffy, see §12). 8. Ship `apps/api/assets/brand/` with the API build (the ticket PDF reads the logo from there at runtime; `dist/` does not copy it).

## 12. Payment-provider boundary (Zeffy)

Nothing Zeffy-specific is implemented or invented. A provider plugs in by implementing `PaymentProviderAdapter` (`createPaymentSession` for hosted checkout, `verifyWebhookSignature`, `parseWebhook` → `NormalizedWebhookEvent` carrying our `attemptReference`). Because Zeffy's API is described as read-only and offers no sandbox, three things must be confirmed with SDI/Zeffy before the adapter can be written: (a) how a hosted checkout is created or pre-configured and how our `attemptReference`, amount and currency are bound to it; (b) what authenticated notification (webhook/export) proves a payment and a refund; (c) whether a verified server-side status query exists. Until then `/checkout` returns `503 PAYMENTS_UNAVAILABLE`, `salesEnabled` stays false, and the browser return URL can never confirm anything.

## 13. Remaining client decisions

**MEKI:** approve opening sales; capacity / max tickets per booking; event start/end time and timezone (calendar); Arabic copy for tickets/e-mails; refund policy (cancellation window, partial refunds); privacy/retention for guest and dietary data; who may be given the door-staff role; invited-guest list handling.
**SDI / Zeffy:** hosted-checkout mechanism and reference binding, verified payment/refund notification, merchant details, live test (small payment + refund) schedule; **fair-market value of dinner and program** (needed before any tax wording — none is stated or computed anywhere); confirmation that SDI issues all tax receipts; ticket-revenue reconciliation format.
