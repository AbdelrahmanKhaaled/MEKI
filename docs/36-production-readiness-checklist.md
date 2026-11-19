# 36 — Production readiness checklist

Date: 2026-11-18. Tick every box on **staging** before production. Values are never written here; names only.

How to read the checklist:

- **Bold** items are blockers.
- *WEB* = needed for the informational website.
- *SALES* = needed only for paid Gala ticket sales (which stay closed until SDI and MEKI approve — doc 38).

## A. Infrastructure

- [ ] **Domains + TLS certificates** for the website, admin and API (*WEB*).
- [ ] **Reverse proxy** on the admin host:
  - `/api/v1/*` → API
  - `/media/uploads/*` → API
  - request bodies up to **12 MB** (the API enforces 10 MB per file)
  - `X-Forwarded-*` headers set
  - matching `TRUST_PROXY` hop count on the API (*WEB*)
- [ ] **HTTP → HTTPS redirect** on every host; HSTS headers are already sent by both Next apps.
- [ ] **MySQL 8 over TLS** for the API connection, or an equivalent private-network setup that avoids `caching_sha2_password` RSA issues (doc 29 §4) (*WEB*).
- [ ] **Least-privilege database user.** The app user has no `CREATE DATABASE` (verified locally); a separate operator account handles backups and restores.
- [ ] **Persistent volumes, backed up, never served publicly:**
  - `LOCAL_STORAGE_DIR` (media)
  - `PRIVATE_STORAGE_DIR` (ticket PDFs)
- [ ] **Backups:** daily `mysqldump --single-transaction --routines --triggers` plus storage volume snapshots; retention agreed; **restore drill done once** (doc 37 §6) (*WEB*).
- [ ] **Monitoring:**
  - `/api/v1/health` (readiness) and `/api/v1/health/live` (liveness) wired to the load balancer / process manager
  - `/api/v1/admin/system/status` checked by an operator or a scraper with an `audit.read` account
  - alerts on `status: "attention"`
- [ ] **Logs:** `LOG_FORMAT=json` shipped to the log platform; `LOG_LEVEL=log` (or `warn`); alert on website lines `[meki-web] CMS content unavailable`.
- [ ] **Run ONE API instance (blocker for scaling out).** Corrected in Phase 9B: the Redis rate-limit store is **not implemented** — `RATE_LIMIT_STORE=redis` makes the API refuse to start (`common/rate-limit.ts`). With N instances the in-memory limits become N× looser (login throttling still has the per-account DB lockout). Before scaling out: implement and test a shared throttler store, and run the job poller (`GALA_JOBS_INTERVAL_SECONDS>0`) and `ZEFFY_RECONCILIATION_ENABLED` on one instance only (jobs are lease-claimed so a second poller is safe but wasteful; Zeffy's API limit is 100 requests/min). Sessions (DB), CSRF, lockout and webhooks are already instance-safe; media/ticket storage needs a shared volume. Details: doc 41 §5.

## B. API environment (`apps/api`; names only)

- [ ] `NODE_ENV=production` (this switches on secure `__Host-` cookies, forbids the mock provider and dev mail transports, and refuses `ALLOW_DEMO_PUBLISH` and Zeffy auto-confirm).
- [ ] `DATABASE_URL`, `PORT`, `TRUST_PROXY`.
- [ ] `CORS_ORIGINS` (the website origin; the admin is same-origin through the proxy).
- [ ] `WEB_URL`, `API_PUBLIC_URL`.
- [ ] `EVENT_BOOKING_RETURN_URL` (`https://<web>/{locale}/events/{slug}/booking`), `DONATION_RETURN_URL`.
- [ ] `EVENT_BOOKING_TOKEN_SECRET` and `DONATION_TOKEN_SECRET`: ≥ 32 random characters each, unique per environment, in the secret store.
- [ ] `STORAGE_DRIVER`, `LOCAL_STORAGE_DIR`, `PRIVATE_STORAGE_DIR`, `PUBLIC_MEDIA_BASE_URL`, `MEDIA_MAX_UPLOAD_MB=10`.
- [ ] `SESSION_IDLE_MINUTES`, `SESSION_ABSOLUTE_HOURS`, `LOGIN_RATE_LIMIT_PER_MINUTE`.
- [ ] `SWAGGER_ENABLED=false` (production never serves it anyway; set it explicitly for public staging).
- [ ] `MAIL_TRANSPORT=none` until an approved provider adapter exists (doc 38) (*SALES*).
- [ ] `PAYMENTS_ENABLED=false`; `PAYMENT_PROVIDER` unset (*SALES*).
- [ ] `ZEFFY_*` unset until SDI delivers. `ZEFFY_GALA_AUTO_CONFIRM` must stay false (production refuses it).
- [ ] `LOG_FORMAT=json`, `LOG_LEVEL`.

## C. Website and admin build variables (fixed at build time — a change needs a rebuild)

- [ ] **Website:**
  - `NEXT_PUBLIC_API_URL` **including `/api/v1`**
  - `API_INTERNAL_URL` (optional, server-side)
  - `NEXT_PUBLIC_SITE_URL` (canonical / Open Graph / sitemap)
  - `NEXT_PUBLIC_CHECKOUT_ALLOWED_HOSTS` empty until SDI confirms hosts
- [ ] **Admin:** `ADMIN_API_UPSTREAM`, or the reverse-proxy rules (A2).
- [ ] **Search indexing** stays off (`PUBLIC_INDEXING=false` in `apps/web/src/lib/site.ts`) until MEKI approves; then change it and rebuild.

## D. Release gates

- [ ] `pnpm install --frozen-lockfile` succeeds; `pnpm audit --prod` shows no high/critical findings (current: 1 moderate, accepted — doc 33).
- [ ] `pnpm turbo run typecheck lint build --force --concurrency=1` passes.
- [ ] API tests pass against a ***_test** database (never production).
- [ ] `prisma migrate status` on staging lists only reviewed migrations; a backup is taken before `prisma migrate deploy`.
- [ ] Smoke on staging: public pages EN/AR, admin login, a CMS publish, the Gala page (sales closed), `/health`, `/admin/system/status` = ok.
- [ ] Content and legal items from MEKI resolved (doc 38 §1) (*WEB*).
- [ ] Payment, e-mail and live-test items resolved before any sales (doc 38 §2–3) (*SALES*).

## E. Security confirmations

- [ ] Responses carry the security headers (`curl -I`): CSP (frame/base/object/form), HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy and Permissions-Policy (admin `camera=(self)` for QR check-in).
- [ ] Session cookie is `__Host-meki_admin_sid; Secure; HttpOnly; SameSite=Strict`.
- [ ] No `.env` file in the deployed artefact or repository; secrets only in the store.
- [ ] Admin accounts: unique per person, roles least-privilege (door staff = `EVENT_CHECKIN_STAFF`; supervisors with `gala.checkin.manage` decided by MEKI).
