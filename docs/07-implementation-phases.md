# 07 — Implementation Phases (dependency-aware)

Estimates are working days for a team of about 2–3 developers. They are **planning estimates**, not commitments, and are re-estimated at each gate.

## Dependency graph

```
P0 Sign-off ──► P1 Foundation ──┬──► P2 API + DB + Seed ──┬──► P4 Admin dashboard ──┐
                                │                         │                         ├──► P5 Harden + Staging + Launch
                                └──► P3 Landing page ─────┴── (swap fixtures → API) ┘
                                       (fixtures from S1 seed JSON)

P5 ──► P6 Donor portal & auth ──► P7 Payments (GATED) ──► P8 KYC/AML/fraud (GATED, may merge with P7)
```

**Critical path:** P0 → P1 → P2 (schema + content API) → P4 → P5. The landing page (P3) runs in parallel and only joins at the API swap, so the public page is never waiting on the admin.

---

### P0 — Sign-off (now)
- **Deliverables:** this pack approved; blocking questions B1–B6 answered or logged as assumptions.
- **Gate G0:** written approval from the project owner.

### P1 — Foundation (≈3 d) · depends on P0
1. Scaffold pnpm workspace + Turborepo (`apps/web`, `apps/admin`, `apps/api`, `packages/*`).
2. `packages/config`: TS strict, ESLint (+ the logical-properties rule), Prettier.
3. `packages/tokens`: generate `@theme` CSS from `MEKI_Colours.json`; WOFF2 fonts; contrast test.
4. `docker-compose.yml` for local MySQL 8. It creates **new** `meki_dev` and `meki_test` databases only, plus the `scripts/db-guard` safety wrapper.
5. CI (GitHub Actions): install, lint, typecheck, test, build, gitleaks, `pnpm audit`.
- **Gate G1:** a clean clone runs `pnpm i && pnpm build && pnpm test` green; CI green.

### P2 — API, database & verified seed (≈6–7 d) · depends on P1
1. Prisma schema for doc 03 §2 models → `migrate dev --create-only` → **PR review of SQL** → apply to `meki_dev`.
2. Modules: health, auth (sessions, CSRF, lockout), users, audit, site, pages/sections, programmes, stats, media (+ sharp pipeline), campaigns, publishing (integrity rules + revalidation).
3. Public endpoints + Swagger → generate `packages/api-client`.
4. `scripts/seed-data/verified/*.json` transcribed and peer-reviewed; `seed:verified` (upsert, dry-run); `admin:create` CLI.
5. Media shortlist and import of the first curated batch (depends on Q-C1 consent answers).
6. Tests: integrity rules (DEMO cannot publish, stat needs attribution, media needs consent+alt, campaign needs approval, donationsOpen locked), RBAC, auth lockout, seed idempotency.
- **Gate G2:** OpenAPI committed; tests green on `meki_test`; seed is reviewed and run in dev with its output recorded.

### P3 — Landing page (≈6 d) · depends on P1 (tokens); parallel with P2
1. `[locale]` routing, `dir`, next-intl, fonts, header/footer, language switch.
2. Sections per doc 05 §2, as typed components that take the Zod section types. The page first renders from **fixtures generated from the S1 JSON**, so it shows real content from day one with no lorem ipsum.
3. Programme detail pages, 404/500, consent banner, SEO (metadata, OG, sitemap, hreflang, JSON-LD Organization limited to verified facts).
4. Swap the fixtures for `api-client` fetches with ISR + tags, and add the `/api/revalidate` route (HMAC).
5. Tests: component tests and Playwright smoke tests in both locales, plus axe checks.
- **Gate G3:** design review by MEKI brand owner (Nahla Mourad) on staging preview at 360/768/1280 in EN (and AR when B3 allows).

### P4 — Admin dashboard (≈7–8 d) · depends on P2 (API) + P1
1. Auth screens and session handling (401/403/429), app shell with RTL support.
2. Landing page builder (section forms from shared schemas, reorder, show/hide, EN/AR tabs, preview via draft mode).
3. Programmes, proof points, media library, campaigns (proposed), site settings, navigation, users, audit log, versions/restore.
4. Publish workflow UI with integrity-rule feedback.
5. Tests: RHF+Zod form tests, plus Playwright flows: edit hero → submit → publish → web shows the change; unauthorised role is blocked.
- **Gate G4:** MEKI staff (or a delegate) completes a scripted editing session on staging.
- **4b (≈2 d, may follow launch if B5 allows):** TOTP MFA for staff and recovery codes.

### P5 — Hardening, staging & launch (≈4 d) · depends on P3 + P4
- Lighthouse on mobile (≥ 90, LCP ≤ 2.5 s, CLS ≤ 0.1), axe + manual NVDA/VoiceOver pass, CSP/headers test, dependency audit + CycloneDX SBOM + licence list, gitleaks, backup/restore drill on the staging DB, runbook.
- MEKI content approval checklist: every published item is verified or approved, Arabic is approved, image consent is confirmed, and payments are OFF.
- **Gate G5 (launch):** MEKI sign-off, then production deploy, then a smoke test.

**Indicative total to launch:** about 20–24 working days. Parallelising P2/P3 is what makes this the fastest safe path.

---

### P6 — Donor portal & accounts (scope TBD) · depends on P5 + decisions Q4/Q6/Q7
Donor sign-up/sign-in, OTP/MFA, account and security centre, notification preferences (SEC-07/08, FRD-03/06).

### P7 — Payments (GATED) · depends on vendor + merchant account + compliance sign-off
Hosted/tokenised checkout only (FRD-04), server-verified idempotent webhooks, receipts with references (FRD-11), refunds, reconciliation report, sandbox E2E test suite. A **go-live checklist** is required before `PAYMENTS_ENABLED=true`: vendor contract, merchant account, approved campaigns, legal text, E2E tests passed, and webhook replay/duplicate tests passed.

### P8 — KYC / AML / fraud (GATED) · depends on Q6 jurisdiction + vendor
Tiered verification, declarations, limits, re-verification, review queues in our admin (replacing the Filament scope in the old brief).

## Test & DB protocol (all phases)
- Tests run only against `meki_test` (the guard checks the DB name). They use transactional rollback or truncate scoped to `meki_test`, and never touch `meki_dev`, staging or production.
- Each phase report records the exact commands run and their results, including failures.
