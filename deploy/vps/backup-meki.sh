#!/usr/bin/env bash
# MEKI — nightly backup on the VPS (docs/54 §6). Install as root:
#   install -m 0750 deploy/vps/backup-meki.sh /usr/local/sbin/backup-meki
#   echo '15 3 * * * root /usr/local/sbin/backup-meki >> /var/log/meki/backup.log 2>&1' > /etc/cron.d/meki-backup
# Credentials: /etc/meki/backup.cnf (root:root 0600) with [mysqldump] user=meki_backup password=... — never on the command line.
# Output: /var/backups/meki/<UTC timestamp>/ {meki.sql, storage.tar.gz, SHA256SUMS}, mode 0600; the last 14 days are kept.
# Copy the newest directory OFF the server (object storage / another host) — a backup on the same disk is not a backup.
set -euo pipefail
umask 077
ts=$(date -u +%Y%m%dT%H%M%SZ)
dir=/var/backups/meki/$ts
mkdir -p "$dir"
mysqldump --defaults-extra-file=/etc/meki/backup.cnf --single-transaction --routines --triggers --no-tablespaces meki > "$dir/meki.sql"
tail -1 "$dir/meki.sql" | grep -q 'Dump completed' || { echo "$ts dump INCOMPLETE"; exit 1; }
tar -czf "$dir/storage.tar.gz" -C /var/lib/meki uploads private
(cd "$dir" && sha256sum meki.sql storage.tar.gz > SHA256SUMS && sha256sum -c SHA256SUMS >/dev/null)
echo "$ts ok tables=$(grep -c 'CREATE TABLE' "$dir/meki.sql") triggers=$(grep -c 'CREATE.*TRIGGER' "$dir/meki.sql") size=$(du -sh "$dir" | cut -f1)"
# retention: delete only backup directories older than 14 days, inside /var/backups/meki
find /var/backups/meki -mindepth 1 -maxdepth 1 -type d -name '20*Z' -mtime +14 -exec rm -rf -- {} +
