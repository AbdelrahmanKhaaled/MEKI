# 35 — Phase 9A: Performance report

Date: 2026-11-18. **Rule followed: measure first; change only what the measurements justify.**

## 1. API (measured on the inflated `meki_test` dataset)

**Dataset** (much larger than production will have):

| Data | Rows |
|---|---|
| Pages | 1,041 |
| Events | 975 |
| Bookings | 960 |
| Tickets | 1,280 |
| Donations | 496 |
| Audit logs | 8,361 |
| Webhook events | 1,351 |

**Method:** test API on localhost, 5 runs per endpoint, median and max, response size.

| Endpoint | Median | Max | Size |
|---|---|---|---|
| `GET /public/home?locale=en` | 20 ms | 72 ms | 67.5 KB |
| `GET /public/faqs` | 3 ms | 28 ms | 1.9 KB |
| `GET /public/programmes` | 8 ms | 51 ms | 6.8 KB |
| `GET /admin/cms/pages` (unpaginated, 1,041 pages) | 47 ms | 70 ms | **491 KB** |
| `GET /admin/gala/events` (975 events) | 15 ms | 30 ms | 111 KB |
| `GET /admin/events?pageSize=20` | 19 ms | 24 ms | 29 KB |
| `GET /admin/donations` p1 / search | 40 / 17 ms | 58 / 30 ms | — |
| `GET /admin/donors?search=a` | 15 ms | 47 ms | 11 KB |
| `GET /admin/audit-logs` p1 / by entity | 13 / 12 ms | 14 / 16 ms | 7 KB |
| `GET /admin/payments/webhook-events` | 13 ms | 14 ms | 6 KB |
| `GET /admin/reports/donations/summary` | 16 ms | 21 ms | — |
| Gala bookings / bookings search / guests search | 18 / 19 / 21 ms | 23 / 38 / 29 ms | 10–13 KB |
| Gala tickets / financials / jobs | 18 / 15 / 17 ms | ≤ 20 ms | ≤ 15 KB |
| Check-in history (audit JSON filter) | 34 ms | 43 ms | — |
| `/admin/system/status`, Zeffy status | 15 / 13 ms | 17 / 13 ms | < 1 KB |

**Conclusion:** every endpoint answers in under 50 ms median on this dataset. **No backend optimisation is justified now.** The rate limiter returned 429 during a 400-request burst, which is expected behaviour.

**Watch list** (fine today; act if production data approaches the threshold):

| Item | Why | Threshold / action |
|---|---|---|
| `GET /admin/cms/pages` returns all pages | In production about 10 site pages + 1 event page. The test DB is inflated by QA event pages. | Add server pagination or exclude event pages if over ~500 pages |
| `contains` searches (`LIKE '%…%'`) on bookings, guests, donors, donations | Cannot use B-tree indexes | Add FULLTEXT or prefix search if tables pass ~50k rows |
| Check-in history filters `AuditLog.metadata->eventId` (JSON) after the indexed `action` filter | Scans that action's rows | Add a generated column + index if audit rows per action pass ~200k |
| `/public/home` builds a 67 KB payload per request; the website caches it (ISR 300 s) and Phase 7 raised the build-time timeout | | Keep the ISR cache; no change |

## 2. Public website (production build, Chrome, localhost)

**Method:** each page loaded once per viewport. Bytes are transfer sizes captured over the Chrome DevTools Protocol. LCP comes from `PerformanceObserver` and, being single runs on localhost, is **indicative only**.

**Before (baseline):**

| View | Page | Requests | JS KB | Fonts KB | Images KB | Total KB | LCP ms |
|---|---|---|---|---|---|---|---|
| mobile | `/en` | 28 | 224 | **256** | 31 | 583 | 1,856 |
| mobile | `/ar` | 34 | 224 | **463** | 31 | 793 | 424 |
| mobile | `/en/events/gala-night` | 26 | 218 | 256 | 26 | 549 | 272 |
| mobile | `/en/faq` | 25 | 216 | 256 | 7 | 522 | 556 |
| desktop | `/en/programs` | 31 | 216 | 256 | 205 | 724 | 84 |

**Finding.** `next/font/local` preloaded **all 9 Latin brand faces** (5 Source Serif + 4 Lato TTF, including italics) on **every** page, Arabic pages included. That forced about 256 KB of high-priority downloads competing with the main content.

**Change:** `preload: false` on the two local families in `apps/web/src/lib/fonts.ts`. The Arabic families already had it. The brand font **files are untouched** (no conversion or subsetting). `display: swap` keeps text visible while a face loads.

**After (same build environment):**

| View | Page | Requests | JS KB | Fonts KB | Images KB | Total KB | LCP ms |
|---|---|---|---|---|---|---|---|
| mobile | `/en` | 25 | 225 | **165** | 32 | **494** | 816 |
| mobile | `/ar` | 25 | 225 | **208** | 32 | **540** | 244 |
| mobile | `/en/events/gala-night` | 22 | 220 | 143 | 27 | 439 | 136 |
| mobile | `/en/faq` | 19 | 217 | **87** | 7 | **355** | 424 |
| desktop | `/en/programs` | 26 | 217 | 112 | 206 | 582 | 124 |

**Result:**

- Font bytes per page fell by **91–255 KB**.
- Total page weight fell by 15–32 %.
- There are 3–9 fewer requests per page.
- Unit guard: `apps/web/tests/security-headers.test.mjs`.

**Not changed (documented):**

- **JavaScript** (about 220 KB on every page) is shared framework and GSAP code. Reducing it requires route-level code splitting of the animation code. That is a design change, to be measured on a real network before deciding.
- **Fonts as TTF:** converting brand fonts to WOFF2 would save roughly a further 40 %. It needs MEKI's brand owner to approve derived font files (licence/brand question), so it is listed in doc 38.
- **Images** are already responsive (`next/image`, AVIF/WebP); the largest page loads about 206 KB of images on desktop.

## 3. Admin dashboard

- **Pagination:**
  - Server-paginated (20–25 rows): donations, donors, payments, refunds, receipts, bookings, guests, tickets, jobs, provider payments.
  - Client-side over a capped API page: FAQs and statistics (≤ 100 rows by API design).
  - Unpaginated: CMS pages and the Gala event resolver (see the watch list).
- **No avoidable request storms found.** React Query caches by key and placeholder data is per event (Phase 6E). The one deliberate burst in this measurement came from the measurement script, not the UI.

## 4. Commands

- **API timings:** start the test API (`NODE_ENV=test PORT=4100 node dist/main.js`) and log in with a test-DB admin. The script is in the session scratchpad (not committed); the method is fully described above.
- **Web weight:** `next build` then `next start -p 3001`, then a Playwright CDP script capturing `Network.loadingFinished` sizes per resource type.
