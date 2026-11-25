#!/usr/bin/env bash
# MEKI — READ-ONLY check that every migration shipped in a release is already applied to the production database.
# It never applies, resets or edits anything: it runs `prisma migrate status` with the RUNTIME connection (/etc/meki/api.env),
# which only reads the `_prisma_migrations` table. Prints no credentials (Prisma prints only the host and database name).
#
#   deploy/vps/check-migrations.sh /srv/meki/releases/<timestamp>
#
# Exit 0 = schema up to date → the release may be switched. Any other exit (pending or failed migrations, database
# unreachable) = DO NOT switch: apply the reviewed migrations first (docs/FINAL_PRODUCTION_DEPLOYMENT_RUNBOOK.md §6).
set -euo pipefail
REL="${1:?usage: check-migrations.sh /srv/meki/releases/<timestamp>}"
case "$REL" in /srv/meki/releases/*) ;; *) echo "release must be under /srv/meki/releases" >&2; exit 2;; esac
[ -d "$REL/apps/api/prisma/migrations" ] || { echo "$REL has no apps/api/prisma/migrations" >&2; exit 2; }
[ -r /etc/meki/api.env ] || { echo "missing /etc/meki/api.env" >&2; exit 2; }

echo "Migrations shipped in this release:"
find "$REL/apps/api/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -printf '  %f\n' | sort
cd "$REL/apps/api"
# DATABASE_URL is read from the env file inside a subshell only; it is never echoed or passed on a command line.
if ( set -a; . /etc/meki/api.env; set +a; pnpm exec prisma migrate status ); then
  echo "OK: the database schema includes every migration of this release."
else
  echo "BLOCKED: pending or failed migrations (or the database is unreachable). The release was NOT switched." >&2
  exit 4
fi
