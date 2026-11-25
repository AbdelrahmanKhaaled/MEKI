# MEKI client edits — implementation status (updated 25 Nov 2026)

> Historical record. Phase 09 confirms the website Arabic translations and the Disability assignment to program 08. The final website results, public asset locations and remaining external dependencies are in the [final client changes report](MEKI_FINAL_CLIENT_CHANGES_REPORT.md).

**Sources:** `references/client-edits-2026-11-23/` — `MEKI-US Website Edits for the IT Team.docx` (22 Nov, authoritative wording), `client-feedback.md` (23 Nov), `client-confirmations-nov24.md` (24 Nov, overrides earlier wording), 8 approved MEKI logos, and the 24 Nov Gala assets in `06-gala-assets/` (two venue exterior photos, the venue logo in two versions, Raya Abirached's photo, `sponsorship-06/Sponsorship Packages.pdf`). Since 24 Nov the client photos are in `08-client-delivery-originals/` (102 files, see `docs/MEKI_CLIENT_ASSET_INVENTORY_2026-11-24.md`); `04-homepage-images` holds the two "Home P" hero photos; `05-gallery-originals` and `07-approvals` are still empty.
**Not committed, pushed or deployed. No migration has been applied to any persistent database.** Pending items: `docs/MEKI_PENDING_CLIENT_ASSETS.md`. Arabic for approval: `docs/MEKI_ARABIC_CONTENT_FOR_APPROVAL.md`.

Status keys: **IMPLEMENTED** = done and tested · **PARTIAL** = everything possible done, part depends on client material or a decision · **BLOCKED** = cannot be done without client material.
"Live" means after deployment **and** running `deploy/staging/apply-nov23-client-edits.mjs` (§4) and, since 25 Nov, `deploy/staging/apply-nov25-final-content.mjs` (§0) on the existing database. Until the script runs, the website already shows the approved wording because old seed values are recognised at render time; editor-written values are always kept.

## 0. Final integration — 25 Nov 2026 (supersedes the "PARTIAL / BLOCKED" notes below where it says so)

**Not committed, pushed or deployed. No migration applied anywhere. No database was available in this session (Docker not running, no MySQL), so nothing below that needs MySQL is claimed as verified — see "Verified / not verified".**

### 1. Client content and image integrations
- **Photo delivery of 24 Nov (102 files, 12 folders)** — every file accounted for, 0 duplicates, 0 unusable: inventory and per-file mapping in `docs/MEKI_CLIENT_ASSET_INVENTORY_2026-11-24.md`. Folder = program (the client's own organisation). *Home P* → the **two homepage hero photos** (family photo main, community-school photo secondary — replacing the "lady" photo and the pier photo; the About page's arch uses the family photo too). The **clear water photo** (Wash folder, laying a pipeline) replaced the unclear pipe photo ("Water for families" card, Give page, Wash gallery). Nine program covers (built-in + Programme.coverMedia), every photo in its program gallery and in the Media Library, 26 photos on the homepage gallery.
- **Gallery:** the list is now **list-driven** (any number of published photos, "Show more photos" without JavaScript). Previously the website replaced its built-in 7 photos only when exactly 7 were published, so adding photos in Admin changed nothing. Captions are **derived and PROPOSED**, format *Title – Place* + program (MEKI supplied no captions with this delivery) — MEKI must verify them. The seeded old photos are only hidden (never deleted); an edited caption is never overwritten.
- **Programs Word document (SHORTENED):** landing page, nine program pages (title, subtitle, summary, mandate, areas of work with descriptions, change we aim to create), enabling functions, MEKI Legacy — see "Programs (25 Nov)" below. Arabic for these new strings was **translated by the dev team** from the approved English (the document has no Arabic); listed in the Arabic document.
- **Image quality:** `sizes` of cropped photos (hero arch, program cards, gallery frames) now account for the crop (`coverSizes`) — a 16:9 photo in a 3:4 frame was being requested at about 40 % of the width it needs and upscaled.

### 2. Gala updates — see "Gala (25 Nov)" below
Host photo published (approval granted), exterior-only venue wording enforced, experience wording ("Set-menu dinner", "Virgin Drinks"), sponsorship PDF unchanged and replaceable, **dynamic partner logos** (Bokra, The Waterway: hidden, logo-less, nothing public until an administrator publishes — and only with a logo), inquiries e-mail.

### 3. CMS functionality completed
Admin → API → DB → website now agree for: header and footer navigation, footer text / note / **copyright**, contact e-mail / phone / address, social links, logos (Site settings → Branding, safe files only), SEO title/description, homepage hero images, About / Legacy, Programs landing + 9 program pages + enabling functions, gallery, Gala (hero, venue, host, experience, sponsorship PDF, partners, contact). Publishing keeps using the existing per-section Save → Publish → website revalidation; unpublished working copies are never served.

### 4. Menu and copyright bugs — root causes and fixes
| Bug | Root cause | Fix |
|---|---|---|
| 1. Admin → Menus showed labels/links that did not match the public navigation | The database was seeded from the dictionary's **one-page "#anchor" menu** ("Who we are", "Impact", "Campaigns", "How giving works"…). The website rejects a menu containing anchors and silently shows its own six-page menu, so Admin and site diverged (`resolveMenu` fell back; an older test even asserted this) | The seed source (`en.ts` / `ar.ts` `nav.links`, `footer.givingLinks`) now **is** the real navigation (Home · About MEKI · Programs · Give · FAQ · Contact; Give · FAQ; Gala Night stays a fixed entry). Existing databases: `nov25/site.mjs` rewrites a menu **only while every entry is still a legacy anchor** (extras hidden, never deleted; editor-managed menus untouched) and republishes the footer if it was cleanly published. Admin → Menus gets **"Use the website's current menu"** for the same repair without a script. |
| 2. Copyright in Site settings did not change the website | The footer **hard-coded** `© 2026 {built-in text}`; `copyright`, `footerText`, `footerNote`, contact details, tagline/legacy, SEO and logos were served by `/public/home` but **never read** by the footer (only the Contact page read contact data) | `applySiteSettings()` (`apps/web/src/lib/content.ts`): Site settings values are shown (a value edited in the homepage Footer section keeps priority; otherwise Site settings; otherwise built-in). Copyright is shown as written (with ©) or prefixed with the **current** year. Footer text/note/e-mail/phone/address appear only when stored. The duplicate editors for copyright / footer note in Homepage → Footer were removed from Admin (Site settings is the single place). |
| 3. Are footer text, note, social links and other settings consumed? | Footer text/note: no (see 2). Social links: yes (since 24 Nov). | Now all consumed; tested in EN and AR. |

### 5. Tests executed (25 Nov 2026, this machine) — actual results
| Suite | Result |
|---|---|
| Web unit (`node --test`) | **173/173** |
| Admin unit | **235/235** |
| API unit (`jest --selectProjects unit`) | **202/202** |
| Sync scripts (Nov-23 + Nov-25: site/menus, images, programmes, gala, runner) against mock admin APIs | **26 passed, 1 opt-in skipped**. The opt-in (`FULL_UPLOAD_TEST=1`) was run once: **all 102 derivatives uploaded as multipart, 0 failures** |
| Website data-flow check against a **mock public API** (`apps/web/tests/e2e/cms-sync.smoke.mjs`; built site + real `next start` + real `/api/internal/revalidate`) | **3/3**: navigation label + URL, copyright, footer text, contact e-mail, social links, hero image, program title + mandate (home, `/programs`, program page), gallery (12 photos, "Title – Place") — EN and AR; stale until revalidation, new value on the next request after it, reload keeps it, removed values disappear without placeholders; wrong secret → 401, invalid tag → 400 |
| Typecheck web / admin / api | 0 errors |
| ESLint web / admin | 0 errors (6 pre-existing warnings) |
| Production builds: web (`next build`), admin (`next build`), api (`nest build`) | success |
| Screenshots (Chrome: home 1440 px EN, program page EN and AR/RTL) | hero shows the family photo sharply; Arabic RTL renders; covers load |

### Verified / not verified
- **Verified:** website behaviour for published data (above); script logic and HTTP/multipart wiring against mocks; unit suites; builds.
- **NOT verified (no MySQL here):** that **Admin saves → the real API stores it → the database holds it**; the real public API's publish/unpublish snapshots; the new migration; the API integration/e2e suites (`pnpm --filter @meki/api test:int`); the sponsorship-PDF replace flow and partner publish/unpublish through the real API (unit-tested only). I tried a portable MySQL download; running a downloaded database binary was blocked by the environment's permission policy, so I stopped instead of working around it. **Before release run the integration suite on a disposable MySQL** (staging compose, `docs/54`) and rehearse the sync script on staging.

### 7. Remaining technical blockers
None in code. An environment with MySQL is needed for the integration run above. `packages/api-client/src/generated/schema.d.ts` is stale since 23 Nov (not used by the changed code; regenerate with the OpenAPI export if desired).

### 8. Migrations required before deployment (both additive, nullable columns only; no DROP)
1. `20261123100000_client_edits_programme_copy` (4 columns, from 23 Nov — still unapplied)
2. `20261125100000_programme_area_details` (`focusAreaDetailsEn/Ar` JSON, `pageTitleEn/Ar` VARCHAR(255))

### 9. Production deployment steps (nothing has been done; run only after MEKI / ops approval)
1. **Back up** the production database and `/var/lib/meki/uploads`; confirm the files are non-empty.
2. **Build without switching:** `deploy/vps/deploy.sh <tag>` (stops with "built but NOT switched" while migrations are pending).
3. **Migrate (reviewed step, migrator account, runbook §6):** read both `migration.sql` files, then `prisma migrate status` → `prisma migrate deploy` → status = up to date. The current release keeps serving.
4. **Switch:** `deploy/vps/switch.sh /srv/meki/releases/<ts>`; health checks (`/api/v1/health`, `/en`, `/ar`, Admin login, program pages).
5. **Content sync**, from a workstation that has `references/client-edits-2026-11-23/` (needs the new API): `export ADMIN_URL=<admin origin> ADMIN_EMAIL=<publisher account>` (the password is asked with hidden input, never on the command line), then
   - `node deploy/staging/apply-nov23-client-edits.mjs` (dry run → review → `DRY_RUN=0`) — if not yet run;
   - `powershell -File deploy/staging/nov25/convert-heic.ps1 -Root <delivery folder>` (one HEIC photo → JPEG next to the folder);
   - `node deploy/staging/apply-nov25-final-content.mjs` → **dry-run report** (`wouldUpload`, `wouldPublish`, `leftForEditor`) → review → `DRY_RUN=0 node deploy/staging/apply-nov25-final-content.mjs`.
6. Confirm every published section reported `revalidated` (otherwise Admin → "Retry now"); sections under `leftForEditor` are reviewed and published by an editor.
7. Checks: header/footer menus (EN/AR), Admin → Menus equals the site, footer copyright + e-mail + social links, hero photos, a program page (areas of work), gallery "Show more", Gala page (host photo, no partners block, Sponsor now → PDF), media URLs 200. **A second dry run must report no changes** (idempotency).
8. Partners: an administrator uploads the official logos and publishes only when MEKI confirms the partnership in writing (Admin → Gala → Settings → Gala page → Sponsorship).

*Correction to the Programs section below: its "Deploy order" line says switch before migrating — the correct order is the one above (migrate first, then switch; `deploy.sh` enforces it).*

---

## 1. Word document — Home page

| # | Edit | Status | What was done / reason | Evidence |
|---|---|---|---|---|
| 3 | Hero intro → approved mission | IMPLEMENTED | `hero.lead` EN; AR = mission translation (draft). CMS HERO body via script. | nov23 test "item 3"; screenshots |
| 4 | "Misr El‑Kheir" must not break on mobile | IMPLEMENTED | `NoBreak` nowrap span (hero eyebrow + lead, About, footer). | test "item 4"; 390 px screenshot |
| 6 | Who we are: new two-paragraph copy; remove italic legacy line | IMPLEMENTED | Two CMS-editable paragraphs; legacy line not rendered there (CMS value kept). | test "item 6" |
| 7 | Programs intro + nine program texts + layout + five steps | IMPLEMENTED | Photo → italic line → two sentences → What we do → The change we aim for. Additive columns `summaryEn/Ar`, `outcomesEn/Ar`; Admin Programs editor fields; steps = CMS items `how-1…5`. | test "item 7"; screenshots |
| 9 | "enrol" → "enroll" | IMPLEMENTED | | test "item 9" |
| 10 | Enabling functions copy; remove "They are capabilities, not programs." | IMPLEMENTED | Short line + sentence per function. | test "item 10" |
| 11 | "Results are reported back to supporters." (trust strip, Why support MEKI) | IMPLEMENTED | **To confirm:** similar milestone wording remains in How we work, How giving works, one FAQ (not listed in the document). | test "item 11" |
| 12 | Every gallery photo captioned (place and program) | PARTIAL → **IMPLEMENTED 25 Nov** (derived captions, MEKI to verify) | One format **Title – Place** + program, in every DB state (fixes "not synchronized"). Places/programs are derived from photo folders — **verified mapping still pending from MEKI** (24 Nov list). | tests; screenshot |
| 13 | One capitalization style for buttons | IMPLEMENTED | | test "item 13" |
| 14 | "Follow us" in every footer and at the end of the Gala page; new tab | IMPLEMENTED (24 Nov) | **LinkedIn, Facebook, Instagram** (official URLs confirmed 24 Nov) with platform icons, `target=_blank` + `rel=noopener noreferrer`, screen-reader labels. Source of truth = Site settings → Social links (MySQL); the sync script adds each confirmed network that is missing and never overwrites an editor's URL. | nov24 test "Social"; real-stack render EN/AR; footer screenshot |
| 15 | Approved MEKI logos everywhere; favicon; link-sharing image | IMPLEMENTED | Green on light, white on dark; venue logo never replaces it (nov24 test). | test "item 15"; screenshots |

## 2. Word document — Gala page (with 24 Nov confirmations)

| # | Edit | Status | What was done / reason | Evidence |
|---|---|---|---|---|
| 14 | No glowing dots/particles/abstract lights; real photos | PARTIAL | Effects removed. Hero and venue now use real photos. "Why we gather" photo slot still empty — **no photos of the evening supplied**. | tests; screenshots |
| 15 | Hero: venue photo, full width, dark green overlay | IMPLEMENTED (24 Nov) | `15.jpg.jpeg` (night exterior, 1809×1298 — the only supplied photo large enough for full width) → Media Library → EVENT_HERO image. Overlay keeps text readable; crop `50% 40%` checked at 1440 and 390 px. | real stack: public API + rendered page; screenshots EN/AR |
| 17 | Host section with photo | PARTIAL (approval) → **IMPLEMENTED 25 Nov** (approval granted; see "Gala (25 Nov)") | `Raya Abirached.png` registered in the Media Library (consent **UNKNOWN**) and attached to the host item, but the host section is left **unpublished**: the materials do not say her management cleared the photo for publication. Name and line are live. One flag (`HOST_PHOTO_APPROVED=1`) confirms consent and publishes it (verified). Square crop, ≤ 192 px from a 1056 px source, `object-top`. | real stack: draft not public, then published after approval; screenshot |
| 18 | Experience cards with photos | BLOCKED (ready) → **PARTIAL 25 Nov** (exterior on the black-tie card only; no dish/drinks photos exist — see "Gala (25 Nov)") | **No dish, drinks, lamps or auction photos supplied.** No venue photo was put on a dinner/drinks card; the black-tie card is not given a venue exterior either, to avoid repeating the hero photo. Icons stay. | nov24 test |
| 19 | Card wording: "Set-menu dinner"; drinks card; no Craft display; auction without brands | IMPLEMENTED (24 Nov) | **"Virgin Drinks"** (24 Nov, supersedes "Virgin bar") in the website copy, Admin labels and the CMS (sync script writes the five cards into EVENT_HIGHLIGHTS, replacing only the old seeded titles). AR draft "مشروبات منعشة" (no "alcohol" wording, per 21 Nov). | phase13b + nov24 tests; real stack EN/AR |
| 20 | Program wording; names confirmed in writing only | IMPLEMENTED | | nov19 + nov23 tests |
| 21 | Venue photos instead of the drawn map; "View on map"; cross street and ZIP | PARTIAL | Address exactly as confirmed: **583 Park Avenue (at East 63rd Street), New York, NY 10065**. `images.jpeg` (day exterior) replaces the drawn map, shown at most at its own 547 px width (no blur). Venue logo `583-Park-Ave-Logo_1_white.png` on Deep Green in the venue area only, original proportions, replaceable in Admin. **Hall/interior photos not supplied** (only exteriors). `583_park_avenue_cover.jpeg` turned out to be the venue logo on white, not a photo — not used. | real stack; screenshots desktop/mobile/AR |
| 22 | USD 500, one ticket, own name, no plus-one, booking form, contact email | PARTIAL | Policies kept; "No plus-one". **Not done:** on-page booking form (MEKI/SDI decision, listed as pending 24 Nov). **Contact email not supplied.** Booking/payment architecture, Zeffy and SDI untouched. | tests |
| 23 | "Sponsor now" opens the packages; partner logos once official | PARTIAL → **IMPLEMENTED 25 Nov** (partner logos: dynamic, hidden until published) | **Sponsor now implemented (24 Nov):** the supplied PDF is uploaded to the Media Library (PDF support added; stored byte-for-byte in the persistent upload storage) and referenced by the EVENT_SPONSORSHIP section; the button opens it in a new tab with a note that amounts are proposed contributions. Replace in Gala → Settings → Gala page → Sponsorship. No tiers, checkout or payment on the page. **Partner logos (Bokra, The Waterway) still hidden — not approved/supplied.** ⚠ The PDF itself still contains placeholders "[Contact name] · [Email] [Telephone]" (p. 10) and "[Partner Name]" (p. 4); it is published unchanged as supplied — MEKI may want to send a completed version. | API unit tests; nov24 test; real stack: HTTP 200 `application/pdf`, identical bytes, `Content-Disposition: inline; filename="Sponsorship Packages.pdf"` |

## 3. Client feedback (23 Nov)

| Feedback | Status | Notes |
|---|---|---|
| Gallery wording unified | PARTIAL → **implemented 25 Nov** | One format "Title – Place" + program everywhere; the new delivery carries derived (PROPOSED) captions — MEKI to verify; the gallery is now list-driven. |
| Pictures still low quality | **IMPLEMENTED 25 Nov** | High-resolution originals delivered 24 Nov (up to 9504×6336) → ≤ 2560 px WebP q95 derivatives; `sizes` now account for cropping (`coverSizes`); hero quality 85. |
| Replace the hero photo of the lady | **IMPLEMENTED 25 Nov** | The "Home P" family photo is the hero main photo (built-in default, seed, CMS Hero image); the school photo is the secondary circle. The old photo files stay in the repository. |
| Water pipe picture not clear | **IMPLEMENTED 25 Nov** | The clear Wash-folder photo (`water-pipeline`) replaces it on the "Water for families" card and the Give page; Wash cover and gallery use the new Wash photos. |

## 4. CMS, API, database

- **Migration (unchanged since 23 Nov, additive):** `20261123100000_client_edits_programme_copy` — 4 nullable `Programme` columns. **No migration added on 24 Nov.**
- **24 Nov API change — PDF documents in the Media Library** (`apps/api/src/modules/media/*`): PDF accepted only with a `%PDF-` header **and** an `%%EOF` marker; stored unmodified under a random `.pdf` key in the same persistent storage as images (`LOCAL_STORAGE_DIR`, outside releases); served as `application/pdf` with `nosniff` and an inline filename. `GET /admin/media?kind=image|document`. A PDF is rejected wherever an image is required (`MEDIA_NOT_IMAGE`); only CMS section/item references may point to one. Same size limit (10 MB), same permissions, de-duplicated by checksum.
- **Website:** `lib/gala-cms.ts` reads hero photo, venue logo, venue photos, host photo, sponsorship PDF (or an https link) from the published event sections; a PDF is never rendered as an image; only https/same-origin URLs.
- **Admin:** Gala → Settings → Venue photos (+ venue logo); Gala → Settings → Gala page → Sponsorship (upload/replace/remove PDF; external link as an alternative); image pickers list images only; PDF thumbnails show a document icon.
- **Sync script** `deploy/staging/apply-nov23-client-edits.mjs` (extended, not replaced): dry run by default; uploads the five supplied files through `POST /admin/media` after verifying their SHA-256 (re-runs find them by checksum and upload nothing); fills only empty slots; publishes only sections it created, cleanly published sections, or empty never-published seed shells; host section stays a draft unless `HOST_PHOTO_APPROVED=1`; merges social links by network; reports each publish's live-refresh result.

## 5. Tests (24 Nov 2026, local)

| Suite | Result |
|---|---|
| Website unit (`node --test`, incl. new `tests/nov24.test.mjs`, 6 tests) | **147/147** |
| Admin unit | **231/231** |
| API unit (incl. new `media.service.spec.ts` + PDF validation) | **202/202** |
| Sync script vs mock admin API (`deploy/staging/apply-nov23-client-edits.test.mjs`) | **5/5** (dry run writes nothing; editor values kept; idempotent; assets registered once and reused by checksum; host draft → approval publishes; **dry-run report predicts exactly what the real run publishes**; the admin password never appears in output) |
| API integration (`test:int`) on a **new, empty, disposable** MySQL container (all migrations applied from scratch; removed afterwards) | **311/311** (release stabilization, 24 Nov). The earlier 3 failures were obsolete test expectations, not regressions: the seed was updated on 19 Nov (commit 6b37e9c: USD 500, capacity 350, 3:30–8:30 PM New York = 20:30–01:30 UTC) and the hero title is the approved tagline "Lasting Change,". The tests now assert those confirmed values; no seed or business rule changed. They had been hidden because the persistent `meki_test` DB still held older rows. |
| Real stack on that disposable DB (built API + built website, live revalidation on) | Script: dry run → apply → second run (all reused, 0 changes) → approval run. Public API EN/AR returns the new media; PDF and images served (200, correct types); website shows hero, venue logo, venue photo, Sponsor now → PDF, Virgin Drinks, address, LinkedIn/Facebook in EN and AR; host photo hidden while draft and shown after approval; **draft-only edit not visible**; **two consecutive Save & Publish both visible on the next request** (`X-Meki-Revalidation: revalidated`); 0 px overflow, 0 console errors at 1440/390 px. Note: the local check used an https proxy because the site only accepts https media URLs (production serves `https://api.meki-us.org/media/…`). |
| Typecheck web/admin/api · ESLint · `next build` | 0 errors · 0 errors (5 pre-existing warnings) · success |
| Financial workflows | Not modified (no change to donations, Zeffy, SDI, tickets); their suites pass in the integration run. |

## 5a. Release stabilization (24 Nov 2026)

- **Integration failures:** obsolete expectations fixed in `apps/api/test/{events,gala,content}.e2e-spec.ts` (see §5). No regression found.
- **Deployment safety:** `deploy/vps/deploy.sh` used to switch and reload without checking migrations; deploying this release before migration `20261123100000` would make every programme query (and `/public/home`) fail with "unknown column". `deploy.sh` now runs the new **read-only** `deploy/vps/check-migrations.sh` (`prisma migrate status` with the runtime connection; verified: exit 1 while migrations are pending, 0 when up to date) and **refuses to switch** while migrations are pending; the built release is then activated with the new `deploy/vps/switch.sh` after the reviewed migrator step. Neither script ever applies a migration.
- **Sync script:** password is never a command-line argument (hidden prompt on a terminal; env only if already exported; never printed — tested); dry-run report now shows `wouldPublish`/`wouldRepublish` and matches the real run (tested).
- **Git hygiene:** `/references/` added to `.gitignore` (client Word files, screenshots, original logos/photos, sponsorship PDF). Scan of all changed files: no secrets, no personal data.
- **Arabic approval document:** regenerated from the current implementation; one missing string added ("Why we gather" photo heading) — every new/changed Arabic string is now covered (154 lines), status PENDING CLIENT REVIEW.

## 6. Items still needing MEKI (updated 25 Nov 2026 — only what genuinely remains)

1. **Verify the derived gallery captions and program mapping** of the 24 Nov photo delivery (*Title – Place*, EN + AR; places named only where a file/folder names one; "Egypt" elsewhere) and the assumption that the *disability* folder belongs to program 08.
2. **Photo consent** is recorded as UNKNOWN for all 102 photos (identifiable children and patients appear). Confirm per photo or per folder; confirmed-only serving (`MEDIA_PUBLIC_CONSENT_MODE=confirmed_only`) needs it.
3. **Official Bokra / The Waterway logos** + written confirmation that the partnerships are signed (until then the entries stay hidden).
4. Dinner / drinks / lamps / auction photographs for the Gala experience cards (no venue exterior is used for them).
5. A completed sponsorship PDF without the "[Contact name] · [Email] [Telephone]" / "[Partner Name]" placeholders, if desired.
6. Arabic: the client approved the existing Arabic; the strings the dev team translated on 25 Nov (programs, legacy, enabling, Gala partner labels) are listed in `docs/MEKI_ARABIC_CONTENT_FOR_APPROVAL.md` for a last read.
7. On-page booking form vs SDI's hosted form (MEKI/SDI decision) — the SDI / Zeffy flows are untouched.
8. "MEK" in the Programs document was implemented as "MEKI" (10 places) — confirm.

## Gala (25 Nov) — final Gala content and dynamic partners

Sources: MEKI confirmations of 24 and 25 Nov 2026 (host photo approval granted in writing; inquiries e-mail `Inquiries@meki-us.org`; Bokra and The Waterway named but **not officially signed**). Sync module: `deploy/staging/nov25/gala.mjs` (+ `gala.data.json`, `gala.test.mjs`); it is run by the final runner, never writes SQL, never overwrites administrator values.

| Item | Status | What was done |
|---|---|---|
| Host — Raya Abirached | IMPLEMENTED (code, sync, tests); live after the sync run | Written approval granted → the sync sets the photo's consent to CONFIRMED, attaches it to item `host` and publishes the host section (only if the section is a never-published shell, holds only the script's own host photo, or is published with no pending edits — otherwise the change waits for an editor). The website shows the photo from the published item; with no photo it shows name + line only. The old "unpublished pending approval" wording was removed from code comments and Admin hints. |
| Venue | IMPLEMENTED | Exterior photos only; address unchanged (583 Park Avenue (at East 63rd Street), New York, NY 10065). Admin examples/hints that suggested interiors ("Grand hall", "Grand Ballroom") were replaced; a test fails if interior wording returns. |
| Experience cards | IMPLEMENTED | "Set-menu dinner" / "Virgin Drinks" (EN + AR) unchanged and verified. The supplied day exterior is attached to the **Black-tie** (arrival) card only, with its exterior alt text. Dinner, drinks, lamps and auction get no venue photo (a building exterior would misrepresent them) — they keep their icons until real photos exist. Admin already supports a photo per card. |
| Sponsorship | IMPLEMENTED (existing) | PDF kept; "Sponsor now" opens it in a new tab; no payment/checkout. Replacement flow (Admin → Gala → Settings → Gala page → Sponsorship: upload new PDF → Save → Publish) is unchanged and covered by the 24 Nov unit tests; **not exercised against a database in this session**. |
| Partners (Bokra, The Waterway) | IMPLEMENTED (code, seed, sync, tests) | Modelled as items of the existing `EVENT_SPONSORSHIP` section (no schema change, no migration): codes `partner-bokra`, `partner-waterway` and any number of extra entries. Created **hidden, without logo, provenance PROPOSED** (seed for fresh databases; sync for existing ones). Admin → Gala → Settings → Gala page → Sponsorship: name, optional https website, logo upload/replace, "Show on the website" toggle, one-click add for the two named partners, status line per entry. The public page renders the Partners section only when at least one partner is **published (section publish), visible and has a logo**; alt text = partner name; no placeholder is ever shown. Publishing triggers the existing `events` revalidation. |
| Gala inquiries e-mail | IMPLEMENTED | `Inquiries@meki-us.org` in the seed (EVENT_CONTACT item `email`) and the sync (only when the item is missing or empty); editable in Admin → Gala page → Contact email; the Gala page falls back to the Site Settings e-mail only through the existing logic. |

Tests (25 Nov, this worker): `deploy/staging/nov25/gala.test.mjs` 5/5 (in-memory admin API); web `nov25-gala.test.mjs` 7/7; API unit 202/202; admin unit 231/231; typecheck web/admin/api clean. API e2e spec added (`events.e2e-spec.ts`: hidden / unpublished partner entries are never public) — **not run: no database available**.


---

## Programs (25 Nov) — "MEKI Website Content (Programs) SHORTENED.docx"

Status: **IMPLEMENTED (EN + AR), pending the production data update.** Source of truth for the new copy: `apps/web/src/content/en.ts` / `ar.ts`; the database is updated by `deploy/staging/nov25/programmes.mjs` (idempotent, admin API only).

| Area | What was done |
|---|---|
| Programs landing page | Title "Nine Programs. One Commitment." + the three approved paragraphs (CMS: PROGRAMMES section title/body, paragraphs separated by a blank line; rendered on the home Programs block and the `/programs` hero). Nine cards: title, subtitle, **program summary**, area titles. |
| Nine program pages | H1 + subtitle → **Program mandate** (all paragraphs) → **Areas of work** (numbered title + description) → **The change we aim to create** → fundraising/causes. The landing summary is no longer repeated on the page. The old "Impact" tiles (themes) were replaced by the Areas section; the verified-statistics block remains and appears only when a verified figure exists. |
| Page title | "Emergency Response & Gaza Relief" is the page title (H1, breadcrumb); the card and all other places keep the brand name "Emergency Response". Stored in the new `pageTitleEn/Ar` field (blank for the other eight). |
| MEKI Legacy | New section on the **About** page (after Vision & Mission): title, subtitle, three paragraphs. CMS: homepage ABOUT section labels `legacyTitle`/`legacyTagline` + items `legacy-1…3` (Admin → Homepage → About). "Who we are" on the home page is unchanged (the Word document does not supersede it). |
| Enabling functions | Names, taglines, sentences from the document. **"NGO Development" → "NGO Engagement & Development"** (AR: إشراك الجمعيات الأهلية وتنميتها). |
| Admin | Programs editor: *Subtitle*, *Page title*, *Program summary*, *Program mandate*, *Areas of work — titles / descriptions* (one per line, same order), *The change we aim to create*; Homepage → About: legacy labels + paragraphs. All EN + AR. |
| API / database | **Migration `20261125100000_programme_area_details`** — additive, 4 nullable columns on `Programme` (`focusAreaDetailsEn/Ar` JSON, `pageTitleEn/Ar` VARCHAR(255)). DTO, admin read/write, public `/public/home` + `/public/programmes` (`focusAreaDetails`, `pageTitle`), seed, `@meki/api-client` types. |
| Existing databases | A published CMS value equal to the previous (22–24 Nov) approved copy never masks the new copy (`apps/web/src/content/superseded-programmes.ts`, generated); any other value an admin wrote is shown as written. `programmes.mjs` replaces only those previous values, fills empty fields, writes area descriptions only next to the approved titles, republishes only cleanly published sections (PROGRAMMES, ABOUT). Programs have no draft copy (status only). |

**English wording normalised (everything else is verbatim, including title-case subtitles and the document's curly apostrophes):**
1. "MEK" → "MEKI" in all 10 places (same decision as the earlier "MEK funds" → "MEKI funds"), including "MEK's/MEK’s".
2. "governance an capabilities" → "governance and capabilities" (NGO Engagement & Development).
3. "individuals and household from / facing" → "households" (Social Solidarity, summary and Area 1).
4. "…applied research… and ensure sustainability" → "ensures" (Scientific Research mandate, subject "This program harnesses… and ensures").
5. "Misr El Kheir" → "Misr El-Kheir" (house spelling used everywhere else; intro and legacy text).
6. Mandate paragraphs 04, 06, 07 have three paragraphs in the document and are kept as three.

**Arabic:** the Word document has no Arabic; all new Arabic strings are dev-team translations (141 rows) listed in `docs/MEKI_ARABIC_CONTENT_FOR_APPROVAL.md` → "25 Nov programme copy". Unchanged Arabic (program names, two subtitles) was kept.

**Tests (25 Nov, programs worker):** web `tests/nov25.test.mjs` 10/10 (copy, EN/AR completeness, areas counts, no "MEK"/Gaza typos, CMS merge: old DB values never mask the new copy, admin edits win); `deploy/staging/nov25/programmes.test.mjs` 5/5 (dry run writes nothing; apply; editor values kept; pending-edit section not republished; idempotent; data = dictionaries); API unit 202/202; typecheck web/admin/api clean; ESLint clean on all touched files. Whole web suite 162/164 and admin 230/231 — the failing tests are outside this scope (Hero image tests; Admin menus rule test, being changed by the CMS-audit work). API integration/e2e: **not run — no database available**; no migration was applied anywhere.

**Deploy order:** switch release → run `migrate deploy` (migrations `20261123100000` then `20261125100000`) → run the Nov-25 runner (dry run first). Until the data update runs, the website already shows the new copy (built-in fallback + superseded-value rule).
