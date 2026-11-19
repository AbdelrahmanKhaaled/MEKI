# 39 — Phase 9B: Cross-browser and responsive QA

Date: 2026-11-18.

## 1. What was tested — and what was NOT

| Engine | Build | What it is |
|---|---|---|
| Chromium | Google Chrome 157.0.8103.79 (system) | Chrome / Edge engine |
| Firefox | Playwright Firefox 159.0 | Gecko engine |
| WebKit | Playwright WebKit 27.2 (Windows build) | **Safari's engine, not Safari.** No real Safari, iPhone or iPad was available. |

Automated WebKit coverage catches layout, CSS and JavaScript engine differences. It does **not** reproduce:

- real Safari UI (address bar, safe areas, iOS keyboard);
- iOS camera permission prompts or `BarcodeDetector` availability;
- VoiceOver;
- touch latency;
- Safari's private-relay or ITP cookie policies.

A **real-device pass is still required** (doc 42).

Widths: **360, 390, 768, 1024, 1440 px**. Touch emulation is on below 1024 px (`isMobile` in Chromium and WebKit; Firefox does not support it). Languages: **EN (LTR) and AR (RTL)** throughout.

Browser binaries were installed with `npx playwright-core install firefox webkit` into the user's Playwright cache. **No project dependency was added.** axe-core was used from a scratch folder (`AXE_PATH`).

## 2. Scripts (manual; not part of `pnpm test`)

| Script | Covers |
|---|---|
| `apps/web/tests/e2e/crossbrowser.smoke.mjs` (new) | 10 public pages × EN/AR × 5 widths × 3 engines. Checks: HTTP 200, `dir`, no page-level horizontal overflow, runtime errors. Mobile menu: tap, links visible, no overflow, Escape. Keyboard: skip link, focus rings. Contact-form validation (`aria-invalid` + described errors). Donate `<dialog>` (focus, name, Escape, no overflow). axe WCAG 2.2 AA. |
| `apps/admin/tests/e2e/crossbrowser.smoke.mjs` (new) | Real test API + `*_test` fixture. Checks: login, reload persistence, second tab (AR), cookie flags; 27 routes × EN/AR at 390 + 1440 and 6 routes at 360/768/1024; drawer (tap + keyboard focus management); confirm dialog keyboard; media upload; CSV/XLSX export; ticket PDF; QR check-in with camera fallback; axe. |
| `apps/web/tests/e2e/booking.smoke.mjs` (now `BROWSER=` selectable) | Gala booking UI against a stub API |
| Chart check (scratch script, stub data) | Dashboard charts + accessible tables, 3 engines × EN/AR, axe |
| `apps/admin/tests/e2e/dashboard.smoke.mjs`, `finance.smoke.mjs` (existing, stub) | Regression of dashboard and finance after the token and dialog changes |

## 3. Results

### Public website (real test API)

**1073 / 1082 checks passed.** Every functional, layout and keyboard check passed in all three engines. The 9 remaining are axe colour-contrast results, all classified in doc 40:

- the `aria-hidden` decorative ordinal numerals on Programs and Gala (exempt decoration);
- white text over programme photos, which axe cannot measure over an image (manual review: legible on the darkened gradient).

| Area | Chromium | Firefox | WebKit |
|---|---|---|---|
| 200 + correct `dir`, 10 pages × EN/AR × 5 widths | ✔ | ✔ | ✔ |
| No horizontal overflow (incl. menu open, dialog open) | ✔ | ✔ | ✔ |
| Mobile menu (tap, links, Escape) | ✔ | ✔ | ✔ |
| First Tab = skip link | ✔ | ✔ | Engine default skips links on Tab¹ — skip link verified by focus |
| Focus ring on first 14 tab stops | ✔ | ✔ | ✔ (via Option+Tab equivalent) |
| Contact form errors announced | ✔ | ✔ | ✔ |
| Donate dialog keyboard | ✔ | ✔ | ✔ |
| Booking UI (stub) | **58/58** | **58/58** | **58/58** |

¹ Safari moves focus to links on Tab only when "Press Tab to highlight each item" is enabled (or with Option+Tab).

### Admin dashboard (real test API)

**1111 / 1113 checks passed** (3 engines). The 2 failures were axe `scrollable-region-focusable` on the Zeffy page (Chromium, EN + AR), fixed afterwards (doc 40 A8): a re-scan of Zeffy EN/AR, payments, donations, receipts and campaigns is **clean**. WebKit logged 28 "access control checks" errors, all fetches **cancelled by leaving the dashboard** (see §4).

| Area | Chromium | Firefox | WebKit |
|---|---|---|---|
| Login, reload persistence, second tab (AR/RTL) | ✔ | ✔ | ✔ |
| Cookie `HttpOnly`, `SameSite=Strict` | ✔ | ✔ | Header verified; engine store reports `None`² |
| 27 routes × EN/AR, no overflow (390/1440 + subset at 360/768/1024) | ✔ | ✔ | ✔ |
| Sidebar drawer: tap + focus in / Tab trap / Escape / focus return | ✔ | ✔ | ✔ after fix R3 (doc 41) |
| Confirm dialog keyboard (regenerate PDFs, cancelled) | ✔ | ✔ | ✔ |
| Media upload through the proxy (multipart) | ✔ | ✔ | ✔ |
| CSV (BOM, Arabic) + XLSX download | ✔ | ✔ | ✔ |
| Ticket PDF download (`%PDF-` … `%%EOF`) | ✔ | ✔ | ✔ |
| QR check-in, manual/handheld entry fallback; REVOKED; live region | ✔ | ✔ | ✔ |
| Camera button → explicit state + `role="alert"`, never silent | ✔ | ✔ | ✔ |
| Charts with data + data tables + axe (stub) | **27/27 total across 3 engines × EN/AR** | | |
| `dashboard.smoke` (stub, Chromium) | **53/53** | | |
| `finance.smoke` (stub, Chromium) | **134/134** | | |

² WebKit's Windows build reports every cookie as `SameSite=None`. The server header is `Set-Cookie: meki_admin_sid=…; HttpOnly; SameSite=Strict` (verified with curl).

## 4. Engine-specific notes (not product defects)

| Observation | Explanation |
|---|---|
| Firefox: Playwright actions hung on "waiting for navigation to finish" after many page loads in one context | Pages are served with `stale-while-revalidate`. Once Firefox's cache holds a page, it revalidates in the background, and Playwright's Firefox driver reports that as an uncommitted navigation. A fresh context made exactly one document request (with and without JS). Users are unaffected. The smoke uses a fresh context per interaction section. |
| WebKit: `pageerror … due to access control checks` on `_rsc` prefetches and once on `/public/donations/config` | WebKit reports fetches **cancelled by a navigation** as errors. The donation-config call is wrapped in `.catch` (preview mode), and Next prefetches are best-effort. |
| WebKit: no `BarcodeDetector` | The scanner shows its "camera not supported" alert, and manual/handheld entry works. Real iOS Safari support must be checked on a door device (doc 38 §4). |

## 5. Responsive observations

No page-level horizontal overflow at any width, in either language, in any engine, after fix R1 (doc 41). Wide admin tables scroll inside their card; on phones they become cards. The scroll region is now keyboard-reachable (doc 40 A8).
