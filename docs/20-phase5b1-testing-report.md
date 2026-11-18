# 20 — Phase 5B.1 testing & verification report

Date: 2026-11-16 · All integration tests ran against `meki_test` (existing `*_test` guard; no truncation, no reset, uniquely named rows). `meki_dev` was only migrated (additive, after a backup).

## Results (exact)

| Command | Result |
|---|---|
| Baseline before changes — `npx jest --runInBand` | 16 suites, **265 passed** |
| `npx prisma validate` | valid |
| `prisma migrate deploy` → `meki_test`, then `meki_dev` | `20261116200000_phase5b1_booking_jobs` applied; `migrate status` up to date on both |
| Schema parity | 44 tables / 14 triggers on both; 0 column differences (both directions); dev rows unchanged |
| `npx tsc --noEmit` | 0 errors |
| `npx eslint src test prisma scripts` | 0 errors, 0 warnings |
| **Final `npx jest --runInBand`** | **18 suites, 333 passed, 0 failed** (165 s) |
| — unit project | 7 suites, **139 passed** (was 88: +51 in `ticket-qa.spec.ts`, one obsolete test replaced) |
| — integration project | 11 suites, **194 passed** (was 177: +17 in `gala-qa.e2e-spec.ts`; the 38 Phase 5B tests all still pass) |
| `pnpm --filter @meki/api build` | success; `dist/assets` created |
| `node scripts/verify-assets.mjs` | “runtime assets OK … (8 files)” |
| `pnpm --filter @meki/api openapi:export` / `api-client generate` + `typecheck` | 165 paths (163 + 2 new); no path removed; only existing path whose definition changed: `guests/export` (XLSX documented); client typecheck 0 errors |
| `pnpm turbo run typecheck lint build --force` | **7/7 tasks successful** (web lint: 3 pre-existing warnings, files untouched) |

Existing Phase 1–4 and Phase 5B suites pass unmodified except: `gala.e2e-spec.ts` (the “XLSX is unsupported” expectation became “XLSX works and is permission-protected”) and `gala.spec.ts` (the `LogGalaNotifier` test was replaced because that class no longer exists; the no-PII-in-logs guarantee is now tested more strongly end to end). No test was removed to make the suite pass.

## Evidence by requirement

**Arabic/Unicode PDF.** Unit: printable-name matrix (10 cases incl. CJK, emoji, bidi override, newline); run-order tests (`محمد عبد الرحمن` → words emitted right-to-left; mixed `أميرة Hassan السيد` → `السيد, Hassan, أميرة`; `Omar بن خالد Al-Farouk`; bracket mirroring + LTR digits); PDF tests for Arabic-only, mixed, Latin-extended (`Zoë O'Brien-Łukasz (Jr.)`), very long Arabic/English, one-letter name — each a valid single-page PDF; Noto Arabic/Latin fonts are embedded exactly where required and absent for plain Latin-1 names; unsupported script/label → `TicketPdfError`; missing font path or assets → constructor throws (fail fast); startup self-test; exact MediaBox `[0 0 595.28 419.53]`; metadata; logo aspect ratio equals the SVG viewBox. Integration: Arabic/mixed/English booking → paid → all three PDFs generated, Arabic fonts embedded in the first two; names round-trip through the guest list; CJK/emoji/RLO names → 422 before payment and on admin edit; non-Latin-1 label config → 400.

**PDF visual inspection — performed.** Nine sample tickets (Arabic, English, mixed ×2, brackets+digits, very long Arabic, very long English, special characters, short) were rendered through **pdf.js in headless Chrome** and viewed as images: [`docs/samples/phase5b1/`](samples/phase5b1/) (PDFs + `render-*.png`). Observed: correct Arabic joining and right-to-left word order; mixed names ordered correctly (first logical word rightmost, Latin run intact); brackets mirrored and digits LTR; long Arabic shrinks to fit without clipping; long English wraps to two lines inside the panel; logo undistorted, gold rules and green panels as designed; QR crisp with white quiet zone; check-in text, references and date/venue readable. An earlier defect (wrong word order of multi-word Arabic) was found this way and fixed. Limits: this is screen rendering — **not a printed proof**; colour/ink behaviour on paper is unverified.

**QR.** Software decode with `jsQR`: the PNG decodes to exactly the token at full size and downscaled to 200 px; 560 px wide (≥ the 625 px a 150 pt print needs at 300 dpi, upscale ≤ 12 %); error-correction level M; first dark pixel ≥ 4 modules from the edge; pure black/white only; 500 distinct tokens, correct shape. Check-in concurrency: **25 simultaneous scans from two staff sessions → exactly 1 `VALID`, 24 `ALREADY_CHECKED_IN`, one audit row** (plus the earlier 8-way test). MySQL isolation is `REPEATABLE-READ`; correctness does not rely on it — the guard is a single conditional `UPDATE … WHERE status='ISSUED' AND qrTokenHash=? AND booking is CONFIRMED+PAID` (row-locked, one winner). **Physical phone/scanner compatibility: NOT verified** (no device available).

**XLSX.** Reading the produced file back with ExcelJS: PK/zip container, MIME and attachment headers, exact 10 headers, widths ≥ 14, frozen header, real date cell with format, Arabic name preserved, no formula cell anywhere, injection strings (`=HYPERLINK…`, `+1+1`, `@SUM`, `-2+3`) stored as quoted text, plain phone preserved; five filter scenarios give identical row counts for XLSX and CSV; CSV unchanged (BOM, header); finance/staff 403, anonymous 401, invalid format 400, unknown event 404; another event's workbook is empty of these guests; audit rows for both formats.

**Lifecycle failures.** PDF write fails after payment → webhook still `PROCESSED`, booking `CONFIRMED/PAID`, ticket `ISSUED` with no PDF, PDF job `PENDING` (attempt 1, back-off), `ticket.delivery` deferred (not failed), confirmation mail sent, purchaser sees `pdfReady:false`; after retry the PDF exists, the guest e-mail carries a `%PDF` attachment and the live QR scans `VALID`. E-mail provider down → booking/tickets/PDF untouched, error stored as `[email]`-redacted text (no `@`, no token), exponential back-off, `FAILED` after 5 attempts, admin re-queue (finance 403) delivers, audited. No provider → jobs `SKIPPED/NO_MAIL_TRANSPORT`, nothing sent, delivered after a transport exists. Duplicate webhook ×3 → no new jobs/e-mails/tickets (same dedupe keys, same hashes). Refund after issuance → tickets `REFUNDED`, scan `REFUNDED`, refund notice sent; a late confirmation job is parked `NOT_APPLICABLE`. Arabic booking gets English mail while the Arabic flag is off. Earlier suite still covers late payment after cancellation, cancellation, revocation.

**Storage.** 12 traversal/unsafe keys refused for put/get/remove; 5 hostile ticket identifiers (`..%2F`, double-encoded, NUL, drive path, unknown) → 404 on public and admin routes; missing file → `404 TICKET_PDF_UNAVAILABLE`; no response in the flow contains a storage key, `pdfStorageKey`, `/storage/`; error bodies no longer echo `?token=`; earlier tests cover unauthorised/other-booking/revoked access.

**Runtime assets.** Resolver order tested; `verify-assets` passes for the shipped dir and exits 1 for an incomplete one; **production build output checked**: `dist/assets` holds the 2 logos, 4 fonts, 2 licences; a copy of `dist/` alone (no source `assets/`, different working directory) rendered an Arabic ticket with embedded Arabic font, and failed with a clear message when `dist/assets` was removed; the compiled app boots against the dev DB with the startup self-test log line.

**Security regressions (new).** NUL-byte path parameter (A12), `?token=` echo (A13), raw error text in logs (A14), rate-limit bypass by spoofing the leftmost `X-Forwarded-For` (still 429 — one trusted hop), reference/token enumeration (identical status/code/message for unknown reference vs wrong token; 5 distinct references), no personal data/QR token/hash in logs or in 8 admin/public responses and the CSV, unprintable names refused.

**Calendar.** Six schedule states: nothing / start only / zone only / offset (`-05:00`) / abbreviation (`EST`) → pending (`409 CALENDAR_PENDING`, `available:false`); start + `America/New_York` → `.ics` 200. Unit: invalid zones, `DTEND` only when confirmed, one `VEVENT`.

## Not tested / not claimed

- No real e-mail was delivered (no provider); only transports `none`, `dev-file` (not exercised in CI) and `memory` exist.
- No physical QR scan, no printed ticket, no other PDF viewers (Acrobat/iOS/Android) — pdf.js/Chrome only.
- Arabic e-mail copy is machine-checked for structure and rules, **not reviewed by a native speaker or MEKI**.
- No load test; XLSX 20 000-row cap not exercised with that many rows (batching and streaming are exercised functionally).
- Multi-instance job runners were reasoned about (lease + conditional claim), not run in parallel processes.
- No payment-provider (Zeffy) behaviour; all payments use the dev/test mock.
