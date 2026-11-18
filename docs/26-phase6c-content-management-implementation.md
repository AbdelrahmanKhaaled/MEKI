# 26 — Phase 6C: Programs, Causes, Campaigns & Media management (admin)

Date: 2026-11-17 · Builds on [24](24-phase6a-implementation.md) and [25](25-phase6b-donations-admin-implementation.md). Nothing was committed, pushed or deployed. **No schema change and no migration.** Homepage CMS, FAQs, statistics and site settings are out of scope (Phase 6D).

## 0. Session history (checkpoints)

Phase 6C ran across three Claude Code sessions.

1. **Session 1:** API additions (§4) and `apps/api/test/content-6c.e2e-spec.ts`. The 6C and campaigns specs passed 16/16. The session stopped at its usage limit.
2. **Session 2:** recovered from the files, then built the admin API client extensions, all pages, components and unit tests, and the contract and smoke scripts. It was interrupted (accidental exit) while adding failed-mutation capture to the browser smoke.
3. **Session 3:** recovered again. It checked the debug cause `PRJ-E2EDBGX1` (exists only in `meki_test`, under "Health Access, Coverage & Quality", no campaigns) and did not duplicate it. It then captured the failing mutations, fixed one real app bug and several harness issues (§9), and completed verification and this document.

## 1. Hierarchy decision: Program → Cause → Campaign

| Requirement | Existing model | Verdict |
|---|---|---|
| A Program has many Causes | `Project.programmeId → Programme` (1:N) | ✔ |
| A Cause has many Campaigns | `Campaign.projectId → Project` (1:N) | ✔ |
| A Campaign belongs to a Program | `Campaign.programmeId` (needed for publishing rules and reports) | ✔ (stored on both levels) |
| Consistency between the two levels | **not enforced before 6C** | added as API guards (§4), no schema change |
| Bilingual name, location, provenance, source | `nameEn/Ar`, `locationEn/Ar`, `provenance`, `sourceRef`, `sourceFolder` | ✔ |
| Separate public pages | none — causes are not public at launch (brief) | ✔ consistent |
| Cover/gallery, description, publish/delete for causes | **not in the model or API** | not invented; shown as "not supported" in the UI |

**Mapping:** the admin calls the existing **`Project`** model a **"Cause"**. Database, API paths and fields keep their names (`/admin/projects`, `projectId`). No duplicate entity or relationship was created. Existing data was consistent: every seeded campaign's project belongs to the campaign's programme (contract check, §8).

## 2. Implemented routes (`apps/admin`, all under `/en` and `/ar`)

| Route | Page | Sidebar |
|---|---|---|
| `/programs`, `/programs/new`, `/programs/[id]` | List (search; status, kind and provenance filters; cover; cause and campaign counts; updated). Editor: bilingual fields side by side, cover, gallery, SEO, metadata, publish/unpublish/delete with gates, causes of the program, audit | Programs |
| `/causes`, `/causes/new`, `/causes/[id]` | List (search; program and provenance filters; campaign count). Editor: explicit parent program (locked once the cause has campaigns), bilingual name and location, provenance, campaigns of the cause, audit | Causes |
| `/campaigns`, `/campaigns/new`, `/campaigns/[id]` | List (search; status, program, cause, provenance and start-date filters; cover, target, collected, approval). Editor with 6 tabs: Basic · Program & cause · Fundraising · Media · Publishing & approval · Activity | Campaigns |
| `/media`, `/media/[id]` | Library (grid/list; search, category, provenance and consent filters; inline uploader). Detail: preview, metadata editing, "In use by", guarded delete, audit | Media Library |

Filters are kept in the URL, and back links restore the list's query (6B pattern). The dashboard quick actions "Manage programs" and "Manage campaigns" now link to these pages. The other "Soon" entries are unchanged.

## 3. Components

- `components/content/ui.tsx` (new): `ProvenanceBadge` (three distinct styles, DEMO in red), `ContentStatusBadge`, `ProvenanceNotice`, `Field`/`TextInput`/`TextArea`/`Select`/`Checkbox`, `Bilingual` (English LTR + Arabic RTL; side by side from md up, stacked below), `SaveBar` (sticky, counts unsaved changes, warns on tab close), `ContentGateNotice`, `Checklist`, `Thumb` (falls back to a placeholder when an image can't load), `useContentError`, `serverReasons`.
- `components/content/media.tsx` (new):
  - `Uploader`: drag-and-drop or browse, sequential uploads with per-file progress, client pre-checks, server duplicate detection with "use existing"
  - `MediaPicker`: browse/upload tabs, search/category/provenance filters, single or ordered multi-select
  - `CoverField` and `GalleryField`
- Reused unchanged from 6A/6B: `AppShell`, `PageHeader`, `DataTable`, `FilterBar`, `SearchFilter`, `SelectFilter`, `DateRangeFilter`, `Pagination`, `Tabs`, `ConfirmDialog`, `Notice`, `DetailGrid`, `AuditList`, `FinancePage` (permission gate), `useUrlState`, `useDetailHref`/`useBackHref`.
- 6A `Modal` gained an optional `size="xl"`; the default is unchanged.
- Data layer:
  - `lib/content-schemas.ts`: zod, written from the services
  - `lib/content.ts`: pure gates and validation mirroring the API
  - `lib/i18n-content.ts`: EN/AR
  - `services/content.ts`: one function per endpoint
  - `hooks/useContentData.ts`: stable `["content", …]` keys; mutations invalidate the content, audit and dashboard caches
  - `hooks/useForm.ts`

**API client (`lib/api.ts`, still the only network module):**
- PATCH, PUT and DELETE (204), plus `apiUpload` (XMLHttpRequest with upload progress, same CSRF/401/envelope rules)
- one automatic CSRF refresh and retry on `403 CSRF_INVALID`
- `ApiError.details`/`apiMessage`, so publish blockers and a duplicate's ID reach the UI

## 4. API endpoints

**Reused** (all `/api/v1/admin`):

| Area | Endpoints |
|---|---|
| Programmes | `GET/POST programmes`, `GET/PATCH/DELETE programmes/:id`, `PUT programmes/:id/gallery`, `POST programmes/:id/{publish,unpublish}` |
| Projects (causes) | `GET/POST projects`, `PATCH projects/:id` |
| Campaigns | `GET/POST campaigns`, `GET/PATCH/DELETE campaigns/:id`, `PUT …/gallery`, `POST …/{submit,publish,pause,resume,complete,unpublish,archive,approve,revoke-approval}`, `PATCH …/donations` |
| Media | `POST media` (multipart), `GET media`, `GET/PATCH/DELETE media/:id`, files at `/media/uploads/*` |
| Supporting | `GET settings/donation` (`paymentsEffective`), `GET /public/donations/config`, `GET reports/campaigns/:id`, `GET reports/donations/by-campaign`, `GET audit-logs?entityType&entityId` |

**Backend additions** (additive, no schema change, tested in `content-6c.e2e-spec.ts`):

| Change | Why |
|---|---|
| `GET /admin/projects/:id`: project + programme (status/kind) + non-deleted campaigns (target as a decimal string) | Cause detail page |
| `GET /admin/projects`: optional `search`, `provenance` (alongside `programmeId`); rows add the programme's `nameAr/status/kind` and `_count.campaigns`. Still an unpaginated array, still strictly validated | Causes list, filters, counts |
| `GET /admin/programmes?provenance=`, `GET /admin/media?provenance=` | Provenance filters |
| `GET /admin/campaigns?projectId=&startsFrom=&startsTo=` | Cause and date-range filters |
| Campaign create/update: **422 `PROJECT_PROGRAMME_MISMATCH`** if the project belongs to another programme. Checked only when `programmeId`/`projectId` is part of the request; projects without a programme don't constrain (legacy data) | Enforces the hierarchy |
| Project update: **409 `PROJECT_HAS_CAMPAIGNS`** when changing (or clearing) the programme of a project that has campaigns | Keeps existing campaigns consistent |

Unchanged: public endpoints, publishing rules, approval, payments, donations, accounting and the media pipeline.

## 5. Permissions (backend keys; the UI only mirrors them)

| Page / action | Needs |
|---|---|
| Programs and Causes pages | `programmes.read` |
| Create/edit programs and causes, delete programs | `programmes.manage` |
| Publish/unpublish programs | `programmes.publish` |
| Campaigns pages | `campaigns.read` |
| Create/edit/submit/delete campaigns | `campaigns.manage` |
| Publish/pause/resume/complete/unpublish/archive, open/close donations | `campaigns.publish` |
| Approve/revoke approval | `campaigns.approve` |
| Media pages | `media.read` |
| Upload and edit media metadata | `media.upload` |
| Delete media | `media.delete` |
| Collected amounts | `reports.read` |
| Payment state | `settings.read`, otherwise the public config |
| Audit sections | `audit.read` |

Role effects verified against the real API:
- **CAMPAIGN_MANAGER:** programs read-only; campaigns can be managed and published but not approved.
- **CONTENT_MANAGER:** cannot create campaigns; can edit media metadata but not delete media.
- **EVENT_CHECKIN_STAFF:** no-access state on all four modules, no requests sent, and the API itself answers 403.

## 6. Campaign lifecycle, approval and donations

- **Transitions** mirror `campaign.rules.ts` exactly: submit, publish, pause, resume, complete, unpublish, archive. Only actions valid for the current status are listed. Each disabled action shows its exact reason.
- **Publishing checklist** (= the API's blockers):
  - MEKI approval recorded
  - not DEMO
  - English title
  - English summary
  - a related program, which must be published
  - end date after start date
  - end date not passed

  If the API still refuses, its `details.reasons` are shown in the dialog.
- **Approval** needs a reference (5–2000 characters). It is refused for DEMO and for completed/archived campaigns. Revoking requires unpublishing first.
- **Financial fields:**
  - Changing target, currency or provenance on an approved campaign warns that approval will be reset (API rule).
  - On a live campaign, saving is blocked (`LIVE_CAMPAIGN_FINANCIAL_CHANGE`).
- **Donations:** "Open" requires a published campaign and `paymentsEffective`, which is what the API checks. Unknown payment state is treated as blocked. Closing is always possible with the permission. Payments are disabled on the platform (and on `meki_test`), so donations were never opened.
- **Amounts:** the form validates exact decimals (≤ 12 integer digits, ≤ 2 decimals) and sends JSON numbers, because the DTO requires numbers; ≤ 14 significant digits survive exactly. Values from the API are decimal strings (zod rejects floats). Collected amounts come only from the finance report (verified payments, test records excluded, per currency, never combined). The frontend never sends a raised/collected figure.
- Only changed fields are PATCHed, so an untouched target is never resent and never resets approval by accident.

## 7. Provenance and media

**Provenance:**
- Every list and detail page shows a provenance badge plus a notice explaining what it means.
- Provenance can be changed only where the existing PATCH DTOs allow it (manage permissions), and the audit log records it.
- **DEMO is never offered for approval or publishing**, in the UI and in the API. The UI is stricter than a staging API with `ALLOW_DEMO_PUBLISH=true`, on purpose.

**Media:**
- **Upload:** JPEG/PNG/WebP up to 10 MB; client pre-check, then the API's magic-byte check, re-encoding, metadata stripping, and duplicate detection by checksum (`DUPLICATE_MEDIA` → "already in the library", with "use existing"). Upload progress comes from XHR.
- **Previews:** uploaded files load through a new same-origin rewrite `/media/uploads/*` → API (`next.config.ts`). The admin session cookie therefore lets `media.read` users preview assets that are not public yet, without exposing private URLs elsewhere. Curated WEB_STATIC images are served by the public website. When an image can't load, the thumbnail shows a placeholder.
- **Proxy body limit (found and fixed during testing):**
  - Next 16 cuts proxied request bodies at 10 MiB by default. An 11 MB upload returned a bare **500**, and a file just under 10 MB plus the multipart envelope could have been truncated.
  - `experimental.proxyClientMaxBodySize` is now `"12mb"`, so the API remains the only enforcer of the 10 MB file limit. Over-limit uploads now get the API's own 413, and a 9.7 MB image uploads through the proxy (both verified).
- **Picker:** browse or upload, select a cover or an ordered gallery. Only real media IDs are sent (`coverMediaId`, `PUT …/gallery {mediaIds}`), and nothing is copied.
- **"In use by"** shows the API's usage counts. Delete is disabled with the reason while the asset is in use (`MEDIA_IN_USE`) or curated, and always asks for confirmation.

## 8. Tests and results

| Check | Result |
|---|---|
| Admin unit tests `pnpm --filter @meki/admin test` | **99/99** (72 from 6A/6B + 27 new 6C): program gates, campaign transitions/checklist/approval/donation/delete/edit gates, financial-change effect, hierarchy, exact decimals, suggested amounts, dates/codes/slugs, PATCH diff, upload pre-checks, preview routing, media delete gate, zod mapping, navigation + route files, EN/AR coverage, static guards |
| API `jest --runInBand` (meki_test; `migrate deploy` + idempotent seed only) | **339/339**, 19 suites. The new `content-6c.e2e-spec.ts` has 6 tests: project detail/filters/counts/403, mismatch on create and update, programme change guard, campaign projectId/date filters, programme/media provenance filters, public endpoints unchanged |
| `tsc --noEmit` / ESLint (admin) | 0 errors; 2 warnings, both pre-existing in 6A fixtures. The 6 warnings in the 6B `finance-contract.mjs` were fixed |
| `pnpm turbo run typecheck lint build --force --concurrency=1` | **10/10 tasks** |
| `tests/e2e/content-contract.mjs` against the real API (meki_test, GET only) | **17/17**, including 9 official programmes verified, hierarchy consistent in existing data, additive fields present |

## 9. Browser verification (Playwright + Chrome, production build)

- **Real API** (`tests/e2e/content.smoke.mjs`): API from the current code on :4100 against **meki_test**, admin build on :3003, accounts `p6c-{admin,campaign,content,door}-*@meki.test`. Final run **117/117**:
  - the nine official programs listed (verified, kind Program)
  - DEMO program created, not publishable (exact reasons), edited, then deleted
  - uploads: PNG, JPEG + WebP, duplicate, > 10 MB refused client-side, fake PNG refused by the server, 9.7 MB through the proxy, 413 from the API through the proxy
  - media metadata edited
  - cause created from its program page (program preselected)
  - campaign created from its cause, with an exact decimal target round-trip and decimal validation
  - hierarchy reset when the program changes
  - cover and ordered gallery set through the picker
  - "In use by" blocks deleting the image; the cause's program is locked once it has campaigns
  - checklist → approval → publish → live financial-change block → unpublish → approval-reset warning → revoke → archive (editing locked) → audit trail
  - open donations blocked because payments are disabled
  - the three role checks
  - Arabic RTL (field directions, labels, sidebar)
  - no horizontal overflow on 9 pages × 1440/768/390 × EN/AR
  - cleanup: campaign deleted, then the now-unused image deleted
  - no console or page errors
- **Regression on the same build (stub API):** 6B 134/134, 6A 53/53. The 6A quick-actions check was updated for the two new links.
- **Bugs found and fixed:**
  1. Proxy body limit (§7).
  2. After a delete, the page stayed on the deleted record. The shared mutation `onSuccess` awaited cache invalidation, the refetch (404) unmounted the editor, and TanStack Query then dropped the per-call navigation callback. Invalidation is now started without being awaited.
  3. Broken-image icons when curated images are unavailable (placeholder fallback).
- **Harness issues fixed:**
  - client-side navigations never fire `load`
  - fixtures and slugs must be unique per run (the API correctly answered `DUPLICATE_MEDIA`/`CONFLICT`)
  - stale picker results while a new search loads
  - the API's login rate limit (429) during repeated logins

## 10. Files

**Added:**
- `apps/admin/src/lib/content.ts`, `apps/admin/src/lib/content-schemas.ts`, `apps/admin/src/lib/i18n-content.ts`
- `apps/admin/src/services/content.ts`
- `apps/admin/src/hooks/useContentData.ts`, `apps/admin/src/hooks/useForm.ts`
- `apps/admin/src/components/content/{ui,media}.tsx`
- `apps/admin/src/features/content/{programs,causes,campaigns,media}/*`
- 11 route files under `apps/admin/src/app/[locale]/(dashboard)/{programs,causes,campaigns,media}/…`
- `apps/admin/tests/content.test.mjs`, `apps/admin/tests/e2e/{content.smoke,content-contract}.mjs`
- `apps/api/test/content-6c.e2e-spec.ts`
- this document

**Modified:**
- admin:
  - `src/lib/api.ts`, `src/lib/navigation.ts` (4 hrefs), `src/lib/i18n.ts` (`content` dictionary, quick-action subtitles)
  - `next.config.ts` (media rewrite, proxy body limit)
  - `src/components/common/Modal.tsx` (`size`), `src/features/dashboard/DashboardPage.tsx` (2 quick-action links)
  - `tests/dashboard.test.mjs` (route list), `tests/e2e/dashboard.smoke.mjs` (quick-actions check), `tests/e2e/finance-contract.mjs` (lint)
- api:
  - `src/modules/programmes/{programmes.dto,programmes.module,programmes.service}.ts`
  - `src/modules/campaigns/{campaigns.dto,campaigns.service}.ts`
  - `src/modules/media/{media.dto,media.service}.ts`
- `docs/README.md`

**Not changed:** Prisma schema, migrations, `.env*` files, the MySQL port, auth, payments/donations/accounting, the public web app, dependencies.

**Database changes:** none to the structure. The development database was not touched. `meki_test` gained test records:
- accounts `p6c-*@meki.test`
- per smoke run one cause `PRJ-E2E<run>` (causes have no delete endpoint) and soft-deleted program/campaign/media records
- the debug program `PRG-E2EDBG1` (DEMO draft) and debug cause `PRJ-E2EDBGX1`
- the leftover cause `PRJ-E2E0F60C9` from an interrupted run
- uploaded test images in the test storage folder

## 11. Known limitations and backend gaps

| ID | Gap | Effect / proposal |
|---|---|---|
| C1 | Causes have no publish, delete, cover/gallery or description in the model/API | UI shows the status as information only and states that media isn't supported. Add these if MEKI needs them (would need a migration) |
| C2 | `GET /admin/projects` is not paginated | the UI paginates client-side; fine at the current scale |
| C3 | The API lets the campaign's own creator record its approval (no four-eyes rule) | confirm with MEKI whether approval must come from a different person |
| C4 | Campaign amounts travel as JSON numbers (DTO) | exact up to 14 significant digits (validated); a decimal-string DTO would be cleaner |
| C5 | Media metadata cleared to `""` rather than `null` | cosmetic |
| C6 | Curated (WEB_STATIC) previews need the public website running | placeholder otherwise |
| C7 | Production reverse proxy | must route `/api/v1/*` **and** `/media/uploads/*` to the API and accept request bodies ≥ 12 MB |
| — | Arabic interface copy | technical draft pending MEKI review; record content is never auto-translated |

## 12. Items requiring MEKI approval

1. Program 6's name: stored as **"WASH, Environment & Climate Resilience"** (from the brand content used by the seed). The brief writes **"W.A.S.H, Environment & Climate Resilience"**. It was not changed; MEKI must confirm the official spelling. The editor shows a warning before anyone edits an official name.
2. Arabic names of the nine programs (seeded as "proposed translation") and all Arabic admin copy.
3. The "Cause = Project" mapping and whether causes need publish/media (C1).
4. Approval policy (C3), and who may change provenance.
5. Consent policy for images of people (`MEDIA_PUBLIC_CONSENT_MODE`).

## 13. Next phase

**6D — Website CMS:** homepage and pages/sections, FAQs, statistics, site settings, reusing the bilingual fields, save bar, gates and the media picker from 6C. Also: small backend tickets C1–C3 as MEKI decides, and the production proxy configuration (C7).
