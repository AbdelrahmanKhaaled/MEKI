# 16 — Phase 5B API reference (Gala booking & ticketing)

Base: `/api/v1`. Success `{ data }` / `{ data, meta }`; errors `{ error: { statusCode, code, message, details?, requestId } }`. Money is always a **decimal string** (`"750.00"`). The OpenAPI document (`packages/api-client/openapi.json`) and the typed client (`packages/api-client/src/generated/schema.d.ts`) were regenerated with the repository tooling and contain all endpoints below (163 paths, +24).

Admin routes need the HttpOnly session cookie and, for mutations, `X-CSRF-Token`. Every admin route is **scoped to `:eventId`**: the booking/ticket must belong to that event (otherwise 404). Test-provider records are excluded from admin lists/exports/financials unless `includeTest=true`.

## Public (no session)

| Method & path | Notes |
|---|---|
| `GET /public/events/:slug/ticketing` | Offer: `ticket {name, type:"INDIVIDUAL", price, currency, tablesAvailable:false}`, `classification:"EVENT_TICKET_PAYMENT"`, `salesOpen`, `soldOut`, `maxTicketsPerBooking`, `checkoutAvailable`, `calendar {available, url? \| reason:"SCHEDULE_PENDING"}`, event labels. 404 unless the event is PUBLISHED and has ticketing. |
| `POST /public/events/:slug/bookings` | Header `Idempotency-Key` (16–80 chars, required). Body `{ purchaser:{fullName,email,phone}, guests:[{fullName,email,phone,dietaryRequirements,isPurchaser?}] (1–50), ticketCount? (must equal guests.length), locale?, privacyConsent:true }`. **No price field exists; any extra property → 400.** Returns 201 `{ reference, accessToken, bookingStatus:"PENDING", paymentStatus:"UNPAID", ticketCount, unitPrice, totalAmount, currency, classification, isTest }` (+`replayed:true` on replay). Errors: 400 validation / `IDEMPOTENCY_KEY_REQUIRED` / `INVALID_PHONE`; 409 `IDEMPOTENCY_KEY_REUSED`; 422 `TICKET_SALES_CLOSED`, `TICKET_COUNT_MISMATCH`, `TOO_MANY_TICKETS`, `DUPLICATE_GUEST`, `INSUFFICIENT_CAPACITY`. Rate limit: `DONATION_RATE_LIMIT_PER_MINUTE` per IP. |
| `GET /public/bookings/:reference/status` · `/confirmation` | Token via `X-Booking-Token` header or `?token=`. Unknown reference and wrong token both → 404. Returns `{ reference, bookingStatus, paymentStatus, confirmed, message (awaiting_payment\|processing\|payment_failed\|confirmed\|cancelled\|refund_pending\|refunded), ticketCount, totalAmount, currency, event{…}, calendar{…}, tickets:[{ticketNumber,status,downloadPath}] }`. **No guest/purchaser PII, provider ids or tokens.** `confirmed` is true only after a verified provider event; tickets are listed only then. 60 req/min/IP. |
| `POST /public/bookings/:reference/checkout` | Header `X-Booking-Token`. Starts or reuses a provider-hosted checkout → `{ attemptReference, checkoutUrl, expiresAt, provider, isTest }`. 503 `PAYMENTS_UNAVAILABLE` until every payment gate is open; 409 `BOOKING_ALREADY_PAID`; 422 `BOOKING_NOT_PAYABLE` / `TICKET_SALES_CLOSED` / `CURRENCY_NOT_SUPPORTED`; 502 `PROVIDER_UNAVAILABLE`. |
| `GET /public/bookings/:reference/tickets/:ticketNumber/pdf` | Booking token required. 200 `application/pdf` (`no-store`, attachment). 404 for wrong token, other booking's ticket, pending/revoked/refunded ticket, or unconfirmed booking. |
| `GET /public/events/:slug/calendar.ics` | `text/calendar`. 409 `CALENDAR_PENDING` until the event has `startsAt` + `timezone`. |

Provider webhooks keep using the existing `POST /webhooks/:provider`; events whose `attemptReference` starts with `BA-` are handled as ticket payments (idempotent, signature-verified).

## Admin — `/admin/events/:eventId/…`

| Method & path | Permission | Notes |
|---|---|---|
| `GET /ticketing` | `gala.bookings.read` | Ticket configuration |
| `POST /ticketing` | `events.manage` | Create (`ticketPrice`, `displayNameEn`, `eventDateLabelEn`, `venueLabelEn`, optional `currency`, `maxTicketsPerBooking`, `capacity`, `checkInNoteEn`); starts with sales **closed**; 409 if exists |
| `PATCH /ticketing` | `events.manage` (+ `events.approve` to change `salesEnabled`) | Price must match `^[1-9]\d{0,8}(\.\d{1,2})?$`; audited with old/new price |
| `GET /bookings` | `gala.bookings.read` | `page,pageSize,search,sort,bookingStatus,paymentStatus,includeTest` |
| `GET /bookings/:bookingId` | `gala.bookings.read` | Booking + guests (+ticket status) + attempts + ledger. Never returns hashes, idempotency data, storage keys |
| `PATCH /bookings/:bookingId` | `gala.bookings.manage` | `purchaserName/Email/Phone`, `guests:[{id,fullName?,email?,phone?,dietaryRequirements?}]`. 409 when REFUNDED/CANCELLED/REFUND_PENDING; renaming an **issued** ticket rotates its QR + regenerates the PDF; checked-in names are locked. Audit stores changed field **names** only |
| `POST /bookings/:bookingId/cancel` | `gala.bookings.manage` | `{reason}`. Unpaid → `CANCELLED`; paid → `REFUND_PENDING`; tickets revoked; 409 if already closed; 422 if a guest is checked in |
| `POST /bookings/:bookingId/regenerate-tickets` | `gala.tickets.manage` | Re-issues ISSUED tickets that have no PDF; 422 unless confirmed + paid |
| `GET /financials` | `gala.bookings.read` | `{ classification:"EVENT_TICKET_PAYMENT", currency, grossCaptured, refunded, net, capturedPayments, refundPayments, bookingsByStatus, ticketsByStatus, taxTreatment:{ taxDeductibleAmount:null, fairMarketValueProvided:false, note } }` — ticket ledger only, never mixed with donations |
| `GET /guests` | `gala.guests.read` | One row per guest ticket. Filters `paymentStatus, ticketStatus, checkInStatus(CHECKED_IN\|NOT_CHECKED_IN), search, includeTest` |
| `GET /guests/export` | `gala.guests.export` | `format=csv` (default). `xlsx` → 422 `FORMAT_NOT_SUPPORTED`. `text/csv; charset=utf-8`, UTF-8 BOM, `attachment`, `no-store`, formula-injection safe, audited, ≤20 000 rows (`EXPORT_TOO_LARGE`) |
| `GET /tickets` · `GET /tickets/:ticketId` | `gala.tickets.read` | Guest name/e-mail/phone/dietary, booking ref/status, `hasPdf` |
| `GET /tickets/:ticketId/pdf` | `gala.tickets.read` | PDF from private storage; 404 `TICKET_PDF_UNAVAILABLE` when none |
| `POST /tickets/:ticketId/revoke` | `gala.tickets.manage` | `{reason}`; 422 if checked in; 409 if already revoked/refunded |
| `POST /tickets/:ticketId/reissue` | `gala.tickets.manage` | `{reason}` → `{ticketNumber, pdfGenerated}`; the previous QR stops working immediately; only ISSUED tickets |
| `POST /check-in/validate` | `gala.checkin.validate` | `{ token, verifyOnly? }` → `{ result, ticket? }` with `result` ∈ `VALID, ALREADY_CHECKED_IN, INVALID, REVOKED, REFUNDED, PAYMENT_NOT_CONFIRMED`. `ticket` = `{ticketNumber, guestName, bookingReference, status, checkedInAt}` (omitted for `INVALID`). Atomic; 300 req/min/IP |
| `GET /check-in/statistics` | `gala.checkin.validate` | `{ validTickets, checkedIn, remaining, percentCheckedIn, byStatus }` |
| `POST /tickets/:ticketId/check-in` | `gala.checkin.manage` | Manual check-in; 422 with the blocking result code, otherwise 409 if raced |
| `POST /tickets/:ticketId/undo-check-in` | `gala.checkin.manage` | `{reason}`; audited |

## Audit actions written

`gala.booking.confirmed`, `gala.booking.payment_after_cancellation`, `gala.booking.refunded` (system actor, from verified provider events); `gala.booking.update`, `gala.booking.cancel`, `gala.booking.regenerate_tickets`, `gala.ticket.revoke`, `gala.ticket.reissue`, `gala.checkin.checked_in`, `gala.checkin.rejected`, `gala.checkin.manual`, `gala.checkin.undo`, `gala.guests.export`, `gala.ticketing.create`, `gala.ticketing.update`. Metadata never contains guest PII, tokens or hashes (rejected scans keep only an 8-character hash prefix).

## Statuses at a glance

Booking: `PENDING → CONFIRMED → REFUND_PENDING → REFUNDED`, or `PENDING → CANCELLED`. Payment: `UNPAID → PENDING → PAID → REFUNDED`, `FAILED` retryable. Ticket: `PENDING → ISSUED → CHECKED_IN`; `REVOKED`, `REFUNDED` are terminal for entry.
