# MEKI pre-push audit

25 November 2026. The local changes through Phase 09.1 are ready to stage as one GitHub release candidate. Production activation depends on the database and content checks below.

## Git and client scope

The local branch is `main`, tracking `origin/main`. A read-only GitHub lookup returned `7507227ae75869ca73692bb93affd5f505c6e5af`, matching local HEAD and the tracking ref. Both remote URLs are `https://github.com/AbdelrahmanKhaaled/MEKI.git`. The index was empty of changes. The manifest below lists every modified and new nonignored file relative to that baseline. There were no deletions.

| Area | Release contents |
|---|---|
| Website | Bilingual homepage, program details and galleries, Gala, contact, giving and booking flows, approved brand assets, served WebP photographs, sponsorship PDF, image builders, tests and browser checks. |
| Gala and programs | The daytime venue exterior illustrates black-tie arrival. The other four activity cards retain their icons. Why We Gather retains the approved text layout. The venue section uses exterior photography. The site includes two hero photos, 100 photos across nine program galleries and 26 homepage selections drawn from those galleries. |
| Admin | Branding, bilingual menus and editing, program fields, Gala settings and media selection, with test coverage. |
| API and shared client | CMS, media validation and filtering, programs, seed content, Prisma schema, two migrations, API tests, generated OpenAPI contract and shared public types. |
| Release tools | Versioned synchronization scripts and manifests, mock-API tests, VPS migration gate and release activation helper, updated runbook, and release packaging. |
| Client records | Dated asset inventory, approval sheet, pending items, requirement register, closure decisions and final visual verification. The historical reports document the instructions that applied at each phase. |

The [final client report](MEKI_FINAL_CLIENT_CHANGES_REPORT.md) maps individual requirements to implementation and evidence. The [closure report](MEKI_CLIENT_REQUIREMENTS_CLOSURE_REPORT.md) records superseded instructions and outstanding external approvals. Official partner artwork, missing activity photography and the external legal, payment and advertising checks retain the dispositions in those reports.

## Release preparation changes

- Updated Git and Docker exclusions for local environments and private inputs. The API Docker build now includes the shipped image manifests and files used to calculate seed metadata.
- Regenerated the API snapshot from compiled Nest metadata with a stub Prisma provider and generated its TypeScript declarations. The contract differences were limited to the Admin media list and the program create/update DTOs.
- Corrected the VPS instructions for a release paused by pending migrations. The runbook uses Bash explicitly, distinguishes pending status from connection or migration errors, and resumes the exact built release. Operator messages point to its scripts.
- The candidate scan covered tracked files and eligible additions, including binary sizes, common credential formats, private-key markers and local environment-value matches. No credential was identified. The password-like test literals reviewed were fixtures. No changed file exceeded 50 MiB.
- Raw deliveries, temporary client references, real environment files, build outputs, local uploads, caches and test screenshots stay outside the staging manifest. Public derivatives, approved Gala files and the machine-readable synchronization metadata belong in the release. The existing tracked files matched no Git ignore rule.

## Local verification

| Check | Result |
|---|---|
| Unit tests | Website 182, Admin 235, API 202. All passed. |
| Synchronization tests | 27 passed with the full-upload option. All 102 photo derivatives went through multipart uploads to a loopback mock Admin API. The delivery checksum checks used the local source pack and HEIC companion. |
| Production builds and types | API, website and Admin builds passed. TypeScript passed for all three and the generated API client. Eight compiled API runtime assets passed verification. |
| ESLint | Zero errors. Web had two warnings, Admin three, API zero. |
| Browser | Local production website with the public API offline. English and Arabic home, Gala and nine program pages passed at 390, 768 and 1440 pixels, 66 page/viewport checks. Hosted-flow entry and simulated donation confirmation and replay passed. External advertising requests were intercepted. |
| Packaging | Frozen-lockfile validation passed offline against the five workspace manifests. Prisma schema validation passed. All seven release/staging Bash scripts parsed. Changed documentation links and Git whitespace were checked. |

## Before production activation

1. Rehearse the database-backed API integration suite and release build on disposable MySQL and a Docker-capable runner. This host had no available Docker engine or disposable MySQL service. Real database connectivity, migration execution, image builds and live full-stack integration remain unverified.
2. Review the two additions after the fifteen existing migrations. `20261123100000_client_edits_programme_copy` adds nullable bilingual summary and outcomes columns. `20261125100000_programme_area_details` adds nullable bilingual focus-area details and page titles. The eight columns match the Prisma schema. Verify the target migration history and a restorable backup before using the migrator account. Failed or divergent history requires investigation. The release gate reads migration status before switching and checks it again when resuming.
3. Provision the private original delivery and converted HEIC companion separately for the authorized publisher. Review the Nov 23 dry run with `ASSET_DIR`, followed by the Nov 25 dry run with `DELIVERY_DIR` and `GALA_ASSET_DIR`, against the intended Admin origin. Each runner defaults to dry run. Review file checksums, publication/consent decisions, preserved editor changes and required permissions before applying each pass, in date order. Reconcile media, draft/published status and website revalidation afterward. Git carries the public files. Existing CMS records and uploaded media require this separate synchronization.
4. Verify the live bilingual pages, CMS overrides, media delivery and financial flows under the release runbook. The browser replay used a simulated confirmation. No transaction, vendor attribution, deployment, live content write or migration was performed during this audit.

## Exact Git commands

Run in PowerShell from the repository root when authorized to publish. The first block stages the listed paths, checks the baseline and refuses an unexpected staged path. Review the staged diff before running the last two commands.

```powershell
git fetch origin main
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed' }
if ((git branch --show-current) -ne 'main' -or (git rev-parse HEAD) -ne '7507227ae75869ca73692bb93affd5f505c6e5af' -or (git rev-parse origin/main) -ne (git rev-parse HEAD)) { throw 'Release baseline changed. Repeat the audit.' }
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Review the existing index before staging' }
$paths = @(Get-Content -LiteralPath docs/MEKI_PRE_PUSH_AUDIT.md -Encoding UTF8 | Where-Object { $_ -cmatch '^\[(M|A)\] ' } | ForEach-Object { $_.Substring(4) })
$list = Join-Path $env:TEMP 'meki-release-stage-paths.txt'
[IO.File]::WriteAllLines($list, [string[]]$paths, [Text.UTF8Encoding]::new($false))
git --literal-pathspecs add --pathspec-from-file="$list"
if ($LASTEXITCODE -ne 0) { throw 'Staging failed' }
$staged = @(git -c core.quotepath=false diff --cached --name-only --no-renames)
if (Compare-Object $paths $staged -CaseSensitive) { throw 'Staged paths differ from the audited inventory' }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Review staged whitespace errors' }
git diff --cached --stat
git diff --cached
```

```powershell
git commit -m "Complete MEKI client changes through Phase 09.1"
if ($LASTEXITCODE -ne 0) { throw 'Commit failed' }
git push origin main:main
```

## Complete file manifest

M denotes a tracked modification. A denotes a new file to stage.

109 modified files and 181 new files, 290 paths in total.

~~~text
[M] .dockerignore
[M] .gitignore
[M] apps/admin/src/app/[locale]/layout.tsx
[M] apps/admin/src/components/cms/SectionEditor.tsx
[M] apps/admin/src/components/content/media.tsx
[M] apps/admin/src/components/content/ui.tsx
[M] apps/admin/src/components/layout/Sidebar.tsx
[M] apps/admin/src/features/auth/LoginForm.tsx
[M] apps/admin/src/features/cms/menus/MenusPage.tsx
[M] apps/admin/src/features/content/programs/ProgramEditorPage.tsx
[M] apps/admin/src/features/gala/settings/GalaSettingsPage.tsx
[M] apps/admin/src/features/gala/settings/VenuePhotosCard.tsx
[M] apps/admin/src/lib/cms.ts
[M] apps/admin/src/lib/content-schemas.ts
[M] apps/admin/src/lib/i18n-cms.ts
[M] apps/admin/src/lib/i18n-content.ts
[M] apps/admin/src/lib/i18n-gala.ts
[M] apps/admin/tests/cms.test.mjs
[M] apps/api/Dockerfile
[M] apps/api/prisma/schema.prisma
[M] apps/api/prisma/seed/gala-night.ts
[M] apps/api/prisma/seed/run-seed.ts
[M] apps/api/prisma/seed/seed-data.ts
[M] apps/api/src/common/common.spec.ts
[M] apps/api/src/modules/cms/cms.service.ts
[M] apps/api/src/modules/media/media.dto.ts
[M] apps/api/src/modules/media/media.module.ts
[M] apps/api/src/modules/media/media.service.ts
[M] apps/api/src/modules/media/media.validation.ts
[M] apps/api/src/modules/programmes/programmes.dto.ts
[M] apps/api/src/modules/programmes/programmes.service.ts
[M] apps/api/test/content.e2e-spec.ts
[M] apps/api/test/events.e2e-spec.ts
[M] apps/api/test/gala.e2e-spec.ts
[M] apps/web/next.config.ts
[M] apps/web/public/images/work/carpentry.webp
[M] apps/web/public/images/work/doctor-patient.webp
[M] apps/web/public/images/work/elder-field.webp
[M] apps/web/public/images/work/farmer-portrait.webp
[M] apps/web/public/images/work/field-sky.webp
[M] apps/web/public/images/work/greenhouse-harvest.webp
[M] apps/web/public/images/work/greenhouse.webp
[M] apps/web/public/images/work/hero-field.webp
[M] apps/web/public/images/work/housing-roof.webp
[M] apps/web/public/images/work/housing-site.webp
[M] apps/web/public/images/work/incubator.webp
[M] apps/web/public/images/work/livestock.webp
[M] apps/web/public/images/work/mobile-clinic.webp
[M] apps/web/public/images/work/operating-room.webp
[M] apps/web/public/images/work/painted-house.webp
[M] apps/web/public/images/work/relief.webp
[M] apps/web/public/images/work/student-lab.webp
[M] apps/web/public/images/work/student-reading.webp
[M] apps/web/public/images/work/swimmer-medal.webp
[M] apps/web/public/images/work/swimmer.webp
[M] apps/web/public/images/work/water-pier.webp
[M] apps/web/public/images/work/water-pipe.webp
[M] apps/web/public/images/work/water-pump.webp
[M] apps/web/public/images/work/water-station.webp
[M] apps/web/public/images/work/weaver.webp
[M] apps/web/public/images/work/weavers-loom.webp
[M] apps/web/scripts/build-images.mjs
[M] apps/web/src/app/[locale]/about/page.tsx
[M] apps/web/src/app/[locale]/contact/page.tsx
[M] apps/web/src/app/[locale]/donation/return/page.tsx
[M] apps/web/src/app/[locale]/events/gala-night/book/page.tsx
[M] apps/web/src/app/[locale]/events/gala-night/booking/[reference]/page.tsx
[M] apps/web/src/app/[locale]/events/gala-night/booking/page.tsx
[M] apps/web/src/app/[locale]/events/gala-night/donate/page.tsx
[M] apps/web/src/app/[locale]/events/gala-night/page.tsx
[M] apps/web/src/app/[locale]/give/page.tsx
[M] apps/web/src/app/[locale]/give/status/[reference]/page.tsx
[M] apps/web/src/app/[locale]/layout.tsx
[M] apps/web/src/app/[locale]/page.tsx
[M] apps/web/src/app/[locale]/programs/[slug]/page.tsx
[M] apps/web/src/components/DonationReturn.tsx
[M] apps/web/src/components/Header.tsx
[M] apps/web/src/components/Logo.tsx
[M] apps/web/src/components/PreviewNote.tsx
[M] apps/web/src/components/gala/GalaSections.tsx
[M] apps/web/src/components/giving/IntentStatus.tsx
[M] apps/web/src/components/pages/PageShell.tsx
[M] apps/web/src/components/pages/ProgramsGrid.tsx
[M] apps/web/src/components/programme/ProgrammeSections.tsx
[M] apps/web/src/components/sections/Enabling.tsx
[M] apps/web/src/components/sections/FinalFooter.tsx
[M] apps/web/src/components/sections/Gallery.tsx
[M] apps/web/src/components/sections/Hero.tsx
[M] apps/web/src/components/sections/Programmes.tsx
[M] apps/web/src/components/sections/TrustAbout.tsx
[M] apps/web/src/content/ar.ts
[M] apps/web/src/content/booking.ts
[M] apps/web/src/content/en.ts
[M] apps/web/src/content/gala.ts
[M] apps/web/src/content/giving.ts
[M] apps/web/src/content/media.ts
[M] apps/web/src/content/pages.ts
[M] apps/web/src/lib/content.ts
[M] apps/web/src/lib/site.ts
[M] apps/web/src/lib/venue-photos.ts
[M] apps/web/tests/live-publishing.test.mjs
[M] apps/web/tests/nov19.test.mjs
[M] apps/web/tests/phase10.test.mjs
[M] apps/web/tests/phase13b.test.mjs
[M] deploy/vps/deploy.sh
[M] docs/FINAL_PRODUCTION_DEPLOYMENT_RUNBOOK.md
[M] packages/api-client/openapi.json
[M] packages/api-client/src/generated/schema.d.ts
[M] packages/api-client/src/public.ts
[A] apps/admin/public/brand/MEKI_Icon_Approved_32.png
[A] apps/admin/public/brand/MEKI_Icon_Approved_White_128.png
[A] apps/admin/public/brand/MEKI_Secondary_Green.png
[A] apps/admin/public/brand/MEKI_Secondary_White.png
[A] apps/admin/src/features/gala/settings/GalaPageCard.tsx
[A] apps/admin/src/services/gala-page.ts
[A] apps/admin/tests/nov25-menus.test.mjs
[A] apps/api/prisma/migrations/20261123100000_client_edits_programme_copy/migration.sql
[A] apps/api/prisma/migrations/20261125100000_programme_area_details/migration.sql
[A] apps/api/src/modules/media/media.service.spec.ts
[A] apps/web/public/brand/MEKI_Icon_Approved_192.png
[A] apps/web/public/brand/MEKI_Icon_Approved_32.png
[A] apps/web/public/brand/MEKI_Icon_Approved_512.png
[A] apps/web/public/brand/MEKI_Icon_Approved_Apple_180.png
[A] apps/web/public/brand/MEKI_Icon_Approved_Green_128.png
[A] apps/web/public/brand/MEKI_Icon_Approved_White_128.png
[A] apps/web/public/brand/MEKI_Secondary_Green.png
[A] apps/web/public/brand/MEKI_Secondary_White.png
[A] apps/web/public/brand/approved-logo-manifest.json
[A] apps/web/public/gala/host-raya-abirached.png
[A] apps/web/public/gala/sponsorship-packages.pdf
[A] apps/web/public/gala/venue-exterior-day.jpeg
[A] apps/web/public/gala/venue-exterior-night.jpeg
[A] apps/web/public/gala/venue-logo-white.png
[A] apps/web/public/images/gallery/disability-football.webp
[A] apps/web/public/images/gallery/disability-performer.webp
[A] apps/web/public/images/gallery/disability-swimmer.webp
[A] apps/web/public/images/gallery/economic-carpentry-craftsman.webp
[A] apps/web/public/images/gallery/economic-carpentry-workshop.webp
[A] apps/web/public/images/gallery/economic-carpet-showroom.webp
[A] apps/web/public/images/gallery/economic-farmer-tiller.webp
[A] apps/web/public/images/gallery/economic-fisherman-nile.webp
[A] apps/web/public/images/gallery/economic-fishermen-boats.webp
[A] apps/web/public/images/gallery/economic-greenhouse-farmer.webp
[A] apps/web/public/images/gallery/economic-greenhouse-harvest.webp
[A] apps/web/public/images/gallery/economic-livestock-shed-2.webp
[A] apps/web/public/images/gallery/economic-livestock-shed.webp
[A] apps/web/public/images/gallery/education-classroom.webp
[A] apps/web/public/images/gallery/education-flag-ceremony.webp
[A] apps/web/public/images/gallery/education-graduates.webp
[A] apps/web/public/images/gallery/education-graduation-stage.webp
[A] apps/web/public/images/gallery/education-playground-swings.webp
[A] apps/web/public/images/gallery/education-pupils-writing.webp
[A] apps/web/public/images/gallery/education-school-building.webp
[A] apps/web/public/images/gallery/education-school-colourful.webp
[A] apps/web/public/images/gallery/education-schoolboy.webp
[A] apps/web/public/images/gallery/education-schoolgirl.webp
[A] apps/web/public/images/gallery/education-tire-swing.webp
[A] apps/web/public/images/gallery/emergency-border-flags.webp
[A] apps/web/public/images/gallery/emergency-border-trucks.webp
[A] apps/web/public/images/gallery/emergency-border-volunteers.webp
[A] apps/web/public/images/gallery/emergency-convoy-launch.webp
[A] apps/web/public/images/gallery/emergency-convoy-line.webp
[A] apps/web/public/images/gallery/emergency-convoy-truck-2.webp
[A] apps/web/public/images/gallery/emergency-convoy-truck.webp
[A] apps/web/public/images/gallery/emergency-convoy-volunteer.webp
[A] apps/web/public/images/gallery/emergency-gaza-aid-box.webp
[A] apps/web/public/images/gallery/emergency-gaza-distribution-2.webp
[A] apps/web/public/images/gallery/emergency-gaza-distribution.webp
[A] apps/web/public/images/gallery/emergency-gaza-mother-child.webp
[A] apps/web/public/images/gallery/emergency-medical-supplies.webp
[A] apps/web/public/images/gallery/emergency-packing-tent.webp
[A] apps/web/public/images/gallery/emergency-relief-hall.webp
[A] apps/web/public/images/gallery/emergency-sorting.webp
[A] apps/web/public/images/gallery/emergency-trucks.webp
[A] apps/web/public/images/gallery/emergency-volunteers-packing.webp
[A] apps/web/public/images/gallery/health-children-corridor-2.webp
[A] apps/web/public/images/gallery/health-children-corridor.webp
[A] apps/web/public/images/gallery/health-corridor-before-abu-el-rish.webp
[A] apps/web/public/images/gallery/health-dialysis-kom-hamada.webp
[A] apps/web/public/images/gallery/health-dialysis-patient.webp
[A] apps/web/public/images/gallery/health-neonatal-room.webp
[A] apps/web/public/images/gallery/health-nurses-station.webp
[A] apps/web/public/images/gallery/health-ward-2.webp
[A] apps/web/public/images/gallery/health-ward-3.webp
[A] apps/web/public/images/gallery/health-ward.webp
[A] apps/web/public/images/gallery/heritage-arts-concert.webp
[A] apps/web/public/images/gallery/heritage-handicrafts-showcase.webp
[A] apps/web/public/images/gallery/heritage-orchestra.webp
[A] apps/web/public/images/gallery/heritage-stage-event.webp
[A] apps/web/public/images/gallery/heritage-weaver.webp
[A] apps/web/public/images/gallery/heritage-weaving-hands.webp
[A] apps/web/public/images/gallery/household-aid-delivery.webp
[A] apps/web/public/images/gallery/household-blankets-distribution.webp
[A] apps/web/public/images/gallery/household-classroom.webp
[A] apps/web/public/images/gallery/household-door-delivery.webp
[A] apps/web/public/images/gallery/household-family-meal.webp
[A] apps/web/public/images/gallery/household-volunteer-bags.webp
[A] apps/web/public/images/gallery/housing-girl-at-home.webp
[A] apps/web/public/images/gallery/housing-painted-home-2.webp
[A] apps/web/public/images/gallery/housing-painted-home-3.webp
[A] apps/web/public/images/gallery/housing-painted-home.webp
[A] apps/web/public/images/gallery/housing-renovated-home.webp
[A] apps/web/public/images/gallery/ibn-el-sabeel-dorm.webp
[A] apps/web/public/images/gallery/ibn-el-sabeel-entrance.webp
[A] apps/web/public/images/gallery/investment-cutting-machine.webp
[A] apps/web/public/images/gallery/investment-cutting-table.webp
[A] apps/web/public/images/gallery/investment-fabric-spreading.webp
[A] apps/web/public/images/gallery/investment-factory-building-2.webp
[A] apps/web/public/images/gallery/investment-factory-building.webp
[A] apps/web/public/images/gallery/investment-factory-complex.webp
[A] apps/web/public/images/gallery/investment-factory-entrance.webp
[A] apps/web/public/images/gallery/investment-factory-gate.webp
[A] apps/web/public/images/gallery/investment-factory-hall.webp
[A] apps/web/public/images/gallery/investment-factory-sign.webp
[A] apps/web/public/images/gallery/investment-ironing.webp
[A] apps/web/public/images/gallery/investment-production-floor.webp
[A] apps/web/public/images/gallery/investment-sewing-line.webp
[A] apps/web/public/images/gallery/investment-sewing-workers.webp
[A] apps/web/public/images/gallery/research-laboratory.webp
[A] apps/web/public/images/gallery/wash-girl-drinking.webp
[A] apps/web/public/images/gallery/wash-girl-glass.webp
[A] apps/web/public/images/gallery/wash-tap-hands.webp
[A] apps/web/public/images/gallery/wash-water-splash.webp
[A] apps/web/public/images/work/client-delivery.json
[A] apps/web/public/images/work/hero-family.webp
[A] apps/web/public/images/work/hero-school.webp
[A] apps/web/public/images/work/program-economic-empowerment.webp
[A] apps/web/public/images/work/program-education.webp
[A] apps/web/public/images/work/program-emergency-response.webp
[A] apps/web/public/images/work/program-health.webp
[A] apps/web/public/images/work/program-heritage-culture.webp
[A] apps/web/public/images/work/program-housing.webp
[A] apps/web/public/images/work/program-scientific-research.webp
[A] apps/web/public/images/work/program-social-solidarity.webp
[A] apps/web/public/images/work/program-wash.webp
[A] apps/web/public/images/work/water-pipeline.webp
[A] apps/web/public/og/meki-og-approved-logo.jpg
[A] apps/web/public/tracking.js
[A] apps/web/scripts/build-brand.mjs
[A] apps/web/scripts/build-client-delivery.mjs
[A] apps/web/scripts/build-public-gallery.mjs
[A] apps/web/src/components/NoBreak.tsx
[A] apps/web/src/components/PublicTracking.tsx
[A] apps/web/src/components/SocialLinks.tsx
[A] apps/web/src/content/delivery-gallery.json
[A] apps/web/src/content/delivery.ts
[A] apps/web/src/content/gala-assets.ts
[A] apps/web/src/content/superseded-programmes.ts
[A] apps/web/src/lib/donation-tracking.ts
[A] apps/web/src/lib/gala-cms.ts
[A] apps/web/tests/client-delivery.test.mjs
[A] apps/web/tests/closure-audit.test.mjs
[A] apps/web/tests/e2e/client-delivery.smoke.mjs
[A] apps/web/tests/e2e/cms-sync.smoke.mjs
[A] apps/web/tests/e2e/mock-public-api.mjs
[A] apps/web/tests/nov23.test.mjs
[A] apps/web/tests/nov24.test.mjs
[A] apps/web/tests/nov25-cms-sync.test.mjs
[A] apps/web/tests/nov25-gala.test.mjs
[A] apps/web/tests/nov25.test.mjs
[A] deploy/staging/apply-nov23-client-edits.data.json
[A] deploy/staging/apply-nov23-client-edits.mjs
[A] deploy/staging/apply-nov23-client-edits.test.mjs
[A] deploy/staging/apply-nov25-final-content.mjs
[A] deploy/staging/nov25/build-manifest.mjs
[A] deploy/staging/nov25/build-programmes-data.mjs
[A] deploy/staging/nov25/client-delivery.manifest.json
[A] deploy/staging/nov25/client-delivery.map.mjs
[A] deploy/staging/nov25/convert-heic.ps1
[A] deploy/staging/nov25/derive.mjs
[A] deploy/staging/nov25/gala.data.json
[A] deploy/staging/nov25/gala.mjs
[A] deploy/staging/nov25/gala.test.mjs
[A] deploy/staging/nov25/images.mjs
[A] deploy/staging/nov25/programmes.data.json
[A] deploy/staging/nov25/programmes.mjs
[A] deploy/staging/nov25/programmes.previous.json
[A] deploy/staging/nov25/programmes.test.mjs
[A] deploy/staging/nov25/runner.test.mjs
[A] deploy/staging/nov25/site-images.test.mjs
[A] deploy/staging/nov25/site.mjs
[A] deploy/vps/check-migrations.sh
[A] deploy/vps/switch.sh
[A] docs/MEKI_ARABIC_CONTENT_FOR_APPROVAL.md
[A] docs/MEKI_CLIENT_ASSET_INVENTORY_2026-11-24.md
[A] docs/MEKI_CLIENT_EDIT_STATUS.md
[A] docs/MEKI_CLIENT_REQUIREMENTS_CLOSURE_REPORT.md
[A] docs/MEKI_FINAL_CLIENT_CHANGES_REPORT.md
[A] docs/MEKI_PENDING_CLIENT_ASSETS.md
[A] docs/MEKI_PRE_PUSH_AUDIT.md
~~~
