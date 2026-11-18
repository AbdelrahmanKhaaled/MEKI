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
