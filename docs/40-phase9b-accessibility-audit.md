# 40 — Phase 9B: Accessibility audit (WCAG 2.2 AA)

Date: 2026-11-18. Scope: public website (`apps/web`) and admin dashboard (`apps/admin`), English (LTR) and Arabic (RTL).

## 1. Method

| Layer | How | Limits |
|---|---|---|
| Automated rules | axe-core 4.10.3, tags `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa`, injected by the cross-browser smokes (doc 39). It ran on every website page (EN + AR) at 390 px and 1440 px in Chromium, and on the home + give pages in Firefox and WebKit. On the admin it ran on every route at 390 px and 1440 px in Chromium, and on a subset in Firefox and WebKit. axe is loaded from a scratch folder via `AXE_PATH`; it is **not** a project dependency. | Automated rules find roughly 30–40 % of WCAG problems |
| Scripted keyboard checks | Skip link first, visible focus indicator on the first 14 tab stops, mobile menu (tap, Escape), donate `<dialog>` (focus inside, named, Escape), admin drawer and modals (focus in, Tab trap, Escape, focus return), contact-form errors (`aria-invalid` + `aria-describedby`), check-in result live region | Scripted, so not a human judging the reading order |
| Code review | Charts, dialogs, forms, RTL handling | — |
| **Not done** | Real screen readers (NVDA, JAWS, VoiceOver, TalkBack), 200 %/400 % zoom review by a person, cognitive review, real-device Safari | Needs a human tester — doc 42 |

**Animation-aware measurement.** The site reveals content with scroll-triggered animations. The first axe pass therefore reported colours that changed from run to run: the same element was measured at `#d1a967`, `#d8b67c` and `#c99b4e`, i.e. caught mid-fade. The smoke now scrolls through each page and waits 1.6 s before scanning, so only the **steady state** is judged. Findings below are steady-state only.

## 2. Findings fixed

| # | WCAG | Where | Problem | Fix | Proof |
|---|---|---|---|---|---|
| A1 | 1.4.3 Contrast (AA) | Website, "How we work" (home + About) | Until scroll progress reached a step, the **whole step** (number, verb, description) sat at `opacity: 0.55`. The description measured 2.6:1, the eyebrow 2.44:1 and the verb 1.43:1 while on screen and being read. | The step copy is never dimmed. The progressive activation is kept, carried by the dot, ring, number badge, wave fill and verb colour. The inactive verb is now an 80 % brand-green mix (3.45:1, above the 3:1 needed for this 32 px text); the active verb stays full brand green. Brand colours are unchanged. | `apps/web/tests/a11y.test.mjs`; axe after rebuild (doc 39) |
| A2 | 1.1.1 Non-text content, 1.3.1 Info and relationships | Admin dashboard charts (trend, donut, programme bars, stacked bars) | Each chart was a `role="img"` with only a generic label: "Gross / Net", or the hard-coded English `"bar chart"` on the Arabic dashboard too. Screen-reader users got **none of the figures**. | The SVG is `aria-hidden`. Each chart now renders a visually hidden `<table>` (`ChartTable`) with a localized caption (the card title), column headers and row headers, holding the same values the chart draws (money formatted in the active locale). EN and AR header labels were added (`dashboard.chartTable`). Sighted layout is unchanged. | `apps/admin/tests/a11y.test.mjs`; stub-data browser check (doc 39) |
| A3 | 2.1.2 No keyboard trap (inverse), 2.4.3 Focus order, 4.1.2 | Admin mobile/tablet sidebar drawer (< 1024 px) | The drawer is `role="dialog" aria-modal="true"`, but focus stayed on the menu button behind the overlay, Tab walked through the page underneath, and Escape did nothing. Confirmed in the baseline run (Chromium 360/390/768, EN + AR: `inside=false … closed=false`). | New shared `useDialogFocus` hook: focus moves to the close button, Tab / Shift+Tab stay inside, Escape closes, focus returns to the menu button. | Browser run after rebuild (doc 39); unit test |
| A4 | 2.4.3 Focus order | Admin `Modal` (every confirm dialog: cancel/resend/regenerate, sign-out, refunds, CMS publish…) | Focus moved in and Escape worked, but **Tab could leave the modal** into the page behind it. | `Modal` uses the same hook (adds the Tab trap; existing behaviour kept). | Browser run (regenerate dialog, cancelled); unit test |
| A5 | 1.4.3 Contrast | Admin: **hundreds of nodes** on every list (Zeffy 270, campaigns 226, receipts 160, …) | Four shared tokens failed small-text contrast: `muted` #7b8a83 (3.4–3.6:1, captions, labels, meta text), `ok` #1f8a5b on its tint (3.6:1, status badges), `warn` #b7791f on its tint (3.0:1), and sidebar group labels `mint/60` on deep green (4.3:1). | Same hue, darkened only as far as needed: `muted` #66736d, `ok` #1a744c, `warn` #8b5c18 (each ≥ 4.6:1 on white, page grey and its own tint); group labels `mint/70` (5.3:1); chart axis uses the new muted. Brand colours (greens, golds) are untouched. `danger` and `body` already passed. The disabled "Soon" nav items (`aria-disabled`) are exempt and unchanged. | Unit test computes the ratios; admin axe after rebuild |
| A6 | 1.4.3 Contrast | Admin dashboard quick-action tiles | Subtitle `opacity-80` white on brand teal = 3.7:1 | Full-opacity subtitle; hierarchy kept by size and weight | Chart/dashboard axe (stub) |
| A7 | 4.1.2 / axe `aria-hidden-focus` | Admin charts (consequence of A2) | Recharts 3 makes the chart SVG and the Pie layer keyboard-focusable (`tabIndex=0`): an invisible-to-AT tab stop inside `aria-hidden` | `accessibilityLayer={false}` on all 4 charts, `rootTabIndex={-1}` on the Pie; the data table replaces the keyboard tooltip | 27/27 chart check, 3 engines |
| A8 | 2.1.1 Keyboard | Admin finance `DataTable` (Zeffy, payments, refunds, receipts…) at ≥ 768 px | A wide table scrolls horizontally inside its card; when its rows hold no links, keyboard users could not scroll it (axe `scrollable-region-focusable`) | The scroll container is `tabIndex=0`, `role="region"`, named by the table caption, with a visible focus ring | Unit test; axe re-check |

## 3. Verified compliant (no change)

- **Language and direction:** `<html lang dir>` correct on every website page and admin route (EN `ltr`, AR `rtl`), checked in all three engines.
- **Skip links:** website (`#main`) and admin (`#content`). On the website the first Tab stop is the skip link in Chromium and Firefox. WebKit skips links on Tab by engine default (§4).
- **Focus indicators:** a visible ring on each of the first 14 tab stops, EN + AR, desktop + mobile, in Chromium and Firefox (doc 39).
- **Mobile menu:** `aria-expanded` and `aria-controls`, opens by tap, Escape closes, links visible, no overflow while open.
- **Forms:** the contact form submitted empty → 4+ fields `aria-invalid="true"`, each with an `aria-describedby` message. Donate `<dialog>`: focus inside, named, Escape closes, all engines. Inputs have labels (no axe `label` findings).
- **FAQ and programme accordions:** native buttons with `aria-expanded` / `aria-controls`.
- **Check-in:** the result region is announced (live region). The scanner input is masked; the token is never displayed.
- **Camera fallback:** an unsupported or denied camera produces an explicit `role="alert"` message; manual and handheld entry always works (doc 39).
- **Gauges:** `<figure>` with a value in the accessible name and a `figcaption`.
- **Data tables (admin lists):** real `<table>` elements with header cells.

## 4. Accepted / not changed (with reasons)

| Item | Reason |
|---|---|
| Programme and Gala ordinal numerals "01–06" in brand gold `#c08a30` (2.7–3.0:1) | `aria-hidden`, purely decorative ordinals next to headed content; WCAG 1.4.3 exempts pure decoration. **MEKI may choose** the darker brand gold `--color-gold-text` (#7a5818) if they want them to pass anyway — a visual-identity decision (doc 42). | **Phase 10:** the redesigned Programs grid and Gala experience cards now use `gold-text` (#7a5818), so these pass.
| WebKit: the first Tab skips the skip link | Safari/WebKit excludes links from Tab unless "Press Tab to highlight each item" is enabled (or Option+Tab is used). The skip link itself is verified in WebKit: focusable, visible on focus, `#main` exists. |

## 5. Final automated results

See doc 39 §3 for the per-engine numbers after all fixes. Remaining axe results are only the exempt or manual-review items in §4:

- decorative `aria-hidden` ordinals;
- white text over photographs, which axe cannot measure over images. Reviewed by screenshot: legible on the darkened lower gradient. Keep the gradient overlay whenever MEKI replaces a programme photo.

## 6. Before / after (axe colour contrast, Chromium, all routes)

| App | Before | After |
|---|---|---|
| Website | Home 16, About 8, Programs 9, Gala 6 (steady state) | Home: only white-on-photo panel text (manual review); Programs/Gala: decorative ordinals only |
| Admin | 94 nodes on the first routes scanned; 270 on the Zeffy page alone | Full 3-engine run: only `scrollable-region-focusable` ×2 (Zeffy), then fixed → affected routes re-scanned **clean**. Colour contrast: **0**. |
