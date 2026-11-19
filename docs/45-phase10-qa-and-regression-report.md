# 45 — Phase 10: QA and regression report

Date: 2026-11-19.

**Environment:**

- **API:** test API (`NODE_ENV=test`, `meki_test`, job poller off).
- **Website:** production builds of `apps/web`.
- **Browsers:** Chromium = Chrome 157; Playwright Firefox 159 and WebKit 27.2. WebKit is Safari's engine, not a real Safari or iOS device.

Nothing was paid, no sales were opened, and no database record was changed.

## 1. Results

| Check | Result |
|---|---|
| Web unit (`node --test`) | **62/62** (55 + 7 new `phase10.test.mjs`) |
| Admin unit | **164/164** |
| API (Jest, 25 suites, `meki_test`) | **399/399** |
| `pnpm turbo run typecheck lint build --force --concurrency=1` | **10/10**, exit 0; only the 6 pre-existing lint warnings (3 web, 3 admin), none from Phase 10 |
| Cross-browser smoke, 12 routes (10 + `/book` + `/donation/return`) × EN/AR × 360/390/768/1024/1440 × 3 engines | **1260/1270** on the first run. The 10 were: 3 × Gala `/ar` 360 px overflow (fixed: price lamp in RTL); Programs decorative numerals contrast (fixed: darker brand gold); homepage-only contrast items (homepage out of scope and unchanged — the known white-text-over-photo panels, doc 40). |
| Focused re-verification after the fixes (8 pages × 5 widths × 3 engines + axe on Programs EN/AR) | **122/122** |
| Site smoke (real test API: links, SEO, images, CMS content, EN/AR) | First run **248/250** — a new icon-only scroll cue on the Gala hero had no accessible name → fixed (named link) → **250/250** |
| Booking UI smoke (stub API), Chromium / Firefox / WebKit | **58/58** each (the `/book` page now uses `FlowBand`; the flow is unchanged) |
| Reduced motion (`prefers-reduced-motion: reduce`), 9 pages × EN/AR | **18/18**: every revealed element visible, no running animation |
| Runtime errors | 0 page/console errors in Chromium and Firefox. WebKit: 1 known cancelled-fetch report during navigation (doc 39 §4). |

## 2. Homepage regression (must be unchanged)

**Method (deterministic):**

- **Load:** `/en` and `/ar` at 390 and 1440 px, with reduced motion and after a full scroll.
- **Record:**
  1. the `<main>` HTML (SHA-256);
  2. a dump of layout-relevant computed styles for every element in `<main>` (colour, background, font, weight, line height, padding, margin, display, radius, grid);
  3. the page height.
- **Baseline:** captured **before any Phase 10 change**; two baseline runs were identical.

| View | HTML | Computed styles | Height |
|---|---|---|---|
| EN 390 | = | = | = 21 532 px |
| EN 1440 | = | = | = 14 930 px |
| AR 390 | = | = | = 20 423 px |
| AR 1440 | = | = | = 14 371 px |

- **Result:** the final build was identical in two consecutive runs.
- **Observation:** on the first snapshot after a cold server start, one element at EN 390 reported a different auto-margin, and the next run matched exactly. This is a first-load timing effect, not a style change; it was reproduced twice and cleared each time.
- **Pixel hashes:** full-page PNG hashes are not deterministic even between two baseline runs (twinkling lights, image decoding), so they are not used as proof. One pair matched byte for byte.
- **Phase 9B note:** the homepage's "How we work" contrast fix was made in **Phase 9B (WCAG)**, *before* Phase 10. The baseline includes it. Phase 10 did not change it.

## 3. Bugs found and fixed in Phase 10

| # | Bug | Severity | Fix |
|---|---|---|---|
| 1 | **Booking, booking status and donation return pages: header navigation invisible** (white links on limestone at the top of the page) | High (navigation) | Page-level `FlowBand`; header unchanged |
| 2 | Gala page showed the ticket price only from the static brief, while the booking flow charges the DB price | Medium (integrity) | Page uses the published ticketing API price; brief text only while unpublished |
| 3 | New: Gala `/ar` 360 px horizontal overflow (decorative lamp at the inline end) | Low | Attendance section clips its decoration |
| 4 | New: unnamed scroll-cue link on the Gala hero | Low (a11y) | Named link |
| 5 | Programs decorative numerals 2.98:1 (were exempt) | Low | Darker brand gold (9B decision (a), applied on redesigned pages) |

## 4. Functionality checked

- **Navigation links:** checked by site smoke and the cross-browser run.
- **CTAs:** they link only to existing pages.
- **Forms:** contact form validation in 3 engines.
- **Accordions:** FAQ and Gala.
- **Donate dialog:** in 3 engines.
- **Mobile menu:** in 3 engines.
- **Booking flow:** stub, 3 engines.
- **Not affected by Phase 10 code; covered by the API suite and doc 41:** ticket PDF download, QR check-in and CMS rendering.
- **CMS content:** site smoke checks the published FAQs.
- **Gala information:** doc 44.

## 5. Limitations

- **No real Safari, iOS or Android devices, and no screen-reader pass.** Unchanged from doc 42.
- **Motion feel and performance on low-end phones** were not measured on hardware.
  - Animations are transform/opacity only, and infinite ones are limited to small decorative layers.
  - A real-device check is recommended.
- **Image-consent status:** MEKI photography is still UNCONFIRMED (`content/media.ts`); this applies to all pages.
- **Approval-dependent content:** the Gala page cannot show more than the approved content. Missing fields are listed in doc 44.
