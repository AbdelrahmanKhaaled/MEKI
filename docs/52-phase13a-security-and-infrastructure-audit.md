# 52 — Phase 13A: security and infrastructure audit

Date: 2026-11-19. Scope: the code in this working tree and the local staging rehearsal. The live Vercel projects and the VPS were **not** accessible, so their configuration is a checklist (§4), not a finding.

## 1. Verified controls

| Area | Evidence |
|---|---|
| Authentication | Wrong password → 401 with no cookie; unauthenticated `/me` and protected routes → 401; first-login change enforced (`PASSWORD_CHANGE_REQUIRED`) for both the bootstrap Super Admin and new users |
| Session cookie through the admin proxy | `__Host-meki_admin_sid; HttpOnly; Secure; SameSite=Strict; Path=/`, no `Domain` (staging smoke) |
| CSRF | A mutation without `X-CSRF-Token` → 403 |
| Session expiry and logout | Idle-expired session → 401; logout clears the cookie, then `/me` → 401; a password change revokes other sessions (test) |
| Authorization | A content manager is refused finance, SDI, users and the guest list (403); approvals need `events.approve` from a different user (four-eyes) |
| Rate limiting | Login → 429 after repeated failures; public burst of 100 → 429 |
| Headers | Admin: CSP (frame-ancestors/base/object/form), HSTS, `X-Frame-Options: DENY`, nosniff, `no-store`, `noindex`. Website: CSP, HSTS, DENY, no `x-powered-by`. API: helmet (nosniff, CORP same-site, no `x-powered-by`) |
| CORS | An unknown origin gets no `Access-Control-Allow-Origin` |
| Swagger | Not served in staging/production (404) |
| Financial switches | Staging: `zeffy_hosted`, sales, giving, programme, general and report-apply all OFF (smoke and the compose file). MEKI-native checkout is refused in production. A synthetic SDI upload is refused in staging |
| Database privileges | Runtime account DML only; migrations through a separate account; backups through the operator or backup account |
| Uploads | Size, type and formula checks (doc 48 §2); private storage is never served directly |
| Audit | Login, password change, user creation, Gala price and schedule change, fundraising and legal-copy approvals are all audited |

## 2. Secrets review

- **Tracked files:** no secret found.
  - Scanned for private keys, `whsec_`, `sk_live/test`, AWS keys, `…SECRET|PASSWORD|TOKEN=<16+ chars>` and credentialed DB URLs.
  - The only DB URLs are in `.env.example`, `apps/api/.env.example` and `apps/api/.env.test.example`, all with **placeholder** passwords.
  - A unit-test fixture uses a dummy password.
- **History:** no real `.env` file has ever been committed (`git log --all`: 0).
- **Git-ignored and never committed:**
  - `apps/api/.env`, `apps/api/.env.test`, `apps/web/.env.local`;
  - `deploy/staging/.env.staging` (rehearsal secrets);
  - `deploy/staging/.env.staging-admin` (staging Super Admin password; rotated by the smoke and stored back, 0600);
  - `deploy/staging/backups/` (may contain personal data).
- **Must be rotated / never reused before any public deployment:**
  - the local development `DATABASE_URL` password;
  - `MOCK_PAYMENT_WEBHOOK_SECRET` and `DONATION_TOKEN_SECRET` in `apps/api/.env` and `.env.test`. Treat them as exposed: they may have appeared in screenshots. The mock provider is refused in staging/production anyway;
  - every rehearsal secret in `deploy/staging/.env.staging`;
  - the staging admin password.

  Generate fresh values for the VPS (`EVENT_BOOKING_TOKEN_SECRET`, `DONATION_TOKEN_SECRET`, and the MySQL `meki_app` / `meki_migrator` / `meki_backup` passwords) and keep them only in `/etc/meki/*.env` / `.cnf` (0600 / 0640). No value was changed in any existing file.
- **Staging admin passwords:**
  - generated in memory;
  - written only to the git-ignored 0600 file;
  - never printed or logged;
  - forced to change at first login, which the smoke does automatically;
  - on a `.invalid` e-mail domain.

## 3. Dependency vulnerabilities

The production audit gate from doc 36 (`pnpm audit --prod`: no high/critical; 1 moderate accepted, doc 33) was **not re-run**: it needs registry access with the project's identifiers. It stays a release gate in doc 54 §1.

## 4. Risks and accepted items

| # | Risk | Status / action |
|---|---|---|
| R-1 | Live admin login 404 | Root cause fixed in code; the **operator** must set `ADMIN_API_UPSTREAM` and redeploy (doc 54 §7). Unverified live |
| R-2 | `allowPublicKeyRetrieval=true` lets a network attacker substitute the RSA key | Acceptable **only** on loopback (VPS) or a private Docker network (rehearsal). Any remote DB must use TLS |
| R-3 | API port 6666 is in browsers' blocked range (6665–6669) | Harmless behind nginx; it must stay bound to 127.0.0.1 and closed in the firewall |
| R-4 | Client IP through Vercel → nginx → API: with `TRUST_PROXY=1` the API sees Vercel's edge address for admin traffic, so the login rate limit is shared by all admins on that edge | **Verify the `X-Forwarded-For` chain** on the live deployment before tuning `TRUST_PROXY` (never `true`). Website direct calls are unaffected |
| R-5 | Vercel external-rewrite body limits for media (10 MB) and SDI reports (5 MB) | Unverified. Test an upload through `https://admin-anhk.vercel.app` after go-live. If refused, the limit must be raised on the hosting side or uploads documented as size-limited — never by weakening auth |
| R-6 | One API instance (job poller + in-memory rate limit) | Accepted for launch (doc 36 A); scaling out needs a shared store first |
| R-7 | Staging Docker image is 1.25 GB (full workspace install, so operators can migrate/seed from it) | Accepted for staging; a slimmer production image is optional (the VPS does not use Docker) |
| R-8 | HSTS without `includeSubDomains` | Accepted until the domain plan is decided (doc 38) |
| R-9 | The local rehearsal runs over http on localhost | By design (`STAGING_LOCAL_REHEARSAL`, refused in production). Browsers treat localhost as secure for `__Host-` cookies |

## 5. No weakening

No guard, permission, CSRF check, rate limit or session rule was relaxed to make a test pass. The two escape hatches added are:

- `STAGING_LOCAL_REHEARSAL`: staging only, and only relaxes the localhost-URL check;
- `DB_CONNECTION_PARAMS`: compose only.

Both are documented.
