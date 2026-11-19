# 48 — Phase 12: SDI report reconciliation and financial integrity

Date: 2026-11-19.

**Scope:** how SDI's daily report becomes booking state in MEKI, and the rules that stop a wrong, duplicated or forged confirmation. The implementation overview is in [doc 47](47-phase12-sdi-hosted-forms-implementation.md).

**Status of the real format:** SDI has **not** yet sent a sample report. Nothing assumes column names. Every test file is a **synthetic fixture**: it is flagged `isSynthetic`, has `SYNTHETIC` in its file name, shows a badge in the admin, and is refused in staging/production.

## 1. Pipeline

```
upload (sdi.reports.upload) ─▶ UPLOADED: file stored privately, headers read, SHA-256 recorded — nothing evaluated
preview (sdi.reports.upload) ─▶ PREVIEWED: mapping validated, every row classified — NO booking or money change
apply  (sdi.reports.approve, different user) ─▶ APPLIED: one DB transaction re-evaluates and applies MATCHED rows only
reject (sdi.reports.upload) ─▶ REJECTED: kept for audit, never applicable
```

Every step is audited:

- `sdi.report.upload`, `sdi.report.preview`, `sdi.report.apply`, `sdi.report.reject`, `sdi.report.export`;
- `sdi.mapping.create`, `sdi.mapping.update`, `sdi.mapping.verify`;
- per booking: `gala.booking.confirmed`, `gala.booking.refunded`, `gala.booking.cancelled`.

## 2. File safety

| Threat | Control |
|---|---|
| Oversized / zip-bomb | 5 MB multer limit **and** a service check; at most 20 000 rows, 80 columns, 2 000-character cells, 120-character headers |
| Wrong type | Extension `.csv`/`.xlsx` + MIME check + ZIP magic bytes for XLSX; anything else → `FILE_TYPE_NOT_ALLOWED` |
| Malformed CSV | Strict RFC 4180 parser: UTF-8 only (`FILE_ENCODING`), NUL refused, unterminated quote refused, duplicate/blank/formula headers refused |
| Spreadsheet formulas | XLSX formula cells are **refused** (`XLSX_FORMULA`), never evaluated. Text cells starting with `= + - @ TAB CR` → row `INVALID` (`*_FORMULA_LIKE`) |
| CSV injection on export | `csvCell` prefixes formula-like cells with `'`. The export contains no personal data (none is stored on rows) |
| Replay of the same file | Unique `(source, kind, fileSha256)` → `409 DUPLICATE_FILE` |
| Public exposure | Stored under `PRIVATE_STORAGE_DIR/sdi-reports/<id>.<ext>` (git-ignored, not served). `storageKey` never leaves the API |
| Synthetic data reaching production | Synthetic uploads/applies are refused in staging/production (`SYNTHETIC_NOT_ALLOWED`) |

## 3. Column mapping (no invented schema)

- The importer chooses the column for each value.
- Header-name suggestions are only a convenience, and a suggestion that doesn't match a header is left blank.
- Required columns: order ID, amount, status, date.
- Optional columns: MEKI booking reference, ticket type, quantity, refunded amount, currency.
- Date format must be chosen explicitly: ISO, M/D/Y or D/M/Y. There is no locale guessing.
- **Status map.** Each value in SDI's file maps to one of COMPLETED, PENDING, FAILED, CANCELLED, REFUNDED or PARTIALLY_REFUNDED. Unknown values → `REQUIRES_REVIEW`.
- **Donation ticket types.** Lines with these ticket types are Gala donations. They are kept apart from ticket revenue and not applied.
- **Mapping profiles** can be saved and reused.
  - A profile is "verified" only when a **different** administrator with `sdi.reports.approve` attests, in a free-text note, which **real** SDI sample it was checked against.
  - Editing a profile clears the verification.
  - **A non-synthetic reconciliation report can be applied only with a verified profile** (`MAPPING_NOT_VERIFIED`).

## 4. Value validation (strict)

| Field | Rule |
|---|---|
| Amount, refunded | Digits; optional `$`/`USD`; comma thousands in groups of 3; ≤ 2 decimals. No negatives, exponents or decimal commas. Refunded ≤ amount |
| Currency | Must be USD, or the column is absent → `CURRENCY_NOT_USD` otherwise |
| Quantity | Integer 1–9999 |
| Date | Real calendar date (e.g. 30 February is refused), in the chosen format |
| Booking reference | `EB-` + 12 Crockford base-32 characters. Normalised for case, spaces and typographic dashes, and a missing dash after `EB` is restored. Characters outside the alphabet (`O`, `I`, `L`, `U`) are **never corrected** → `INVALID_REFERENCE` |
| Order ID | Required, ≤ 64 characters, not formula-like |

## 5. Matching rules

Evaluated first per row, then per order, then against the database:

| Status | When |
|---|---|
| `INVALID` | Any validation error above |
| `REQUIRES_REVIEW` | Unknown status; Gala donation line; booking not created through the hosted flow (`ticketIssuer ≠ ZEFFY`); paid then cancelled without a refund; reported paid again after a refund; refunded amount decreased; payment reported for a cancelled/refunded booking |
| `UNMATCHED` | No reference, or a well-formed reference with no booking (likely a buyer typo; contact SDI or the buyer) |
| `INVALID_REFERENCE` | Not a MEKI reference |
| `DUPLICATE_ROW` | Identical state repeated for one order in the file; or conflicting rows for one order at the same timestamp (all rows of that group) |
| `STALE` | An earlier state of an order superseded by a later row in the file, or older than the state already recorded in MEKI (out-of-order reports) |
| `AMBIGUOUS` | Several paid orders carry the same reference; the booking is already linked to another SDI order; the order is linked to a different booking; the booking is already PAID without a prior SDI record |
| `AMOUNT_MISMATCH` | `amount ≠ quantity × booking unit price` (with a quantity column), or `amount ≠ booking expected total` (without one) |
| `ALREADY_APPLIED` | Same status, amount and refunded amount as already recorded for the order |
| `MATCHED` | Everything above passed. A different paid quantity is allowed but noted, because SDI's count is authoritative |

**Never matched on e-mail + amount.** The only key is the MEKI booking reference, plus a strict one-order ↔ one-booking pairing. This pairing is enforced by the existing unique constraint on `ProviderPayment(provider, matchedEntityType, matchedEntityId)`.

## 6. Applying (all-or-nothing)

A single `$transaction` (120 s) re-evaluates the file against **current** data (another report may have landed since the preview). It then applies `MATCHED` rows in date order:

1. **Order record:** `ProviderPayment` (provider `sdi_report`) is upserted with status, amounts and the correlation reference.
2. **Paid state for an unpaid booking:**
   1. `guestCount`, `reportedTicketCount` and `totalAmount` are set to SDI's paid quantity and amount.
   2. The order is linked to the booking.
   3. An evidence row is written to `PaymentWebhookEvent`: `signatureVerified:false`, `payload.source:'sdi-report'`, with the file hash and row number.
   4. A payment attempt is created.
   5. The booking goes through the **same** `BookingPaymentsService.handle(payment.succeeded)` pipeline as every other confirmation.
   6. Anything other than `PROCESSED` throws `APPLY_ROLLED_BACK` and the whole import rolls back.
3. **Refunds:** a `REFUND` transaction for the **delta only** (`providerTransactionRef sdi-refund:<order>:<cumulative>`, unique). History is never rewritten.
   - A partial refund leaves the booking CONFIRMED/PAID, with `refundedAmount` updated.
   - A full refund → REFUNDED/REFUNDED.
4. **Cancellation:** `CANCELLED` on a pending, unpaid booking → booking CANCELLED with a reason.
5. **Rows:** all rows are stored with `applied` flags. The import becomes APPLIED with the counts, and is audited.

**Idempotency:**

- the same file can't be imported twice (hash);
- the same state is `ALREADY_APPLIED`;
- evidence keys and refund references are unique.

**Money separation:**

- Confirmed ticket money is ledgered as `EVENT_TICKET_PAYMENT` on the booking. It **never** creates a `Donation`; the test asserts the donation count is unchanged.
- Gala donation lines are held for review.
- General and programme donations made on SDI's forms are **not** imported in this phase (see doc 49, D-5).

**Test data:** a ledger entry is `isTest` when the booking is a test booking (any non-production environment) or the file is synthetic. Finance reports already exclude `isTest`.

## 7. Tests and results (recorded 2026-11-19)

| Suite | Command | Result |
|---|---|---|
| Phase 12 API integration (`test/phase12-sdi.e2e-spec.ts`, 11 tests, `meki_test`) | `npx jest --runInBand test/phase12-sdi.e2e-spec.ts` | **11/11 passed** |
| Full API suite (unit + integration, `meki_test`) | `npx jest --runInBand` | **27/27 suites, 417/417 passed** |
| Web unit/static | `pnpm --filter @meki/web test` | **75/75 passed** |
| Admin unit/static/contract | `pnpm --filter @meki/admin test` | **180/180 passed** |
| Typecheck + lint + build | `pnpm turbo run typecheck lint build --force --concurrency=1` | **10/10 tasks successful** |
| Browser smoke, hosted flow | `node apps/web/tests/e2e/hosted-booking.smoke.mjs` | **Chromium 21/21, Firefox 20/20, WebKit 20/20** |

What the Phase 12 API suite covers:

- **Hosted booking:**
  - ticketing advertises the SDI form;
  - the legacy booking and MEKI checkout are refused;
  - reference-only booking with no guests or tickets;
  - idempotent replay, plus `IDEMPOTENCY_KEY_REUSED` for different data;
  - client price rejected; `TOO_MANY_TICKETS`;
  - status `awaiting_sdi_report`.
- **Upload security:**
  - 403 without permission;
  - wrong type; malformed CSV; duplicate header;
  - XLSX formula; oversized file;
  - duplicate file (409).
- **XLSX** read as values, with dates.
- **Classification of 15 rows in one file:**
  - matched, mistyped, unknown and missing references;
  - amount mismatch; quantity differs;
  - ambiguous pair; formula-like; invalid date;
  - EUR; unknown status; donation line; bad amount;
  - identical duplicate.
- **Preview changes nothing; four-eyes (403).**
- **Apply:**
  - CONFIRMED/PAID with **0 MEKI tickets and 0 jobs**;
  - one CAPTURE, classified `EVENT_TICKET_PAYMENT`, `isTest`;
  - the paid quantity is adopted;
  - mismatched and ambiguous bookings stay UNPAID;
  - **no Donation rows**;
  - regenerate/resend → `TICKETS_OWNED_BY_ZEFFY`;
  - admin detail shows the SDI order;
  - public status `confirmed_by_sdi`.
- **Later reports:**
  - `ALREADY_APPLIED`;
  - cancellation closes a pending booking;
  - partial then full refund ledgered as 750 + 750 with one capture;
  - an older row is `STALE`;
  - a second order for a reconciled booking is `AMBIGUOUS`.
- **Rollback:** the 2nd row's pipeline is forced to FAIL → `APPLY_ROLLED_BACK`, the 1st row is not applied and the import stays PREVIEWED; a retry succeeds.
- **Mapping profiles:**
  - a real file needs a verified profile;
  - the creator can't verify; edits clear the verification;
  - the export is formula-safe and has no e-mails.
- **Attendees:**
  - nothing is visible before approval;
  - Arabic names kept; a formula row rejected;
  - restricted to `gala.guests.read`;
  - no MEKI tickets.
- **Status and public forms:**
  - status shows no URLs or secrets;
  - `hosted-forms` shows no URLs while switches are off; every programme has a `PRG-` code.
- **Unit:**
  - config guards (production default, `meki` refused, auto-confirm conflict, missing form URL, designation, non-Zeffy host);
  - strict amounts; MDY/DMY/ISO dates;
  - reference normalisation without "correction";
  - RFC 4180 quotes; missing business days.

### 7.1 Full-suite results

See [doc 49 §5](49-phase12-sdi-final-handoff-checklist.md#5-verification-record) for the complete verification record.
