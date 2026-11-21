#!/usr/bin/env bash
# MEKI — Phase 13A backup + restore drill for the LOCAL staging stack (docs/54 §5). Disposable and isolated:
#   - backs up meki_staging with the compose `backup` service (checksum written and verified),
#   - normalizes the known trigger quirk (docs/37 §2), restores into a THROWAWAY mysql:8.4 container on the staging network,
#   - compares tables / triggers / key row counts with live staging (read-only), runs `prisma migrate status`,
#   - boots the release image against the restored copy (read-only health check), then removes every drill container.
# Never touches meki_dev, meki_test or the live staging database. Drill passwords are random, in-memory, never printed.
set -euo pipefail
cd "$(dirname "$0")/../.."
P="meki-staging"
C="docker compose -p $P -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env.staging"
NET="${P}_default"
IMAGE="${MEKI_API_IMAGE:-meki-api:staging-local}"
DRILL_DB="meki-restore-drill"
DRILL_API="meki-restore-drill-api"
t0=$(date +%s)
cleanup() { docker rm -f "$DRILL_API" "$DRILL_DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "== 1. backup (compose 'backup' service)"
mkdir -p deploy/staging/backups
out=$($C run --rm backup 2>&1 | grep "backup ok" || true)
[ -n "$out" ] || { echo "backup FAILED"; exit 1; }
echo "$out"
f=$(ls -t deploy/staging/backups/meki_staging-*.sql | head -1)
# The .sha256 file stores the BARE file name (verifiable on the host and in the container). Any failure stops the drill.
[ -s "$f" ] || { echo "backup file missing or empty"; exit 1; }
if (cd deploy/staging/backups && sha256sum -c "$(basename "$f").sha256" >/dev/null); then echo "checksum verified: $(basename "$f")"; else echo "CHECKSUM VERIFICATION FAILED"; exit 1; fi

echo "== 2. normalize (docs/37 §2 trigger caveat) — original dump untouched"
r="${f%.sql}.restore.sql"
sed -E '/^\/\*!50003 CREATE\*\/.*TRIGGER/ s/;[[:space:]]*\*\/;;$/ *\/;;/' "$f" > "$r"
chmod 600 "$r"

echo "== 3. disposable restore target"
root=$(node -e 'console.log(require("crypto").randomBytes(18).toString("base64url"))')
mig=$(node -e 'console.log(require("crypto").randomBytes(18).toString("base64url"))')
app=$(node -e 'console.log(require("crypto").randomBytes(18).toString("base64url"))')
cleanup
docker run -d --name "$DRILL_DB" --network "$NET" -e MYSQL_ROOT_PASSWORD="$root" mysql:8.4 --log-bin-trust-function-creators=1 >/dev/null
# Wait for an AUTHENTICATED query, not a ping: the image first runs a temporary init server (root password not yet set) that
# answers pings — racing it caused "Access denied for user 'root'" (found in the Phase 13A drill).
ready=0
for i in $(seq 1 90); do docker exec -e MYSQL_PWD="$root" "$DRILL_DB" mysql -uroot -h 127.0.0.1 -N -e "SELECT 1" >/dev/null 2>&1 && { ready=1; break; }; sleep 2; done
[ "$ready" = 1 ] || { echo "restore target did not become ready"; exit 1; }
t1=$(date +%s)
# the triggers carry DEFINER=meki_migrator — create the same accounts before restoring (docs/37 §2)
docker exec -i -e MYSQL_PWD="$root" "$DRILL_DB" mysql -uroot <<SQL
CREATE DATABASE meki_staging CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'meki_migrator'@'%' IDENTIFIED BY '$mig';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, TRIGGER, CREATE VIEW, SHOW VIEW, LOCK TABLES ON meki_staging.* TO 'meki_migrator'@'%';
CREATE USER 'meki_app'@'%' IDENTIFIED BY '$app';
GRANT SELECT, INSERT, UPDATE, DELETE ON meki_staging.* TO 'meki_app'@'%';
SQL
docker exec -i -e MYSQL_PWD="$root" "$DRILL_DB" mysql -uroot meki_staging < "$r"
t2=$(date +%s)
echo "restored in $((t2 - t1))s"

echo "== 4. compare with live staging (read-only)"
q="SELECT CONCAT((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='meki_staging'),' tables, ',(SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='meki_staging'),' triggers, AdminUser=',(SELECT COUNT(*) FROM meki_staging.AdminUser),' AuditLog=',(SELECT COUNT(*) FROM meki_staging.AuditLog),' Programme=',(SELECT COUNT(*) FROM meki_staging.Programme),' Event=',(SELECT COUNT(*) FROM meki_staging.Event),' Donation=',(SELECT COUNT(*) FROM meki_staging.Donation),' EventBooking=',(SELECT COUNT(*) FROM meki_staging.EventBooking),' migrations=',(SELECT COUNT(*) FROM meki_staging._prisma_migrations))"
live=$(docker exec meki-staging-mysql sh -c "mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -N -e \"$q\" 2>/dev/null")
rest=$(docker exec -e MYSQL_PWD="$root" "$DRILL_DB" mysql -uroot -N -e "$q" 2>/dev/null)
echo "live    : $live"
echo "restored: $rest"
[ "$live" = "$rest" ] && echo "MATCH" || echo "NOTE: counts differ (writes after the backup are expected only if staging was in use)"
guard=$(docker exec -e MYSQL_PWD="$root" "$DRILL_DB" mysql -uroot meki_staging -e "DELETE FROM AuditLog LIMIT 1" 2>&1 || true)
echo "append-only trigger after restore: $(echo "$guard" | grep -o 'append-only' || echo 'NOT ENFORCED')"

echo "== 5. prisma migrate status on the restored copy"
docker run --rm --network "$NET" -e DATABASE_URL="mysql://meki_migrator:$mig@$DRILL_DB:3306/meki_staging" "$IMAGE" sh -c "pnpm exec prisma migrate status 2>&1 | grep -E 'migrations found|up to date|not yet been applied|failed'"

echo "== 6. boot the release image on the restored copy (read-only health check)"
docker run -d --name "$DRILL_API" --init --network "$NET" -p 127.0.0.1:4299:4000 \
  -e NODE_ENV=staging -e STAGING_LOCAL_REHEARSAL=true -e GALA_JOBS_INTERVAL_SECONDS=0 -e MAIL_TRANSPORT=none -e SWAGGER_ENABLED=false \
  -e DATABASE_URL="mysql://meki_app:$app@$DRILL_DB:3306/meki_staging?allowPublicKeyRetrieval=true" \
  -e EVENT_BOOKING_TOKEN_SECRET="$(node -e 'console.log(require("crypto").randomBytes(40).toString("base64url"))')" \
  -e WEB_URL=http://localhost:3200 -e API_PUBLIC_URL=http://localhost:4299 -e PUBLIC_MEDIA_BASE_URL=http://localhost:4299/media \
  -e CORS_ORIGINS=http://localhost:3200 -e DONATION_RETURN_URL='http://localhost:3200/{locale}/donation/return' -e EVENT_BOOKING_RETURN_URL='http://localhost:3200/{locale}/events/{slug}/booking' \
  "$IMAGE" >/dev/null
for i in $(seq 1 60); do curl -sf http://127.0.0.1:4299/api/v1/health >/dev/null 2>&1 && break; sleep 2; done
t3=$(date +%s)
echo "health: $(curl -s http://127.0.0.1:4299/api/v1/health)"
echo "public FAQs served: $(curl -s http://127.0.0.1:4299/api/v1/public/faqs | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).data.length)}catch{console.log("ERR")}})')"

echo "== 7. timings"
echo "restore target ready → restored: $((t2 - t1))s; restored → API healthy: $((t3 - t2))s; whole drill: $((t3 - t0))s"
echo "drill containers removed on exit; backup kept privately: $(basename "$f") (+ .sha256, normalized copy)"
