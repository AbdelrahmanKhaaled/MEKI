# 37 — Deployment and rollback runbook

Date: 2026-11-18. For the operator deploying MEKI (staging first, then production). Prerequisites: doc 36 ticked.

**Conventions:**

- `$REL` = the release tag or commit being deployed.
- `$PREV` = the currently running release.
- All database commands use an **operator** account, not the application user.

## 1. Before the window

1. Announce the window; agree a rollback decision time (e.g. 30 minutes after cut-over).
2. On the build machine, from a clean checkout of `$REL`:
   ```sh
   pnpm install --frozen-lockfile
   pnpm audit --prod                      # no high/critical
   pnpm turbo run typecheck lint build --force --concurrency=1
   ```
   **Build with the production `NEXT_PUBLIC_*` / `ADMIN_API_UPSTREAM` values.** They are inlined at build time.
3. Read `apps/api/prisma/migrations/` for new folders since `$PREV`. Every migration must be reviewed (additive only); check the SQL for `DROP` / `ALTER … DROP`.
4. Keep the `$PREV` artefacts (API `dist/`, website/admin `.next/`) available for rollback.

## 2. Backup (mandatory)

```sh
# database (operator account; single consistent snapshot; includes triggers and routines)
mysqldump --single-transaction --routines --triggers --no-tablespaces -h <db-host> -u <operator> -p meki_prod > meki_prod-$(date +%Y%m%dT%H%M%S).sql
# verify: the file ends with "-- Dump completed" and the CREATE TABLE count matches information_schema.tables
grep -c "CREATE TABLE" meki_prod-*.sql
```

Also snapshot `LOCAL_STORAGE_DIR` and `PRIVATE_STORAGE_DIR`. Store both off-host.

> **Restore caveat (found by the Phase 9B drill).** 11 of the 14 append-only triggers store a trailing `;` in their body. `mysqldump` writes them as `/*!50003 … ; */;;`, which the `mysql` client **rejects on restore** (`ERROR 1064 … near ' */'`), and the restore stops after 3 tables. Every dump of this schema must be normalized before it is restored. The dump file itself stays untouched; a normalized copy is restored:
>
> ```sh
> sed -E '/^\/\*!50003 CREATE\*\/.*TRIGGER/ s/;[[:space:]]*\*\/;;$/ *\/;;/' meki_prod-<ts>.sql > meki_prod-<ts>.restore.sql
> grep -c "TRIGGER" meki_prod-<ts>.restore.sql   # expect the live trigger count (14)
> ```
>
> The triggers carry `DEFINER=` the application user: create that user on the target server **before** restoring (otherwise the guard triggers fail with "definer does not exist" instead of their own message). A permanent fix (a reviewed migration that re-creates the 11 triggers without the trailing semicolon) is listed as a decision in doc 42.

## 3. Deploy

1. **API: migrations first.** Additive migrations are compatible with the old code still running.
   ```sh
   cd apps/api
   npx prisma migrate status          # expect only the reviewed pending migrations
   npx prisma migrate deploy          # never `migrate dev` / `reset` in production
   ```
2. **API: switch the release.**
   - Stop `$PREV` gracefully: SIGTERM, which runs the shutdown hooks (job poller and DB pool closed).
   - Start `$REL`: `NODE_ENV=production node dist/main.js` under the process manager, with automatic restart on crash.
   - Health: liveness at `/api/v1/health/live`, readiness at `/api/v1/health`.
   - Only one instance runs the job poller (doc 36 A).
3. **Website and admin.** Start the new builds with `next start -p <port>`, behind the proxy.
4. **Verify** (both languages):
   - `curl -fsS https://<api>/api/v1/health` returns `{"status":"ok","database":"up"}`.
   - Admin: log in, then open `/admin/system/status` (UI: an `audit.read` account) → `status: "ok"`, `alerts: []`.
   - Website: `/en`, `/ar`, `/en/events/gala-night` (booking closed), `/en/faq` (CMS FAQs visible); the website logs show no `CMS content unavailable` error lines.
   - Security headers present (`curl -I`); the session cookie is `__Host-…; Secure`.
5. Keep watching logs and `/admin/system/status` until the rollback decision time.

## 4. Rollback

**Trigger:** failed verification, error spike, or a data problem.

1. **Application only** (normal case; migrations are additive):
   - Stop `$REL` and start `$PREV` (API, website, admin) with their previous artefacts.
   - The extra tables or columns from the new migration are ignored by the old code; **do not drop them**.
   - Verify as in §3.4.
2. **Data restore** (only if data was damaged; decided by the project lead):
   1. Put the website in maintenance and stop the API (no writes).
   2. Normalize the §2 dump (caveat in §2), then restore it into a **new** database: `mysql -u <operator> -p meki_restore < meki_prod-<ts>.restore.sql`.
   3. Verify the table counts and spot-check recent records.
   4. Point `DATABASE_URL` to it (or rename after verification); restore the storage snapshots if affected.
   5. Start `$PREV`.
   6. Record exactly which writes after the backup were lost, and reconcile payments from provider records (Zeffy reconciliation re-reads SDI's payments idempotently once configured).
3. Write an incident note (timeline, cause, data impact).

## 5. Graceful restart and recovery procedures

| Situation | Procedure |
|---|---|
| Background jobs FAILED (status alert) | Admin → Gala → Communications → "Retry booking"; or `POST /admin/events/:id/bookings/:id/resend` |
| Webhook events FAILED / stuck RECEIVED | Admin → Payments → webhook events → retry (donation provider). Zeffy: Admin → SDI / Zeffy → Reconcile now (once configured) |
| Database restarted, API reports "Database unavailable" | Check the TLS/auth setup (doc 29 §4); restart the API after the database is reachable |
| Disk full / storage not writable (status alert) | Free space or expand the volume; the jobs retry automatically |
| Dev only: API dies after `pnpm turbo … build` | Stop `nest start --watch` before full builds and restart it afterwards (doc 34 §4) |

## 6. Restore drill (once before launch, then quarterly)

On staging with an operator account:

1. Restore the latest production-like dump into `meki_restore_drill`.
2. Run `npx prisma migrate status` against it (expect "up to date").
3. Compare table and trigger counts.
4. Start an API instance on it (read-only smoke).
5. Drop the drill database afterwards.
6. Record the duration (= the recovery time) in this document.

**Drill performed 2026-11-18 (Phase 9B), isolated and disposable.** A throwaway `mysql:8.4` container on its own port, never `meki-mysql`; it was removed afterwards. Input: the pre-Phase-8A backup of `meki_dev`.

| Step | Result |
|---|---|
| Restore of the raw dump | **Failed**: `ERROR 1064` at the first trigger, 3 of 44 tables restored → the caveat in §2 |
| Restore of the normalized copy | OK in 4 s (264 KB dump): 44 tables, 14 triggers, 6 migrations recorded |
| Row counts vs live `meki_dev` (read-only) | Equal: Donation 7, Event 1, Page 2, AuditLog 33, MediaAsset 26 |
| Append-only triggers enforce after restore | Yes: `DELETE FROM AuditLog` → `ERROR 1644: AuditLog is append-only` |
| `prisma migrate deploy` on the restored copy | Applied the pending Phase 8A migration; `migrate status` → up to date |
| API started on the restored copy | `/health` → `{"status":"ok","database":"up"}`; public FAQs served |
| Recovery time (container ready → API healthy) | ≈ 1 minute for this data size |

The drill script is reproducible (start a disposable container, normalize, restore, compare counts, migrate, boot, remove). Repeat it on staging with a production-sized dump.
