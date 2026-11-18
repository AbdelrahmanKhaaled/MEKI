# 24 — Phase 6A: Admin Dashboard foundation & overview

Frontend-only phase: **no backend, schema, migration or auth change**. Audit: [23](23-phase6a-admin-audit.md). Nothing is committed, pushed or deployed.

## 1. Architecture (`apps/admin`)

Next.js 16 (App Router) + React 19 + Tailwind v4 + Lucide, port 3001, workspace package `@meki/admin`. New direct dependencies: **recharts 3.10**, **@tanstack/react-query 5.107**, **zod 4.6** (response validation); fonts/brand files copied unmodified from `apps/web`.

```
src/app/[locale]/(auth)/login · (dashboard)/dashboard      routes (en | ar)
src/lib/        api.ts (only network code) · schemas.ts (zod) · metrics.ts (pure maths) · navigation.ts · format.ts · i18n.ts
src/services/   dashboard.ts  — one function per existing endpoint
src/hooks/      useDashboardData.ts — TanStack Query hooks (keys include range/currency/page)
src/features/   auth/ (AuthProvider, LoginForm) · dashboard/ (DashboardRoute, DashboardPage)
src/components/ layout/ (AppShell, Sidebar, Header, Breadcrumbs) · cards/ · charts/ · common/ (Dropdown, Modal, States, Providers)
tests/          dashboard.test.mjs · e2e/ (stub-api, dashboard.smoke, api-contract)
```

**Same-origin proxy:** `next.config.ts` rewrites `/api/v1/*` → `ADMIN_API_UPSTREAM` (default `http://localhost:4000`; read **at build time**). The API's HttpOnly, `SameSite=Strict` session cookie is therefore set for the admin host; no CORS or credentialed cross-origin calls; compatible with a production reverse proxy doing the same rewrite (see §9).

## 2. Design system

Tokens (`globals.css`): the **official MEKI palette** from the public site — deep green `#0B3B30`, MEKI green `#008066`, gold `#D6A146`, light background `#F5F7F5` — plus line/ink/body greys and semantic ok/warn/danger/info. Source Serif headings + Lato (Arabic: IBM Plex Sans Arabic, same pairing as the website). White cards (radius 1rem, hairline border, soft shadow), dark-green sidebar with a gold active indicator, restrained gradients (tinted KPI/status tiles, one green hero card, gradient bars), focus rings in gold, reduced-motion respected. Layout follows the Preadmin Invoice overview (screenshot reviewed): hero stat + overview row, wide area chart + donut/flow column, progress + vertical bars, gauges + stacked bars, ranked list + timeline + coloured quick actions, wide table; adapted to MEKI data (no copied code/CSS/assets/markup).

## 3. Widget → data (all existing endpoints)

| Widget | Endpoint(s) | Permission |
|---|---|---|
| KPI: confirmed donations | `GET /admin/reports/donations/summary` | `reports.read` |
| KPI: donors / programs | `GET /admin/donors`, `/admin/programmes?status=PUBLISHED&kind=PROGRAMME` (`meta.total`) | `donors.read` / `programmes.read` |
| KPI: confirmed Gala guests | `GET /admin/events` → Gala id; `…/financials` (`ticketsByStatus`) | `events.read` + `gala.bookings.read` |
| Hero (net after refunds), flow tiles, gauges (refund rate, monthly share), stacked one-time vs monthly | `summary` (`confirmed`, `byFrequency`) | `reports.read` |
| Donation overview (status tiles) | `summary` with **no date range** (the API filters status counts by confirmation date, so a period would hide pending/failed) | `reports.read` |
| Trend (gross vs net) | `…/donations/by-date` (daily/monthly bucketing client-side) | `reports.read` |
| Donut, program bars, top campaigns | `…/donations/by-campaign` | `reports.read` |
| Campaign progress | `by-campaign` + `GET /admin/campaigns?status=PUBLISHED` (`targetAmount`) | `reports.read` + `campaigns.read` |
| Gala overview + check-in gauge | `…/financials`, `…/ticketing` (capacity), `…/check-in/statistics` | `gala.bookings.read` (+ `gala.checkin.validate` for the check-in count) |
| Recent activity | `GET /admin/audit-logs?pageSize=6` | `audit.read` |
| Recent donations table | `GET /admin/donations` (`page`, `search`, `paymentStatus`; 8/page) | `donations.read` (donor name needs `donors.read`) |
| Quick actions | in-page anchors (donations table, Gala) for implemented sections; everything else shown disabled "upcoming" | permission-filtered |

Response shapes are **zod schemas written from the backend code** (`lib/schemas.ts`); a response that does not validate is an error state, never rendered. The schemas were validated against the real API: `tests/e2e/api-contract.mjs` checks login, me, csrf, summary, by-date, by-campaign, donations (253 items), campaigns, audit logs, events, Gala financials/ticketing/check-in statistics against a running API (13/13 OK).

## 4. Authentication integration (existing contract only)

Login → `POST /admin/auth/login` (cookie + user + CSRF token); on every load `GET /admin/auth/me`, then `GET /admin/auth/csrf`; the CSRF token lives **in memory only** and is sent as `X-CSRF-Token` on mutations (sign-out is the only one in 6A); any 401 returns to login and **clears the query cache**; sign-out asks for confirmation. Nothing is put in `localStorage`/`sessionStorage`/cookies by the app (the only `localStorage` key is the sidebar-collapsed UI preference, test-enforced). `mustChangePassword` accounts get a notice (the password-change screen is not part of 6A). **Verified:** real login/logout through the proxy against the real API (see §8). **Not verified:** production authentication in the real hosting topology (domains undecided).

## 5. Permissions

`lib/navigation.ts` maps the backend permission keys to navigation items and widgets (`can()`); no second permission system. UI hides sidebar entries, quick actions and widgets the user cannot use; a widget the API refuses (403) shows "no access", not a failure; backend stays authoritative. Door staff (only `gala.checkin.validate`) get no finance overview. Donor names are masked ("Restricted") without `donors.read`.

## 6. Financial metric definitions (enforced in `lib/metrics.ts`, unit-tested)

All money is a decimal **string**; sums use BigInt (6 decimals); charts get numbers only for display. **One currency at a time** (selector; never combined). Only provider-verified payments are "confirmed"; test/mock records are excluded (the dashboard never sets `includeTest`). Net = gross − refunded (as the API reports). Refund rate = refunded ÷ gross; monthly share = MONTHLY gross ÷ total gross (payments, not agreements). Program performance = **direct** programme designations only (campaign and general donations are not attributed to programs). A percentage/gauge/progress exists **only** when its denominator is a real figure (approved campaign target; configured capacity; confirmed guests) — otherwise "—" / "No approved target" / "No approved capacity configured". **No trend badges and no "vs previous period"** are shown (no comparison is computed). **Gala ticket revenue (USD, net of refunds) is read from the ticket ledger only and displayed in its own section; it is never added to donation figures** (test asserts both).

## 7. Navigation

All planned groups are present, filtered by permission. **Only "Dashboard" has a route**; every other entry is rendered disabled with a "Soon" badge (no links to empty pages).

## 8. Tests and results

| Check | Result |
|---|---|
| `pnpm --filter @meki/admin test` (Node runner) | **35 / 35** — BigInt maths, percentages (null on zero), currency separation, trend buckets, status/refund metrics, designation/programme/campaign logic, Gala metrics + separation from donations, period presets, permission navigation (roles, upcoming modules, door staff), formatting (no "US$"), zod boundary rejections (float money, bad currency), EN/AR key parity, static guards (no tokens in storage, `fetch` only in `lib/api.ts`, no hard-coded hosts, no mock data, RTL chart mirroring) |
| Browser, **real API** (`MODE=real`, real login with a seeded `*_test` ADMINISTRATOR; API on the `meki_test` DB) | **11 / 11** — redirect when signed out, wrong password (real 401), login through the proxy, cookie HttpOnly+SameSite=Strict and invisible to JS, no storage besides the UI preference, permission-filtered sidebar, honest empty states (test-provider data excluded), no off-origin requests, CSRF sign-out, session ended |
| Browser, **stub API with FAKE data** (`MODE=stub`, Playwright + Chrome) | **53 / 53** — all widgets/charts render, per-currency switching, period filter, table pagination/search/status filter/detail modal, collapse sidebar, widget error + retry, 401 mid-use → login, finance role (masked donors, locked sections), door staff, no-permission viewer, confirmed sign-out with CSRF, Arabic RTL (sidebar right, axes/gauge mirrored, Arabic labels), no horizontal overflow at 1440/1024/768/390/360 in EN and AR, mobile drawer, **no console or hydration errors** |
| `tsc --noEmit`, ESLint (admin) | 0 errors (2 warnings, both in test fixtures) |
| `pnpm turbo run typecheck lint build --force --concurrency=1` | **10 / 10 tasks** (api, api-client, web, admin). Note: without `--concurrency=1` Turbo can hit an `EEXIST` race between the API's parallel `prisma generate` runs (pre-existing flake, unrelated to this phase) |
| API suite (`npx jest --runInBand`, unchanged code) | see final report |

Visual verification was done on Chrome screenshots (EN/AR, 1440 and 390 px; stored outside the repo). Safari/Firefox/real devices and a print/accessibility audit (screen reader, contrast tooling) were **not** done.

## 9. Environment and deployment

| Variable | Default | Notes |
|---|---|---|
| `ADMIN_API_UPSTREAM` | `http://localhost:4000` | upstream of the `/api/v1` rewrite; **build-time** (baked into the routes manifest) — rebuild when it changes. In production prefer the reverse proxy to own this rule |

Production: serve admin and API behind the same host (or an equivalent proxy rule `/api/v1/* → API`), TLS on (the API uses the `__Host-` cookie prefix in staging/production, which requires `Secure`, `Path=/`, and the cookie's own host); add the admin origin to the API's `ADMIN_URL`/`CORS_ORIGINS` only if you stop using the proxy. Local: `pnpm --filter @meki/admin dev` (3001) with the API on 4000.

## 10. Missing endpoints / limitations (audit gaps that still apply)

G1 no aggregate overview endpoint (≈9 parallel reads on load, cached 60 s); G2 `by-date` has no frequency/designation split or week/month buckets (so the stacked chart is one-time vs monthly totals, not a time series); G3 no payment-method data (no payment-method donut); G4 no top-donor aggregate (top **campaigns** shown instead); G5 no donation export; G6 no notifications feed (no bell); G7 no org-level targets; G9 no failed-jobs count; plus: donation status counts are all-time by design; the donor count is `meta.total` of an unfiltered list; "Active programs" = published programmes of kind PROGRAMME. Comparison with a previous period is intentionally absent.

## 11. Honest status

**Completed:** app foundation, shell (collapsible sidebar, mobile drawer, header, breadcrumbs, profile menu, language switch), login, the full overview (A–K) with loading/error/empty/forbidden states, EN/AR RTL, responsive, tests, build. **Partial:** hero card has no "target" progress (none exists); "View details" shows the list row (no extra donation endpoint call); Arabic text is a technical draft pending MEKI review. **Unverified:** production auth/hosting topology; real-data visuals on non-test data (charts were verified with fake fixtures; the real DB holds only test-flagged donations); non-Chrome browsers.

## 12. Files

*Created:* all of `apps/admin/` (package.json, next/postcss/eslint/tsconfig, `src/**`, `public/brand/*` copies, `src/fonts/*` copies, `tests/**`), this document. *Modified:* `pnpm-lock.yaml` (new workspace package + 3 dependencies). Existing apps/packages untouched in this phase.

## 13. Remaining work

Pages behind the "Soon" entries (donations, donors, campaigns, programmes, events/bookings/guests, QR check-in, content, users, audit, settings); password-change screen; optional backend additions G1/G2 (aggregate + bucketed report) and a donation export; accessibility audit; deployment/proxy configuration once hosting is decided; MEKI approval of Arabic copy and of the admin visual direction.
