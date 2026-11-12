# @meki/api — MEKI core backend

NestJS 11 modular monolith · MySQL 8 · Prisma 7 (MariaDB driver adapter) · REST under `/api/v1` · Swagger at `/api/docs` (non-production).

## Local setup

1. **MySQL 8.4** (dedicated container, never shared with other projects):
   ```sh
   docker run -d --name meki-mysql -p 127.0.0.1:3307:3306 \
     -e MYSQL_ROOT_PASSWORD=<root> -e MYSQL_DATABASE=meki_dev -e MYSQL_USER=meki_user -e MYSQL_PASSWORD=<pw> \
     -v meki_mysql_data:/var/lib/mysql mysql:8.4 --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
   # test DB + trigger permission (audit-log append-only triggers):
   docker exec meki-mysql mysql -uroot -p<root> -e "CREATE DATABASE meki_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; \
     GRANT ALL ON meki_test.* TO 'meki_user'@'%'; SET PERSIST log_bin_trust_function_creators=1;"
   ```
2. `cp .env.example .env` and `cp .env.test.example .env.test`, fill in `DATABASE_URL` (`.env.test` **must** point to a `*_test` DB).
3. ```sh
   pnpm --filter @meki/api prisma:generate
   pnpm --filter @meki/api db:migrate:deploy   # applies reviewed migrations only — never resets
   pnpm --filter @meki/api db:seed             # create-only, idempotent baseline content
   ADMIN_BOOTSTRAP_EMAIL=... ADMIN_BOOTSTRAP_PASSWORD=... pnpm --filter @meki/api admin:bootstrap
   pnpm --filter @meki/api dev                 # http://localhost:4000/api/v1
   ```
   Optional dev-only accounts (one per role, `@meki.test`): `DEV_ACCOUNTS_PASSWORD=... pnpm --filter @meki/api db:seed:dev`.

## Database safety

- Never `prisma migrate reset`, `db push --force-reset`, `db pull` over the schema, or DROP/TRUNCATE.
- New migrations: generate SQL with `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, review it, save under `prisma/migrations/<timestamp>_<name>/migration.sql`, then `db:migrate:deploy`.
- The seed only **creates** missing rows by stable keys (`code`/`slug`); it never updates rows, so dashboard edits survive re-runs.
- Tests run against `*_test` only (guarded), create uniquely-named rows and never truncate.

## Commands

| | |
|---|---|
| `pnpm --filter @meki/api typecheck` / `lint` / `build` | static checks / compile to `dist/` |
| `pnpm --filter @meki/api test` | unit + integration (Jest + Supertest, `meki_test`) |
| `pnpm --filter @meki/api openapi:export` | writes `packages/api-client/openapi.json` |

## Conventions

- Success: `{ data }` / `{ data, meta: { page, pageSize, total, totalPages } }`. Errors: `{ error: { statusCode, code, message, details?, requestId, path, timestamp } }`.
- Lists: `?page&pageSize(≤100)&search&sort=field:asc|desc` + entity filters.
- Bilingual paired fields (`titleEn`/`titleAr`). Public endpoints accept `?locale=en|ar` to flatten (Arabic falls back to English and lists `translationFallback`).
- Admin auth: HttpOnly `SameSite=Strict` session cookie (`__Host-meki_admin_sid` + `Secure` in staging/production), hashed server-side sessions (30 min idle sliding, 12 h absolute), `X-CSRF-Token` on every mutation, argon2id, lockout after 5 failures, 5 login attempts/min/IP.
- Publication rules: DEMO never public; campaigns need a recorded MEKI approval + published programme; statistics need `VERIFIED` + `sourceRef`; donations cannot open until a payment provider is configured server-side **and** enabled in settings.

## Donations (Phase 3)

See [docs/10-donations-and-payments.md](../../docs/10-donations-and-payments.md). Amounts in the API are **decimal strings**. Payments need server env (`PAYMENTS_ENABLED`, `PAYMENT_PROVIDER`, `DONATION_TOKEN_SECRET`) plus an admin enabling the provider record and `paymentsEnabled`. The `mock` provider is development/test only.
