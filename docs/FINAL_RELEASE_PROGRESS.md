# Final release — progress checklist

Persistent checklist for the final pre-production pass (VPS-only hosting on `meki-us.org`). Another session can resume from here.

- **Base commit:** `6b37e9c` (Phases 13A–14B).
- **Rules:** no commit/push/deploy; no real `.env` edits; no live financial switch turned on.
- **Status keys:** `[x]` done + verified · `[~]` in progress · `[ ]` open · `[B]` blocked externally.

## 0. Baseline

- [x] Working tree at `6b37e9c` clean except the untracked client DOCX.
- [x] DOCX is byte-identical (SHA-256) to the one fully inspected (text + 10 images incl. the agenda graphic) in the Phase 13B session.
- [x] `docs/client-requirements/` added to `.gitignore` (client-proprietary; CLAUDE.md).

## 1. Official Zeffy forms / public journeys

- [x] Diagnosed: both pages depend on the API (`/public/events/gala-night/ticketing`, `/giving-options`); deployed API unreachable + all sales gates OFF by design → closed states.
- [x] Official-form hand-off (`src/lib/official-forms.ts`, `OfficialFormHandoff`), switches `NEXT_PUBLIC_GALA_{TICKET,DONATION}_FORM_HANDOFF` (default OFF); works with API offline; reference flow preferred. `tests/final-zeffy.test.mjs` 5/5.
- [x] Zeffy embed / API / webhook researched from official sources. Embed = BLOCKED_EXTERNAL (dashboard-only iframe code). Webhook signature undocumented → keep disabled.

## 2. Website Comments

- [x] All 9 comments re-verified against code + tests → `FINAL_CLIENT_REQUIREMENTS_MATRIX.md`.

## 3. Integration matrices

- [x] `scripts/api-integration-matrix.mjs`: 230 call sites → 0 without a backend route. Dead ends FIXED: forced password change (AccountGate) + Users & Roles page. Browser e2e 24/24 × 3.

## 4. VPS deployment (meki-us.org)

- [x] PM2 for 3 apps (`deploy/vps/ecosystem.config.cjs`, loopback ports 6666/3000/3001).
- [x] nginx (`nginx-meki-us.conf` + bootstrap) — `nginx -t` OK on nginx 1.24 container; redirects verified with curl.
- [x] Env templates `deploy/vps/{api,web,admin}.env.example` (build-time vs runtime). turbo.json build `env` declared.
- [x] Admin: nginx routes `admin.meki-us.org/api/v1` → 127.0.0.1:6666 directly; `ADMIN_API_UPSTREAM=https://api.meki-us.org` fallback. HTTPS-Git `deploy.sh` / `rollback.sh`.
- [x] Empty MySQL 8.0.46: 15 migrations via least-privilege migrator, 53 tables, 18 triggers, no drift, re-deploy no-op; seed via DML-only user idempotent, 0 admins/transactions, 0 published campaigns. Container removed.

## 5. Security

- [x] gitleaks 8.24.2: history (8 commits) + tracked files → 3 hits, all obvious test fixtures (zeffy.spec.ts, test/zeffy-env.ts). No .env/keys tracked.
- [x] `pnpm audit --prod`: 1 high (effect via Prisma config) + 1 moderate (uuid via exceljs) → fixed with narrow pnpm overrides → "No known vulnerabilities found". Dev-only moderates remain (glob/minimatch in jest/eslint).
- [x] Headers/CORS/cookies reviewed (matrix §2); admin /api/v1 same-origin via nginx.

## 6. Final QA

- [x] API 490/490 (35 suites).
- [x] Web 117/117, admin 227/227.
- [x] Turbo typecheck+lint 7/7 (0 errors, 5 pre-existing warnings); web/admin `next build` OK (staging + switch-ON variants); API build via openapi:export.
- [x] Staging smoke 56/56 (no credential rotation).
- [~] Browsers × 3: users/password 24/24 ×3; official-form hand-off (API offline) 26/26 ×3; Phase 14B Chromium 40/40, Firefox 40/40, **WebKit 38/40** (cancelled-request notices; open, see readiness report §3.1).

## 7. Reports

- [x] `FINAL_CLIENT_REQUIREMENTS_MATRIX.md`
- [x] `FINAL_FULLSTACK_API_INTEGRATION_MATRIX.md`
- [x] `FINAL_ZEFFY_INTEGRATION_REPORT.md`
- [x] `FINAL_PRODUCTION_DEPLOYMENT_RUNBOOK.md`
- [x] `FINAL_PRODUCTION_READINESS_REPORT.md`
