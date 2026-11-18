# 17 — Phase 5B testing & verification report

> Historical report for Phase 5B (265 tests). Phase 5B.1 results (333 tests, PDF visual inspection, XLSX, failure scenarios) are in [20](20-phase5b1-testing-report.md).

Date: 2026-11-16 · Environment: Windows 11, Node ≥22, MySQL 8.4 (`meki-mysql` container, port 3307), `meki_test` for all tests. No destructive operation was run against any database; the integration harness refuses any `DATABASE_URL` that does not end in `_test` (unchanged guard) and creates uniquely named rows without truncating.

## Results (exact)

| Command (run in `apps/api` unless noted) | Result |
|---|---|
| Baseline before any change: `npx jest --runInBand` | 14 suites, **193 passed** |
| `npx prisma validate` | schema valid |
| `prisma migrate deploy` → `meki_test`, then `meki_dev` | `20261116100000_phase5b_gala_booking` applied to both; `migrate status`: "up to date" for both |
| Schema consistency | both DBs: 43 tables, 14 triggers, 0 column differences (information_schema `EXCEPT` in both directions) |
| Existing dev data after migration + seed | `Event` 1, `Donation` 7, `PaymentTransaction` 4 — unchanged; 0 bookings |
| `npx tsc --noEmit` (typecheck) | 0 errors |
| `npx eslint "src/**/*.ts" "test/**/*.ts" "prisma/**/*.ts" "scripts/**/*.ts"` | 0 errors, 0 warnings |
| Final `npx jest --runInBand` (unit + integration) | **16 suites, 265 passed, 0 failed** (103 s) |
| — unit project | 6 suites, **88 passed** (54 existing + 34 new in `src/modules/gala/gala.spec.ts`) |
| — integration project | 10 suites, **177 passed** (139 existing + 38 new in `test/gala.e2e-spec.ts`) |
| `pnpm --filter @meki/api openapi:export` | 163 paths written (139 before, +24, none removed) |
| `pnpm --filter @meki/api-client generate` / `typecheck` | generated; 0 errors |
| `pnpm turbo run typecheck lint build --force` (repo root) | 7/7 tasks successful (web lint reports 3 pre-existing warnings in files not touched by this phase) |

Existing Phase 1–4 suites (auth, rbac, content, campaigns, events, media, platform, security-fixes, donations incl. webhooks/refunds/receipts/recurring/reports, common, campaign/event rules, donations spec) all pass unchanged. The OpenAPI comparison showed every existing path definition byte-identical; the only changed schema is `UpdateRolePermissionsDto` (its permission-key enum gained the 8 new keys). The generated `schema.d.ts` diff is large only because path order changed.

## What the new tests cover

**Unit (34):** price calculation (decimal, no float drift, invalid counts); booking/attempt/ticket reference shapes + uniqueness over 2 000 draws; QR token generation, hash-only verification, guess/length/format rejection; duplicate-guest detection; phone digits; canonical idempotency hashing; booking and ticket state machines; check-in decision table (7 cases); CSV formula-injection (every dangerous leading character, phone exemption, quoting, CRLF); ICS (pending → no file, UTC output, escaping, folding ≤75 octets, no `DTEND` when unknown); all six e-mail templates (pending never says confirmed, confirmation contents, HTML escaping, no tax/receipt claims); log notifier (no PII, "NOT SENT"); PDF (valid structure, single page, embedded images, token not present as text, non-Latin name does not throw).

**Integration (38):** public ticketing info; unpublished/closed/unknown events; booking creation (3 guests → `2250.00`, tickets PENDING without token or PDF, one ticket per guest, no `Donation` row); purchaser-as-guest; **price manipulation** (every client price/total/currency field rejected; `ticketCount` mismatch); input validation matrix; idempotent replay, key reuse conflict and concurrent double-submit; capacity under concurrency; public status (token required, no PII, single 404, cross-booking token rejected); rate limiting (429); checkout 503 until payments are enabled, hosted-checkout reuse, browser return/cancel cannot confirm; **verified payment** (PAID+CONFIRMED, hashed unique QR per ticket, PDFs stored, ledger `EVENT_TICKET_PAYMENT`, audit row, donation report + donation/ledger row counts unchanged); **duplicate webhook** (same event id → duplicate; new event id → ignored; no second ticket set); bad signature / wrong amount / wrong currency / wrong session / unknown attempt; failed vs cancelled vs retried payment and late failure; **PDF access** (token required, IDOR both directions, no pre-payment access, revoked blocked, admin event scope, permission); **check-in** (VALID once, replay, `verifyOnly`, malformed/guessed/other-event tokens, **8 simultaneous scans → exactly 1 VALID**, REVOKED, REFUNDED via verified refund (partial refund rejected, duplicate refund ignored, history preserved), PAYMENT_NOT_CONFIRMED, re-issue rotates QR and kills the old one, renaming an issued ticket re-issues, manual check-in/undo permissions + audit); **cancellation** (unpaid, late payment after cancel recorded for review and issues nothing, paid → REFUND_PENDING → REFUNDED); **guest list/export** (filters, search, event scoping, CSV columns, BOM, headers, formula neutralisation, audit, XLSX refusal, export permission matrix, 401/404); **RBAC matrix** for content/campaign/finance/door-staff/admin, CSRF, cross-event IDOR on bookings/tickets/cancel/revoke; role catalogue; financial summary (ticket-only, `taxDeductibleAmount: null`, test records excluded by default, no receipt rows); append-only/no-delete triggers via raw SQL; ticket-config permissions and audit; seeded Gala config (USD 750, sales closed, no capacity, event not published); calendar pending vs valid ICS; e-mail composer (confirmation refused before payment, PDF attachment, secure link only for the purchaser); booking detail/list/patch and audit without PII.

The test harness captures each QR token by spying on `TicketPdfService.render` (the application never stores it); that is a test-only seam, not production behaviour.

## Findings fixed during testing

1. Guest-name pattern rejected digits after the first letter ("Smith III") — relaxed (first character must still be a letter, so a name can never start with a formula character).
2. Jest's per-project `testTimeout` is not honoured, so the ticket flows set `jest.setTimeout(60_000)` in their file.
3. `pnpm add` changed peer-dependency hashes in `pnpm-lock.yaml` and left the web app's `eslint-plugin-import` link stale (web lint could not start); `pnpm install --frozen-lockfile` reconciled `node_modules`. No web source file changed.
4. The authoring tool converted `\uXXXX` escapes into raw characters in two source lines (regex, BOM) which ESLint rejected; they were rewritten with code-point ranges and `String.fromCharCode`.

## NOT tested / NOT claimed

- **No real payment provider, no Zeffy, no live payment or refund.** All payment flows use the dev/test-only mock provider and its signed webhooks. Real-provider signature verification, hosted checkout and refund notifications are untested because they do not exist yet.
- **No e-mail was sent or delivered.** Only template rendering and composition (with PDF attachment) are tested; no provider is configured.
- **PDF visual check — partial.** The PDF was rasterised with pdf.js in a scratch folder: layout, panel colours, the official logo, the QR and gold rules rendered correctly; text glyphs could not be rasterised there (a pdf.js/Node-canvas limitation with standard fonts), so text was verified by extracting each text item's position — all inside the page/panel bounds, nothing overlaps the divider or border (after a 6 pt shift of the title below the "ADMIT ONE" label). A person should still look at a real ticket in a PDF viewer and print one. QR **scan** with a physical reader/phone was not performed (the token round-trip through the API is tested). Arabic names and `TICKET_PDF_UNICODE_FONT_PATH` were not visually verified.
- **No browser/UI tests**; the frontend and admin dashboard are out of scope for this phase.
- **Multi-instance behaviour** (shared rate-limit store, shared private storage) is untested; the check-in and booking logic rely on database atomicity, which was tested.
- **XLSX** is not implemented, so not tested (the refusal is).
- Load/performance testing was not performed.
