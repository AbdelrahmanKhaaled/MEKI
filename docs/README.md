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
