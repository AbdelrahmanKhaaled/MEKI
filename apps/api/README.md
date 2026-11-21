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
   **Interactive Super Admin (dev DB only):** `pnpm --filter @meki/api seed:superadmin` prompts for e-mail, name, hidden password + confirmation (argon2id via the app's `PasswordService`, same policy), creates or updates only that account as `SUPER_ADMIN`, re-runnable, never deletes data, never prints the password. Refuses `NODE_ENV=production` and any DB not named `*_dev`; requires a real terminal.
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

## Gala booking & ticketing (Phase 5B)

See [docs/15](../../docs/15-phase5b-implementation.md) (design), [docs/16](../../docs/16-phase5b-api-reference.md) (endpoints), [docs/17](../../docs/17-phase5b-testing-report.md) (tests). Individual tickets (USD 500 per guest since MEKI's 19 Nov 2026 update; the price is server-configured), one per guest; ticket revenue is classified `EVENT_TICKET_PAYMENT` and is **never** a donation (separate booking-keyed attempts and append-only ledger; no tax receipts, no fair-market-value is stored). Tickets, QR tokens and PDFs exist only after a **verified** provider notification; the browser return URL never confirms payment. Sales are seeded **closed**; checkout returns 503 until a provider is approved and every payment gate is open (the mock provider stays dev/test only).

- Env (all optional): `EVENT_BOOKING_TOKEN_SECRET`, `EVENT_BOOKING_RETURN_URL`, `EVENT_BOOKING_HOLD_MINUTES`, `PRIVATE_STORAGE_DIR` (private ticket-PDF storage, never web-served), `TICKET_PDF_UNICODE_FONT_PATH`.
- New permissions `gala.bookings.read|manage`, `gala.guests.read|export`, `gala.tickets.read|manage`, `gala.checkin.validate|manage`; new role `EVENT_CHECKIN_STAFF` (door scanning only). Existing databases receive grants through the apply-once seed version `2026-11-16-phase5b-gala` (`pnpm db:seed`, create-only).
- Guest list CSV export only (no XLSX library installed). E-mail is composition-only until a provider is wired to `GALA_NOTIFIER`. Calendar (`.ics`) answers 409 `CALENDAR_PENDING` until the event has a confirmed start time and timezone.

## Ticketing QA & hardening (Phase 5B.1)

See [docs/18](../../docs/18-phase5b1-qa-audit.md) (audit), [19](../../docs/19-phase5b1-implementation.md), [20](../../docs/20-phase5b1-testing-report.md), [21](../../docs/21-phase5b1-deployment-requirements.md).

- **Arabic/Unicode ticket PDFs:** bundled SIL-OFL Noto Sans / Noto Sans Arabic (`assets/fonts`), Unicode bidi + shaping; only Latin and Arabic guest names are accepted (422 `UNSUPPORTED_NAME_CHARACTERS` otherwise). Font overrides: `TICKET_PDF_UNICODE_FONT_PATH`/`_BOLD_PATH`, `TICKET_PDF_LATIN_FONT_PATH`/`_BOLD_PATH` — an invalid path stops the API at startup.
- **Guest export:** `GET …/guests/export?format=csv|xlsx` (same permission, filters, audit, formula-injection guard).
- **Retryable work:** payment confirmation writes outbox rows (`EventBookingJob`); PDFs and e-mails are retried with back-off and never roll back a verified payment. Admin: `POST …/bookings/:id/resend`, `POST …/jobs/run`. Env: `GALA_JOBS_INTERVAL_SECONDS`, `GALA_JOB_MAX_ATTEMPTS`.
- **E-mail:** `MAIL_TRANSPORT=none` (default; parks mail, sends nothing) | `dev-file` (dev) | `memory` (tests). No provider is chosen; Arabic templates are proposed copy gated by `GALA_EMAIL_ARABIC_APPROVED`.
- **Build:** `pnpm --filter @meki/api build` copies runtime assets to `dist/assets`; `pnpm --filter @meki/api verify:assets` checks them.
