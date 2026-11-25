#!/usr/bin/env bash
# MEKI — build and switch a release on the VPS, as the `meki` user. HTTPS Git only (no SSH deploy keys).
#
#   deploy/vps/deploy.sh <git-ref>        e.g. deploy/vps/deploy.sh v1.0.0   (a tag or full commit SHA, never a moving branch)
#
# Git authentication: a fine-grained GitHub token with READ-ONLY "Contents" access to this one repository, typed when Git
# asks for the password (username: the GitHub login). It is cached in memory for 15 minutes by `credential.helper cache`
# and never written to disk, the repo, the shell history or this script. Set once:  git config --global credential.helper 'cache --timeout=900'
#
# What it does NOT do: it never runs migrations, seeds, or writes to the database. Migrations are a separate, reviewed step
# (backup first, migrator account) — see docs/FINAL_PRODUCTION_DEPLOYMENT_RUNBOOK.md §6. Before switching it runs the READ-ONLY
# check-migrations.sh and refuses to switch while migrations are pending (then: migrate, and deploy/vps/switch.sh <release>).
set -euo pipefail

REF="${1:?usage: deploy.sh <tag-or-commit-sha>}"
REPO_URL="${MEKI_REPO_URL:?set MEKI_REPO_URL to the https:// clone URL (no credentials in the URL)}"
case "$REPO_URL" in https://*@*) echo "MEKI_REPO_URL must not contain credentials" >&2; exit 2;; https://*) ;; *) echo "MEKI_REPO_URL must be https://" >&2; exit 2;; esac
[ "$(id -un)" = "meki" ] || { echo "run as the meki user" >&2; exit 2; }
for f in /etc/meki/api.env /etc/meki/web.env /etc/meki/admin.env /etc/meki/web.build.env /etc/meki/admin.build.env; do
  [ -r "$f" ] || { echo "missing $f (see deploy/vps/*.env.example)" >&2; exit 2; }
done

MIRROR=/srv/meki/repo.git
REL=/srv/meki/releases/$(date -u +%Y%m%dT%H%M%SZ)

# 1. Fetch over HTTPS into a bare mirror, then export the exact ref into a new release directory.
[ -d "$MIRROR" ] || git clone --bare "$REPO_URL" "$MIRROR"
git -C "$MIRROR" fetch --prune --tags "$REPO_URL" '+refs/heads/*:refs/heads/*'
SHA=$(git -C "$MIRROR" rev-parse --verify "$REF^{commit}")
mkdir -p "$REL"
git -C "$MIRROR" archive "$SHA" | tar -x -C "$REL"
echo "$SHA" > "$REL/REVISION"
cd "$REL"

# 2. No .env file may exist inside a release (all configuration comes from /etc/meki).
if find apps -maxdepth 2 -name '.env*' ! -name '*.example' | grep -q .; then echo "a .env file is present in the release" >&2; exit 3; fi

# 3. Install and build. Build-time public values are exported only for the web/admin builds.
pnpm install --frozen-lockfile
DATABASE_URL='mysql://build:placeholder@127.0.0.1:3306/none' pnpm --filter @meki/api build
( set -a; . /etc/meki/web.build.env; set +a; pnpm --filter @meki/web build )
( set -a; . /etc/meki/admin.build.env; set +a; pnpm --filter @meki/admin build )

# 4. Migration-first guard (read-only). A release whose Prisma schema is ahead of the database must never go live: the new
#    API would query columns that do not exist yet. If migrations are pending, stop here WITHOUT switching; apply them as the
#    reviewed migrator step (runbook §6 — additive migrations are safe while the current release keeps running), then
#    activate this already-built release with deploy/vps/switch.sh "$REL".
if ! bash deploy/vps/check-migrations.sh "$REL"; then
  echo "Release built at $REL but NOT switched. After the migration step: bash $REL/deploy/vps/switch.sh $REL" >&2
  exit 4
fi

# 5. Switch atomically and reload (previous release stays on disk for rollback).
PREV=$(readlink -f /srv/meki/current 2>/dev/null || true)
ln -sfn "$REL" /srv/meki/current.next && mv -T /srv/meki/current.next /srv/meki/current
pm2 startOrReload /srv/meki/current/deploy/vps/ecosystem.config.cjs --update-env
pm2 save
echo "deployed $SHA → $REL (previous: ${PREV:-none})"
echo "next: run the health checks in the runbook §7; rollback = bash $REL/deploy/vps/rollback.sh $PREV"
