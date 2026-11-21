# 51 — Phase 13A: staging deployment and operational validation

Date: 2026-11-19.

**What did not change:**

- Nothing was committed, pushed or deployed (no Vercel, no VPS).
- No real `.env` file was edited.
- No financial switch was turned on.
- `meki_dev` and `meki_test` received only additive migrations, after backups.

**Two different environments — do not confuse them:**

| Environment | What it is | Status |
|---|---|---|
| **Local staging rehearsal** (this document) | Docker on the developer machine: isolated MySQL 8.4 (`meki-staging-mysql`, 127.0.0.1:3308, database `meki_staging`), the API image (`meki-staging-api`, :4200), production builds of the website (:3200) and admin (:3201) | **Operational and verified** (§4) |
| **Real deployment** | Ubuntu 24.04 VPS with native MySQL 8.0 (`meki`, 127.0.0.1:3306), API on 127.0.0.1:6666 behind HTTPS nginx; website `https://meki-neon.vercel.app`, admin `https://admin-anhk.vercel.app` | **Not accessed and not verified.** No VPS or Vercel credentials were available. Runbook: doc 54 |

## 1. The deployed admin login 404 — root cause and fix

**Root cause** (from the code and configuration; the live project was not accessible):

- The admin proxies every `/api/v1/*` request to `ADMIN_API_UPSTREAM` through a Next.js rewrite.
- Rewrites are compiled at **build** time.
- When the variable is missing, `next.config.ts` fell back to `http://localhost:4000`. On Vercel that address is unreachable, so `POST /api/v1/admin/auth/login` returns 404.
- A second, equally silent mistake: setting the upstream to `https://api…/api/v1` produced `/api/v1/api/v1/…`, which is also a 404.

**Fix (code — verified locally):** `apps/admin/next.config.ts` → `resolveApiUpstream()`:

- On a hosted build (`VERCEL` set, or `MEKI_DEPLOY_ENV=staging|production`), the build **fails** unless `ADMIN_API_UPSTREAM` is an absolute `https` URL that is not localhost. The error message names the variable.
- A trailing `/api/v1` is removed; the rewrite keeps `/api/v1/:path*`.
- Credentials, queries and fragments in the URL are refused.
- Local builds keep the `http://localhost:4000` fallback.

Proved by:

- `VERCEL=1 next build` without the variable → build stops: *"ADMIN_API_UPSTREAM is required for a hosted admin build…"*;
- with `ADMIN_API_UPSTREAM=https://api.staging.example.org/api/v1` the compiled rewrite is `/api/v1/:path* → https://api.staging.example.org/api/v1/:path*`;
- 5 unit tests (`apps/admin/tests/phase13a.test.mjs`).

The website has the same guard for `NEXT_PUBLIC_API_URL` (`checkPublicApiUrl()`): a hosted build fails on a localhost/http value and warns when it is missing.

**Consequence for the current Vercel admin project:** its next build **fails on purpose** until `ADMIN_API_UPSTREAM` is set. That replaces a silent 404 with an explicit message.

**Still required to fix the LIVE login** (operator, doc 54 §7):

1. Deploy the API on the VPS behind HTTPS.
2. Set `ADMIN_API_UPSTREAM=https://<api host>` for Production (and Preview) in the Vercel admin project.
3. Redeploy without the build cache.
4. Verify that `https://admin-anhk.vercel.app/api/v1/health` returns `{"status":"ok","database":"up"}`.

**The live 404 is not fixed until these steps are done and verified.**

## 2. Topology

```
Browser ──https──▶ Vercel: admin (Next.js)   ── rewrite /api/v1/*, /media/uploads/* ──┐
Browser ──https──▶ Vercel: website (Next.js) ── server fetch (API_INTERNAL_URL) ───────┤
Browser ──https──▶ (website calls the public API with NEXT_PUBLIC_API_URL) ────────────┤
                                                                                       ▼
                        VPS: nginx :443 (TLS) ──▶ 127.0.0.1:6666 NestJS API (PM2, 1 instance)
                                                       │  Prisma 7 + MariaDB adapter
                                                       ▼
                                                 MySQL 8.0 127.0.0.1:3306 `meki`
                                                 /var/lib/meki/uploads (public media via the API)
                                                 /var/lib/meki/private (ticket PDFs, SDI reports — never served by nginx)
```

The session cookie is set by the API through the admin's same-origin proxy, so it belongs to the **admin** host: `__Host-meki_admin_sid; Secure; HttpOnly; SameSite=Strict; Path=/`. There is no CORS on the admin path.

The local rehearsal is the same topology, with Docker in place of the VPS and plain http on localhost.

## 3. What was built for deployment (Phase 13A)

| Item | File(s) |
|---|---|
| API image (Node 22, pnpm 10, Prisma generate, assets, non-root, liveness `HEALTHCHECK`, `/data/uploads` + `/data/private`) | `apps/api/Dockerfile`, `.dockerignore` |
| Local staging stack: isolated MySQL with least-privilege `meki_migrator` / `meki_app`; API with every financial switch hard-wired OFF; one-off `migrate`, `seed`, `bootstrap-admin`, `reset-admin-password`, `backup` | `deploy/staging/docker-compose.yml`, `deploy/staging/mysql-init/01-users.sh` |
| Secrets for the rehearsal, generated without being printed; git-ignored | `deploy/staging/init-secrets.mjs` → `deploy/staging/.env.staging` |
| End-to-end staging smoke (57 checks) | `deploy/staging/smoke.mjs` |
| Backup + isolated restore drill | `deploy/staging/restore-drill.sh` |
| Apply the 19 Nov Gala values to an existing database through the audited admin API | `deploy/staging/apply-nov19-gala.mjs` |
| VPS templates: PM2, nginx, MySQL users, nightly backup, env names | `deploy/vps/*` |
| **Startup guard:** staging/production refuse localhost/http public URLs and CORS origins | `env.validation.ts` → `validateDeploymentUrls()` (+ `STAGING_LOCAL_REHEARSAL`, staging-only) |
| **DB pool defaults** (`connectTimeout` 10 s, `acquireTimeout` 20 s; URL values win) | `src/prisma/prisma.service.ts` |
| **Atomic password change** | `src/modules/auth/auth.service.ts`, `session.service.ts` |
| **Operator lockout recovery** (`admin:reset-password`) | `apps/api/scripts/reset-admin-password.ts` |

## 4. Local staging rehearsal — verified

Commands (repository root):

1. `node deploy/staging/init-secrets.mjs`
2. `docker build -f apps/api/Dockerfile -t meki-api:staging-local .`
3. `docker compose -p meki-staging -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env.staging up -d mysql`
4. `… run --rm migrate`, then `… run --rm seed`, then `… up -d api`
5. One-time Super Admin: `ADMIN_BOOTSTRAP_EMAIL=… ADMIN_BOOTSTRAP_PASSWORD=… … run --rm bootstrap-admin`

| Check | Result |
|---|---|
| Database isolation | Separate container, volume, port (3308) and database. `meki_app` has DML on `meki_staging` only; `meki_migrator` has DDL on `meki_staging` only |
| Migrations | **11/11 applied in order**; `migrate status` up to date |
| Seed | Roles, permissions and verified content only. **No donations, bookings or payments** |
| API | `/api/v1/health` → `{"status":"ok","database":"up"}`; `/health/live` ok; JSON logs |
| Staging Super Admin | `staging-superadmin@meki-staging.invalid` (reserved `.invalid` domain, so no mail can ever reach a person). Created by the existing bootstrap; password only in the git-ignored `deploy/staging/.env.staging-admin` (0600), never printed |
| End-to-end smoke | **57/57** (doc 53 §2) |
| Gala values (19 Nov) | Applied through the admin API, audited: price 750 → **500**, capacity **350**, 3:30–8:30 PM America/New_York; `salesEnabled=false` |
| Backup + restore drill | **Passed**, 25 s end to end (§6) |

## 5. Defects found by the rehearsal and fixed

| # | Defect | Effect | Fix | Proof |
|---|---|---|---|---|
| D-1 | Admin rewrite silently compiled to localhost | Deployed login 404 | Build-time guard (§1) | Build fails without the variable; 5 tests |
| D-2 | MariaDB driver defaults (`connectTimeout` 1 s): concurrent connection opening timed out client-side while completing server-side | 30 concurrent requests waited **10.7 s**; `pool timeout` errors; the first-login password change returned 500 | `withPoolDefaults()` in `PrismaService` | Rebuilt image, no URL override, cold start: 60 concurrent → **0.54 s**, 0 pool timeouts; 3 unit tests |
| D-3 | Password change was 3 separate writes | The change **committed** but the request failed, so the client discarded an active password (the staging Super Admin was locked out) | One transaction (hash computed first) | `test/phase13a.e2e-spec.ts` (failure → rollback, old password works); staging smoke |
| D-4 | No lockout recovery without e-mail (`MAIL_TRANSPORT=none`) | A locked-out sole Super Admin had no supported recovery | `admin:reset-password` operator CLI: confirmation required, forced change, sessions revoked, audited, nothing printed | Used to recover the staging account; then smoke 57/57 |
| D-5 | Strict environments accepted localhost default URLs | E-mails, CORS and return URLs pointing at a developer machine | `validateDeploymentUrls()` | 5 unit tests |
| D-6 | Backup checksum stored the container path (`/backups/…`) | Host verification failed (`No such file or directory`) | Bare file name in `.sha256`; drill aborts on a mismatch | Drill: "checksum verified" |
| D-7 | Restore target "ready" on a ping from MySQL's temporary init server | Drill race: `Access denied for user 'root'` | Wait for an authenticated query | Drill exit 0 |
| D-8 | Six orphaned `nest start --watch` processes from earlier sessions rebuilt the same `apps/api/dist` | The dev API vanished; CPU saturation; 3 ticket-PDF unit tests timed out | All stopped (only this repo's processes); a single watcher. The machine rebooted afterwards | 177/177 unit tests on an idle machine |

## 6. Backup and restore drill (2026-11-19, `deploy/staging/restore-drill.sh`)

| Step | Result |
|---|---|
| Backup (`backup` compose service, root operator account) | `meki_staging-20261119T183359Z.sql`: 51 tables, 14 triggers, ends with "Dump completed" |
| Checksum | Bare-name `.sha256`, verified on the host |
| Normalization (doc 37 trigger caveat) | Separate `.restore.sql`; the original is untouched |
| Restore target | **Disposable** `mysql:8.4` container on the staging network; accounts created first (trigger `DEFINER`) |
| Restore | 4 s |
| Integrity vs live staging (read-only) | Identical: 51 tables, 14 triggers, AdminUser 3, AuditLog 34, Programme 12, Event 1, Donation 0, EventBooking 0, migrations 11 |
| Append-only guard after restore | `DELETE FROM AuditLog` refused ("append-only") |
| `prisma migrate status` | 11 found, up to date |
| Release image booted on the restored copy | `/health` ok, database up; 7 public FAQs served (read-only) |
| Recovery time | 4 s restore + 7 s to a healthy API; whole drill 25 s |
| Cleanup | Drill containers removed. **Live staging unchanged.** Backups kept in `deploy/staging/backups/` (git-ignored) |

The first attempt's checksum file (container path) is kept as it was; the backup it describes is intact (SHA-256 recomputed on the host matches).

## 7. Mail, storage and background jobs

- **Mail:** staging and production refuse every development transport. `MAIL_TRANSPORT=none` parks messages as `SKIPPED`, so no e-mail can reach a donor or guest. The smoke confirms the system status reports `none`. For Zeffy-owned bookings, MEKI sends no ticket e-mail at all (Phase 12).
- **Storage:** the public media upload directory and the private directory (ticket PDFs, SDI reports) are separate volumes. Private files are never served directly (Phase 12 / doc 48 §2).
- **Jobs:** one API instance runs the poller. Retry and failure handling is covered by the existing Gala job tests in the full API suite.
- **PDFs:** Zeffy issues tickets and QR codes for the hosted flow. MEKI PDF generation remains for legacy `meki`-mode bookings and is covered by unit tests.

## 8. Not verified (needs access or a decision)

- The live Vercel admin and website, and the VPS: no credentials were available. Doc 54 has the exact steps.
- Request-body limits of Vercel external rewrites for media (10 MB) and SDI report (5 MB) uploads through the admin proxy (doc 52 R-5).
- Client-IP forwarding through Vercel to nginx, which matters for the login rate limit (doc 52 R-4).
- TLS between the API and MySQL is unnecessary on the VPS (loopback). A managed or remote database would need TLS.
