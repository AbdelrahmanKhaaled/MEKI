# 33 — Phase 9A: Security audit

Date: 2026-11-18. Scope: `apps/api`, `apps/web`, `apps/admin`, Prisma/MySQL, authentication, Gala ticketing, donations, Zeffy, background jobs.

**Method.** Each control was checked against the actual code, configuration and tests (not assumed), plus a dependency scan (`pnpm audit --prod`). Confirmed issues were fixed with regression tests. Approved business rules, tax/receipt wording and payment gates are unchanged.

## 1. Findings fixed in Phase 9A

| # | Severity | Finding | Fix | Evidence |
|---|---|---|---|---|
| S1 | **High** (availability) | `multer@2.4.0` — **GHSA (high)**: denial of service via a pending asynchronous fileFilter after request teardown. Pulled in by `@nestjs/platform-express`, whose file interceptor serves the admin media upload. The direct dependency was already `^2.5.0`, but Nest used its own copy. | Workspace `pnpm.overrides: { multer: "^2.5.0" }` → every path resolves to 2.5.0 (same major version). The lockfile diff contains only this change. | `pnpm audit --prod`: the high finding is gone. The upload e2e tests (media suite) pass. |
| S2 | **Medium** (broken feature) | Admin `Permissions-Policy: camera=()` **blocked the camera for the whole admin**, so the Gala QR scanner (6E) could never use a device camera. | `camera=(self)`; microphone and geolocation stay blocked. | `apps/admin/tests/security-headers.test.mjs` |
| S3 | Low (defence in depth) | No Content-Security-Policy and no HSTS on the website or admin. | Script-neutral CSP: `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`. Plus `Strict-Transport-Security: max-age=31536000` (browsers honour it only over HTTPS; no `includeSubDomains`). | Header tests in web and admin |
| S4 | Low (availability) | `/health` hung about 10 s when the database was unreachable (pool timeout), stalling load-balancer probes. | 3-second probe timeout → fast 503 `DB_UNAVAILABLE`. New DB-free `/health/live`. | `test/phase9-ops.e2e-spec.ts` (hung DB → 503 in < 6 s) |

## 2. Controls verified (no change needed)

| Area | Result |
|---|---|
| **Sessions** | Server-side sessions (only the token hash is stored). Cookie: `HttpOnly`, `SameSite=Strict`, `Secure` + `__Host-` prefix in staging/production (`AppConfigService.secureCookies`). Idle/absolute expiry via `SESSION_IDLE_MINUTES` / `SESSION_ABSOLUTE_HOURS`. Logout revokes the session. Argon2id passwords with a policy check. Lockout after repeated failures. Login throttled (`LOGIN_THROTTLE`). Covered by `auth.e2e-spec.ts`. |
| **CSRF** | Global CSRF guard (header token, kept in memory in the admin). Exemptions are deliberate and authenticated otherwise: login, public booking/donation creation and checkout (idempotency key + purchaser token), provider webhooks (HMAC signatures) and the dev-only mock checkout. |
| **CORS** | Explicit origin list (`CORS_ORIGINS`), credentials allowed only for those origins. Phase 7 added `X-Booking-Token` (regression test: foreign origins refused). |
| **RBAC** | Every admin route carries `@RequirePermissions`; the guard requires all listed permissions; SUPER_ADMIN bypasses. Covered by `rbac.e2e-spec.ts` and per-module 403 tests (Gala door staff, finance, content manager, Zeffy, system status). |
| **Input validation** | Global `ValidationPipe({ whitelist, forbidNonWhitelisted })`: unknown fields are rejected (no client price on bookings — tested). Route IDs are checked by `SafeIdPipe`; ticket numbers by pattern. |
| **Output / errors** | Error envelope without stack traces; `path` without query strings (so no tokens in error bodies — gala-qa test). Swagger is never served in production. |
| **File uploads** | Magic-byte detection (never extension or MIME). SVG refused. `sharp` re-encodes and strips metadata. Pixel limit. 10 MB per file; the admin proxy allows 12 MB bodies so the API stays the enforcer. |
| **Private PDFs** | Private storage directory, never public URLs. Access needs the purchaser token or `gala.tickets.read`. Storage keys never leave the service. |
| **QR tokens** | 256-bit random. Only the SHA-256 is stored. Rotation on re-issue. The masked scanner field never displays the token. Atomic conditional check-in (concurrency tested). |
| **Webhooks** | Raw-body HMAC, constant-time comparison. Mock: timestamped. Zeffy: documented `t=…,v1=…` scheme with ±5 min tolerance and rotation. Unique `(provider, eventId)`; duplicates and replays are idempotent. Nothing changes before authentication (`zeffy.e2e-spec.ts`, `gala*.e2e-spec.ts`). |
| **Logs** | HTTP log = method, path without query, status, duration, request ID, user ID. Job errors are sanitised (e-mails and QR tokens masked). Zeffy logs only rejection reasons. **One intended exception:** in `NODE_ENV=development` only, the password-reset notifier prints the reset token (no e-mail provider exists); other environments log a generic notice. |
| **Personal data** | Guest exports need `gala.guests.export` and are audited and formula-injection safe. Door staff see names and ticket numbers only. Zeffy records store no buyer name, e-mail, address or free-text answers. Webhook payloads are sanitised. |
| **Audit logging** | Mutations across finance, content, Gala, Zeffy and settings write `AuditLog` entries (actor, entity, small metadata, never secrets). |
| **Secrets in the repository** | Only `*.env.example` files are tracked. No key, password or private-key patterns in tracked sources. `client-resources/` is not tracked. |
| **Database privilege** | The application user cannot create databases (verified: `ERROR 1044`) — least privilege. |
| **Payments** | Mock provider forbidden in staging/production. Payments disabled by default. Zeffy auto-confirmation refused in staging/production. No card data anywhere. |

## 3. Accepted risks and residual items

| Item | Decision |
|---|---|
| `uuid@8.3.2` via `exceljs` — moderate advisory (v3/v5/v6 with a caller-supplied buffer) | **Not reachable:** exceljs calls only `uuid.v4()`. Forcing uuid 11 under exceljs risks breaking XLSX export for no benefit. Revisit when exceljs updates. |
| No `script-src` CSP | Requires per-request nonces for Next.js inline bootstrapping; a static policy would break the site. Recommended as a later improvement, tested on staging. |
| In-memory rate limiter | Correct for one API instance. **Corrected in Phase 9B:** a Redis store is *not* implemented (`RATE_LIMIT_STORE=redis` refuses to start), so scaling out first needs a shared throttler store (doc 36 A, doc 41 §5). |
| Swagger in **staging** | Served unless `SWAGGER_ENABLED=false`; set it to false if staging is public. |
| Development-only reset-token log | Intended for local work; impossible in staging/production (environment check). |
| HSTS preload / includeSubDomains | Deliberately not set until the production domain plan is known (doc 38, H-items). |

## 4. Files changed

- Root `package.json` (`pnpm.overrides`), `pnpm-lock.yaml`.
- `apps/admin/next.config.ts`, `apps/web/next.config.ts` (headers).
- `apps/api/src/modules/health/health.module.ts` (probe timeout, `/health/live`, `/admin/system/status`).
- Tests: `apps/admin/tests/security-headers.test.mjs`, `apps/web/tests/security-headers.test.mjs`, `apps/api/test/phase9-ops.e2e-spec.ts`.
