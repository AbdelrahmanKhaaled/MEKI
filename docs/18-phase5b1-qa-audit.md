# 18 — Phase 5B.1 QA audit (ticketing QA, PDF fixes, production hardening)

Date: 2026-11-16 · Method: re-read of the code in `apps/api/src/modules/gala/`, the schema, the build config and docs 14–17 **before** changing anything. Nothing below is taken from the previous report without checking the code.

## 0. Repository state at the start

- Branch `main`, HEAD `5d9a5a9`; all Phase 5B work is **uncommitted** (nothing has been committed since). Changes after the Phase 5B report: none by others (the only on-disk change notices were this session's own edits).
- Files verified: `CLAUDE.md`, `apps/api/README.md`, `apps/api/prisma/schema.prisma`, the whole `gala` module, `package.json`, `nest-cli.json`, `.gitignore`, `packages/api-client`, docs 14–17. No `Dockerfile`/compose file exists in the repo (deployment packaging is undefined — see §3).
- Baseline: `npx jest --runInBand` → 16 suites, **265 passed** (Phase 5B result reproduced).
- Environment: MySQL container `meki-mysql` was stopped again at session start and was restarted (only that container).

## 1. Existing implementation (confirmed by reading the code)

| Area | State |
|---|---|
| PDF | `pdfkit` A5-landscape ticket, logo rasterised from the approved SVG with `sharp`, built-in PDF fonts (Times/Helvetica/Courier) |
| QR | `qrcode` PNG, EC level M, margin 2, 560 px; token `mkt_` + 256-bit CSPRNG, only SHA-256 stored; check-in = one conditional `UPDATE` |
| Storage | `LocalPrivateStorage` under `PRIVATE_STORAGE_DIR`, server-generated keys, root-prefix check |
| E-mail | six English templates + `GalaEmailComposer`; `LogGalaNotifier` only logs; **no transport, no retry** |
| CSV | `GuestsService.exportCsv` (BOM, formula guard); XLSX refused with 422 |
| Calendar | `buildIcs`/`calendarAvailability`: pending unless `startsAt` **and** a non-empty `timezone` |
| Packaging | logo read from `../../../assets/brand` relative to the compiled file |

## 2. Previously reported limitations → status after inspection

| Reported limitation | Confirmed? | Evidence |
|---|---|---|
| Arabic names print as `?` | **Yes** | `latin1()` replaced every char > U+00FF; optional font path used a naive string reverse |
| XLSX missing | **Yes** | `exportCsv` threw `FORMAT_NOT_SUPPORTED` |
| E-mail not delivered | **Yes** | only `LogGalaNotifier`; no transport interface |
| PDF visual check partial | **Yes** | text glyphs could not be rasterised in the earlier check |
| Physical QR scan not done | **Yes** — still cannot be done here (no phone/scanner) |

## 3. Issues confirmed during this audit

| # | Issue | Severity | Fix |
|---|---|---|---|
| A1 | Arabic/non-Latin-1 names broken (`?`) — no shaping, no bidi, no font shipped | High | bundled OFL fonts + `bidi-js` run layout + fontkit shaping; unsupported scripts refused up front |
| A2 | Even with a font configured, pdfkit shapes **word by word**: multi-word RTL names came out in logical word order (found while inspecting rendered output) | High | RTL runs split into word tokens and emitted in visual order |
| A3 | PDF render, storage write and e-mail ran **once**, after commit, inside the webhook request; a failure left a confirmed booking with no PDF/e-mail and only a manual endpoint as recovery | High | transactional outbox table `EventBookingJob` + leased, back-off job runner; payment never rolled back |
| A4 | No mail transport abstraction; no Arabic templates; delivery attempts not recorded | Medium | `MailTransport` port (none / dev-file / memory), attempts recorded per job with sanitised errors, Arabic set (proposed copy, flag-gated) |
| A5 | XLSX export absent | Medium | ExcelJS streaming writer, same filters/permission/audit/injection guard as CSV |
| A6 | Runtime assets only resolvable from the source tree; `nest build` (`deleteOutDir`) wipes `dist/`; no check that a build artifact contains the logo; no fonts at all | High (deploy) | `copy-assets` build step → `dist/assets`, resolver (`ASSETS_DIR` → `apps/api/assets` → `dist/assets`), `verify-assets` script, startup self-test |
| A7 | Calendar accepted any non-empty string as timezone (`"EST"`, `"+05:00"`, `"foo"`) | Medium | must be a real IANA zone known to the runtime |
| A8 | QR quiet zone 2 modules (< the 4-module standard minimum) | Low | margin 4 |
| A9 | Public status listed a `downloadPath` for a confirmed ticket whose PDF did not exist yet | Low | `pdfReady` flag per ticket |
| A10 | Guest names were not checked for printability, so an unprintable name only failed after payment | Medium | validated at booking and on admin edit (`UNSUPPORTED_NAME_CHARACTERS`) |
| A11 | Ticket label fields (`*En`) could hold characters the template can't print | Low | restricted to printable ASCII/Latin-1 in the DTO; renderer refuses otherwise |
| A12 | **Found by a new test:** a trailing NUL byte in the ticket-number path param (`TK-…%00`) still matched the ticket (needs the booking token, so not an access bypass, but params must be strict) | Medium | `TicketNumberPipe` / `SafeIdPipe` → 404 for anything not shaped like an id |
| A13 | **Found by a new test:** the shared error filter echoed the full URL, including `?token=<booking token>`, in error bodies | Medium | `path` is now the path only (shared filter; no existing test depended on the query) |
| A14 | **Found by a new test:** services logged raw error messages, which can carry PII from a failing dependency | Medium | `sanitizeError()` on every logged/stored error |

Verified as already correct (no change needed): cryptographic token generation; hash-only storage; atomic check-in; revoked/refunded/pending rejection; storage keys server-generated with a root-prefix guard; admin and public ticket access scoped; booking creation idempotency; no ticket before verified payment; duplicate-webhook idempotency; ticket history append-only.

## 4. Dependencies added

`exceljs@4.4` (XLSX; maintained, pure JS), `bidi-js@1.0.3` (Unicode bidi, MIT, used by troika), dev: `jsqr@1.4` (software QR decode in tests). Fonts (bundled, SIL OFL 1.1): Noto Sans Regular/Bold, Noto Sans Arabic Regular/Bold. No e-mail provider library was added.

## 5. Tests required (all implemented — see doc 20)

PDF (Arabic, English, mixed, long, special chars, unsupported script, missing font, startup failure, page size, logo ratio), XLSX (workbook content, Arabic, injection, filters vs CSV, RBAC, scope, audit), QR (decode round trip, quality, 25-way concurrency), storage (traversal keys, missing file, no path leak, unauthorised), lifecycle (PDF failure, e-mail failure, no provider, duplicate webhook, refund, late job), security regressions (A12–A14, rate-limit spoofing, enumeration), calendar (all pending states), assets (resolver, verify script, dist-only deployment run).

## 6. Not resolvable without credentials, physical testing or client decisions

- **Real e-mail delivery** — no provider chosen/approved; only the port and dev/test transports exist.
- **Zeffy** payment verification — unchanged scope boundary.
- **Physical QR scanning** with phones/scanners and **printing** on paper — no device or printer here (software decoding is tested).
- **Arabic e-mail copy and Arabic event labels** — need MEKI approval (Arabic set is gated by `GALA_EMAIL_ARABIC_APPROVED=false`).
- **Font/licence sign-off** — Noto fonts are SIL OFL 1.1 (redistribution permitted); MEKI should confirm they are acceptable as ticket typography.
- **Event start/end time** — calendar stays `CALENDAR_PENDING`.
