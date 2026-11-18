# 28 — Phase 6E: Gala Night operations, guest management & check-in (admin)

Date: 2026-11-18. Builds on the Gala backend ([15](15-phase5b-implementation.md), [16](16-phase5b-api-reference.md), [19](19-phase5b1-implementation.md), [21](21-phase5b1-deployment-requirements.md)), the public booking flow ([22](22-phase5c-implementation.md)) and the admin phases [24](24-phase6a-implementation.md) to [27](27-phase6d-website-cms-implementation.md).

Nothing was committed, pushed or deployed. **No schema change and no migration.** Ticket sales were not opened and no payment was executed. The existing booking, ticketing, PDF, QR, job and webhook system is reused unchanged: no second booking system, ticket system or e-mail queue was created.

## 1. Implemented modules and routes

All routes exist under `/en` and `/ar`, in the sidebar group "Event management".

| Route | Module | Page permission (read) | Actions and their permissions |
|---|---|---|---|
| `/gala` | Operations overview | `gala.bookings.read` | — |
| `/gala/bookings`, `/gala/bookings/[id]` | Booking management | `gala.bookings.read` | Edit purchaser/guest, cancel, resend (`gala.bookings.manage`). Regenerate missing PDFs (`gala.tickets.manage`) |
| `/gala/guests` | Guest management | `gala.guests.read` | — (corrections are made on the booking page) |
| `/gala/tickets` | Ticket management | `gala.tickets.read` | Download PDF (`gala.tickets.read`). Revoke, re-issue (`gala.tickets.manage`) |
| `/gala/check-in`, `/gala/check-in/history` | QR check-in | `gala.checkin.validate` | Manual check-in and undo (`gala.checkin.manage`) |
| `/gala/exports` | Guest list export | `gala.guests.export` | CSV / XLSX download |
| `/gala/communications` | Communications | `gala.bookings.read` | Retry a booking's jobs (`gala.bookings.manage`) |
| `/gala/settings` | Gala configuration | `gala.bookings.read` | Event schedule/venue, ticket configuration (`events.manage`). Sales switch (`events.approve`) |

**Event selection.** Every page works on one ticketed event. The default is the Gala Night event (`EVT-GALA-NIGHT`). When more than one ticketed event exists (the test database has many QA events), a selector is shown. The choice is kept in memory only, never in browser storage, and a notice appears when the selected event is not Gala Night.

**Door staff.** The dashboard of a door-staff user (only `gala.checkin.validate`) now links to the scanner.

## 2. Module notes

### Overview (`/gala`)

Everything on the page comes from `GET …/financials`, `…/ticketing`, the public ticketing view and a count of bookings with payment status FAILED.

- **Booking figures:** total, confirmed, pending, cancelled, refund pending / refunded, failed payments, registered guests.
- **Ticket figures:** issued, pending issuance, checked in, not checked in, revoked/refunded.
- **Ticket revenue:** gross, refunded and net, in the configuration currency, labelled "Ticket revenue — not a charitable donation". The figures come only from the ticket ledger (`EVENT_TICKET_PAYMENT`).
- **What is not shown, and why:**
  - **Charitable donations linked to the Gala:** the API has no verified figure, so the page says so instead of showing a number.
  - **Tax-deductible or fair-market value:** none is computed. The admin schema rejects any value other than `null`.
  - **Test-provider records:** excluded by default. A visible "Include test bookings" switch adds them, marked TEST.
  - **Attendance percentage:** shown only when admissible tickets exist (issued + checked in). Otherwise "no percentage".
- **Sales status:** sales switch, online-payment availability, price and capacity ("not configured" when null).

### Bookings

- **List:** server-side pagination, search (reference, purchaser, guest name/e-mail), booking status, payment status, booking-date range (new `from`/`to` filter, §4) and sort (date, amount, status).
- **List columns:**
  - booking: reference, booking date, number of guests
  - purchaser: name, e-mail, phone
  - money and status: amount + currency, booking status, payment status, ticket issuance
- **Detail page** has these sections:
  - **Booking information.**
  - **Guests:** each guest's ticket number, status, issue date, check-in time and PDF availability, with a PDF download.
  - **Payment:** provider and provider reference, checkout attempts, and verified payment events with their classification.
  - **Jobs:** the booking's PDF and e-mail jobs.
  - **Activity:** audit entries.
- **Corrections:** purchaser and guest corrections go through `PATCH …/bookings/:id`. The dialog warns that renaming the holder of an issued ticket rotates its QR code and regenerates the PDF. The API refuses to rename a checked-in ticket.
- **Cancel** needs a reason. An unpaid booking becomes CANCELLED. A paid booking becomes REFUND_PENDING; the refund completes only through a verified provider event.
- **Regenerate** is enabled only when an issued ticket has no PDF, so a valid ticket is never duplicated.
- **Never shown:** booking access tokens and QR tokens.

### Guests

- One row per individual ticket. There are no tables or table reservations.
- Search by name, e-mail, ticket number or booking reference.
- Filters: check-in status, ticket status, payment status.
- The detail dialog links to the booking and the ticket. The guest row now carries `ticketId` and `bookingId` for these links; they are additive and not exported.
- Dietary requirements are free text, so no structured filter exists; the page says this.

### Tickets

- List with search and status filter. The detail dialog shows the QR version and the revoke reason.
- **PDF download** fetches the existing A5 PDF through the authenticated proxy and returns it as a download. API errors (e.g. `TICKET_PDF_UNAVAILABLE`) are shown on screen, never saved as a file.
- **Revoke and re-issue** both need a reason.
- **E-mail resend** works per booking (§ Communications), through the existing queue.

### QR check-in

- **Scanner input:**
  - **Handheld (keyboard-wedge) scanners** type into a masked field and press Enter. The field is a password input, so the token is never displayed, and it is cleared after each scan.
  - **Camera scanning** uses the browser's native `BarcodeDetector`, so **no dependency was added**:
    - The camera starts only on an explicit click, which triggers the permission prompt.
    - Denied or unsupported cameras show a message and keep the manual options.
    - Every camera track is stopped on "Stop" and when the page is left.
- **Validation** uses only `POST …/check-in/validate`. The backend's single conditional UPDATE remains the only write.
- **Repeat protection (client side):** while a request is running nothing else is sent, and the same code is not resent within 2.5 s. A later rescan reaches the server, which answers `ALREADY_CHECKED_IN` and creates no second attendance record.
- **Results:**

  | Result | Meaning shown to staff |
  |---|---|
  | VALID | admit |
  | ALREADY_CHECKED_IN | already used |
  | INVALID | unknown, malformed or other-event code |
  | REVOKED | cancelled ticket |
  | REFUNDED | refunded ticket |
  | PAYMENT_NOT_CONFIRMED | payment not confirmed |

  Each result has its own colour and instruction text, announced through `aria-live`.
- **Verify-only mode** looks a ticket up without checking it in.
- **Live statistics** refresh every 15 s.
- **Manual lookup** by ticket number or guest name (new endpoint, §4) returns minimal fields only: no e-mail, phone, dietary data or amounts.
  - **Manual check-in and undo** need `gala.checkin.manage`. Door staff see "ask a supervisor".
  - **Undo** needs a reason.
- **History** (`/check-in/history`) lists every scan, manual check-in, rejection and undo of the event, read from the audit trail, filterable by action.

### Guest list export

- Uses the existing `GET …/guests/export` in both formats: CSV (UTF-8 BOM) and native XLSX.
- Filters are the guest-list filters, and the page shows how many guests match before downloading.
- **Columns:** booking reference, full name, e-mail, phone, dietary requirements, ticket number, ticket status, payment status, check-in status, booking date.
- **Already handled by the server:**
  - formula-injection protection
  - audit of every export, with its filters and row count
  - the row limit (`EXPORT_TOO_LARGE`)
- **Permissions:** check-in staff and finance cannot export (`gala.guests.export`).
- **RSVP:** no integration. The file is meant to be merged manually with the invited-guest list.

### Communications

- **Job list:** every PDF and e-mail job of the event (new read endpoint, §4) with booking, template, ticket, status, attempts and last error (sanitised by the runner), plus a count per status.
- **Mail transport:** shown on the page.
  - `none` explains that nothing is sent and lists what is still needed.
  - `dev-file` and `memory` are marked as development/test only.
- **Retry** uses the existing `POST …/bookings/:id/resend`, which re-queues FAILED/SKIPPED jobs and runs them. There is no second queue. A job is marked sent only by the job runner after the transport accepted the message.

### Settings

- **Read-only:** event name, slug and status (managed in the Events module).
- **Editable** with `events.manage`, using the existing APIs:
  - **Schedule** (start, end, time zone) and **venue** (name EN/AR, address EN/AR, city), through `PATCH /admin/events/:id`. The fields are empty until MEKI confirms them; the grey ISO examples are placeholders, not values.
  - **Ticket configuration:** price, capacity (empty = no limit), tickets per booking and the Latin-only labels printed on tickets, through `PATCH …/ticketing`.
- **Price changes** need a separate confirmation showing the old and new price.
- **Sales switch:** needs `events.approve` (also enforced by the server) and a confirmation in which the user must type `OPEN`. The dialog warns when online payment is unavailable. **Sales were not opened.**
- **Unsupported settings** (sales start/end dates, early-bird pricing, tables, ticket categories) are listed as unavailable.
- The previously approved information (Every Light Counts · 12 Dec 2026 · 583 Park Avenue · USD 750) is shown as reference only and is not applied.

## 3. Permissions (unchanged catalogue; least privilege)

| Role | Gala access |
|---|---|
| Super Admin / Administrator | Everything above |
| Finance Manager | Read-only: overview, bookings, guests, tickets (incl. PDF download), communications and settings. No export, no check-in, no edits. |
| Event Check-in Staff | Scanner, door lookup (minimal fields), statistics and history only. Bookings, guests, finance and exports return 403. |
| Content Manager / Campaign Manager | No Gala operations page. Their `events.read` gives no booking, guest or financial data. |

The backend enforces every rule itself (the contract checks the 403s; §6). One deliberate addition: `GET /admin/gala/events` accepts *any* Gala read permission or `events.read`. Without it, door staff (who have no `events.read`) could not find the event ID.

## 4. API changes (additive, read-only)

| Change | Permission | Purpose |
|---|---|---|
| `GET /admin/gala/events` | any of `gala.bookings.read`, `gala.guests.read`, `gala.tickets.read`, `gala.checkin.validate`, `events.read` | Lists ticketed events (id, code, slug, title, status, start, time zone) |
| `GET /admin/events/:id/jobs` | `gala.bookings.read` | Job list (status/type/reference filters), per-status count, mail transport `{name, delivers}` |
| `GET /admin/events/:id/check-in/lookup?q=` | `gala.checkin.validate` | Door lookup: 3–60 characters, max. 10 rows, minimal fields, rate-limited, does not check in |
| `GET /admin/events/:id/check-in/history` | `gala.checkin.validate` | Check-in history from the audit trail, filterable by action |
| `GET …/bookings?from=&to=` | existing | Booking-date range filter (ISO-8601) |
| Guest rows: `ticketId`, `bookingId` | existing | Links from the guest list (not exported) |
| Undo-check-in audit entry now includes `eventId` | — | So the history can show undos |

Files: `gala-ops.controller.ts`, `gala-ops.service.ts`, `gala.dto.ts`, `bookings.service.ts`, `guests.service.ts`, `checkin.service.ts`, `gala.module.ts`. Test: `test/gala-6e.e2e-spec.ts`.

The generated OpenAPI client (`packages/api-client`) was not regenerated. The admin uses its own zod schemas (`lib/gala-schemas.ts`), which the contract script validates against the running API.

## 5. Zeffy / SDI payment integration — status after code inspection

| Question | Current implementation | Missing |
|---|---|---|
| How is a hosted checkout created? | `POST /public/bookings/:ref/checkout` → `PaymentProviderRegistry` → `adapter.createSession({attemptReference, donationReference: bookingRef, classification: EVENT_TICKET_PAYMENT, amount, currency, returnUrl, cancelUrl})`. The registry contains only the dev/test **mock** provider. | **A Zeffy (or Givebutter) adapter.** It needs a way to create a checkout per booking, or a confirmed alternative such as a prepared Zeffy form whose metadata carries our reference. **A read-only API key cannot create checkouts.** |
| How is it tied to our booking? | Each attempt has a unique `BA-…` reference that the provider must echo back (`attemptReference`). Attempts are unique per `(provider, sessionRef)` and `(provider, paymentRef)`. | Confirmation from SDI/Zeffy that a custom reference or metadata field is echoed in webhooks. |
| How does a verified payment arrive? | `POST /webhooks/:provider`: signature check → stored `PaymentWebhookEvent` → `BookingPaymentsService` (CONFIRMED + PAID + ticket issue + outbox jobs in one transaction). | Zeffy's webhook signature scheme and event payload, so the adapter can verify and normalise them. |
| Reconciliation | Status changes only from verified events. **No scheduled reconciliation job exists.** | Optional: a reconciliation job using SDI's read-only Zeffy API (transaction report), if SDI confirms it returns our reference and the refund state. |
| Refunds | `refund.succeeded` events mark ticket refunds (ledger REFUND, tickets REFUNDED). Admin cancel → REFUND_PENDING. | SDI's confirmation that refunds and failures are notified. Until then a refund done in Zeffy stays REFUND_PENDING in MEKI. |
| Deduplication | `PaymentWebhookEvent` is unique per `(provider, providerEventId)`. The ledger is unique per `(provider, providerTransactionRef, type)`. Jobs are unique per `dedupeKey`. | — |
| Failed / late notifications | `payment.failed` / `cancelled` are handled. Webhook rows record attempts and errors. Bookings stay PENDING until a verified event arrives. | The same reconciliation question as above. Also an operational procedure for late events (SDI). |

**Blocker:** the hosted-checkout creation mechanism, the webhook contract and refund/failure notifications from Zeffy/SDI are still unconfirmed. No adapter was written and nothing was enabled. In production `checkoutAvailable` stays false, so the public booking form stays closed even if sales were opened. Card data never touches MEKI, and payments go directly to SDI.

## 6. Tests and results (2026-11-18)

| Check | Data | Result |
|---|---|---|
| API e2e, full suite (`npx jest --runInBand`, `meki_test`) | real test DB (mock provider) | **21 suites, 350/350** (new `gala-6e.e2e-spec.ts`: 5 tests — event resolver incl. door staff, jobs list + event scope + 403, door lookup minimal fields / ≥ 3 chars / 403 / no check-in, history of valid + duplicate + invalid + manual + undo with one attendance record, date filter) |
| Admin unit tests (`pnpm --filter @meki/admin test`) | pure logic | **149/149** (new `gala.test.mjs`: event choice, KPIs with no invented percentage, issuance, gates, scan guard, QR/price patterns compared with the API source, financial schema rejects donation class and tax values, i18n EN/AR parity, least-privilege navigation, static guards: no storage/network/fake data, no donation-report imports, masked scan input, camera release, confirmations) |
| Web unit tests | pure logic | 44/44 |
| Gala contract (`tests/e2e/gala-contract.mjs`, GET only) | **real API**, QA fixture + Gala Night | **34/34**, including the staff and finance 403s |
| 6A / 6B / 6C contracts | real API | still passing (re-run in 6D) |
| Browser smoke (`tests/e2e/gala.smoke.mjs`, admin build → test API) | **real API + real DB**, QA fixture | **101/101**: every module, the check-in states (valid, duplicate, revoked, refunded, invalid, verify-only), manual check-in + undo, CSV/XLSX + audit, retry, settings safeguards, 4 roles, EN/AR at 1440/768/390 with no overflow, no console errors |
| `pnpm turbo run typecheck lint build --force --concurrency=1` | — | **10/10 tasks**, 0 errors (admin 3 / web 3 pre-existing lint warnings) |

**Real data vs. test fixtures.** Everything ran against the real API and a real database (`meki_test`). No stub was needed.

- **QA fixture:**
  - **What it is:** one isolated ticketed event (`EVT-P6E-…`, DRAFT, sales closed, DEMO config) with test-flagged bookings, tickets with known QR tokens, ledger rows and two job rows. The tickets' QR secrets are known only through it.
  - **How it was made:** a temporary script, deleted afterwards. It was created twice more for clean reruns; each run left one such event and four `p6e-…@meki.test` accounts in `meki_test`, and nothing was erased.
- **Ticket PDF:** the download used a real PDF already stored for an earlier QA booking.
- **Not verified here:**
  - **Camera:** headless Chrome reported "unsupported", so the fallback was tested; a real camera scan was not.
  - **E-mail:** in the test environment the transport is `memory`; real delivery is not possible until a provider exists.

**Found and fixed during verification:**

- Gala gate reasons would have shown as raw keys. A dedicated `GalaGateNotice` now translates them, with a static test.
- Switching events could briefly show the previous event's rows. Placeholder data is now kept per event only.
- The "Include test bookings" checkbox flicked back until the URL updated. It is now optimistic.
- One transient `ECONNRESET` between the Next proxy and the test API was seen once, on one GET; the UI showed its retry state.

## 7. Known limitations

- **Resend is per booking.** It re-queues the booking's failed/skipped jobs; there is no per-ticket e-mail endpoint. Confirmation and ticket e-mails are also re-queued together for a confirmed booking.
- **Door lookup check-in.** Door staff can look tickets up but not check them in manually (`gala.checkin.manage`, by design). A supervisor account is needed at the door.
- **Camera scanning** needs a browser with `BarcodeDetector` (Chrome/Edge/Android). Elsewhere, use a handheld scanner or the lookup.
- **Failed payments KPI** counts bookings whose payment status is FAILED. Individual failed attempts appear on the booking page.
- **Dietary requirements** are free text with no structured filter. The API also has no export column selection; check-in staff simply have no export access.
- **Test vs. real databases.** `meki_test` contains hundreds of QA ticketed events, so the event selector is long there. In `meki_dev`/production normally only Gala Night is ticketed.

## 8. Remaining SDI / MEKI approvals and deployment requirements

1. **SDI / Zeffy:**
   - hosted-checkout creation mechanism (or the agreed alternative)
   - webhook signature and payload, including our reference
   - refund and failure notifications
   - read-only API scope for reconciliation
   - checkout host names for `NEXT_PUBLIC_CHECKOUT_ALLOWED_HOSTS`
   - a coordinated small live payment + refund test
2. **MEKI — e-mail provider choice.** Then:
   - an adapter for the `MailTransport` port
   - credentials in environment variables
   - SPF/DKIM for the sending domain
   - switching `MAIL_TRANSPORT` from `none`
3. **MEKI — event details:** start/end time and time zone (needed for the calendar file), capacity (currently not configured), confirmation of the ticket labels.
4. **MEKI + SDI — sales:** approval to open sales. Only after (1) and the end-to-end payment test. An account with `events.approve` then opens them in `/gala/settings`.
5. **MEKI — door access:** who gets `gala.checkin.manage` (supervisors for manual check-in and undo), and whether door staff may see guest names in the lookup (current choice: names and ticket numbers only).
6. **MEKI — copy:** Arabic interface text (technical draft).
7. **Deployment:**
   - the API must expose the new read endpoints (no migration)
   - the admin needs `ADMIN_API_UPSTREAM`
   - private ticket storage must be persistent
   - the job poller must run
