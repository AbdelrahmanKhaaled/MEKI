# syntax=docker/dockerfile:1.7
# MEKI API (NestJS + Prisma 7 / MariaDB adapter) — Phase 13A staging/production image. Build context = repository root:
#   docker build -f apps/api/Dockerfile -t meki-api:<release> .
# The image contains NO secrets and NO .env file: configuration comes from the runtime environment / secret store.
# It keeps the full API workspace install so operators can run `prisma migrate deploy`, the seed and the one-time admin
# bootstrap from the same artefact (`docker run --rm ... meki-api:<release> pnpm db:migrate:deploy`).

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
# openssl: Prisma CLI (migrate) detects the TLS library; ca-certificates: TLS to a managed MySQL
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /repo

FROM base AS build
# Lockfile + every workspace manifest first (layer cache; the frozen lockfile must match the whole workspace).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY packages/api-client/package.json packages/api-client/package.json
RUN pnpm install --frozen-lockfile --filter @meki/api...
COPY apps/api apps/api
# The seed reproduces the approved website copy from these files (prisma/seed/seed-data.ts imports them).
COPY apps/web/src/content apps/web/src/content
# The seed reads the packaged manifests, byte lengths and checksums of the curated public images.
COPY apps/web/public/images/work apps/web/public/images/work
# prisma generate + nest build + copy brand assets/fonts to dist/assets. prisma.config.ts resolves DATABASE_URL even though
# `generate` never connects: a non-secret placeholder scoped to this build step only (it is NOT in the runtime image).
RUN DATABASE_URL="mysql://build:build@127.0.0.1:3306/build" pnpm --filter @meki/api build && test -f apps/api/dist/main.js && test -d apps/api/dist/assets

FROM base AS runtime
ENV NODE_ENV=production PORT=4000
COPY --from=build --chown=node:node /repo /repo
WORKDIR /repo/apps/api
# Writable, persistent paths (mount volumes here): public media uploads and PRIVATE files (ticket PDFs, SDI reports).
RUN mkdir -p /data/uploads /data/private && chown -R node:node /data && rm -rf test
ENV LOCAL_STORAGE_DIR=/data/uploads PRIVATE_STORAGE_DIR=/data/private
USER node
EXPOSE 4000
# Liveness only (no DB): readiness (/api/v1/health, includes the database) is for the load balancer / orchestrator.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Run node directly as PID 1 child of `docker run --init` / compose `init: true` so SIGTERM reaches Nest's shutdown hooks
# (job poller stopped, DB pool closed) and zombie processes are reaped.
CMD ["node", "dist/main.js"]
