# 54 — Phase 13A: deployment and recovery runbook (VPS + Vercel)

Date: 2026-11-19; release closeout updated 2026-11-21.

**Current provisioned target (supplied by the developer):** `138.197.198.151`, Ubuntu 24.04.5 LTS, 4 Intel vCPU, 8 GB RAM, 240 GB NVMe, native MySQL 8.0.46, Nginx 1.24, pnpm 10, PM2 7, Node 24 and Git; UFW enabled. Do not reinstall the server, downgrade Node or install Docker. The API DNS hostname and operator SSH account must be confirmed separately. This release was built/tested locally with Node 24.21.0; installed Nest, Prisma and Next engine declarations support Node 24. The optional local Docker API rehearsal uses Node 22, which is also supported.

**Target:**

- Ubuntu 24.04 VPS;
- native **MySQL 8.0** on 127.0.0.1:3306, database **`meki`**;
- NestJS API on **127.0.0.1:6666** behind HTTPS nginx, managed by **PM2**;
- website `https://meki-neon.vercel.app` and admin `https://admin-anhk.vercel.app` on Vercel.

Docker is **not** used on the VPS; it is only for the local rehearsal (doc 51).

**Safety:**

- Run every step as an operator who has verified the target host and database name.
- Never point anything at `meki_dev`, `meki_test`, `meki_staging` or a developer machine.
- Never `prisma migrate dev`, `reset` or `db push`.
- All financial switches stay OFF (doc 55).
- **This runbook was not executed:** no VPS or Vercel access was available.

Templates: `deploy/vps/` (`api.env.example`, `ecosystem.config.cjs`, `nginx-meki-api.conf`, `mysql-setup.sql`, `backup-meki.sh`).

## 1. Prerequisites and release gates

On the build machine, from a clean checkout of the release commit:

```sh
pnpm install --frozen-lockfile
pnpm audit --prod                                   # no high/critical (doc 36 D)
pnpm turbo run typecheck lint build --force --concurrency=1
```

Read every new folder in `apps/api/prisma/migrations/` since the running release. All must be additive: no `DROP`, no `ALTER … DROP`.

## 2. One-time VPS setup

```sh
# system
sudo apt update && sudo apt install -y nginx mysql-server certbot python3-certbot-nginx
node --version && pnpm --version && pm2 --version     # existing VPS: Node 24, pnpm 10, PM2 7; verify, do not reinstall
sudo corepack enable && corepack prepare pnpm@10.0.0 --activate
sudo npm i -g pm2 && pm2 install pm2-logrotate
sudo adduser --system --group --home /srv/meki meki
sudo mkdir -p /srv/meki /etc/meki /var/lib/meki/uploads /var/lib/meki/private /var/log/meki /var/backups/meki
sudo chown -R meki:meki /srv/meki /var/lib/meki /var/log/meki && sudo chmod 700 /var/lib/meki/private
```

**MySQL 8.0:**

1. In `/etc/mysql/mysql.conf.d/mysqld.cnf` set `bind-address = 127.0.0.1` and **`log_bin_trust_function_creators = 1`**. Binary logging is on by default, and the migrations create append-only triggers. Restart MySQL.
2. **First confirm the target:** `sudo mysql -e "SHOW DATABASES"`. If a database `meki` already exists, **stop** and back it up (§6) before anything else. Never drop it.
3. Replace the three placeholder passwords in `deploy/vps/mysql-setup.sql` (fresh random values, kept only on the server), then `sudo mysql < mysql-setup.sql`. This creates `meki` only if absent, plus `meki_migrator` (DDL), `meki_app` (DML) and `meki_backup`.
4. Create `/etc/meki/backup.cnf` (root:root 0600) with a `[mysqldump]` section holding the `meki_backup` user and password.

**Secrets:**

- Create `/etc/meki/api.env` (root:meki **0640**) from `deploy/vps/api.env.example`.
- Generate new secrets: `openssl rand -base64 48` for each token secret.
- `DATABASE_URL` uses `meki_app` on 127.0.0.1 with `allowPublicKeyRetrieval=true`. This is acceptable **only** because it is loopback (doc 52 R-2). Connection-pool timeouts are built in (doc 51 D-2).
- Set `API_BIND_HOST=127.0.0.1` in the native-VPS configuration. The API now explicitly passes this validated IP to `listen`; container defaults remain `0.0.0.0`. Verify the listener with `ss -ltnp` before exposing nginx. Port 6666 must not listen publicly.
- **No `.env` file may exist** in `/srv/meki/current/apps/api`. The API would also read it; all configuration comes from `/etc/meki/api.env`.

## 3. Deploy a release

```sh
# as meki, into a new release directory (keeps the previous one for rollback)
REL=/srv/meki/releases/$(date -u +%Y%m%dT%H%M%SZ)
git clone --depth 1 --branch <release-tag> <repo> "$REL" && cd "$REL"
pnpm install --frozen-lockfile --filter @meki/api...
DATABASE_URL=mysql://placeholder@127.0.0.1/none pnpm --filter @meki/api build      # prisma generate + nest build + assets
# migrations: BACKUP FIRST (§6), then with the MIGRATOR account
cd apps/api
DATABASE_URL='mysql://meki_migrator:<pw>@127.0.0.1:3306/meki' pnpm exec prisma migrate status
DATABASE_URL='mysql://meki_migrator:<pw>@127.0.0.1:3306/meki' pnpm exec prisma migrate deploy
# first install only: roles/permissions/verified content (create-only; never modifies existing rows)
DATABASE_URL='mysql://meki_migrator:<pw>@127.0.0.1:3306/meki' pnpm db:seed
ln -sfn "$REL" /srv/meki/current
pm2 startOrReload /srv/meki/current/deploy/vps/ecosystem.config.cjs && pm2 save
```

- **First install only:** `pm2 startup systemd`, so PM2 restarts the API after a reboot.
- **Graceful restart:** PM2 sends SIGTERM; the Nest shutdown hooks stop the job poller and close the pool (`kill_timeout` 30 s). Crashes are restarted automatically.
- **Startup validation:** the API refuses to start in production with:
  - localhost/http public URLs or CORS origins;
  - `PAYMENTS_ENABLED=true` (MEKI-native checkout);
  - the mock provider;
  - a non-`none` mail transport;
  - `ZEFFY_GALA_AUTO_CONFIRM`;
  - non-Zeffy form URLs.

  A refusal is logged and PM2 keeps restarting. Fix `/etc/meki/api.env`, never the code.

**First Super Admin** (existing secure bootstrap, one time):

```sh
cd /srv/meki/current/apps/api
read -rs ADMIN_BOOTSTRAP_PASSWORD; export ADMIN_BOOTSTRAP_PASSWORD   # typed, not echoed, not in shell history
ADMIN_BOOTSTRAP_EMAIL=<real admin e-mail> DATABASE_URL='mysql://meki_app:<pw>@127.0.0.1:3306/meki?allowPublicKeyRetrieval=true' pnpm admin:bootstrap
unset ADMIN_BOOTSTRAP_PASSWORD
```

- It refuses if a Super Admin already exists.
- The password must be changed at first login.

**Lockout recovery:** e-mail reset is unavailable while `MAIL_TRANSPORT=none`. Use the same pattern with `ADMIN_RESET_EMAIL`, `ADMIN_RESET_PASSWORD` and `ADMIN_RESET_CONFIRM=<same e-mail>`, then `pnpm admin:reset-password`. It forces a change, revokes all sessions and is audited.

**Gala values from 19 Nov 2026 on an existing database:** the seed never modifies rows. In the admin:

1. Gala → Settings → Ticketing: price **500.00**, capacity **350**. Sales stay closed.
2. Schedule: `2026-12-12T15:30:00-05:00` → `2026-12-12T20:30:00-05:00`, `America/New_York`.

Both actions are audited. `deploy/staging/apply-nov19-gala.mjs` does the same through the API (point `ADMIN_URL` at the admin).

## 4. nginx and HTTPS

1. Install `deploy/vps/nginx-meki-api.conf` as `/etc/nginx/sites-available/meki-api`, with the real host name.
2. `ln -s` it into `sites-enabled`, then `nginx -t && systemctl reload nginx`.
3. Run `certbot --nginx -d <api host>`.

For a fresh API hostname, first install an HTTP-only ACME bootstrap vhost, obtain the certificate, then install the HTTPS template; `nginx -t` cannot pass while the referenced certificate files do not exist. The template uses `listen 443 ssl http2` for the provisioned Nginx 1.24; the standalone `http2 on` directive was introduced in 1.25.1 ([official Nginx module documentation](https://nginx.org/en/docs/http/ngx_http_v2_module.html)).

What the configuration does:
- only `/api/v1/` and `/media/uploads/` are proxied; everything else is 404;
- `client_max_body_size 12m`;
- HSTS;
- forwarded headers.

**Firewall:** `ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable`. **Port 6666 and 3306 stay closed.** Port 6666 is also browser-blocked (doc 52 R-3).

`TRUST_PROXY=1` (nginx). Before changing it for the Vercel hop, see doc 52 R-4.

## 5. Health checks and monitoring

| Check | Expectation |
|---|---|
| `curl -fsS https://<api>/api/v1/health/live` | 200 (process up) |
| `curl -fsS https://<api>/api/v1/health` | `{"status":"ok","database":"up"}` (readiness) |
| Admin → system status (`audit.read`) | `status: ok`, `alerts: []`, mail transport `none` |
| `pm2 status`, `pm2 logs meki-api` | online, JSON log lines, no restart loop |
| Security headers / cookie | `curl -I`; login sets `__Host-meki_admin_sid; Secure; HttpOnly; SameSite=Strict` |

## 6. Backup and restore

**Nightly backup:** install `deploy/vps/backup-meki.sh` as `/usr/local/sbin/backup-meki`, with the cron line from its header. It produces:

- a `mysqldump --single-transaction --routines --triggers`;
- a tar of `/var/lib/meki/{uploads,private}`;
- `SHA256SUMS`, verified;
- 14-day retention.

**Copy the newest backup off the server** (a second host or object storage); that's an operator decision.

**Before every migration:** run `sudo backup-meki` and confirm the "ok" line.

**Restore** (only into a **new** database; decided by the project lead):

1. Stop writes: `pm2 stop meki-api`.
2. Verify the checksums: `cd /var/backups/meki/<ts> && sha256sum -c SHA256SUMS`.
3. Normalize the known trigger quirk (doc 37 §2):

   ```sh
   sed -E '/^\/\*!50003 CREATE\*\/.*TRIGGER/ s/;[[:space:]]*\*\/;;$/ *\/;;/' meki.sql > meki.restore.sql
   ```
4. `CREATE DATABASE meki_restore …`, then `mysql meki_restore < meki.restore.sql`. The accounts named in the triggers' `DEFINER` (`meki_migrator`) must exist.
5. Compare table and trigger counts and spot-check recent rows. Run `prisma migrate status` against `meki_restore`.
6. Point `DATABASE_URL` at `meki_restore` (or rename after verification), restore the storage tar if needed, then `pm2 start meki-api`.
7. Record which writes after the backup were lost. Reconcile from SDI reports, never by guessing.

The procedure was rehearsed on staging on 2026-11-19 (doc 51 §6): restore 4 s, API healthy 7 s later, counts identical.

## 7. Vercel (website and admin) — fixing the admin login 404

**Admin project** (`admin-anhk`):
1. Settings → Environment Variables (Production **and** Preview): `ADMIN_API_UPSTREAM=https://<api host>`.
   - Origin only. A trailing `/api/v1` is tolerated and removed.
   - Optionally `MEKI_DEPLOY_ENV=production`.
2. Deployments → **Redeploy without build cache**. The rewrite is compiled at build time, so changing the variable does nothing until a rebuild.
3. Since Phase 13A, a build **without** this variable fails with an explicit message.

**Website project** (`meki-neon`):
- `NEXT_PUBLIC_API_URL=https://<api host>/api/v1`;
- `API_INTERNAL_URL` (same value, or a private address);
- `NEXT_PUBLIC_SITE_URL=https://meki-neon.vercel.app` (or the final domain);
- `NEXT_PUBLIC_CHECKOUT_ALLOWED_HOSTS` empty.

Then redeploy. A localhost or http API URL fails the build.

**API** (`/etc/meki/api.env`): `CORS_ORIGINS=https://meki-neon.vercel.app,https://admin-anhk.vercel.app` and `WEB_URL=https://meki-neon.vercel.app`, then `pm2 reload meki-api`.

**Verify the live login** (only then may it be called fixed):

| Request | Expected |
|---|---|
| `curl -s https://admin-anhk.vercel.app/api/v1/health` | `{"data":{"status":"ok","database":"up",…}}` (not 404) |
| `curl -si -X POST https://admin-anhk.vercel.app/api/v1/admin/auth/login -H 'Content-Type: application/json' -d '{"email":"nobody@example.invalid","password":"wrong-password-1"}'` | **401** JSON (not 404) |
| Browser login with the bootstrapped account | Forced password change. The cookie is `__Host-meki_admin_sid` on `admin-anhk.vercel.app` with Secure/HttpOnly/SameSite=Strict. Logout clears it |
| A media upload and an SDI report upload through the admin | Succeed (verifies doc 52 R-5) |

## 8. Rollback

- **Application:**
  1. `ln -sfn /srv/meki/releases/<previous> /srv/meki/current && pm2 reload meki-api`.
  2. Vercel: promote the previous deployment.
  3. Migrations are additive: **never drop** the new tables or columns; the old code ignores them.
- **Data:** §6 restore, into a new database only.
- **Configuration:** restore `/etc/meki/api.env` from the operator's secure copy, then `pm2 reload`.
- Write an incident note: timeline, cause, data impact.
