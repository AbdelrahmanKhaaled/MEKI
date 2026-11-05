# 06 — API Design (NestJS, OpenAPI 3.1)

Base URL: `API_URL` with a `/v1` prefix. Responses are JSON. Errors follow the RFC 9457 problem-details shape with **generic messages** (SEC-09). The OpenAPI document is generated at build time and committed as `packages/api-client/openapi.json`. CI fails if it drifts from the code.

## 1. Public (read-only, cacheable, no auth)

Only `PUBLISHED` and non-`DEMO` content is returned. Responses are locale-aware (`?locale=ar|en`) or return both languages, with `Cache-Control: public, s-maxage=300, stale-while-revalidate`.

| Method | Path | Returns |
|---|---|---|
| GET | `/v1/public/site` | Settings (tagline, legacy line, non-null contacts/social), nav, `paymentsEnabled` (effective = env && db) |
| GET | `/v1/public/pages/:slug` | Page + visible sections in order |
| GET | `/v1/public/programmes` | Programmes + enabling functions, sub-themes, cover |
| GET | `/v1/public/programmes/:slug` | Detail + gallery |
| GET | `/v1/public/stats` | Proof points with attribution |
| GET | `/v1/public/campaigns` | Approved, published campaigns only (empty at launch) |
| GET | `/v1/health` | liveness |

## 2. Public write (Phase 3)

| Method | Path | Protections |
|---|---|---|
| POST | `/v1/public/inquiries` | Zod validation, honeypot, bot challenge token (vendor TBD), throttling per IP, size limits, privacy-notice version required |

## 3. Admin (session cookie + CSRF, RBAC)

| Method | Path | Role |
|---|---|---|
| POST | `/v1/admin/auth/login` · `/logout` · GET `/me` · GET `/csrf` | — |
| POST | `/v1/admin/auth/mfa/*` (4b) | — |
| GET/PATCH | `/v1/admin/site-settings` | Super |
| CRUD | `/v1/admin/nav-items` | Editor |
| GET/PATCH | `/v1/admin/pages/:slug` · `/pages/:slug/sections` (create, update, reorder via `PUT .../order`) | Editor |
| CRUD | `/v1/admin/programmes` (+ `/sub-themes`, `/media` ordering) | Editor (name edits: Super) |
| CRUD | `/v1/admin/stats` | Editor |
| POST | `/v1/admin/media` (multipart) · GET list/filter · PATCH metadata · POST `/:id/archive` | Editor |
| CRUD | `/v1/admin/campaigns` · POST `/:id/approval` | Editor / Super |
| POST | `/v1/admin/{entity}/:id/submit` · `/publish` · `/unpublish` · `/archive` | Editor / Reviewer |
| GET | `/v1/admin/{entity}/:id/versions` · POST `/versions/:vid/restore` | Reviewer |
| GET | `/v1/admin/audit-logs` | Super / Reviewer |
| CRUD | `/v1/admin/users` | Super |
| GET/PATCH | `/v1/admin/inquiries` (+ CSV export) | Super |
| POST | `/v1/admin/preview-token` | Editor → signed short-lived token for web draft mode |

**Auth details:**
- An opaque session ID is stored in a `__Host-meki_admin` cookie (`HttpOnly; Secure; SameSite=Strict`) and hashed in the DB.
- Sessions expire after 15 minutes of idle time and after 12 hours absolute.
- Lockout uses progressive delays and then a time lock after repeated failures.
- Login errors are generic.
- Passwords must be at least 12 characters, hashed with argon2id, with an optional breached-password check.

## 4. Media upload rules (SEC-13)

- Allowed MIME types are jpeg, png and webp. The type is detected from magic bytes, not the extension. **SVG uploads are rejected.** The maximum size is 15 MB.
- On upload, the API strips EXIF and generates variants (doc 04 §4) asynchronously in an in-process queue. BullMQ is not needed yet.
- Uploads are stored under random keys and served from a cookieless static origin/CDN path.

## 5. Shared schemas

- `packages/schemas` holds the Zod schemas for each `SectionType` (`HeroContent`, `ProofPointsContent`…), plus `ProgrammeInput`, `StatInput`, `MediaMetaInput`, `CampaignInput` and `InquiryInput`.
- The API uses them through a Zod validation pipe, and the OpenAPI schemas are generated from them with `zod-openapi`. Admin forms use the same schemas with RHF.

## 6. Revalidation contract

- On publish/unpublish, the API sends `POST {WEB_URL}/api/revalidate` with the body `{ tags: ["page:home","programmes"] }` and a signature header `X-MEKI-Signature: HMAC-SHA256(body, REVALIDATE_SECRET)`. The request carries a timestamp, and requests older than 5 minutes are rejected.
- If the call fails, it is retried with backoff and recorded in the audit log. The web cache also has a TTL fallback of 5 minutes.

## 7. Payments endpoints (Phase 7, design placeholder only)

- `POST /v1/donations` creates an intent and returns the provider's hosted checkout URL/session. **It is disabled while gated.**
- `POST /v1/webhooks/{provider}` verifies the signature against the raw body, inserts a `WebhookEvent` row (a unique constraint makes it idempotent), processes it in a transaction, and always returns 2xx once the event is stored.
- `GET /v1/donations/:ref/status` is polled by the return page. The redirect never sets status.
