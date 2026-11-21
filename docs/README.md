# MEKI Platform — Planning Pack (v0.1, for approval)

**Status:** DRAFT for sign-off. No application code, packages, or migrations exist yet.
**Date:** 2026-11-05 · **Author role:** Lead Architect
**Urgent scope:** (1) the public bilingual landing page, (2) an editable admin dashboard that controls it.

## Documents

| # | Document | What it decides |
|---|----------|-----------------|
| 01 | [Source review & requirements](01-source-review-and-requirements.md) | What the client actually supplied; verified vs proposed vs demo; requirement traceability |
| 02 | [Architecture](02-architecture.md) | Monorepo layout, apps, packages, runtime, security baseline |
| 03 | [Database design](03-database-design.md) | MySQL + Prisma models, provenance and publishing rules |
| 04 | [Seed & media strategy](04-seed-and-media-strategy.md) | How real client data enters the DB safely; image curation pipeline |
| 05 | [UI screens](05-ui-screens.md) | Landing page sections, admin screens, design tokens, RTL |
| 06 | [API design](06-api-design.md) | NestJS modules, endpoints, auth, OpenAPI client |
| 07 | [Implementation phases](07-implementation-phases.md) | Dependency-aware plan, critical path, gates, estimates |
| 08 | [Decisions, open questions & risks](08-open-questions-and-risks.md) | What we need from MEKI before or during build |
| 09 | [Events foundation](09-events-foundation.md) | Phase 2: events, Gala Night draft, event CMS pages |
| 10 | [Donations & payments](10-donations-and-payments.md) | Phase 3: donations, provider port, webhooks, refunds, receipts |
| 11 | [Landing integration](11-landing-integration.md) | Phase 4: landing page ↔ API integration |
| 12 | [Phase 5A progress](12-phase5a-progress.md) | Phase 5A: client-approved website updates & Gala Night page |
| 13 | [Phase 7 QA report](13-phase7-qa-report.md) | Phase 7: frontend QA in a real browser |
| 14 | [Phase 5B audit](14-phase5b-audit.md) | Gala booking: repository audit, reuse vs new models, security, migration impact |
| 15 | [Phase 5B implementation](15-phase5b-implementation.md) | Gala booking, guests, tickets, QR check-in, PDF, export, e-mail/calendar foundation |
| 16 | [Phase 5B API reference](16-phase5b-api-reference.md) | Public and admin ticketing endpoints, errors, audit actions |
| 17 | [Phase 5B testing report](17-phase5b-testing-report.md) | Exact commands/results, coverage, what was not tested |
| 18 | [Phase 5B.1 QA audit](18-phase5b1-qa-audit.md) | Re-audit of the ticketing code: confirmed issues, dependencies, blockers |
| 19 | [Phase 5B.1 implementation](19-phase5b1-implementation.md) | Arabic PDF, XLSX, retryable jobs/outbox, mail transport, calendar, storage and asset hardening |
| 20 | [Phase 5B.1 testing report](20-phase5b1-testing-report.md) | Exact results (333 tests), visual PDF inspection, what was not verified |
| 21 | [Phase 5B.1 deployment requirements](21-phase5b1-deployment-requirements.md) | Artifact contents, env vars, checklist, licences, limitations |
| 22 | [Phase 5C implementation](22-phase5c-implementation.md) | Public Gala booking frontend |
| 23 | [Phase 6A admin audit](23-phase6a-admin-audit.md) | Admin dashboard audit and plan |
| 24 | [Phase 6A implementation](24-phase6a-implementation.md) | Admin app foundation + dashboard overview |
| 25 | [Phase 6B donations admin](25-phase6b-donations-admin-implementation.md) | Donations, donors, payments & refunds, recurring, receipts admin pages |
| 26 | [Phase 6C content management](26-phase6c-content-management-implementation.md) | Programs, causes (projects), campaigns lifecycle, media library & picker |
| 27 | [Phase 6D website CMS](27-phase6d-website-cms-implementation.md) | Homepage CMS, pages, menus, FAQs, statistics, site settings; website reads CMS menus and hidden sections |
| 28 | [Phase 6E Gala operations](28-phase6e-gala-operations-implementation.md) | Gala overview, bookings, guests, tickets, QR check-in, exports, communications, settings; Zeffy/e-mail status |
| 29 | [Phase 7 launch readiness report](29-phase7-launch-readiness-report.md) | End-to-end verification, fixes (CORS booking header, e-mail token in fragment, silent CMS fallback, 404), OpenAPI sync, tests, deployment readiness |
| 30 | [Launch blockers & client requirements](30-meki-launch-blockers-and-client-requirements.md) | Handoff checklist: MEKI, SDI/Zeffy, e-mail provider, hosting, physical check-in — website vs ticket-sales blockers |
| 31 | [Phase 8A Zeffy integration](31-phase8-zeffy-integration-implementation.md) | Verified Zeffy API facts, webhook verification, read model, correlation rules, reconciliation, admin SDI / Zeffy screen, tests |
| 32 | [Phase 8 SDI handoff & live-test plan](32-phase8-sdi-handoff-and-live-test-plan.md) | What SDI must provide (secure transmission), booking-reference options, live payment/refund test, Phase 8B entry criteria |
| 33 | [Phase 9A security audit](33-phase9a-security-audit.md) | Controls verified, fixes (multer DoS, admin camera policy, CSP/HSTS, health probe), accepted risks |
| 34 | [Phase 9A reliability & testing](34-phase9a-reliability-and-testing.md) | Test inventory, scenario coverage map, ops endpoints, incidents, backup verification |
| 35 | [Phase 9A performance](35-phase9a-performance-report.md) | Measured API timings, web page weight before/after (font preload fix), watch list |
| 36 | [Production readiness checklist](36-production-readiness-checklist.md) | Infrastructure, environment, build variables, release gates, security confirmations |
| 37 | [Deployment & rollback runbook](37-deployment-and-rollback-runbook.md) | Backup, migrate, deploy, verify, rollback, recovery procedures, restore drill |
| 38 | [Remaining external dependencies](38-remaining-external-dependencies.md) | Consolidated MEKI / SDI / hosting / physical check-in list |
| 39 | [Phase 9B cross-browser QA](39-phase9b-cross-browser-qa.md) | Chromium / Firefox / WebKit × 5 widths × EN/AR; what WebKit is and is not; engine notes |
| 40 | [Phase 9B accessibility audit](40-phase9b-accessibility-audit.md) | WCAG 2.2 AA method, 8 fixes, exempt / manual-review items, before/after |
| 41 | [Phase 9B regression results](41-phase9b-regression-results.md) | Suites, critical journeys, bugs caught by regression, operational validation (restore drill, multi-instance) |
| 42 | [Phase 9B final readiness report](42-phase9b-final-readiness-report.md) | Readiness verdicts, fixed bugs, exact results, open checks, decisions, blockers |
| 43 | [Phase 10 website visual enhancement](43-phase10-website-visual-enhancement.md) | Route inventory, homepage-safe design system, page-by-page redesign, images and motion |
| 44 | [Phase 10 Gala content audit](44-phase10-gala-content-audit.md) | Field-by-field Gala status (client vs DB provenance), booking integrity, missing MEKI/SDI items |
| 45 | [Phase 10 QA and regression](45-phase10-qa-and-regression-report.md) | Test results, deterministic homepage regression, bugs fixed, limitations |
| 46 | [Phase 11A programme pages & giving](46-phase11a-program-detail-and-donation-experience.md) | Single programme pages, Programme → Cause → Campaign, attribution rule, verified fundraising, approved goals, cause publishing, programme-designated giving, tests |
| 47 | [Phase 12 SDI hosted forms — implementation](47-phase12-sdi-hosted-forms-implementation.md) | SDI's decision, integration switches (all off), reference-only Gala booking + Zeffy form, ticket ownership (no MEKI tickets for Zeffy bookings), programme/general hosted giving gates, admin screens, migration |
| 48 | [Phase 12 reconciliation & financial integrity](48-phase12-reconciliation-and-financial-integrity.md) | Report upload → preview → four-eyes apply, file security, column mapping & verified profiles, strict validation, matching statuses, all-or-nothing apply, refunds, money separation, test results |
| 49 | [Phase 12 SDI final handoff checklist](49-phase12-sdi-final-handoff-checklist.md) | Remaining MEKI/SDI dependencies (status updated by doc 50), go-live sequence, operator rules, regression notes, verification record |
| 50 | [Phase 12B SDI agreement alignment](50-phase12b-sdi-agreement-alignment.md) | One approved Gala project (four-eyes approvals), Gala-only giving scope, programme pages informational, Gala donation reconciliation category, SDI sample-layout support, booking reference format + SDI message, dependency register, launch blockers |
| 51 | [Phase 13A staging deployment & operational validation](51-phase13a-staging-deployment-and-operational-validation.md) | Admin login 404 root cause + build-time fix, topology, API image, isolated local staging rehearsal, defects found and fixed (pool timeouts, non-atomic password change, lockout recovery), backup/restore drill |
| 52 | [Phase 13A security & infrastructure audit](52-phase13a-security-and-infrastructure-audit.md) | Verified controls, secrets review and rotation list, risks (Vercel proxy, client IP, upload limits, loopback MySQL), no weakening |
| 53 | [Phase 13A staging test results](53-phase13a-staging-test-results.md) | Exact results: API/web/admin suites, staging smoke (57 checks), browser smoke, drill, Turbo typecheck/lint/build |
| 54 | [Phase 13A deployment & recovery runbook](54-phase13a-deployment-and-recovery-runbook.md) | Ubuntu 24.04 VPS (native MySQL 8.0 `meki`, PM2 on 127.0.0.1:6666, nginx/HTTPS), Vercel env + redeploy for the admin login, health checks, backup/restore, rollback |
| 55 | [MEKI 19 Nov 2026 updates & SDI dependencies](55-meki-november-19-client-updates-and-sdi-dependencies.md) | USD 500 / 350 / 3:30–8:30 PM / four-act agenda (no speaker names), SDI-gated legal copy, MEKI-vs-SDI contradictions (six programmes, Dec 2027, ongoing giving), VPS checklist, blockers |
| 56 | [Phase 13B client website revisions](56-phase13b-client-website-revisions.md) | "Website Comments.docx" (21 Nov 2026) item by item: WASH badge removed from the Give preview, venue-photo gallery (CMS `EVENT_VENUE`, none until MEKI supplies photos), "Title – Place" captions + audited DB script, Refined Refreshments, Arrival/Transfers removed, dietary options, old vs new agenda |
| 57 | [Phase 13B payment integration readiness](57-phase13b-payment-integration-readiness.md) | SDI/Zeffy hosted model re-verified in code, importer checklist, the three SDI texts (verbatim source, approval-gated, receipt never published by MEKI), agreement boundaries, Zeffy dietary question, price/capacity per environment |
| 58 | [Phase 13B final QA and launch blockers](58-phase13b-final-qa-and-launch-blockers.md) | Exact test results, staging rehearsal, infrastructure readiness, MEKI vs SDI vs operator blockers, go-live readiness |
| 59 | [Phase 14 donation and booking flows](59-phase14-donation-and-booking-flows.md) | Three intent flows (Gala ticket EB-, Gala donation DN-, program/general DN-), giving form (preview while closed), program preselection, return/status page, admin screens, before/after UX, files |
| 60 | [Phase 14 Zakat/Sadaqah financial model](60-phase14-zakat-sadaqah-financial-model.md) | First-class immutable classification, intent type, verification vs allocation vs payout, Zakat eligibility (default not eligible, two administrators, both references), additive migration + trigger |
| 61 | [Phase 14 Zeffy hand-off and reconciliation](61-phase14-zeffy-handoff-and-reconciliation.md) | Per-channel switches, SDI form fields to configure, donation-report types and mappings, row outcomes (wrong form/amount/type/designation → review), allocation |
| 62 | [Phase 14 tests and launch gates](62-phase14-tests-and-launch-gates.md) | Exact test results, staging rehearsal, what is implemented vs disabled, SDI configuration and MEKI approvals still required, commit safety and activation answers |
| 63 | [Phase 14B manual evidence and release procedure](63-phase14b-manual-evidence-and-release.md) | Gala-only consent and CTA behavior, private SDI evidence queue, approval gates, reconciliation, native VPS/Vercel release and rollback checklist |
| 64 | [Phase 14B final release report](64-phase14b-final-release-report.md) | Firefox root cause/fix, exact current QA evidence, security, GitHub and disabled-payment deployment readiness |
| 65 | [Phase 14B commit-ready file list](65-phase14b-release-files.txt) | Exact reviewed file set; developer stages/commits/pushes separately |

## The plan in short

1. **Phase 0 (now):** approve this pack and answer the blocking questions in doc 08 (B1–B6).
2. **Phase 1:** set up the monorepo with pnpm + Turborepo, shared design tokens from the official palette, CI, and a new local MySQL dev database. Existing databases are never touched.
3. **Phase 2 + 3 in parallel:**
   - API + DB: content, media and auth modules, OpenAPI, and a seed of verified data only.
   - Landing page: built against typed fixtures generated from the same verified seed, so the API is not on its critical path.
4. **Phase 4:** admin dashboard for editing the landing page (sections, programmes, media, settings, draft campaigns), with publish and on-demand revalidation.
5. **Phase 5:** hardening (accessibility, Lighthouse, CSP, security headers), staging, MEKI content approval, then launch.
6. **Later, gated phases:** donor portal, auth/KYC/AML, payments. Payments are blocked until the vendor, merchant account, compliance sign-off and end-to-end tests exist.

## Non-negotiables carried into every phase

- No invented figures, campaigns, testimonials, totals, contacts or legal claims. Demo values carry the `DEMO` provenance and cannot be published in production.
- Three separate data classes: **verified source data**, **proposed (draft) content**, and **real transactions**. Real transactions are never seeded.
- Donate buttons stay disabled behind a server-side feature flag (`PAYMENTS_ENABLED=false`).
- Original brand files are copied, never modified. The logo is never redrawn or retyped.
- Arabic RTL and English LTR, WCAG 2.2 AA, from 360 px to 1920 px.
