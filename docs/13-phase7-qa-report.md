# 13 — Phase 7 QA report (frontend, real browser)

**Browser:** Google Chrome 157.0.8103.39 (headless) driven by `playwright-core` (new dev dependency in `apps/web`; no browser download, uses the installed Chrome).
**Target:** production build (`next build` + `next start -p 3100`), backend **offline** → built-in fallback content (CMS/API-backed overlays were not exercised).
**Harness:** `apps/web/verification/phase7/run.mjs` (`STAGE=routes-en|routes-ar|interact node verification/phase7/run.mjs [baseUrl]`). Screenshots: `apps/web/verification/phase7/screenshots/` (1440 + 390 per route, mobile menu, donate dialog). Not under `public/`.

## Coverage
- Routes: 20 (home, about, programs, events/gala-night, give, faq, contact, privacy, terms, cookies × en/ar).
- Viewports: 1440, 1024, 768, 390, 360 for every route (200 page loads).
- Per load: HTTP 200, `lang`/`dir`, uncaught JS/console errors (API-offline noise excluded), failed internal requests, horizontal overflow, content stuck at opacity 0 after human-speed scroll, broken images.
- Per route (1440): one H1, unique title + description, duplicate IDs, internal links match the existing route set, canonical + hreflang (en, ar, x-default), no localhost in metadata, forbidden text (payment logos, monthly, tax-deductible, campaigns, sponsorship prices, UK "programme").
- Interactions: language switch from every route keeps the page, with back/forward; desktop nav + active state; logo; hero CTAs; footer links (no legal links); mobile menu open/close/Escape/navigate (en+ar); FAQ click, Enter, Space, `aria-expanded`, four categories; contact form disabled + honest status + labels; Quick Donate opens the "not open yet" dialog with **no donation POST**; Gala facts, timeline order, disabled booking/giving buttons, map link, no sponsorship prices; nine unique programs, no detail links; About and Give claims; legal pending states; reduced-motion visibility; skip link.

## Results
| Stage | Pass | Fail |
|---|---|---|
| Routes en | 480 | 0 |
| Routes ar | 470 | 0 |
| Interactions | 118 | 0 |

`tsc --noEmit`: OK. ESLint (`src`, `verification`): 0 errors, 3 warnings (2 pre-existing `<img>` warnings, 1 unused variable in the QA script, since removed). `next build`: OK, all 20 routes generated.

## Defects
No product defects (P0/P1/P2) were reproduced, so no application code was changed in this phase. Test-harness issues found and fixed: fast scroll-and-return left scroll-reveal elements hidden (not reproducible at human scroll speed or when jumping to the bottom); a too-broad accordion selector; two over-strict text assertions.

## Not verified / limits
- Backend/CMS-backed rendering (API offline): published CMS overlays, stale-copy guard against live data, site-settings contact details, published legal pages, FAQ categories from CMS.
- Visual review by a person: screenshots were captured for all pages, but only a few were inspected. Automated checks cover overflow, hidden content and broken images, not aesthetics, RTL polish or clipped text.
- Open Graph image tags are only emitted when a site URL is set (`NEXT_PUBLIC_SITE_URL` or Vercel env); this run had none, so `og=none`. Verified with a URL set in Phase 5A.
- No contrast audit tool or axe-core run (not installed); only semantics, labels, focus and keyboard checks.
- Contrast and focus-ring appearance, layout shift metrics, Safari/Firefox: not tested.
- Donation return route `/[locale]/donation/return` was not exercised (needs a session token); it is not linked from public navigation.

## Client-approval blockers (unchanged)
3:30 PM vs 4:00 PM doors; speaker/performer name publication; six Gala causes; sponsorship packages; fiscal-sponsor booking/payment/refund/tax/receipt wording; legal documents; official contact details; final program names; contact and notify-me endpoints.

## Confirmation
No payment, ticket booking, RSVP or sponsorship checkout was activated; no donation request was sent during testing; no database, schema or backend change.

## Resume
`pnpm --filter @meki/web build && pnpm --filter @meki/web exec next start -p 3100`, then run the three `STAGE=` commands above (routes stages take ~10 min each).
