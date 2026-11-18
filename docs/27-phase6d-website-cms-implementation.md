# 27 — Phase 6D: Website CMS, Homepage & Platform Settings (admin)

Date: 2026-11-18 · Builds on [24](24-phase6a-implementation.md), [25](25-phase6b-donations-admin-implementation.md) and [26](26-phase6c-content-management-implementation.md). Nothing was committed, pushed or deployed. **No schema change and no migration.** The API changes are additive: two endpoints and one public field.

## 1. Scope delivered

| Route (`/en`, `/ar`) | Page | Permission (view → edit / publish) |
|---|---|---|
| `/homepage` | Homepage CMS. One editor per homepage section (16), a jump list, "Publish all changes", page SEO and status | `content.read` → `content.manage` / `content.publish` |
| `/pages`, `/pages/new`, `/pages/[slug]` | Website pages: list (homepage first, then site pages, then event pages), create, and a content-block editor | same |
| `/menus` | Header menu and footer "Giving" links | same |
| `/faqs`, `/faqs/new`, `/faqs/[id]` | FAQ list (filters, reorder), bilingual editor, publish/unpublish/delete | `faq.read` → `faq.manage` / `faq.publish` |
| `/statistics` | Statistics list and editor dialog: verify/reject, publish/unpublish, delete | `statistics.read` → `statistics.manage` / `statistics.verify` / `statistics.publish` |
| `/settings/site` | Site settings, in tabs: General, Contact, Social, SEO, Branding | `settings.read` → `settings.manage` |

All six appear in the sidebar group "Website management". Only existing permissions are used; none were invented.

## 2. Content model used (unchanged)

`Page` → `PageSection` (one per `SectionKey` and page) → `SectionItem`. Each section has a **working copy** (the editable fields) and a **published snapshot** (`publishedData`) plus `hasUnpublishedChanges`.

- **Saving** changes only the working copy.
- **Publishing** a section copies the working copy into the snapshot. Hidden items are dropped from the snapshot.
- The public API serves only **published pages** and **published, visible, non-DEMO sections**. Drafts never reach the website. The browser smoke test checks this on every module (§7).

**Preservation rules in the editors:**

- PATCH bodies contain only the fields that changed.
- Section labels are a flat map. The editor sends the whole stored map back with its edits merged in, so keys it does not know are kept.
- Items are edited one at a time. Unknown items and sections are never touched; sections without an editor model are listed as "kept unchanged".

## 3. API changes (`apps/api`, additive)

| Change | Notes |
|---|---|
| `POST /admin/cms/pages` (`content.manage`) | Creates a page as a draft. Slug format is `^[a-z0-9]+(-[a-z0-9]+)*$`. A duplicate slug returns `409 PAGE_SLUG_TAKEN`. Audited (`page.create`). |
| `DELETE /admin/cms/sections/:id` (`content.manage`) | Only for unpublished sections; a published one returns `409 SECTION_PUBLISHED`. Items cascade. The event-page scope check applies. Audited (`section.delete`). |
| `GET /admin/cms/pages` | Each row now also carries `isEventPage` and `updatedByName`. |
| Public page: `hiddenSectionKeys` | Keys of published sections whose snapshot is hidden. The website uses it to hide those sections instead of falling back to built-in text. |

Event landing pages can still be read through the site CMS, but every write returns `EVENT_PAGE_SCOPE` (they are managed in Events). Tests: `apps/api/test/cms-6d.e2e-spec.ts`.

## 4. Public website changes (`apps/web`)

- **Menus come from the CMS.** The header menu reads the homepage FOOTER items `nav-*`; the footer "Giving" links read `giving-*`.
  - `resolveMenu()` accepts only known page paths or `https://` links.
  - If any visible entry is invalid, the website keeps its built-in menu. That built-in menu is the current state: the seeded data still holds the old one-page `#anchor` links.
  - The Gala Night entry and the Give button stay fixed and cannot be removed.
- **Hidden sections stay hidden.** Optional homepage sections listed in `hiddenSectionKeys` are no longer rendered: Trust, About, Vision & mission, How we work, Impact, Programs, Enabling, Why, Process, Gallery, FAQ and Final CTA. Hero, Quick donate, Campaigns and Footer are part of the page structure and always render.
- **Section order is fixed in the website code.** The admin therefore offers no homepage reorder and says so.
- **Fixed list sizes** (trust 4, verbs 4, statistics 4, programs 9, enabling 3, reasons 4, steps 4, "never" 3, photos 7). With any other count, the website keeps its built-in list. The editor shows a live count indicator for each list. A unit test compares these sizes with `apps/web/src/content/en.ts`.

## 5. Module rules (mirror the API; the API stays authoritative)

- **Featured campaigns** come from the Campaigns module: approved **and** published only. The homepage editor links there and never bypasses that rule.
- **Statistics:**
  - Verifying needs a source reference and non-DEMO provenance. Publishing needs `VERIFIED`.
  - Changing a fact field (value, unit, prefix, suffix, source, period, program, attribution) on a verified figure resets its verification and unpublishes it. The dialog warns before saving.
  - Values allow at most 2 decimals and are displayed exactly as stored.
  - The rules notice says that Misr El-Kheir (Egypt) figures keep their attribution and must not be presented as MEKI results.
  - A homepage notice counts published, verified figures; the homepage needs exactly 4.
  - No figure was created or changed in development data.
- **FAQs:** category is a free key (`^[a-z0-9_-]{2,60}$`), and existing categories are suggested. Order is saved with `PUT /admin/faqs/order`.
- **Site settings:**
  - Contact e-mail and phone are cleared as `null`.
  - Empty logo fields are not sent, so the stored brand files are kept.
  - Social links must be `https://`, at most 12.
  - `supportedLocales` is read-only.
  - The page states plainly that favicon upload, map link and indexing switch are not supported by the platform. Mission and vision are edited in the Homepage "Vision & mission" section.
- **Menus:**
  - A new entry is created **hidden**.
  - Saving is blocked for an invalid link (non-https, or a `#anchor` of the old one-page site).
  - The page shows whether the website will use the menu or keep its built-in one.
  - Menus are flat; the platform has no sub-menus.
- **Every publish, unpublish and delete** goes through a confirmation dialog (a static test checks this). The UI greys out actions the user cannot take and lists the reasons, using the same gate rules as the API.

## 6. Files

- **API:** `cms.dto.ts` (`CreatePageDto`), `cms.service.ts`, `cms.module.ts`, `test/cms-6d.e2e-spec.ts`
- **API client:** `packages/api-client/src/public.ts` (`hiddenSectionKeys`)
- **Web:** `content/pages.ts` (`resolveMenu`), `components/Header.tsx`, `components/sections/FinalFooter.tsx`, `lib/content.ts`, `app/[locale]/page.tsx`, `tests/menu.test.mjs`
- **Admin:**
  - Library and data: `lib/cms.ts`, `lib/cms-schemas.ts`, `lib/i18n-cms.ts` (EN + AR), `services/cms.ts`, `hooks/useCmsData.ts`
  - UI: `components/cms/SectionEditor.tsx`, `features/cms/{PageSettingsCard, homepage, pages, menus, faqs, statistics, settings}`, 10 route files
  - Navigation and tests: `navigation.ts`, `tests/cms.test.mjs`, `tests/e2e/cms-contract.mjs`, `tests/e2e/cms.smoke.mjs`

## 7. Verification (2026-11-18)

| Check | Result |
|---|---|
| Admin unit tests (`pnpm --filter @meki/admin test`) | **125/125** (new `cms.test.mjs`: gates, labels, item lists, menu rules cross-checked with the website's `resolveMenu`, fixed sizes, hideable sections, `FACT_FIELDS` against the API, settings validation, i18n EN/AR coverage, static guards) |
| Web unit tests | **44/44** |
| API e2e (`npx jest --runInBand`, `meki_test`) | **20 suites, 345/345** |
| CMS contract (`tests/e2e/cms-contract.mjs`, GET only, test API :4100) | **15/15** |
| 6A / 6B / 6C contracts (regression) | all OK (api-contract, finance 25/25, content 17/17) |
| Real-API browser smoke (`tests/e2e/cms.smoke.mjs`, admin build :3003 → test API :4100) | **74/74** (details below) |
| `pnpm turbo run typecheck lint build --force --concurrency=1` | **10/10 tasks**, 0 errors; 3 lint warnings each in admin and web, in pre-existing files (none in Phase 6D code) |

What the browser smoke test covered:

- **Homepage:** a draft is not public → publish → public → the original text is restored and republished.
- **Pages:** a page and block are created, published and served in Arabic. A later draft does not leak. Removing a published block is blocked until it is unpublished. The page is unpublished at the end.
- **FAQs and statistics:** full lifecycle against the public API. Statistics also checked the 2-decimal rule and the verification-reset warning.
- **Menus:** an entry is added, its https rule checked, and it is removed.
- **Settings:** a value is changed and restored; invalid input blocks saving.
- **Roles:** Content Manager sees settings read-only and cannot verify or publish statistics. Campaign Manager has read-only CMS access and no FAQs.
- **Layout:** EN and AR (`dir=rtl`) at 1440, 768 and 390 px with no horizontal overflow, and no console errors.

**Test data:**

- The smoke test used temporary accounts `p6d-{admin,content,campaign}-<tag>@meki.test` in `meki_test` only. They were created by a temporary script that has been deleted. The password file was deleted after the run. The accounts remain in the test database: nothing was erased.
- Each run leaves one **unpublished** draft page `e2e-<run>` in `meki_test`, because the API has no page delete.
- `meki_dev` and the `.env` files were not touched. The dev API on :4000 stayed up (health 200).

**Problems found and fixed during verification:**

- The pages list put the homepage behind hundreds of event landing pages in the test database. It now sorts homepage → site pages → event pages.
- A stale `next start` process kept serving an old build. It was stopped by PID.

## 8. Known limitations

- **No version history** beyond the working copy and the published snapshot of each section.
- **No optimistic concurrency:** the last save wins.
- **No page delete endpoint.**
- **Site settings on the website:** only the contact e-mail is rendered today (Contact and Give pages). The other values are stored and served by the public API for later pages. Favicon, map link and indexing switch are not stored.
- **Legal pages** (`/privacy`, `/terms`, `/cookies`) render only once a page with that slug is published. None exists yet.

## 9. Requires MEKI approval

1. **Arabic text:** all Arabic interface strings and Arabic content drafts are technical drafts.
2. **Menus:** the stored menu still contains the old one-page `#anchor` links, so the website shows its built-in menu. An editor must fix the entries and publish. MEKI to confirm the entries and their labels.
3. **Statistics:** each public figure needs a source and attribution approved by MEKI. Misr El-Kheir (Egypt) figures must not be presented as MEKI achievements.
4. **Site settings:** official e-mail, phone, address, social accounts, SEO texts and footer texts. They stay empty until supplied; nothing was invented.
5. **Legal pages:** content for Privacy, Terms and Cookies (legal review).
6. **Homepage visibility:** which optional sections to show at launch.
7. **Program 6 name:** "WASH, Environment & Climate Resilience" (stored) vs "W.A.S.H, …" (brief), carried over from 6C.
