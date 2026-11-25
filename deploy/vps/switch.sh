#!/usr/bin/env bash
# MEKI — switch to an ALREADY BUILT release after its migrations were applied (as the meki user). Used when deploy.sh
# stopped at the migration check: apply the reviewed migrations (runbook §6), then
#
#   deploy/vps/switch.sh /srv/meki/releases/<timestamp>
#
# Refuses to switch unless the release is fully built AND check-migrations.sh confirms the schema is up to date.
# Never touches the database itself.
set -euo pipefail
REL="${1:?usage: switch.sh /srv/meki/releases/<timestamp>}"
case "$REL" in /srv/meki/releases/*) ;; *) echo "release must be under /srv/meki/releases" >&2; exit 2;; esac
[ "$(id -un)" = "meki" ] || { echo "run as the meki user" >&2; exit 2; }
for d in apps/api/dist apps/web/.next apps/admin/.next; do [ -e "$REL/$d" ] || { echo "$REL is not a built release ($d missing)" >&2; exit 2; }; done

bash "$(dirname "$(readlink -f "$0")")/check-migrations.sh" "$REL"

PREV=$(readlink -f /srv/meki/current 2>/dev/null || true)
ln -sfn "$REL" /srv/meki/current.next && mv -T /srv/meki/current.next /srv/meki/current
pm2 startOrReload /srv/meki/current/deploy/vps/ecosystem.config.cjs --update-env
pm2 save
echo "switched to $(cat "$REL/REVISION" 2>/dev/null || echo "$REL") (previous: ${PREV:-none})"
echo "next: health checks (runbook §7); rollback = bash $REL/deploy/vps/rollback.sh $PREV"
