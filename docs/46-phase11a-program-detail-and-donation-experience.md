# 46 — Phase 11A: Programme pages, Causes hierarchy and programme-based giving

Date: 2026-11-19.

**What did not change:** nothing was committed, pushed or deployed. Payments stay disabled. No Zeffy or SDI configuration was changed. No record was deleted, and no database was reset.

**Session history:**

- **Interrupted session:** the audit only — the models, relations and finance rules — with no code yet.
- **This session:** the attribution decision and everything below.

## 1. What exists now

| Capability | Status |
|---|---|
| `/{en,ar}/programs/{slug}` for the 9 programmes | ✔ Built. Static params from the approved list; `dynamicParams=false`. Unknown slugs and enabling functions → 404. A programme the API reports unpublished or DEMO → 404. |
| Hero | Programme photo, breadcrumb, "Program NN" + icon, title, intro. "Support this program" and "Explore its causes" buttons. An optional verified statistic, shown only when one exists. |
| Overview | Approved mandate as a pull-quote, the CMS description (paragraphs) when present, and the first gallery image when present. |
| Fundraising dashboard | Approved goal, verified raised, still needed, % funded, accessible animated progress bar, verified donation count, other currencies listed separately. **No goal** → a designed "goal not published yet" state with no percentage. **API down** → "temporarily unavailable". |
| Causes → Campaigns | Published causes of **this** programme only, in alternating editorial layouts. Under each: its approved public campaigns with status, approved target, verified raised and progress (when mathematically valid). Approved campaigns outside a published cause → "More campaigns in this program". The first 6 are shown, the rest behind a native "Show all N" disclosure. |
| Activities and impact | Approved focus areas as numbered cards. Published **and verified** programme statistics (count-up for integers) with attribution and period. |
| Gallery | Programme media-library images, filtered to not deleted, not DEMO and consent not refused. Responsive mosaic plus an accessible `<dialog>` lightbox (Escape, RTL-aware arrow keys, counter, captions). Hidden when there are no images. |
| How your donation helps | The designation statement plus MEKI's four approved trust commitments. **No invented impact equations.** |
| Programme donation panel (`#support`) | Designation fixed to this programme, frequency, amounts, custom amount, limits and summary. See §4. |
| Closing call-to-action | Programme photo backdrop and a "Support this program" button. |
| Section nav | Sticky and horizontally scrollable on phones, anchors only (no scroll hijacking). |
| Programmes listing | Every card links to its page: the title and an "Explore the program" link. |
| SEO | Per-page title and description (CMS SEO fields first), canonical, `en`/`ar`/`x-default` alternates, OG/Twitter image = the programme photo. Sitemap includes the 9 pages. Indexing still follows `PUBLIC_INDEXING`. No structured data — nothing factual to mark up yet. |
| Admin | Programme editor: an **approved fundraising goal** card (amount + currency, validated as a pair). Cause editor: public summary/description (EN/AR), cover image, sort order and **Publish/Unpublish**. |

## 2. Data model and attribution (verified, not assumed)

The hierarchy maps to existing models: **Programme → Project ("Cause" in the admin) → Campaign** (`Campaign.programmeId` + `Campaign.projectId`).

### Attribution rule (authoritative, already in the code)

- Every donation is created with **exactly one** `DonationAllocation` (`DonationsService.create`).
- Its `programmeId` is:
  - the selected programme, for designation `PROGRAMME`;
  - the campaign's programme, for designation `CAMPAIGN`;
  - nothing, for `GENERAL_FUND`.
- Therefore:
  - **Programme collected** = the sum of confirmed allocations whose `programmeId` is the programme.
  - Each donation is counted **once**. A campaign gift counts toward its programme and its campaign — the same allocation, never added twice.
  - **Causes have no separate money figure.** Allocations do not record a project, and nothing is derived for causes.
  - **Programme goals are never derived** from campaign targets.

### Finance rules (reused from `ReportsService`, the same as every admin report)

- **Counted:** verified captures only — `PAID`, `PARTIALLY_REFUNDED` or `REFUNDED` with `confirmedAt` set.
- **Excluded:** test records.
- **Refunds:** pro-rated per allocation.
- **Precision:** exact decimals.
- **Currencies:** per currency, never combined.
- **Gala tickets:** never included — they live in `EventBooking*`, not in `Donation`.

### Progress (computed in the API)

- **Remaining** = `max(goal − collected, 0)`.
- **Percent** = `collected ÷ goal × 100`, one decimal, rounded down. It may exceed 100 if a goal is surpassed; the bar caps at 100 %.
- **Without an approved goal:** `progress = null`.

### Database change (additive, reviewed, backed up)

- **Backup:** `meki_dev` dumped before the change (45 tables, completion marker present).
- **Migration** `20261119100000_phase11a_programme_targets_and_causes`:
  - `Programme`: `targetAmount DECIMAL(14,2) NULL`, `targetCurrency CHAR(3) NULL`;
  - `Project`: `summaryEn/Ar TEXT NULL`, `descriptionEn/Ar TEXT NULL`, `coverMediaId` (FK → MediaAsset, `ON DELETE SET NULL`), `sortOrder INT DEFAULT 0`, `publishedAt DATETIME(3) NULL`.
- **Review:** no drop, no rewrite.
- **Applied with `prisma migrate deploy`** to `meki_test`, then `meki_dev`.
- **After the migration:** all 12 programme targets are NULL, and counts are unchanged (Donation 7, AuditLog 33).

## 3. New and changed API

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/public/programmes/:slug/detail?locale=` (new, public) | One response for the page. Fields: `programme` (incl. consent-filtered gallery), `fundraising {goal, progress, collected[], note}`, `causes[] {…, campaigns[] {…, fundraising}}`, `otherCampaigns[]`, `statistics[]`. 404 unless PUBLISHED and not DEMO. Never exposes drafts, DEMO, approval notes, source folders or internal notes (tested). |
| `PATCH /admin/programmes/:id` (extended) | `targetAmount` / `targetCurrency`. Must be set or cleared together (`TARGET_INCOMPLETE`), > 0 (`TARGET_NOT_POSITIVE`), max 2 decimals, a known currency (`TARGET_CURRENCY_UNKNOWN`). Audited. Requires `programmes.manage`. |
| `POST/PATCH /admin/projects` (extended) | `summaryEn/Ar`, `descriptionEn/Ar`, `coverMediaId` (must exist), `sortOrder`. |
| `POST /admin/projects/:id/publish` (new) | Requires `programmes.publish`. Refused for DEMO (`DEMO_NOT_PUBLISHABLE`), without `nameEn` + `summaryEn` (`MISSING_FIELDS`) or when the programme is unpublished (`PROGRAMME_NOT_PUBLISHED`). Audited. |
| `POST /admin/projects/:id/unpublish` (new) | Requires `programmes.publish`. Audited. |

**Also updated:**

- **API client:** OpenAPI regenerated, and the typed client adds `PublicProgrammeDetail`, `PublicCause`, `PublicProgress`, `PublicCollected` and `PublicCampaignWithFundraising`.
- **Module wiring:** `ReportsService` is now exported from `DonationsModule`, and `PublicModule` imports it.

## 4. Programme-based giving and the payment boundary

- **Attribution:**
  - The panel sends `designation: "PROGRAMME"` + `programmeSlug` only (`source: "programme-page"`).
  - The API resolves the programme itself and accepts only PUBLISHED, `kind = PROGRAMME`, non-DEMO programmes.
  - A client-supplied `programmeId` is rejected (400, unknown field). Tested.
- **Today (payments disabled):** the existing "online giving is not open yet" dialog opens with the selection. Nothing is created or charged, and there is **no fake success**.
- **When payments go live:** the existing checkout step (first name, last name, e-mail, consents) creates the donation and redirects to the provider-hosted page. Payment confirmation comes **only** from verified provider webhooks (unchanged).
- **Frequencies:** One-off always. **Monthly appears only if the live configuration lists it** (`DonationSetting.allowRecurring` + provider support); today it shows "Monthly giving will be offered once it is approved". Quarterly and yearly are not supported by the approved flow and are not offered.
- **Mailing address:** not collected — no SDI requirement is on file (SDI dependency below).
- **Zeffy (doc 31/32):**
  - the API is read-only — no checkout creation;
  - hosted form URLs and the prefill/reference mechanism are not yet provided by SDI;
  - so **no Zeffy link is shown and none is invented**.

## 5. Tests

| Suite | Result |
|---|---|
| API (Jest, `meki_test`, 26 suites) | **406/406**. New `phase11a-programmes.e2e-spec.ts` (7 tests), see below. |
| Admin unit | **167/167** (+3 Phase 11A guards; OpenAPI drift guard passes against the regenerated client) |
| Web unit | **69/69** (+7 Phase 11A guards) |
| `pnpm turbo run typecheck lint build --force --concurrency=1` | **10/10**, exit 0; only the 6 pre-existing lint warnings |
| Browser (Chromium, Firefox, WebKit) | **212/212** — see below |
| Homepage regression | Everything **outside the data-driven campaigns carousel** is byte-identical to the Phase 10 baseline in EN/AR at 390/1440 px, and page heights are equal. The carousel differs only because other test suites added approved campaigns to `meki_test` after the baseline (titles listed). Phase 11A added no CSS. Shared changes are additive: `DonateProvider` source default unchanged; `socialMeta` optional image. |

**Programme-page integration tests (`phase11a-programmes.e2e-spec.ts`):**

- **Exact money:** 300 programme + (200 − 50 refunded) campaign = **450.00 USD of 1,000.00 → 45.0 %, remaining 550.00**. EUR 100.00 is listed separately.
- **Exclusions:** test, pending, failed, another programme and the general fund are all excluded.
- **Campaign progress:** 150.00 of 400.00 = 37.5 %.
- **Visibility:** draft and DEMO causes, draft campaigns and another programme's cause are never exposed. 404 for unpublished, DEMO or unknown programmes.
- **Admin rules:** goal validation and RBAC; cause publish rules and RBAC; programme designation resolution.

**Browser checks, three engines (212/212):**

- **Layout:** 200 + no horizontal overflow on a populated programme (staged QA data) and an empty programme, EN/AR, at 360/390/768/1024/1440 px, with valid section anchors.
- **Lightbox:** opens, RTL-aware arrow keys, Escape closes.
- **Donate panel:** opens the no-charge preview naming the programme.
- **Listing:** 9 programme links in each language.
- **Accessibility:** axe WCAG 2.2 AA clean in EN and AR.
- **Runtime:** 0 page/console errors.

**Two bugs found by visual QA and fixed:**

- API image URLs fed raw to `next/image` (blank overview image) → now mapped like every other API image.
- Hero label low contrast over bright photos → reading-side scrim.

**Test-data hygiene:**

- The new suite archives its fixture programmes, causes and campaigns and flags its fixture donations `isTest` in `afterAll` (donations are append-only; nothing is deleted).
- Two existing report assertions were made robust to *other suites'* test data in a second currency:
  - "USD present, each currency once" instead of "only USD";
  - the set of frequencies instead of the per-currency row list.
- The staged visual-QA data (Health goal, one cause, one campaign, three gallery links) was reverted. The QA cause and campaign remain as **ARCHIVED** rows in `meki_test`; the gallery links were removed.

## 6. What the live data shows today (`meki_dev`)

- **Programmes:** all 9 are published and VERIFIED_SOURCE, with covers. **None has a description, a gallery or an approved goal.**
- **Causes and campaigns:** all 8 causes and all 8 campaigns are DRAFT/PROPOSED → the pages honestly show "causes are being prepared" and no campaigns.
- **Donations:** all are test records → no collected figures.
- **Statistics:** no published, verified programme statistics.

So the pages currently show approved copy, focus areas, photography and honest empty states. Every data section switches on automatically when MEKI publishes the content.

## 7. MEKI decisions and content needed

1. **Programme goals:** approve (or decline) a fundraising goal and currency per programme, entered in the admin.
2. **Causes:**
   - approve the 8 proposed causes;
   - write their public summaries/descriptions (EN/AR) and choose covers;
   - publish them.
3. **Campaigns:** approve and publish campaigns (the existing approval flow), with optional approved targets.
4. **Programme copy:** descriptions (EN/AR) and SEO fields for each programme.
5. **Galleries and consent:** curate per-programme galleries and **confirm photo consent**. Consent is UNCONFIRMED for the current photography — only explicit refusals are filtered today.
6. **Impact statistics:** supply verified, attributed statistics per programme.
7. **Monthly giving:** approve it (or not). Quarterly and yearly would need a product decision and provider support.
8. **New microcopy:** approve the Phase 11A section titles and the "How your donation helps" designation sentence. The Arabic is a draft.

## 8. SDI dependencies

- **Hosted forms:** Zeffy hosted donation form URL(s) per designation, or a confirmed way to pass the programme reference into the form (doc 32 item 6), and the allowed checkout hosts.
- **Donor data:** whether a mailing address (or other donor data) is required on SDI's receipts.
- **Wording:** receipt/tax wording for programme gifts; fiscal-sponsor disclosure text.
- **Live test:** a coordinated live test of a programme-designated gift and its refund (doc 32).

## 9. Known limitations

- **Cause totals:** there are none (by design — the data cannot support them without inventing an aggregation rule).
- **Campaign progress:** depends on approved campaign targets in the campaign's currency.
- **Fundraising refresh:** fundraising figures refresh with the page cache (ISR, 5 minutes).
- **Not verified on real devices:** no real Safari/iOS device or screen-reader pass for the new page (as in docs 39/42).
