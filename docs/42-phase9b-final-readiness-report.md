# 42 — Phase 9B: Final platform readiness report

Date: 2026-11-18. It summarises docs 33–41. Nothing was committed, pushed or deployed. Payments stay disabled and Gala sales stay closed.

## 1. Assessment

| Launch | Verdict | Why |
|---|---|---|
| **Informational website** (EN/AR, no payments) | **Technically ready; blocked on MEKI content/legal and hosting.** | 3-engine × 5-width × 2-language QA passes; WCAG 2.2 AA automated checks pass, except documented exempt or manual-review items; restore drill done. Remaining: doc 38 §1 (legal pages, contacts, Arabic review, statistics, indexing) and §3 (domains, TLS, DB, backups). |
| **Admin dashboard** | **Technically ready** for MEKI staff on staging. | All routes, roles, uploads, exports, PDFs and check-in pass in 3 engines; contrast fixed platform-wide; dialogs keyboard-safe. |
| **Donations through SDI / Zeffy** | **Not ready (external).** | Needs SDI credentials, campaign IDs, hosted forms and the live test (doc 38 §2). The code paths are tested only against documented fixtures. |
| **Paid Gala tickets** | **Not ready (external + MEKI).** | Same SDI items plus booking-reference mapping, ticket ownership, refund/receipt wording, e-mail provider and the door rehearsal. |

## 2. Bugs found and fixed in Phase 9B

| # | Area | Bug | Fix |
|---|---|---|---|
| 1 | Operations | **Backups were not restorable**: `mysqldump` output fails on 11 triggers (`ERROR 1064`) | Verified normalization step and DEFINER-user requirement in runbook doc 37; real drill done |
| 2 | Operations docs | Doc 36 advised `RATE_LIMIT_STORE=redis`, which the API refuses (not implemented) | Docs 33/36/38 corrected: launch on one instance |
| 3 | Website a11y | "How we work" step copy at 1.4–2.6:1 contrast while inactive | Copy never dimmed; activation via dot, ring, number and verb colour (≥ 3:1) |
| 4 | Admin a11y | Charts were unlabelled images with no figures; one hard-coded English label | Localized data tables; SVGs hidden; Recharts focus layer off |
| 5 | Admin a11y | Mobile drawer: no focus management or Escape; modals had no Tab trap; trap escaped in WebKit | Shared `useDialogFocus` hook (focus in, trap, Escape, return), engine-independent |
| 6 | Admin a11y | Hundreds of contrast failures (muted / ok / warn tokens, sidebar labels, quick-action subtitles) | Same-hue darkening, all ≥ 4.6:1 |
| 7 | Admin a11y | Wide finance tables not keyboard-scrollable | Focusable, named scroll region |
| 8 | Admin layout (introduced by fix 4, caught by regression) | Hidden chart tables overflowed the page on phones | `sr-only` on a wrapping div |

Test-harness issues were found and handled without product changes (doc 39 §4): the Firefox cache/revalidation driver hang, the WebKit Tab-to-links default, WebKit's cookie `SameSite` reporting, and WebKit's cancelled-fetch errors.

## 3. Exact test results

| What | Result |
|---|---|
| API (Jest, `meki_test`) | **399/399**, 25 suites |
| Admin unit | **164/164** |
| Web unit | **55/55** |
| Turbo `typecheck lint build --force --concurrency=1` | **10/10**, exit 0 |
| Website cross-browser (3 engines × 5 widths × EN/AR) | **1073/1082**; the 9 open items are exempt/manual-review axe items |
| Admin cross-browser (3 engines) | **1111/1113**; the 2 were fixed afterwards and re-scanned clean |
| Booking UI (stub) | **58/58** in Chromium, Firefox and WebKit |
| Charts + data tables (stub) | **27/27** (3 engines × EN/AR) |
| `dashboard.smoke` / `finance.smoke` (stub) | **53/53** / **134/134** |
| Restore drill (disposable container) | Raw dump **fails**; normalized dump restores; counts equal; API healthy |

## 4. Remaining unverified checks (need people, devices or partners)

1. **Real Safari / iOS / iPadOS and Android devices** — keyboard, VoiceOver/TalkBack, camera permission, `BarcodeDetector` on door devices.
2. **Screen-reader walkthrough** (NVDA + VoiceOver), EN and AR, of booking, donate, contact and the admin check-in.
3. **Zoom / reflow** at 200 % and 400 % by a human reviewer.
4. **Live payments, refunds and recurring billing** via SDI/Zeffy (doc 32 live-test plan).
5. **Real e-mail delivery** (after a provider is chosen).
6. **Door rehearsal**: printed A5 tickets, handheld scanners, two doors.
7. **Restore drill on staging** with a production-sized dump and the operator account.
8. **Multi-instance**: not supported until a shared rate-limit store exists (deliberately out of scope).

## 5. MEKI decisions required

- Everything in doc 38 §1 still applies: legal pages, contacts, Arabic review, Programme 6 name, US/UK spelling, doors-open time and speakers, statistics sources, indexing and domain, Gala record and capacity, door roles, e-mail provider, WOFF2 fonts, opening sales.
- **New in 9B (optional):**
  - (a) darker gold for the decorative "01–06" ordinals (exempt today);
  - (b) approve the admin text-token darkening (applied; originals recorded in `globals.css` if MEKI prefers them, but they fail WCAG);
  - (c) keep the gradient under programme-photo text whenever photos change.
- **Engineering decision for the project lead:** a reviewed migration that re-creates the 11 triggers without the trailing `;`, so future dumps restore without normalization. **Not applied:** it changes integrity triggers on live schemas and needs sign-off plus a backup.

## 6. SDI dependencies (unchanged — doc 38 §2)

Read API key and webhook secret (encrypted channel); webhook registration; campaign IDs; hosted form URLs and allowed hosts; redacted real payloads; booking-reference mapping; ticket-issuance ownership; refund, receipt and FMV wording; a coordinated small live payment + refund test.

## 7. Production launch blockers

1. MEKI legal pages and contact details (website).
2. Domains, TLS, MySQL with TLS, persistent volumes, backups **with the normalization step**, monitoring (doc 36).
3. Search-indexing approval.
4. **For payments/sales only:** all SDI items, e-mail provider, door rehearsal and the live payment test.
