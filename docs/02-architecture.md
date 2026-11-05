# 02 — Architecture

## 1. Monorepo layout (pnpm + Turborepo)

```
MEKI/
├─ apps/
│  ├─ web/        Next.js (App Router) — public landing site; donor portal later
│  ├─ admin/      Next.js (App Router) — staff dashboard (separate deploy, separate origin)
│  └─ api/        NestJS modular monolith + Prisma (MySQL 8)
├─ packages/
│  ├─ tokens/        Brand tokens: Tailwind v4 `@theme` CSS generated from MEKI_Colours.json + font faces
│  ├─ ui/            Shared React primitives (Button, Field, Dialog, Logo, Icon wrapper); RTL-safe
│  ├─ api-client/    Typed client generated from the API's OpenAPI spec (openapi-typescript + openapi-fetch)
│  ├─ schemas/       Zod schemas shared by api/admin/web (content, media, forms)
│  ├─ i18n/          ar/en message catalogues for shared UI + locale helpers (numbers, dates, currency)
│  └─ config/        eslint, prettier, tsconfig bases
├─ scripts/
│  ├─ media/         Curation + optimisation pipeline (reads client-resources read-only)
│  └─ seed-data/     Reviewed verified-content JSON (no proprietary images)
└─ docs/
```

## 2. Runtime overview

```
 Browser ──► web (Next.js, SSG/ISR) ──GET (public, cached)──► api /public/*
                    ▲                                            │
                    └──── on-demand revalidate (signed) ◄────────┤ on publish
 Staff ───► admin (Next.js) ──cookie session + CSRF──► api /admin/*
                                                         │
                                               MySQL 8 (Prisma) + media storage
```

- **web** is pre-rendered per locale (`/ar`, `/en`) with ISR. The landing page keeps working, from its cache, if the API is briefly down.
- When admin publishes, the API calls `POST web/api/revalidate` with an HMAC-signed payload containing the tags to revalidate. Edits go live in seconds without a rebuild.
- **admin** is client-heavy and server-rendered behind auth. It never talks to MySQL directly; it uses the API only.
- **api** is the single source of truth: validation, authorisation, provenance rules, audit log, and later payments and webhooks.

## 3. Key technology choices

| Concern | Choice | Reason |
|---|---|---|
| Styling | Tailwind v4, CSS-first `@theme` in `packages/tokens` | FE-02; tokens are defined once and consumed by both apps |
| i18n (web) | `next-intl` with `[locale]` segment, `dir` set on `<html>` | FE-07, RD-04 |
| Forms | React Hook Form + Zod (`packages/schemas`) | FE-06; the same schema validates on the server |
| Data fetching (admin) | TanStack Query over `api-client` | Caching and optimistic editing |
| API framework | NestJS 11, modules per domain, `@nestjs/swagger` → OpenAPI 3.1 | Typed client generation |
| ORM | Prisma with MySQL 8 provider | Fixed choice |
| Auth (staff) | Server-side sessions (DB table), argon2id passwords, httpOnly cookies; TOTP MFA in Phase 4b | SEC-02/03; avoids JWT-in-storage |
| Rich text | Constrained structured blocks (paragraph, list, link), stored as JSON and sanitised. No raw HTML | SEC-04 |
| Media storage | `StorageDriver` interface: local disk in dev, S3-compatible bucket in staging/prod (doc 08 Q-H1) | Swappable without schema changes |
| Image processing | `sharp`: resize to AVIF/WebP variants, **strip EXIF/GPS** | RD-06 + privacy |
| Testing | Vitest + Testing Library (web/admin), Jest/Vitest + Supertest (api) against a **dedicated test DB**, Playwright e2e + axe | FE-11, RD-05 |
| Node | Current LTS, `engines` field set, pnpm lockfile committed | FE-12 |

Versions are pinned at install time, in Phase 1 after approval, to the latest stable releases. No beta or canary versions.

## 4. NestJS module map (modular monolith)

| Module | Phase | Responsibility |
|---|---|---|
| `health` | 2 | liveness/readiness |
| `auth` | 2 | staff login/logout, sessions, CSRF, password policy, lockout |
| `users` | 2 | staff users and roles |
| `site` | 2 | site settings, navigation, footer, legal-page shells |
| `pages` | 2 | landing page and its ordered sections (typed blocks) |
| `programmes` | 2 | the 9 programmes + 3 enabling functions, sub-themes |
| `stats` | 2 | proof points with source attribution |
| `media` | 2 | upload, variants, alt text, captions, consent flags |
| `campaigns` | 2 | proposed campaign drafts (no money fields active) |
| `publishing` | 2 | status workflow, versions, revalidation webhook |
| `audit` | 2 | append-only audit log |
| `inquiries` | 3 | contact / "register interest" submissions (needs a privacy notice) |
| `donors`, `kyc`, `payments`, `webhooks` | 6+ | gated; see doc 07 |

## 5. Security baseline (from day one)

- Secrets come only from env. `.env.example` lists keys with no values. The secret scan (gitleaks) runs in CI.
- Headers: strict CSP with nonce (no `unsafe-inline` scripts), `frame-ancestors 'none'`, HSTS, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `X-Content-Type-Options`.
- API: Helmet, CORS allow-list (web and admin origins only), rate limiting (`@nestjs/throttler`) on auth and public forms, request-size limits, and global Zod validation pipe.
- Admin and API are on separate origins with `SameSite=Strict` session cookies. CSRF uses a double-submit token on every mutating request.
- RBAC is enforced in the API, never only in the UI.
- Logs are structured (pino) and redact cookies, authorisation headers, emails and phone numbers.
- **Database safety:** every developer gets a new local `meki_dev` database, and tests use a separate `meki_test`. Prisma commands that drop data (`migrate reset`, `db push --force-reset`) are blocked by a wrapper script and are not in `package.json`. Migrations are generated with `--create-only`, reviewed in a PR, and then applied with `migrate deploy`. Production gets a backup and a restore check before every deploy.
- Payments are switched off server-side by `PAYMENTS_ENABLED=false`. The UI reads the flag from the API, so a client-side change cannot enable it.

## 6. Environments

| Env | web | admin | api | DB |
|---|---|---|---|---|
| local | :3000 | :3001 | :4000 | MySQL 8 in Docker, `meki_dev` and `meki_test` |
| staging | staging domain | admin-staging domain (IP or SSO restriction recommended) | api-staging | managed MySQL, staging-only data |
| production | public domain | admin domain | api | managed MySQL with PITR backups |

Hosting is not decided (doc 08 Q-H1). The design does not depend on a specific vendor.
