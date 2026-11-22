#!/usr/bin/env bash
# MEKI — switch back to a previous, already-built release (as the meki user). Never touches the database:
# migrations are additive, so the previous code runs against the newer schema (it ignores new tables/columns).
#   deploy/vps/rollback.sh /srv/meki/releases/<timestamp>
set -euo pipefail
TARGET="${1:?usage: rollback.sh /srv/meki/releases/<timestamp>}"
case "$TARGET" in /srv/meki/releases/*) ;; *) echo "target must be under /srv/meki/releases" >&2; exit 2;; esac
for d in apps/api/dist apps/web/.next apps/admin/.next; do [ -e "$TARGET/$d" ] || { echo "$TARGET is not a built release ($d missing)" >&2; exit 2; }; done
ln -sfn "$TARGET" /srv/meki/current.next && mv -T /srv/meki/current.next /srv/meki/current
pm2 startOrReload /srv/meki/current/deploy/vps/ecosystem.config.cjs --update-env && pm2 save
echo "rolled back to $(cat "$TARGET/REVISION" 2>/dev/null || echo "$TARGET")"
