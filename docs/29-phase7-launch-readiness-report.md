# 29 — Phase 7: Launch readiness report (website, Gala Night, admin)

Date: 2026-11-18. This report builds on documents [21](21-phase5b1-deployment-requirements.md), [22](22-phase5c-implementation.md) and [24](24-phase6a-implementation.md)–[28](28-phase6e-gala-operations-implementation.md). The handoff checklist of open items is in [30](30-meki-launch-blockers-and-client-requirements.md).

**Safety statement.** Nothing was pushed or deployed. Ticket sales stay **closed**, payments stay **disabled**, and no real payment, refund or e-mail was sent. There was no schema change and no migration. `meki_dev` was only **read**: automated mutating tests ran against `meki_test`.

**About the commit.** Part of the Phase 7 work is already contained in commit `0279dde` ("complete MEKI platform phases 5B-6E"). That commit was made outside this session. The later fixes listed in §3 are still uncommitted.

## 1. Current readiness

| Area | State |
|---|---|
| **Public informational website (EN/AR)** | Technically ready. Verified against the real API with a production build (§5). Launch still needs MEKI's content and legal items plus approval of search indexing (doc 30 §1). |
| **Admin dashboard** | Ready for internal use: all implemented modules, server-enforced permissions, EN/AR. |
| **Gala Night page** | Shows only approved facts. Two open content conflicts need a MEKI decision: the doors-open time and the publication of speaker names. |
| **Gala ticket sales** | **Blocked** by the payment provider. No Zeffy/SDI checkout adapter exists. The public booking form stays closed because the backend reports checkout unavailable. Booking, tickets, check-in and the admin side are verified with the mock provider and the test database. |
| **E-mail delivery** | **Blocked** until an e-mail provider is approved. The queue, templates, retry and admin views work, and nothing is ever reported as sent. |

## 2. Workflows verified end-to-end

| # | Workflow | How it was verified | Data |
|---|---|---|---|
| A | Public website → public CMS API → admin CMS | Site smoke: published FAQs and programmes from the API appear on the pages (EN/AR); drafts never leak (Phase 6D smoke and e2e). | **Real API, test DB** |
| B | Programs → Causes → Campaigns → website | Programmes rendered from the API (site smoke). Featured campaigns appear only when approved and published (6C/6D tests). | Real API, test DB |
| C | Gala page → booking → checkout readiness → status | Site smoke: the booking call-to-action is a link only when the API reports sales open **and** checkout available; the booking page is closed; the status page is generic for a missing or wrong token. Booking UI flow (stub API): 58/58. | Real API (closed state) + **stubbed provider** (UI flow) |
| D | Verified payment → confirmed booking → PDF ticket → e-mail job | `phase7-integration.e2e-spec.ts` (detail below). | Test DB, **mock provider** |
| E | Issued ticket → QR validation → admin check-in → attendance | Same integration test, plus the 6E browser smoke (101/101: scanner, duplicate scan, revoked/refunded/invalid codes, manual check-in and undo, history). | Test DB |
| F | Donations → payments → refunds → financial reports | Existing donation e2e suites (included in the 352 API tests). The integration test also proves ticket money never creates a `Donation` or `PaymentTransaction`. | Test DB, mock provider |
| G | Admin authentication → permissions → protected operations | Auth, RBAC and security e2e suites; Gala contract checks (403s for door staff and finance); the 6E role checks in the browser. | Test DB |

**What the integration test (workflows D and E) checks:**

- **Booking:** server-priced booking with an idempotent replay; a client-supplied price is refused.
- **Payment:** checking the status after the return URL does **not** confirm; a signed webhook does, a duplicate webhook is ignored and an unsigned one is refused.
- **Tickets and e-mails:** two tickets with unique numbers and QR hashes; PDFs stored; e-mail jobs DONE (memory transport) with the token only in the link fragment.
- **Purchaser access:** status and PDF need the token; a wrong token gets a 404.
- **Check-in:** VALID, then ALREADY_CHECKED_IN. Five concurrent scans of one ticket produce exactly one check-in.
- **Admin views:** attendance shows 100 %; the history, jobs and financials views agree.
- **Refund:** a refund event updates the ledger and the net figure; donation tables are unchanged.

**Not verified:**

- **Live checkout:** no live checkout, payment or refund was run; it is blocked by SDI/Zeffy.
- **Real e-mail delivery:** blocked by the e-mail provider.
- **Physical devices and printing:**
  - Camera scanning on real phones/tablets: headless Chrome reported "unsupported", so only the fallback was tested.
  - Printing a PDF ticket and scanning the print.
  - Handheld scanners.
- **Real-API admin smokes:** not re-run in Phase 7. The last runs were Phase 6D (74/74) and Phase 6E (101/101); the admin unit tests and the API suites were re-run.

## 3. Implementation changes (Phase 7)

| Change | Files |
|---|---|
| **E-mail booking links carry the access token in the URL fragment** (`?reference=…#token=…`). The fragment never reaches servers, proxies, analytics or the Referer header. The web page already accepted `#token=` and removes it from the address bar. Links sent earlier (`?token=`) keep working. | `apps/api/src/modules/gala/gala-email.composer.ts`, test in `test/gala.e2e-spec.ts` |
| **CORS fix: `X-Booking-Token` allowed** (§4, bug 1). | `apps/api/src/setup-app.ts`, test in `test/phase7-integration.e2e-spec.ts` |
| **Cross-module integration test** (workflows D/E/F) and a CORS preflight test. | `apps/api/test/phase7-integration.e2e-spec.ts` |
| **OpenAPI synchronized** with the existing tooling (`openapi:export` against the test DB, then `generate`): +4 paths (Gala events, jobs, check-in lookup, check-in history) and the new query parameters (`from`/`to`, `status`/`type`, `q`, `kind`). 169 paths in total, none removed. | `packages/api-client/openapi.json`, `src/generated/schema.d.ts` |
| **Admin drift guard:** every API path the admin calls must exist in `openapi.json`. | `apps/admin/tests/openapi.test.mjs` |
| **`robots.txt` and `sitemap.xml`:** disallow everything until launch approval, then allow public pages but never booking, status or return pages. A single indexing switch, `PUBLIC_INDEXING` in `lib/site.ts`, drives the robots meta of every public page. | `apps/web/src/app/robots.ts`, `sitemap.ts`, `src/lib/seo.ts`, `src/lib/site.ts`, `layout.tsx`, `page-meta.ts`, `gala-night/page.tsx`, `tests/seo.test.mjs` |
| **Environment examples:** `NEXT_PUBLIC_API_URL` must include `/api/v1` (§4, bug 2); new `apps/web/.env.example`. | `.env.example`, `apps/web/.env.example` |
| **CMS fetch failures are no longer silent** (§4, bugs 2–3). | `apps/web/src/lib/api.ts`, `src/lib/content-failure.ts` |
| **Branded, localized 404** for unknown `/en/*` and `/ar/*` paths (§4, bug 4). | `apps/web/src/app/[locale]/[...rest]/page.tsx`, `[locale]/not-found.tsx` |
| **Public-site smoke** against the real API (§5). | `apps/web/tests/e2e/site.smoke.mjs` |

## 4. Bugs discovered and fixed

1. **Critical — the public booking flow was blocked by CORS in real browsers.**
   - **Problem:** the API's CORS `allowedHeaders` did not include `X-Booking-Token`. When the website and API run on different origins (as configured), the browser's preflight blocks checkout start, booking status and ticket PDF downloads.
   - **Why it went unnoticed:** Phase 5C was tested against a stub API.
   - **Fix:** header allowed. A regression test checks the preflight for the website origin and refusal for a foreign origin.
2. **Configuration trap — `NEXT_PUBLIC_API_URL` without `/api/v1`.**
   - **Problem:** the root `.env.example` documented the value without the prefix. The website then silently showed only its built-in content, and browser calls went to wrong paths.
   - **Fix:** both examples corrected. A unit test guards the example files, and the site smoke now fails if CMS content isn't rendered.
3. **Silent CMS failures and fallback baked in at build time.**
   - **Problem:** every failed content fetch returned the fallback without a trace. During `next build` the heavy `/public/home` request (about 65 KB) runs for many pages at once and exceeded the 4 s timeout, so static pages were built with built-in content.
   - **Fix:**
     - failures are logged without tokens or bodies: error level for missing core endpoints (`/public/home`, `/public/site`), network failures and 5xx; warning level for other 4xx
     - connection failures and timeouts are retried once
     - during the production build the timeout is 20 s; for visitors it stays 4 s
4. **Unknown pages showed the framework's unbranded English 404.**
   - **Fix:** a catch-all route renders the branded not-found page, which now appears in Arabic under `/ar`.
5. **Operational — development API "Database unavailable" after a MySQL restart.**
   - **Problem:** MySQL 8's `caching_sha2_password` login cache is cleared on server restart. The MariaDB driver used by Prisma then refuses the first plain-TCP login (`ER_CANNOT_RETRIEVE_RSA_KEY`).
   - **Fix applied now:** no code or `.env` change. I warmed the cache with one TLS login of the application user via the `mysql` client inside the container (password passed as an environment variable, never printed).
   - **Will recur:** after every MySQL restart.
   - **Permanent options (developer's decision):** add `allowPublicKeyRetrieval=true` to the local `DATABASE_URL`, or use a TLS connection. Production must use TLS (doc 30 §4).
   - **Earlier outage:** an API outage before the power cut was not reproduced. The full Turbo build ran afterwards while the dev API was running, and it stayed up.

**Content observations (not changed — MEKI must decide):**

- English pages use US spelling by design (`americanize()`: e.g. "Labor Market" for the stored "Labour Market").
- The Gala running order shows "Doors open at 3:30 PM" and three names, all from the client brief. An older RSVP document says 4:00 PM, and `Gala Page.pdf` asks not to publish names until confirmed in writing (doc 12).

## 5. Test results (2026-11-18)

| Suite | Data | Result |
|---|---|---|
| API e2e, full (`npx jest --runInBand`) | test DB, mock provider | **22 suites, 352/352** (incl. the Phase 7 integration and CORS tests, and the fragment-link assertions) |
| Admin unit (`pnpm --filter @meki/admin test`) | pure logic | **152/152** (incl. the OpenAPI drift guard) |
| Web unit (`pnpm --filter @meki/web test`) | pure logic | **50/50** (incl. robots/sitemap, indexing switch, failure levels, env examples) |
| Public-site smoke (`apps/web/tests/e2e/site.smoke.mjs`) | **real API, test DB, production build** | **250/250** (details below) |
| Gala booking UI smoke (`booking.smoke.mjs`) | **stubbed API / provider**, production build | **58/58** |
| `pnpm turbo run typecheck lint build --force --concurrency=1` | — | **10/10 tasks**, 0 errors (3 pre-existing lint warnings in each of admin and web) |

**What the public-site smoke covered:**

- **All 10 public pages in EN and AR:**
  - status and `lang`/`dir`
  - title, description, canonical, hreflang and robots meta (`noindex`)
  - one `main` landmark and an `h1`
  - images load and have alt text; buttons and links have names
  - no DEMO text
- **Site-wide:** unique titles, every internal link resolves, `robots.txt`/`sitemap.xml`.
- **CMS content:** FAQs and programmes from the API are rendered.
- **Gala Night:** booking CTA logic, approved facts, no invented times.
- **Closed booking:** the booking page has no form, and the status page is generic for a reference-only or wrong-token URL. A `#token` link is removed from the address bar.
- **Navigation:** the mobile menu and the language switch.
- **Layout:** no horizontal overflow at 1440/1024/768/390/360 in EN and AR.
- **Errors:** localized 404, no console errors.

The Phase 6D (74/74) and 6E (101/101, 34/34 contract) admin real-API runs are reported in docs 27/28.

## 6. Security findings

| Check | Result |
|---|---|
| Admin sessions | HttpOnly cookies, SameSite=Strict, `__Host-` prefix in production, server-side revocation, idle/absolute expiry. CSRF header on every mutation; same-origin admin proxy. |
| Permission enforcement | Enforced server-side. Door staff, finance, content and campaign roles are covered by e2e and contract tests (403s). |
| Booking token | Header-only in API calls; fragment-only in e-mail links (new); removed from the address bar; constant-time comparison; same 404 for unknown reference and wrong token. |
| QR secrets | Never stored (SHA-256 only), never shown in the admin (masked scanner input), never in job rows or logs (sanitised). |
| Ticket PDFs | Private storage; only via the token (purchaser) or `gala.tickets.read` (admin). |
| Exports | `gala.guests.export` only; formula-injection safe; audited. |
| Redirects | Hosted checkout only to hosts on the allow-list (`NEXT_PUBLIC_CHECKOUT_ALLOWED_HOSTS`; empty means no redirect). |
| Draft content | Never public (6D tests, site smoke). |
| Logging | New web logs contain only public paths and status codes. |
| Indexing | Off until approved; booking, status and return pages are always excluded. |

**Residual risks:**

- Visitors see the built-in fallback when the API is down; operators now see it in the logs.
- Rate limits use the in-memory store unless `RATE_LIMIT_STORE`/`REDIS_URL` is configured (needed for multi-instance hosting).

## 7. Browser and device verification

- **Done:** Chrome (Playwright) at 1440/1024/768/390/360, EN and AR, production builds.
- **Not done:**
  - Safari, Firefox, real phones or tablets
  - screen-reader testing
  - camera QR scanning on devices
  - printing and scanning a ticket

## 8. Build verification and runtime configuration

- **Turbo:** typecheck, lint and build pass for all workspace packages.
- **Fixed at build time — a change needs a rebuild:**
  - Web: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CHECKOUT_ALLOWED_HOSTS`. `robots.txt` and `sitemap.xml` are prerendered with the origin known at build time.
  - Admin: the `/api/v1` and `/media/uploads` rewrites use `ADMIN_API_UPSTREAM` at build time. Alternatively, put the same rules in the reverse proxy (recommended for production).
- **Read at runtime:** API variables, and the web's `API_INTERNAL_URL` (server fetches).
- **Admin upload body size:** the admin proxy accepts 12 MB request bodies (`proxyClientMaxBodySize`); the API keeps its 10 MB per-file limit. A production reverse proxy needs the same 12 MB allowance (doc 30 §4).

## 9. Deployment readiness

Ready to deploy once the hosting items in doc 30 §4 are in place: domains and TLS, reverse-proxy rules, environment variables, persistent storage, backups, and migrations via `prisma migrate deploy`.

**Production guards already in the API's environment validation:**

- DEMO publishing is refused.
- The mock payment provider is refused in staging/production.
- `MAIL_TRANSPORT` must stay `none` until an approved adapter exists.
- Payments stay disabled until enabled in settings.

## 10. Running the project locally

1. **Database:** start the existing container: `docker start meki-mysql` (host port 3307).
2. **If the API reports "Database unavailable" right after a MySQL restart:** that's §4, bug 5. Warm the login cache with one TLS login of the app user, or allow public-key retrieval in your local `DATABASE_URL`.
3. **Development servers:**
   - API: `pnpm --filter @meki/api dev` (:4000)
   - website: `pnpm --filter @meki/web dev` (:3000)
   - admin: `pnpm --filter @meki/admin dev`
4. **Unit tests:**
   - `pnpm --filter @meki/admin test`
   - `pnpm --filter @meki/web test`
5. **API e2e tests:** `cd apps/api && npx jest --runInBand`. They use `.env.test`, i.e. `meki_test`, never `meki_dev`.
6. **Workspace validation:** `pnpm turbo run typecheck lint build --force --concurrency=1`
7. **OpenAPI client:**
   - export: `cd apps/api && npx nest build && NODE_ENV=test node dist/openapi-export.js` (boots against the test DB)
   - generate: `pnpm --filter @meki/api-client generate`
8. **Public-site smoke:**
   - start the test API: `NODE_ENV=test PORT=4100 node dist/main.js`
   - build the website against it: `NEXT_PUBLIC_API_URL=http://localhost:4100/api/v1 API_INTERNAL_URL=http://localhost:4100/api/v1 next build`
   - serve it: `next start -p 3001` (port 3001 is in the test API's CORS list)
   - run: `node tests/e2e/site.smoke.mjs`

## 11. Remaining risks

- **Payments:** ticket sales depend entirely on SDI/Zeffy information that hasn't been received (doc 30 §2).
- **Content:** the public launch needs MEKI's content and legal items. The Gala event record is not published in `meki_dev`, so the page uses its built-in approved content, and the calendar file stays unavailable (no start time or time zone).
- **Menus:** the stored menus still contain the old one-page `#anchor` links, so the website uses its built-in menu until an admin fixes and publishes them.
- **Physical verification:** the door check-in hardware test is outstanding.
