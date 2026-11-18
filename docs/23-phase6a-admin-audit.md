# 23 — Phase 6A.0: Admin Dashboard pre-implementation audit

Date: 2026-11-17 · **Audit and planning only.** No source file, dependency, schema, migration or API behaviour was changed; nothing was installed, committed or pushed. This is the only file created.

## 0. Method and a caveat about the visual reference

Read: `CLAUDE.md` (via the session rules), workspace/turbo config, `apps/admin/`, `apps/web` structure and tokens, `apps/api` auth/RBAC/reports/audit code, `permissions.catalog.ts`, the OpenAPI document (165 paths), `packages/*`. **The Preadmin screenshot mentioned in the brief is not present in this conversation**, so I could not look at it. I fetched the public demo page text instead (`preadmin.dreamstechnologies.com/html/invoice/index.html`); §9 is built from that widget list, not from pixels. Colours, chart styles, spacing and card gradients must be confirmed against the screenshot before 6A.1 (decision D1). Note: that demo page is branded “Kanakku” in its footer (it is the Invoice variant of the Preadmin theme); we take only the **layout pattern**, none of its naming, markup, CSS or assets (it is a commercial theme — copying would be a licensing problem).

## 1. Current repository architecture

- **Monorepo:** pnpm workspaces (`apps/*`, `packages/*`) + Turborepo (`build/lint/typecheck/test`). Node ≥ 22.
- **`apps/api`** — NestJS 11, Prisma 7, MySQL 8.4; 165 documented REST paths under `/api/v1`; 333 passing tests (unit + integration on `meki_test`). Phase 5B/5B.1 (Gala booking, tickets, QR check-in, exports, retry jobs) is complete but **uncommitted**.
- **`apps/web`** — Next.js 16 (App Router, React 19.3), Tailwind v4, `lucide-react`, EN/AR with RTL, fonts via `next/font` (Source Serif, Lato, Arabic text/display faces). Phase 5C (public booking UI) is also **uncommitted**. Public helper `lib/api.ts` (`clientApi`, `ApiRequestError`) is public-site specific (credentials omitted).
- **`packages/api-client`** — `openapi.json` + `src/generated/schema.d.ts` (openapi-typescript: `paths`, `components`, `operations`), plus hand-written public response types (`public.ts`) and the `ApiEnvelope`/`ApiErrorBody` shapes. **Admin response bodies are not typed** in the generated file (the Nest controllers declare few response schemas), so admin widgets need hand-written response types (same approach as `public.ts`).
- **`packages/config`, `packages/ui`** — empty directories.
- **Git state:** 48 modified/untracked entries (Phases 5B, 5B.1, 5C + docs). Recommend committing/branching these before 6A so the admin work starts from a clean, reviewable base (decision D8).

## 2. Does `apps/admin` exist?

Only as a placeholder: `apps/admin/.gitkeep`, no `package.json`, no source. It is already matched by `pnpm-workspace.yaml` (`apps/*`) and the API's CORS defaults already name `ADMIN_URL=http://localhost:3001`. `CLAUDE.md` fixes the choice: **admin = separate Next.js app + Tailwind v4**.

## 3. Recommended admin architecture

- **`apps/admin`**: Next.js 16 App Router + TypeScript + Tailwind v4, port 3001, `@meki/api-client` workspace dependency. Locale routing `/[locale]/…` (`en`, `ar`), `dir` set on `<html>` exactly like the web app.
- **Route groups:** `(auth)` — login, forgot/reset password, forced password change; `(dashboard)` — shell + overview + feature areas (donations, donors, campaigns, programmes/content, media, events/gala, finance reports, settings, users/roles, audit). Door-staff get a dedicated mobile-first scanner route instead of the overview.
- **Rendering:** shell is a server component; data widgets are **client components** (the session cookie is bound to the API, not the admin origin — see §7), each isolated behind its own loading/error/empty boundary so one failing endpoint never blanks the dashboard.
- **Data layer:** thin typed wrapper around `fetch` (credentials included, `X-CSRF-Token` on mutations, envelope unwrapping, `ApiRequestError` with stable codes) + a query cache. Money stays a **decimal string** end to end; formatting only with `Intl`; **currencies are never summed** (matches the API contract).
- **Styling:** admin-local Tailwind v4 theme tokens (§5/§10); do not extract `packages/ui` yet (it is empty and a premature shared package would slow 6A) — extract tokens/formatters later if the web app needs them.
- **Same-origin API proxy (recommended):** Next `rewrites` `/api/v1/*` → API. Then the session cookie (`__Host-meki_admin_sid`, HttpOnly, `Secure`, `SameSite=Strict`, host-only) is set for the admin host, there is no CORS/credentials complexity, and the Next middleware can check cookie presence for route guarding. Alternative (cross-origin fetch with `credentials: 'include'`) works only if admin and API share a registrable domain (`SameSite=Strict`) and `CORS_ORIGINS` lists the admin origin; it cannot guard routes server-side.

## 4. Dependencies — availability today

| Need | Installed in workspace? | Recommendation |
|---|---|---|
| next 16.4.5, react 19.3.1, typescript 5.9, tailwind v4 (+postcss) | **Yes** (same as web) | reuse versions |
| `lucide-react` 1.69 | **Yes** | icons |
| `zod` 4.6 | present transitively (not a declared admin dep) | declare if used for form validation |
| `@meki/api-client` | **Yes** (workspace) | add types for admin responses |
| Chart library | **No** (only d3-* utilities as transitive deps) | **Recharts** (React 19-compatible) covers area/line, donut, horizontal/vertical/stacked bars and radial/semi-circle gauge with one dependency; RTL handled by mirroring axes (§11). Alternatives considered: ECharts (heavier, weaker React/RTL ergonomics), hand-rolled SVG (more code, but zero dependency — viable for gauge/progress only) |
| Data fetching/cache (TanStack Query / SWR) | **No** | `@tanstack/react-query` for caching, retries, stale/loading/error states; hand-written hooks are an acceptable fallback |
| Table (TanStack Table) | **No** | not needed for 6A: simple typed tables with server-side pagination (API already paginates) |
| Form libs, date-fns, clsx/tailwind-merge, Radix | **No** (a few `@radix-ui` pieces exist only transitively) | start with plain controlled forms, `Intl` for dates, a tiny `cn()` helper; add Radix primitives (dialog/dropdown/popover) only when 6A needs accessible menus — decide at implementation |

Net new direct dependencies for 6A: **recharts, @tanstack/react-query** (optionally clsx). All to be installed only in the implementation phase.

## 5. Design system (proposed)

Proposed admin palette: Primary `#073F32`, Dark/secondary `#145A45`, Gold `#E4C477`, Background `#F5F7F5`. **Discrepancy:** the public site/brand kit tokens are `#0B3B30` (deep green), `#008066`/`#006B55` (MEKI green), `#D6A146` (harvest gold), limestone background. The proposed values are close but not identical (D2). Recommendation: keep brand continuity by defining admin tokens as a documented *admin tint scale* derived from the brand greens, and use the proposed hexes only if MEKI approves them as the admin palette; do not modify the logo files. Also needed: semantic colours (success/warning/danger/info) with WCAG AA contrast, chart series palette (colour-blind-safe, ≥ 3:1 against card), dark-on-gradient text rules for the gradient stat cards.

Cross-cutting requirements: EN LTR / AR RTL, responsive 1440/1024/768/390/360, loading skeletons, error panels with retry, empty states that say *why* (no verified data yet vs. filtered out), forbidden state, role-based navigation, `prefers-reduced-motion`, keyboard/focus visibility.

## 6. Existing API available to the dashboard

All paths are `/api/v1`, session + (mutations) CSRF, permission-checked server-side.

| Area | Endpoints (read-oriented) | Permission |
|---|---|---|
| Auth | `POST /admin/auth/login`, `POST /logout`, `GET /me` (user, roles, effective permissions), `GET /csrf`, + 3 password endpoints | public / session |
| Finance reports | `GET /admin/reports/donations/summary`, `/donations/by-campaign`, `/donations/by-date`, `/campaigns/:id`, `/payments`, `/refunds`, `/recurring` (query: `from`, `to`, `currency`, `includeTest`) | `reports.read` |
| Donations & donors | `GET /admin/donations`, `/:id`, `GET /admin/donors`, `/:id` | `donations.read` (donor PII needs `donors.read`) |
| Payments | `GET /admin/payments/transactions`, `/webhooks`, providers, currencies | `payments.read/manage` |
| Refunds / receipts / recurring | `/admin/refunds`, `/admin/receipts`, `/admin/recurring-donations` | respective `*.read` |
| Campaigns, programmes, projects, statistics, faqs, cms, media, settings | list/detail/edit/publish endpoints | `campaigns.*`, `programmes.*`, `statistics.*`, `faq.*`, `content.*`, `media.*`, `settings.*` |
| Events | `/admin/events` (39 paths incl. CMS sections, gallery, approval, publish) | `events.*` |
| Gala ticketing | `/admin/events/:id/{ticketing, bookings, guests, guests/export, tickets, financials, check-in/statistics, check-in/validate, jobs/run}` | `gala.*` |
| Users / roles / audit | `/admin/users`, `/admin/roles`, `/admin/permissions`, `GET /admin/audit-logs` (filters: action, entityType, actorId, date range; paginated, newest first) | `users.*`, `roles.*`, `audit.read` |

Response conventions: `{ data }` / `{ data, meta: { page, pageSize, total, totalPages } }`; errors `{ error: { statusCode, code, message, details?, requestId } }`; amounts are decimal strings; every report is **per currency** and excludes test-provider records unless `includeTest=true`.

## 7. Authentication and permission integration plan

1. **Login page** → `POST /admin/auth/login` (5 attempts/min/IP, lockout after 5 failures — surface the generic error and the 429). Response carries the user and a CSRF token; keep the CSRF token **in memory** only.
2. **Session bootstrap:** on every app load call `GET /admin/auth/me`; 401 → login; `mustChangePassword` → the password-change page only (the API enforces `PASSWORD_CHANGE_REQUIRED` everywhere else).
3. **Idle/absolute expiry** (30 min sliding / 12 h): global 401 handler returns to login preserving the target path; show a “session expired” message, never loop.
4. **CSRF:** `X-CSRF-Token` on all POST/PATCH/PUT/DELETE; on 403 `CSRF_INVALID` call `GET /csrf` once and retry.
5. **Permissions in the UI:** `PermissionGate`/nav filter from `me.permissions` (SUPER_ADMIN bypass flag from `isSuperAdmin`). This is **UX only**; the server remains authoritative and widgets must handle 403 gracefully (a hidden widget and a forbidden widget are different states).
6. **Navigation ↔ permission map:** Overview (any authenticated; widgets individually gated) · Donations (`donations.read`) · Donors (`donors.read`) · Finance reports (`reports.read`) · Payments/Webhooks (`payments.read`) · Refunds (`refunds.*`) · Receipts (`receipts.read`) · Campaigns (`campaigns.read`) · Programmes/Content/Media/FAQ/Statistics (their `.read`) · Events & Gala (`events.read`, `gala.*`) · Check-in scanner (`gala.checkin.validate`) · Users/Roles (`users.read`, `roles.read`) · Audit (`audit.read`) · Settings (`settings.read`).
7. **Role-aware landing:** `EVENT_CHECKIN_STAFF` (only `gala.checkin.validate`) must land on the scanner, not an overview full of 403s; `CAMPAIGN_MANAGER`/`CONTENT_MANAGER` see no finance widgets beyond what they hold (`CAMPAIGN_MANAGER` has `reports.read`).
8. **Logout** → `POST /logout`, clear client caches (they contain financial data).
9. **Security headers/CSP** for the admin app (no third-party scripts, `frame-ancestors 'none'`), `noindex`.

## 8. Dashboard widget → API mapping

Legend: **OK** = data exists today · **Partial** = derivable with client-side work or caveats · **GAP** = no endpoint.

| # | Widget | Source | Status / notes |
|---|---|---|---|
| 1 | Gradient statistics cards (Total confirmed donations, donation count, one-time vs monthly, donors, active campaigns) | `donations/summary` (`confirmed[]` gross/refunded/net/count per currency, `byFrequency[]`), `GET /admin/donors` `meta.total`, `GET /admin/campaigns` `meta.total` | **OK**. One card set **per selected currency** (selector); no cross-currency totals. “+20 % vs last period” = two summary calls with consecutive ranges (**Partial**, client-computed) |
| — | Gala ticket revenue card (separate, labelled “Ticket revenue — not donations”) | `GET /admin/events/:id/financials` (needs the Gala event id from `GET /admin/events`) | **OK**, requires `gala.bookings.read`; must never be added to donation totals |
| 2 | “Invoice overview” equivalent → **Donation status overview** (Confirmed / Pending / Failed / Cancelled / Refunded) | `summary.donationsByStatus[]`, `payments` report (attempt statuses), `refunds` report | **OK**. There is no “Overdue” analogue — drop it |
| 3 | Dual line/area chart (“Revenue & Expenses” → **Gross vs Refunded/Net donations over time**) | `donations/by-date` (per UTC day, per currency: count, gross, net) | **OK**; weekly/monthly buckets aggregated client-side. **No expense data exists** and MEKI is not an accounting system → do not render “expenses” |
| 4 | Donut chart | `summary.byFrequency` (one-time vs monthly) or `by-campaign` designation split (general fund / campaign / programme) | **OK**. The Preadmin “payment method” donut has **no source** (no payment-method field is stored) → **GAP, do not fake** |
| 5 | Horizontal progress bars | `donations/by-campaign` (net per campaign) joined with `GET /admin/campaigns` (`targetAmount`, only where MEKI-approved) | **Partial**: progress shown **only** for campaigns with an approved target; others show raised amount without a bar. No org-level revenue target exists → no “Revenue Target” bar |
| 6 | Vertical gradient bar chart | `by-campaign` (net per campaign) or monthly donation counts from `by-date` | **OK** |
| 7 | Colored metric cards | `refunds` (count/amount by status), `recurring` (monthly amount by status), `payments` (attempt outcomes), failed/needs-review webhooks via `GET /admin/payments/webhooks?status=FAILED` | **OK** |
| 8 | Gauge / semi-circle charts | refund rate = refunded ÷ gross (client-computed from summary); campaign target % (item 5); Gala check-in % from `check-in/statistics.percentCheckedIn` | **Partial** (computed ratios; no stored KPIs/targets) |
| 9 | Stacked bar chart | Gala tickets by status (`financials.ticketsByStatus`, `check-in/statistics.byStatus`); donations by designation per campaign | **Partial**. `by-date` is **not** grouped by frequency or designation, so a *time-series* stack needs a new endpoint (G2) |
| 10 | Recent activity timeline | `GET /admin/audit-logs?pageSize=…` (newest first; `action`, entity, actor, time; metadata is PII-scrubbed) | **OK**, requires `audit.read` (hide widget otherwise). Needs human-readable labels for action keys (client mapping) |
| 11 | Recent donations table | `GET /admin/donations?pageSize=8&sort=createdAt:desc` | **OK**. Donor name/e-mail only with `donors.read`; otherwise masked columns; test records excluded by default |
| 12 | Quick actions | Links into feature screens: new campaign, edit homepage content, upload media, view pending refunds, export guests (`gala.guests.export`), run webhooks retry | **OK** (navigation only; each gated by permission). “Export data” for donations has **no endpoint** (G5) |
| — | Preadmin extras: Top customers, Profit margin, Cash flow, Weekly sales, Expense breakdown | — | **Not applicable** (no expense/profit data). “Top donors” would expose PII and has **no aggregate endpoint** (G4) — decide, don't invent |

Honesty rules for the data layer: show `includeTest` data only behind an explicit, visibly badged “Test data” toggle that is **disabled in production builds**; empty/zero states must say “No verified payments yet”, never placeholder charts; the dev DB currently has only a handful of (test-provider) rows, so most widgets will correctly render empty until real payments exist.

## 9. Preadmin reference breakdown (from the demo page text; confirm against the screenshot)

- **Sidebar** (grouped sections, collapsible, an “upgrade” card at the bottom) → MEKI: grouped nav (Overview · Fundraising · Content · Events · Finance · Administration), collapsible, bottom card repurposed as “Environment / payments status” (shows payments disabled/enabled and test mode — real data from `/admin/payments/providers`).
- **Header:** logo, “Create new” menu, date-range picker, Export (PDF/Excel), language selector, notifications, profile menu → MEKI: Create-new (campaign, event, content) by permission; **global date range** driving every widget (`from`/`to`); EN/AR switch; profile menu (account, sign out); Export only where an endpoint exists (guest CSV/XLSX today); notifications **GAP** (no endpoint) — use a “needs attention” indicator fed by failed webhooks/pending refunds instead.
- **Overview order (13 widgets):** revenue stat + target bar → invoice overview with status tiles → revenue vs expenses chart → weekly sales → top products → payment-method distribution → cash flow tiles → profit-margin block → expense breakdown → top customers → recent activity → quick actions → recent invoices table. MEKI adaptation keeps this **arrangement** (hero stat row, status tiles, wide time-series, side distribution cards, bottom activity/quick-actions/table row) with the data mapped in §8.
- Styling cues to carry over (to verify visually): soft card surfaces with generous radius, gradient stat cards, coloured status tiles, thin progress bars, rounded chart containers, compact table with status pills. Improvements for MEKI: brand greens/gold, serif display headings (brand), stronger contrast, Arabic typography, calmer motion.

## 10. Reusable component architecture (apps/admin)

`shell/` AppShell, Sidebar (collapsible, RTL-aware), Header (DateRange, LocaleSwitch, UserMenu, EnvBadge) · `auth/` AuthProvider, PermissionGate, SessionGuard · `data/` `api()` client, query hooks per endpoint, response types, `useCurrency()` · `ui/` Card, StatCard (gradient variants), MetricCard (colour variants), StatusPill, ProgressBar, Skeleton, DataTable (server-paginated), Pagination, Tabs, Dialog/Menu (accessible), EmptyState/ErrorState/ForbiddenState, **WidgetBoundary** (loading + error + empty + forbidden in one wrapper) · `charts/` AreaDualChart, DonutChart, HBarList, VBarGradient, GaugeSemi, StackedBar, ChartLegend, ChartTooltip (all RTL-mirrored, all fed by already-formatted view models) · `format/` Money (decimal-string → Intl, USD whole amounts like the web app), DateTime, Number, `bdi` helpers · `i18n/` EN/AR dictionaries + `dir` helper. Rules: widgets take typed view-models, never raw API shapes; no widget fetches without a boundary; charts never receive floats computed from money strings (use scaled decimals / integer minor units).

## 11. RTL/LTR strategy

`<html lang dir>` from the locale; Tailwind **logical utilities only** (`ms-/me-/ps-/pe-/start-/end-/text-start`); sidebar anchored with `inset-inline-start`; header actions in DOM order that flips naturally with flex; directional icons (chevrons, arrows, “back”) mirrored with `rtl:` variants; Latin data inside Arabic (references, e-mails, phone numbers, USD amounts) isolated with `<bdi>`/`dir="ltr"`; **Western digits** in both locales (the existing web decision); charts: x-axis `reversed` and y-axis `orientation` swapped in RTL, legend and tooltip alignment mirrored, donut/gauge sweep direction mirrored, time-series reads right-to-left; tables align start and keep numeric columns end-aligned and LTR; Arabic fonts reuse the web app's Arabic faces; verification matrix 1440/1024/768/390/360 × EN/AR with real-browser smoke tests (same approach as Phase 5C).

## 12. Recommended implementation sequence

- **6A.1 Foundation:** scaffold `apps/admin` (Next 16, Tailwind v4, ports/env, CSP/noindex), tokens, fonts, i18n/RTL plumbing, API proxy, typed client + admin response types, formatters, `cn()`.
- **6A.2 Auth & shell:** login / session bootstrap / expiry / CSRF / forced password change, AppShell (sidebar + header), permission-aware navigation, role landing (scanner for door staff), global date-range + currency selectors.
- **6A.3 Overview, KPI layer:** WidgetBoundary, StatCards, status tiles, metric cards, recent donations table, activity timeline, quick actions (all items marked OK/Partial in §8).
- **6A.4 Charts:** area, donut, bars, gauge, stacked (Recharts), RTL mirroring, reduced motion; empty-state honesty.
- **6A.5 Gala widgets:** Gala event discovery, ticket-revenue card (separate), bookings/check-in stats, guest export buttons (CSV/XLSX), failed-jobs/refund-pending attention list.
- **6A.6 Hardening:** accessibility pass, responsive + RTL browser matrix, error/403/429 states, performance (query batching, stale-while-revalidate), tests (view-model/format unit tests, browser smoke), docs.
- Feature CRUD screens (campaigns, content, users…) belong to later phases (6B+); 6A is the overview and shell.

## 13. Missing endpoints / gaps (documented, not invented)

| ID | Gap | Impact | Suggested backend work (later, small) |
|---|---|---|---|
| G1 | No dashboard aggregate endpoint | ~6–8 parallel calls on load | optional `GET /admin/reports/overview` returning summary + by-date + status counts in one response (still per currency) |
| G2 | `donations/by-date` has no frequency/designation split, no week/month bucketing | stacked time-series impossible; client must bucket | `groupBy=frequency|designation`, `interval=day|week|month` query params |
| G3 | No payment-method data | “Payment method” donut impossible | none unless the provider supplies it (Zeffy decision) |
| G4 | No top-donor aggregate | “Top customers” widget | aggregate endpoint gated by `donors.read`, anonymous donors excluded |
| G5 | No donation export (CSV/XLSX) | Preadmin “Export” only for guests | follow the guest-export pattern |
| G6 | No notifications feed | bell icon | derive from failed webhooks / pending refunds / failed jobs (needs a counts endpoint) |
| G7 | No org-level or period targets | “Revenue target” bar | none — only approved campaign targets exist |
| G8 | Admin response bodies untyped in OpenAPI | hand-written types | add `@ApiOkResponse` schemas, regenerate client |
| G9 | No per-event listing of “jobs/FAILED” count | attention card | counts on booking list or a small stats endpoint |
| G10 | Gala event id must be discovered via `GET /admin/events` (code `EVT-GALA-NIGHT`) | extra call | acceptable |

## 14. Risks and unresolved decisions

- **D1** Preadmin visual reference unavailable to me as an image — need the screenshot (or confirmation of the widget list above) before design tokens/layout are fixed.
- **D2** Admin palette (`#073F32/#145A45/#E4C477/#F5F7F5`) vs the brand kit/web tokens — which is authoritative?
- **D3** Same-origin proxy vs cross-origin cookie (needs deployment topology: admin and API hostnames; `SameSite=Strict` and `__Host-` prefix constraints).
- **D4** Chart library choice (Recharts recommended) and RTL mirroring effort; bundle-size budget.
- **D5** Multi-currency presentation: USD only is confirmed for the Gala; donations support several currencies — single selector vs side-by-side cards (never combined).
- **D6** Test-data visibility in non-production; mock/test donations must never look real.
- **D7** Financial-data exposure: dashboard shows totals/donor PII — confirm which roles see what (current RBAC is a proposal pending MEKI sign-off), data-retention and screenshot/export policy.
- **D8** Uncommitted Phases 5B/5B.1/5C — commit or branch first so admin work is reviewable.
- **D9** Licensing: Preadmin is a purchased theme; reimplement the layout, do not copy its HTML/CSS/JS/images (and do not carry “Kanakku” naming).
- **D10** Scope boundary: overview + shell only in 6A; CRUD screens deferred; donation exports and notifications depend on backend additions.
- Technical risks: widget fan-out latency (mitigate with query cache and G1), session-expiry edge cases mid-render, floating-point errors if money is charted (use integer minor units), empty datasets looking “broken” (honest empty states), Arabic chart typography.

## 15. Recommendation

Proceed with Phase 6A as **6A.1 → 6A.6** in a new `apps/admin` Next.js app using a **same-origin API proxy**, Recharts + TanStack Query as the only new direct dependencies, hand-written admin response types, and the widget mapping in §8 — rendering only what the existing endpoints can truthfully supply (per-currency donation KPIs, status overview, time series, campaign progress where targets are approved, refunds/recurring/payment-health cards, recent donations, audit timeline, Gala ticket revenue kept **separate**), and documenting G1–G10 instead of inventing data. Before starting 6A.1: (1) provide the Preadmin screenshot / confirm the palette (D1, D2), (2) confirm hosting topology for cookies (D3), (3) commit or branch the pending 5B/5B.1/5C work (D8). Backend gaps G1/G2 are optional optimisations that can follow once the first version is running.
