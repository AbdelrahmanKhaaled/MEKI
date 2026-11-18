# 19 — Phase 5B.1 implementation

Builds on [15](15-phase5b-implementation.md). Audit and issue list: [18](18-phase5b1-qa-audit.md). Tests: [20](20-phase5b1-testing-report.md). Deployment: [21](21-phase5b1-deployment-requirements.md).

## 1. Arabic and Unicode ticket PDFs

**Pipeline (guest name).** `isPrintableGuestName` → `layoutRuns` (`ticket-text.ts`) → `TicketPdfService.drawName`.

1. *Validation:* letters/marks must be Latin or Arabic script; digits, punctuation and spaces are fine; symbols, emoji, control/bidi-control characters and other scripts (CJK, …) are **rejected at booking time** (`422 UNSUPPORTED_NAME_CHARACTERS`) and on admin edit — the buyer learns before paying, and a ticket can never be printed with substitute glyphs. The renderer re-checks and throws a controlled `TicketPdfError` (the ticket stays PDF-less and retryable; never a broken PDF).
2. *Bidi:* `bidi-js` (Unicode UAX #9) gives embedding levels; text is split into runs of equal level and script; runs are reordered left-to-right (rule L2); brackets are mirrored in RTL runs; digits stay LTR.
3. *Shaping:* each run is drawn with the font of its script — Noto Sans Arabic for Arabic (fontkit applies joining forms and ligatures), Noto Sans for Latin — baselines aligned across fonts by ascender compensation.
4. *pdfkit caveat handled:* pdfkit shapes **word by word** (it splits at spaces), so words of an RTL run are emitted in visual order by this module; glyph order *inside* a word is done by fontkit. (This was a real defect found by inspecting rendered output — Arabic joined correctly but multi-word names read in the wrong order.)
5. *Fit:* font size shrinks (21 → 12 pt) to the 320 pt name box; if still too long the **logical** text is shortened with “…” (never clipped mid-glyph).

Plain Latin-1 names keep the original design (Times Roman, 22 pt). Mixed/Arabic/Latin-extended names use the Noto runs. All other template text (event name, date, venue, references, instructions) is printable ASCII/Latin-1 and keeps its built-in fonts; those labels are restricted accordingly (`*En` fields, DTO + renderer check).

**Fonts** (`apps/api/assets/fonts`, **SIL Open Font License 1.1**, copyright Noto Project Authors; licence texts shipped alongside): `NotoSans-Regular/Bold.ttf`, `NotoSansArabic-Regular/Bold.ttf` (obtained from the `@expo-google-fonts` npm packages, which republish the Google Fonts builds). OFL allows bundling and redistribution with software; the fonts must not be sold on their own and keep their notices. Overrides (all optional, must exist and be `.ttf/.otf` or the **API refuses to start**): `TICKET_PDF_UNICODE_FONT_PATH` / `_BOLD_PATH` (Arabic-capable) and `TICKET_PDF_LATIN_FONT_PATH` / `_BOLD_PATH`. `TicketPdfService` also self-tests at startup (parses all four fonts, renders an Arabic ticket) — no silent fallback anywhere.

**Layout/QA changes:** QR quiet zone 2 → 4 modules (standard minimum); ticket title shifted 6 pt below “ADMIT ONE”; PDF Subject/Keywords metadata. Page size is exactly A5 landscape (595.28 × 419.53 pt).

## 2. XLSX export

`GET /admin/events/:eventId/guests/export?format=xlsx` (CSV remains the default). Same `gala.guests.export` permission, event scope, filters (`paymentStatus, ticketStatus, checkInStatus, search, includeTest`), 20 000-row cap and audit (`format: "xlsx"`). ExcelJS **streaming** writer to the response; rows are read in cursor batches of 500 so memory stays flat. Sheet “Guests”: the 10 required headers (bold white on MEKI deep green), per-column widths, frozen header row, auto-filter, booking date as a real date with format `yyyy-mm-dd hh:mm`, Arabic stored as UTF-8. Every text cell passes `csvSafe` (leading `'` for `= + - @ TAB CR LF`; plain `+digits` phone numbers exempt) and is written as a string, never a formula. Download headers are set only after validation/audit succeed, so errors remain normal JSON. CSV code path unchanged in behaviour (shares the new batched row source).

## 3. Retryable work: transactional outbox

New table `EventBookingJob` (migration `20261116200000_phase5b1_booking_jobs`, additive). In the **same transaction** that confirms a verified payment the handler inserts idempotent jobs (`UNIQUE dedupeKey`): one `TICKET_PDF` per ticket, `booking.confirmed`, one `ticket.delivery` per ticket (`payment.failed` / `ticket.refunded` likewise). After commit `GalaJobsService.processBooking` takes the fast path (renders PDFs with the in-memory QR tokens, then runs the booking's due jobs). Anything that fails is retried by `runDue` — by the poller (`GALA_JOBS_INTERVAL_SECONDS`, default 30 s, 0 disables) or `POST /admin/events/:id/jobs/run`.

- **Claim/lease:** conditional `UPDATE … WHERE id AND status AND attempts` + 2-minute lease; expired leases are recoverable; two runners never run one job.
- **Back-off:** `min(2^attempt × 30 s, 1 h)`, `GALA_JOB_MAX_ATTEMPTS` (5) then `FAILED`; `ticket.delivery` waits for its PDF job without burning attempts and fails permanently if the PDF job fails.
- **PDF retry** re-issues the ticket (new QR; the lost token was never delivered) — the same safe rotation as the admin action.
- **Payment is never rolled back** by a PDF/storage/e-mail failure; booking/payment/ticket state is untouched (tested).
- **Stale messages:** a job executed after a refund/cancellation composes nothing (`NOT_APPLICABLE`) instead of sending “confirmed”.
- **Admin:** booking detail lists jobs (type, template, status, attempts, sanitised last error); `POST …/bookings/:id/resend` re-queues `FAILED`/`SKIPPED` jobs and runs them (audit `gala.booking.requeue_jobs`; `gala.bookings.manage`).
- Not a distributed queue: single-database polling is enough for the expected volume; the lease makes multi-instance safe.

## 4. E-mail delivery foundation

`MailTransport` port (`mail-transport.ts`), selected by `MAIL_TRANSPORT`:
`none` (default; **parks** e-mail jobs as `SKIPPED`/`NO_MAIL_TRANSPORT`, startup warning, nothing is claimed as sent) · `dev-file` (writes `.json` + PDF attachments to `MAIL_DEV_OUTBOX_DIR`; development only) · `memory` (tests only; supports injected failures). `dev-file`/`memory` are rejected by env validation in staging/production. **No commercial provider was chosen**: a real adapter implements `MailTransport` and is bound to `MAIL_TRANSPORT`; delivery attempts, attempt counts and sanitised errors are already recorded by the job table. Logs carry only job type/template/status — never names, addresses, tokens or message bodies; stored/logged errors go through `sanitizeError` (e-mail addresses → `[email]`, QR tokens → `[token]`, truncated to 300 chars).

Templates: six English (unchanged) + six **Arabic** (`gala-email.templates.ar.ts`, RTL HTML, `<bdi>` around Latin event data). The Arabic copy is a **proposed translation, not approved by MEKI**: Arabic bookings receive Arabic mail only if `GALA_EMAIL_ARABIC_APPROVED=true`; otherwise they get the English templates. Same rules in both languages: “confirmed” only after verified payment, calendar-pending note, no tax/receipt claims.

## 5. Calendar

`calendarAvailability` now requires `startsAt` **and** a real IANA zone known to the runtime (`Intl.DateTimeFormat`); `"EST"`, `"-05:00"`, `"Mars/Olympus"` stay `CALENDAR_PENDING`. `DTEND` only when `endsAt` is set. Output stays UTC with the zone named in the description. Nothing was invented or defaulted.

## 6. Storage and API hardening

- Storage keys must match `^(segment/)+segment.pdf$` (`[A-Za-z0-9_-]` segments) — traversal, absolute paths, backslashes, NUL bytes, drive letters are refused before any filesystem call (tested with 12 attack strings).
- Admin id params (`eventId/bookingId/ticketId`) use `SafeIdPipe`; the public ticket number uses `TicketNumberPipe` (`TK-` + 10 Crockford chars) → plain 404.
- Public booking status: `tickets[].pdfReady`.
- Shared error filter no longer echoes the query string (`?token=`) in `error.path`.
- Download policy unchanged: purchaser token + confirmed/paid booking + ISSUED/CHECKED_IN ticket; admin `gala.tickets.read` + event scope; never a storage path in any response.

## 7. Runtime assets / build

`pnpm --filter @meki/api build` = `prisma generate && nest build && node scripts/copy-assets.mjs` (copies `assets/` → `dist/assets`). `pnpm --filter @meki/api verify:assets` (or `node scripts/verify-assets.mjs [dir]`) fails with exit 1 if any logo/font/licence is missing. The asset directory resolves `ASSETS_DIR` → `apps/api/assets` → `dist/assets`, never the working directory.

## 8. New/changed configuration

`TICKET_PDF_UNICODE_FONT_PATH`, `TICKET_PDF_UNICODE_FONT_BOLD_PATH`, `TICKET_PDF_LATIN_FONT_PATH`, `TICKET_PDF_LATIN_FONT_BOLD_PATH`, `ASSETS_DIR`, `MAIL_TRANSPORT`, `MAIL_DEV_OUTBOX_DIR`, `GALA_JOBS_INTERVAL_SECONDS`, `GALA_JOB_MAX_ATTEMPTS`, `GALA_EMAIL_ARABIC_APPROVED` (all optional; `.env.example` updated). Test harness defaults: poller off, memory transport (`load-test-env.ts`).

## 9. Database change

One additive migration (`EventBookingJob` + 2 enums + 1 FK). Applied with `migrate deploy` to `meki_test` then `meki_dev` after a verified dev backup. Both: 44 tables, 14 triggers, 0 column differences; dev data unchanged (Event 1, Donation 7, PaymentTransaction 4, EventBooking 0).

## 10. Files

*Created:* `gala/ticket-text.ts`, `gala/gala-assets.ts`, `gala/mail-transport.ts`, `gala/gala-jobs.service.ts`, `gala/gala-email.templates.ar.ts`, `gala/ticket-qa.spec.ts`, `test/gala-qa.e2e-spec.ts`, `scripts/copy-assets.mjs`, `scripts/verify-assets.mjs`, `assets/fonts/*` (4 TTF + 2 OFL), migration `20261116200000_…`, docs 18–21, `docs/samples/phase5b1/*`.
*Modified:* `gala/ticket-pdf.service.ts` (rewritten), `guests.service.ts`, `gala.controllers.ts`, `gala.dto.ts`, `gala.module.ts`, `bookings.service.ts`, `booking-payments.service.ts`, `tickets.service.ts`, `gala-support.ts`, `gala-email.composer.ts`, `gala-email.templates.ts`, `calendar.ts`, `ticket-storage.ts`, `ticket-config.service.ts`, `gala.spec.ts` (obsolete log-notifier test replaced by a sanitiser test), `test/gala.e2e-spec.ts` (XLSX expectation updated), `src/config/env.validation.ts`, `src/common/filters/all-exceptions.filter.ts`, `prisma/schema.prisma`, `package.json`, `.env.example`, `.env.test.example`, `test/load-test-env.ts`, `apps/api/README.md`, `docs/README.md`, OpenAPI + generated client.
