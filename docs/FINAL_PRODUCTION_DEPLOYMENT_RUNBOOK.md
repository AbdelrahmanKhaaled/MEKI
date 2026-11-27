# FINAL — Production deployment runbook (DigitalOcean VPS, meki-us.org)

**Audience:** the operator who deploys MEKI on the VPS.

This runbook supersedes the Vercel parts of docs/54. Backup and restore details stay in docs/54 §6.

**Nothing here has been executed on the VPS.** The configuration files were validated locally:
- `nginx -t` on nginx 1.24 with temporary certificates;
- redirects checked with curl;
- migrations applied to an empty MySQL 8.0.46 database;
- PM2 file and shell scripts syntax-checked.

## 0. Target

| Item | Value |
|---|---|
| Server | Ubuntu 24.04, 138.197.198.151, 8 GB RAM + 4 GB swap |
| Runtime | Node 22, pnpm 10, PM2 7, nginx 1.24, MySQL 8 (verify the versions, do not reinstall) |
| Website | `https://meki-us.org` → PM2 `meki-web` → 127.0.0.1:3000 |
| Admin | `https://admin.meki-us.org` → PM2 `meki-admin` → 127.0.0.1:3001; `/api/v1/*` → 127.0.0.1:6666 |
| API | `https://api.meki-us.org` → PM2 `meki-api` → 127.0.0.1:6666 (`/api/v1/*`, `/media/uploads/*` only) |
| Redirects | `www.meki-us.org`, `meki-us.com`, `www.meki-us.com`, `meki-us.net`, `www.meki-us.net` → `https://meki-us.org` (path and query kept) |
| Firewall | `ufw allow OpenSSH && ufw allow 'Nginx Full'`. Ports 3000, 3001, 6666 and 3306 stay closed |

**Repository files:**
- `deploy/vps/ecosystem.config.cjs`
- `deploy/vps/nginx-meki-us.conf` and `nginx-meki-us-bootstrap.conf`
- `deploy/vps/{api,web,admin}.env.example`
- `deploy/vps/deploy.sh` and `rollback.sh`
- `deploy/vps/mysql-setup.sql` and `backup-meki.sh`

## 1. DNS (registrar)

Point these names at 138.197.198.151:
- A records: `meki-us.org`, `www`, `admin`, `api`;
- A records: `meki-us.com`, `www.meki-us.com`, `meki-us.net`, `www.meki-us.net`;
- AAAA records only if IPv6 is configured.

Check with `dig +short <name>` before requesting certificates.

## 2. One-time system setup

```sh
sudo adduser --system --group --home /srv/meki --shell /bin/bash meki
sudo mkdir -p /srv/meki/releases /etc/meki /var/lib/meki/uploads /var/lib/meki/private /var/log/meki /var/backups/meki /var/www/letsencrypt
sudo chown -R meki:meki /srv/meki /var/lib/meki /var/log/meki && sudo chmod 700 /var/lib/meki/private
sudo -u meki pm2 install pm2-logrotate
```

## 3. MySQL 8 (separate migration and runtime users)

1. In `/etc/mysql/mysql.conf.d/mysqld.cnf`, set:
   - `bind-address = 127.0.0.1`
   - `log_bin_trust_function_creators = 1` (the migrations create triggers)
   - `character-set-server = utf8mb4`
   - `collation-server = utf8mb4_unicode_ci`

   Then restart MySQL.
2. `sudo mysql -e "SHOW DATABASES"`. **If `meki` exists, stop:** back it up (docs/54 §6) and never drop it.
3. Copy `deploy/vps/mysql-setup.sql` to a root-only temporary file and replace the three placeholders with fresh random passwords (`openssl rand -base64 32`). Run `sudo mysql < file`, then `shred -u file`. This creates:

   | User | Rights |
   |---|---|
   | `meki_migrator` | DDL + DML. Used only during releases |
   | `meki_app` | DML only. Runtime |
   | `meki_backup` | Read + lock |

   Verified locally: all 15 migrations apply with `meki_migrator`, and the seed runs with `meki_app`.
4. Create `/etc/meki/backup.cnf` (root 0600) for `meki_backup`. Install `backup-meki.sh` with its cron line.

## 4. Environment files (NAMES in the repo, VALUES only on the server)

| File | Owner / mode | Loaded | Contents |
|---|---|---|---|
| `/etc/meki/api.env` | root:meki 0640 | runtime (`node --env-file`, via PM2) | from `api.env.example`: `DATABASE_URL` (meki_app), token secrets (`openssl rand -base64 48`), origins, `LOCAL_STORAGE_DIR=/var/lib/meki/uploads` (absolute, outside releases), `WEB_REVALIDATE_URL=http://127.0.0.1:3000/api/internal/revalidate`, `MEKI_REVALIDATE_SECRET`, **all financial switches `false`** |
| `/etc/meki/web.build.env` | root:meki 0640 | build time (`deploy.sh`) | `MEKI_DEPLOY_ENV=production`, `NEXT_PUBLIC_API_URL=https://api.meki-us.org/api/v1`, `NEXT_PUBLIC_SITE_URL=https://meki-us.org`, `NEXT_PUBLIC_CHECKOUT_ALLOWED_HOSTS=givebutter.com,www.givebutter.com,www.zeffy.com`, `NEXT_PUBLIC_GALA_TICKET_FORM_HANDOFF=true`, `NEXT_PUBLIC_GALA_DONATION_FORM_HANDOFF=false` |
| `/etc/meki/web.env` | root:meki 0640 | runtime | `NODE_ENV=production`, `API_INTERNAL_URL=http://127.0.0.1:8080/api/v1` (nginx loopback proxy — Node's fetch refuses port 6666 as a "bad port"), `MEKI_REVALIDATE_SECRET` (same value as in api.env) |
| `/etc/meki/admin.build.env` | root:meki 0640 | build time | `MEKI_DEPLOY_ENV=production`, `ADMIN_API_UPSTREAM=https://api.meki-us.org` (no `/api/v1`) |
| `/etc/meki/admin.env` | root:meki 0640 | runtime | `NODE_ENV=production` |

**Rules:**
- `NEXT_PUBLIC_*` values are public and baked in at build time. Changing one means running `deploy.sh` again.
- No `.env` file may exist inside a release. `deploy.sh` refuses to continue if one does.
- Never paste a value into Git, a ticket or a chat.

## 5. TLS certificates (Certbot, webroot — certbot never edits nginx)

```sh
sudo cp deploy/vps/nginx-meki-us-bootstrap.conf /etc/nginx/sites-available/meki-us
sudo ln -sf /etc/nginx/sites-available/meki-us /etc/nginx/sites-enabled/meki-us && sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/letsencrypt --cert-name meki-us.org \
  -d meki-us.org -d www.meki-us.org -d admin.meki-us.org -d api.meki-us.org
sudo certbot certonly --webroot -w /var/www/letsencrypt --cert-name meki-us-redirects \
  -d meki-us.com -d www.meki-us.com -d meki-us.net -d www.meki-us.net
sudo cp deploy/vps/nginx-meki-us.conf /etc/nginx/sites-available/meki-us
sudo nginx -t && sudo systemctl reload nginx
echo 'systemctl reload nginx' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh && sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo certbot renew --dry-run
```

**Do not record TLS as done until** `curl -I https://<each name>` shows a valid chain on the VPS.

## 6. Deploy a release (HTTPS Git, no SSH deploy keys)

1. **Token.** Create a fine-grained GitHub token: this one repository only, **Contents: read-only**, short expiry.
2. **Credential cache.** Once, as `meki`, run `git config --global credential.helper 'cache --timeout=900'`. The token is typed at the password prompt and kept in memory only.
3. **Deploy.** Run `deploy.sh` with an exact tag or commit SHA:

   ```sh
   sudo -iu meki
   export MEKI_REPO_URL=https://github.com/<owner>/<repo>.git    # no credentials in the URL
   bash /path/to/reviewed-checkout/deploy/vps/deploy.sh <tag-or-sha>   # use the deployment script from the target revision
   ```

   `deploy.sh` does the following:
   - fetches into a bare mirror and exports the exact commit into `/srv/meki/releases/<ts>`;
   - runs `pnpm install --frozen-lockfile`;
   - builds the API, then web and admin with their build env files;
   - checks migration status using the runtime connection. A pending migration or a failed check leaves the current release serving traffic;
   - on a successful check, switches the `current` symlink atomically, then runs `pm2 startOrReload` and `pm2 save`.

   The status check reads migration history. Migration deployment uses the separate migrator account.

**Migrations** — a separate, reviewed step before the switch (or immediately after the first build):
1. Read every new `apps/api/prisma/migrations/*/migration.sql`. They must be additive; none in this release contains `DROP`.
2. `sudo backup-meki` and confirm the "ok" line.
3. Run:

   ```sh
   cd /srv/meki/releases/<ts>/apps/api
   read -rs MIGRATOR_PW; export DATABASE_URL="mysql://meki_migrator:${MIGRATOR_PW}@127.0.0.1:3306/meki?allowPublicKeyRetrieval=true"
   pnpm exec prisma migrate status
   # Pending reviewed migrations produce a nonzero status. Resolve connection errors, failures or divergent history before proceeding.
   # Only after confirming the expected pending list and a verified backup:
   pnpm exec prisma migrate deploy
   pnpm exec prisma migrate status
   pnpm db:seed          # first install only; create-only, never modifies rows; 0 published campaigns, 0 transactions
   unset DATABASE_URL MIGRATOR_PW
   ```

   After a paused deployment, activate the same built release as `meki` with `bash /srv/meki/releases/<ts>/deploy/vps/switch.sh /srv/meki/releases/<ts>`. This repeats the status check before switching.

**First run:**
- `pm2 startup systemd -u meki --hp /srv/meki` (run the printed command as root), then `pm2 save`.
- Create the first Super Admin: docs/54 §3 (`pnpm admin:bootstrap`, password typed, not echoed).
- Sign in at `https://admin.meki-us.org`. The dashboard now **forces** the temporary password to be changed.
- Then, under **Users & Roles**, create the second finance approver. Four-eyes approval needs two different admins.

**Gala facts on a fresh database** — set in the admin (audited):
- Gala → Settings → Ticketing: price 500.00, capacity 350;
- schedule 2026-12-12 15:30 → 20:30 America/New_York.

Sales stay closed.

## 7. Health checks after every deploy

```sh
ss -ltnp | grep -E ':(3000|3001|6666|8080)'            # all on 127.0.0.1 only
curl -fsS https://api.meki-us.org/api/v1/health
curl -sI https://meki-us.org/en | head -1                # 200
curl -sI http://meki-us.com/x?y=1 | grep -i location     # https://meki-us.org/x?y=1
curl -sI https://admin.meki-us.org/en/login | head -1    # 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://admin.meki-us.org/api/v1/admin/auth/login -H 'content-type: application/json' -d '{}'   # 400 (validation) — NOT 404
pm2 status && pm2 logs --lines 50 --nostream
# CMS live publishing (docs/CMS_LIVE_PUBLISHING.md)
curl -s -o /dev/null -w '%{http_code}
' -X POST https://meki-us.org/api/internal/revalidate          # 404 (nginx keeps it internal)
curl -s -o /dev/null -w '%{http_code}
' -X POST http://127.0.0.1:3000/api/internal/revalidate -d '{}' # 401 (no secret) — 503 means the secret is missing in web.env
curl -s -o /dev/null -w '%{http_code}
' http://127.0.0.1:8080/api/v1/health                          # 200 (SSR proxy)
grep -c 'LOCAL_STORAGE_DIR=/var/lib/meki/uploads' /etc/meki/api.env                                    # 1
```

Then in the admin: edit the Hero title → **Save & publish** → the editor must say "The live website has been refreshed" and `https://meki-us.org/en` must show it on the next load. Revert the title the same way. For an uploaded image, `curl -sI "https://meki-us.org/_next/image?url=<url-encoded https://api.meki-us.org/media/uploads/...>&w=828&q=75"` must return `200` with an `image/*` content type.

The last check proves the former admin login 404 is gone **on the real domain**. Record its output. Until then it is "fixed in code/config, not verified".

Then sign in to the admin and check, in the browser:
- the session cookie is `__Host-meki_admin_sid`, with HttpOnly, Secure and SameSite=Strict;
- a mutation succeeds;
- the website's book and donate pages show the closed state, or the hand-off if its switch is on.

## 8. Releasing the official Zeffy forms (business decision)

Only after SDI confirms in writing that the forms are open:
1. Set `NEXT_PUBLIC_GALA_TICKET_FORM_HANDOFF=true` and/or `NEXT_PUBLIC_GALA_DONATION_FORM_HANDOFF=true` in `/etc/meki/web.build.env`.
2. Run `deploy.sh` with the same tag.

This never marks payments as paid. Reconciliation stays SDI report or manual evidence, approved by a second admin. The API financial switches stay `false` until their own conditions are met (FINAL_ZEFFY_INTEGRATION_REPORT §7).

## 9. Rollback

- **Code:** `bash deploy/vps/rollback.sh /srv/meki/releases/<previous>`. The database is untouched, and migrations are additive.
- **Data:** restore into a **new** database only (docs/54 §6). Never drop.
- **Config:** restore `/etc/meki/*.env` from the operator's secure copy, then `pm2 reload all --update-env`.

## 10. Known operational notes

- **SSR rate limit.** Server-side rendering calls the API from 127.0.0.1 (`API_INTERNAL_URL`). These count against the API's global limit of 300 requests/min per IP. CMS pages are ISR-cached (300 s), but the book and donate pages are dynamic. Watch for 429s in `api.out.log` at launch. If they appear, add an explicit, reviewed exemption for loopback SSR, or raise the global limit. Do not disable throttling.
- **Single API instance** (job poller, in-memory throttle): do not scale `meki-api` with PM2 cluster mode.
