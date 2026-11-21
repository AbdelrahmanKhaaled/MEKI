# Phase 14B final release report

Date: 2026-11-21. Base commit: `14fd81dfdc1fd4a5e8032d49eb9e322cd3ec7185`. All recovered uncommitted Phase 13A, 13B, 14 and 14B work is preserved. This is an uncommitted release candidate; nothing was staged, committed or pushed.

## 1. Phase 14B status

**Complete for the authorized scope, with collection and final manual approval disabled.** The remaining SDI evidence/authorizations govern activation; they do not prevent a deployment with collection disabled. No production deployment or production environment modification was performed. The developer will release and deploy separately.

The recovered partial implementation already contained the Gala-only consent model, intent/reference system, source-interest migration, hosted form routing helpers, Zakat controls and official report importer. Completion finished public entry points, mobile programme giving, bilingual admin evidence management, reconciliation safeguards and release verification. Docs 59–62 retain historical results; the current release evidence is below.

## 2. Last Firefox failure

The reported **23/24** result was reproduced in isolation. Exact failing locator: `#programmes button.btn-green:visible`, first match, Arabic mobile at 390×844. Firefox's normal click log reported neighbouring accordion list items/the Health heading intercepting pointer events; the fixed draft notice also appeared in later retries.

The actual cause was mobile accordion hover activation. Moving a neighbouring header under the pointer during scrolling fired `onMouseEnter`, changed the active programme and collapsed the panel containing the chosen Give button. CSS zero-height clipping left that button with a nonzero DOM rectangle, so it still matched Playwright's `:visible` locator. Pre-fix DOM evidence showed the Social Solidarity panel height **0**, its button clipped, and the Health heading at the hit point.

Fix in `Programmes.tsx`: hover activation applies only at desktop width on hover/fine-pointer devices. Mobile activation remains explicit tap/focus. Collapsed panels are invisible, inert and aria-hidden, preventing inaccessible clipped controls from participating in interaction. The test verifies that pointer movement/scrolling preserves the mobile selection and collapsed Give buttons are hidden/inert. No forced click, skipped assertion or increased click timeout was used. The arbitrary animation delay and swallowed notice-dismissal error were removed.

Post-fix DOM evidence showed the original panel still active, height **516.95 px**, its Give button un-clipped and the actual button at the hit point. Before/after screenshots and DOM snapshots remain private, ignored QA artifacts in `.tmp/phase14b-browser/`.

**Final affected journeys: Firefox 40/40, Chromium 40/40, WebKit 40/40.** Each run includes English desktop 1440×900 and Arabic mobile 390×844. WebKit's admin journey was tested over a loopback-only HTTPS QA proxy with temporary certificates; Secure/__Host cookies were preserved, no system trust store or app environment file was changed, and no admin checks were skipped. All browser page errors count as failures.

## 3. Functional flows

| Entry point | Authorized journey | Disabled journey |
|---|---|---|
| Header Give, mobile navigation Give | MEKI `/give#prepare`, then authorized hosted intent/handoff | Explanation and working link to preview |
| Footer/final Give, homepage hero | Same shared DonateProvider journey | Same explanation/preview navigation |
| Homepage programme cards, including mobile accordion | Explicit programme slug carried as source interest | Programme preselected in preview |
| Homepage campaign cards | Matching programme slug carried where the approved programme label matches; Gala destination disclosed before acceptance | Informational preview; no restricted campaign checkout enabled |
| Quick Donate | Chosen amount and programme carried into `/give`; server revalidates both | Same selection carried into preview; no contact details or payment collected |
| Programme Single donation CTA | MEKI giving journey, source programme preserved | Meaningful programme explanation and preview navigation |
| Gala Book Your Place | Existing pending booking, unique **EB-** reference, copy/reference instructions, authorized official ticket form | Internal booking page explains availability; no hosted checkout |
| Gala Donate Without Attending | MEKI Gala donation page, explicit intent/classification, unique **DN-** reference, authorized official donation form | Preview or truthful unavailable panel; no reference or checkout |

Programme interest is separate from the actual approved Gala project destination and is not a restricted allocation. Redirected giving requires explicit acceptance; no existing restricted intent is repurposed. Returning from Zeffy never marks a payment paid. Zakat is unavailable unless its separate approvals, type question and actual target eligibility all pass. Original intent/classification/consent remain immutable.

Official tickets, QR codes, check-in and tax receipts remain SDI/Zeffy responsibilities. Client-approved event details remain December 12, 2026, USD 500, capacity 350, 3:30–8:30 PM America/New_York. A create-only seed does not overwrite existing admin settings; operators must verify those settings and the real SDI form before activation.

## 4. Manual payment verification

Implemented private finance queue: `/[locale]/payments/sdi-evidence`, with reference/status filters, evidence detail, audit history, submission and independent review. Existing hosted booking and giving detail pages link to it for authorized finance staff.

- Reading/submitting requires `sdi.reports.upload`; deciding requires both upload and `sdi.reports.approve`. The submitter cannot approve or reject their own request, including a Super Admin.
- Capture intended reference separately from the reference in original evidence; external order ID; amount/currency; payment timestamp/timezone; exact form; classification; original Message-ID/sender/authorized recipient/received time; protected archive reference; reasoning and decision metadata.
- Missing trustworthy details or absence of an original SDI email leaves evidence **PENDING_REVIEW**. Complete entries await second-admin approval. Supplied money, currency, reference, source and classification mismatches are rejected. Manual text, screenshots and donor forwards alone cannot prove payment.
- **Final approval remains disabled** via `SDI_MANUAL_CONFIRMATION_ENABLED=false` until an authentic email and matching procedure are validated. No authentic email sample was available; the other-campaign Excel sample was not treated as one.
- Future gated approval revalidates the original pending target, uses a serializable transaction and the importer's unique provider/order/entity registry, rejects competing claims, and is idempotent. Hosted tickets reuse the existing booking ledger/pipeline; no MEKI official tickets are generated.
- Original evidence contents and finalized decisions cannot be edited/deleted through the API; database triggers protect them. Submission, decisions and later reconciliation are audited. Email metadata stays out of donor-visible history. No card data or email body is requested.

The CSV/XLSX importer remains intact. A matching later report reconciles the original evidence without creating a second payment or replacing email provenance. Reference, amount, currency, classification, fund and status conflicts remain report-row exceptions. Reconciled Gala aggregates include a manually verified payment only after an official report reconciles it; its original `manual` source remains intact. Allocation is separately authorized and cannot be approved by the payment approver. Payout stays NOT_REPORTED; no bank settlement is inferred.

## 5. QA results

| Check | Current evidence | Result |
|---|---|---|
| Complete API unit/integration run | `pnpm --filter @meki/api exec jest --runInBand --testTimeout=60000` | **35/35 suites, 489/489 tests** |
| Final affected API delta after bind/aggregate corrections | deployment URL/bind configuration, Phase 14B, Phase 14 giving, Phase 12 SDI suites | **4/4 suites, 46/46 tests** |
| Website, after accordion fix | `typecheck`, `lint`, `test`, `build`; `web-closeout.log` | **112/112 tests; typecheck/build pass; lint 0 errors, 2 existing warnings** |
| Admin final closeout | `typecheck`, `lint`, `test`, `build`; `admin-closeout.log` | **222/222 tests; typecheck/build pass; lint 0 errors, 3 existing warnings** |
| All-workspace baseline release checks | `pnpm turbo run typecheck lint build --force --concurrency=1` | **10/10 tasks passed**, followed by the affected API/web/admin checks above |
| API final production build/typecheck/lint | `api-closeout-build.log` | **Pass; 0 lint errors/warnings** |
| Firefox affected browser journey | `firefox-fixed.log` | **40/40**, no skips |
| Chromium affected browser journey | `chromium-final.log` | **40/40**, no skips |
| WebKit affected browser journey | `webkit-final.log` | **40/40**, no skips; HTTPS admin session verified |
| Final staging API/admin-proxy smoke | `staging-smoke-final.log`; credential rotation explicitly disabled | **56/56** |
| Broader existing public agreement journey, Chromium EN desktop/AR mobile | `agreement-final.log` | **56/56** |
| Node 24 native API startup/bind | Temporary isolated-test-DB process, collection off | Readiness **ok / database up**; listener verified **127.0.0.1:4400** |
| Nginx 1.24 template | Ephemeral local `nginx:1.24`, test certificates, no published ports, `nginx -t` | **Syntax and configuration test successful**, exit 0 |
| OpenAPI/client | Regenerated contract and admin service-path tests | **217 paths**, contract check passes |
| Frozen lockfile | Offline, frozen, scripts disabled; hash compared before/after | **Pass, unchanged** |
| Whitespace | `git diff --check` | **Pass** |

The completed 489-test API run is retained; it is not misrepresented as a new full run after the final bounded API changes. Those changes have the fresh 46-test affected run. Earlier interrupted runs and startup timeouts are not counted as passes. The explicit 60-second API hook timeout addresses the test runner's observed default five-second initialization limit; the Firefox click timeout was not increased.

Local host runtime: Node **24.21.0**. The local API Docker build additionally passed on Node 22. All payment evidence/reports used by automated tests are synthetic and confined to isolated test databases. No live checkout or authentic SDI confirmation was fabricated.

## 6. Database and security

Six pending/uncommitted migration files from Phase 12B onward are included in the release file manifest. Source review found no destructive table/column/database drops, truncations or data deletion. New interest/evidence fields/tables and immutable triggers are additive; original classification controls are preserved.

Earlier in this work, before the final no-deployment instruction, local staging was backed up to `meki_staging-20261121T130223Z.sql`; its SHA-256 was verified. The three pending Phase 14B/evidence migrations applied successfully to **meki_staging**, and Prisma reported all **15 migrations** up to date. No applied migration was reset or replayed. The final checks did not run any production migration or reset any database.

Release-candidate review found no real environment files, private keys, dumps, logs, private uploads, proprietary client resources or browser artifacts in the commit candidate set or tracked file paths. High-confidence credential-pattern scanning found **0 findings**. Temporary QA certificates, browser snapshots, credentials, logs, local storage and backups remain ignored. Generated OpenAPI/client files are intentional source contracts, not test artifacts.

All collection and approval defaults remain disabled. Local staging verified zero payable programmes and no live Gala-only collection. No production secrets/environment files were edited; no production database was accessed. No Git staging, commit, push or production deployment was performed.

## 7. GitHub readiness and release freeze

**Ready for developer review and commit.** The exact proposed **163-file** set is `docs/65-phase14b-release-files.txt`; it includes all preserved phase changes, required migrations, source contracts and release docs. Its SHA-256 is `C42F55E1D49AD260375756CBEAA1D9FBD3B2FEDA9D7E1573902A37D281D944F8`. The Git index remains untouched. Do not stage ignored QA artifacts or proprietary resources.

Lockfile SHA-256: `D0A65E05E3EC25602CBAC79EB671C351DA0C55C66F8CD2B62E0C1C3D2279F096`.

The developer must confirm the intended GitHub remote/private repository and its deployment policy before pushing. No push permission or production deployment is inferred from this report.

## 8. Deployment readiness

**Code/configuration ready for a developer-operated VPS/Vercel release with collection disabled. Not deployed.** Use docs 54 and 63 and `deploy/vps/`. The supplied VPS is **138.197.198.151**, Ubuntu 24.04.5, native MySQL 8.0.46, Nginx 1.24, Node 24, pnpm 10 and PM2 7. Keep Node 24: installed dependency engines support it, the build/test host uses it, and native API startup was verified. Docker is not required or to be installed on the VPS.

The final native-VPS template explicitly sets `API_BIND_HOST=127.0.0.1`. Nginx uses HTTP/2 listen syntax supported by 1.24. A real API DNS hostname, certificate, storage ownership, application/migrator database accounts and a **verified production backup/restore path** remain operator release steps. Apply only reviewed `prisma migrate deploy` migrations after backup; retain the prior application release and additive schema for rollback.

Website Vercel environment must use the confirmed HTTPS API URL. Admin must have the confirmed `ADMIN_API_UPSTREAM` origin **before rebuilding**. Verify health and login through the admin origin, Secure/HttpOnly cookies, CSRF, CORS, uploads and permission restrictions after deployment. The earlier production Admin login 404 is **not claimed fixed**: only the local proxy/login was verified. Prior Vercel project inspection returned 403 for the connected team scope; no hosted project configuration was changed. The developer will handle hosting access and release separately.

## 9. External SDI/MEKI dependencies

1. Authentic original SDI confirmation email sample and a validated exact matching procedure, including trustworthy unique ID/reference/money/source fields, authorized mailbox access and protected evidence retention. If insufficient, use PENDING_REVIEW and obtain the official report.
2. SDI confirmation that EB/DN reference questions are required and appear in exports; verification of the real ticket form's USD 500 price/capacity 350; an actual Gala report sample for a verified mapping and controlled live handoff/reconciliation tests.
3. MEKI/SDI written Gala project/Project Plan/public-fundraising authorization and closing date, approved legal/public copy and explicit approval for each collection switch before activation.
4. Only if Zakat is later requested: designated MEKI religious/finance authority decision, SDI written acceptance, approved actual target eligibility and separate two-person authorization. Zakat stays disabled and does not block a Sadaqah-only disabled-payment release.

The unrelated campaign Excel report does not satisfy the email dependency. No general or programme-restricted fundraising authorization is inferred from Gala approval.

## 10. Next commands — developer only, after review

These commands were **not executed**. Review the manifest and diff first; do not use `git add .` or force-add ignored files.

```powershell
git status --short
git diff --check
git diff --stat
Get-Content docs/65-phase14b-release-files.txt
git switch -c release/phase14b-2026-11-21
git --literal-pathspecs add --pathspec-from-file=docs/65-phase14b-release-files.txt
git diff --cached --check
git diff --cached --stat
git status --short
# After reviewing the staged diff and confirming the intended GitHub target:
git commit -m "Complete Phase 14B Gala-only journeys and secure SDI evidence review"
git push -u origin release/phase14b-2026-11-21
```

`--literal-pathspecs` preserves Next.js `[locale]` paths exactly. Confirm the repository's Vercel/Git automation behavior before the push; the developer controls deployment separately. Do not enable any collection or manual-approval switch as part of release publishing.
