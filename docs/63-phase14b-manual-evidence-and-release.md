# Phase 14B — Gala-only launch and private SDI evidence

Date: 2026-11-21. This document supplements docs 54 and 59–62. Historical QA results in those documents are not current release evidence. Current results are recorded in doc 64.

## Recovery and scope

The recovered tree contained uncommitted Phase 12B fundraising/legal-copy changes, Phase 13 website and infrastructure changes, Phase 14 donation intents/Zakat/importer changes, and partial Phase 14B programme-interest changes. They were preserved. No reset, clean, database reset, production migration, secret update, commit or push was performed.

Phase 14B already had the API consent gate, nullable programme-interest fields and immutability migration, donation form routing helpers, EN/AR disclosures, and API integration fixtures. The handoff stopped around global Give routing and admin interest display. Completion adds CTA regression coverage, missing Arabic dialog copy, admin interest display and a private manual evidence workflow.

## Public journeys

Header, footer, hero, cards, quick giving and mobile Give controls use the existing DonateProvider. Authorized hosted journeys lead to `/[locale]/give#prepare`, carrying programme slug and amount where selected. Disabled journeys explain availability and link to the preview. A programme is an interest, not a restricted fund.

Gala booking links lead to `/[locale]/events/gala-night/book`, including when closed: the page explains why booking is unavailable and provides navigation. Authorized booking saves the existing pending booking and EB reference before the hosted handoff. The expected ticket price remains USD 500, capacity 350, date December 12, 2026, 3:30–8:30 PM America/New_York. Existing database configuration must be checked through admin; create-only seeds do not overwrite it.

Gala donation links always lead to `/[locale]/events/gala-night/donate`. The former direct-form fallback was removed so a payable MEKI journey cannot bypass DN reference creation. The donation form stays preview-only until all gates pass. SDI owns official tickets, QR codes, check-in and tax receipts.

The two supplied form URLs are:

- Ticket: `https://www.zeffy.com/en-US/ticketing/misr-el-kheir-foundation-gala-new-york`
- Donation: `https://www.zeffy.com/en-US/donation-form/misr-el-kheir-foundation-gala-new-york-donation`

These are operator configuration values, not proof that the reference questions exist. No query-prefill behavior is assumed. Returns from Zeffy never confirm payments.

Gala-only redirects require explicit donor acceptance. The saved type is GALA_DONATION and allocation is the approved Gala project; source interest and disclosure acceptance remain separate and immutable. Existing restricted intents are never repurposed. Zakat still needs the separate switch, confirmed Donation Type question and two-admin approved eligibility for the actual Gala project. Nothing is eligible by default.

## Private manual evidence

Admin navigation: **Donors → SDI payment evidence** (`/[locale]/payments/sdi-evidence`). Links are also available from hosted booking and giving detail pages to authorized finance staff.

The API is `/api/v1/admin/sdi/payment-evidence`:

1. GET lists the latest 100 requests, filtered by exact EB/DN reference and review state; reports whether approval is enabled.
2. POST submits immutable evidence against a pending hosted Gala donation or Zeffy booking. It never changes payment status.
3. POST `/:id/decision` records a second-admin rejection or, only after the disabled-by-default gate is deliberately authorized, approval.

Reading/submitting requires `sdi.reports.upload`. Decisions require **both** `sdi.reports.upload` and `sdi.reports.approve`. Existing Finance Manager can submit; an Administrator with both permissions can review. Self-review is refused, including Super Admin self-review.

Capture the selected MEKI reference separately from the reference found in original evidence, external order ID, paid amount/currency, payment timestamp with timezone, exact approved form URL, donation classification, original Message-ID, sender, authorized recipient, received timestamp, protected archive reference and review reasoning. Attachments remain in the finance-controlled original-email archive; the API accepts only an opaque `sdi-evidence:...` reference. No public upload/media link is accepted or rendered. No card credentials or email body is requested.

Missing fields or lack of an original SDI email attestation leave the evidence PENDING_REVIEW. Complete submissions await second-admin approval. Supplied mismatches are rejected. A donor screenshot, donor forward, edited email text or manually entered details alone cannot authorize a payment. Reject and resubmit corrections; there is no edit/delete endpoint. Database triggers preserve evidence contents and finalized decisions, and prohibit deletion. Evidence submission/decisions are audited without exposing email metadata in donor-visible history.

**Current external dependency:** the user confirmed there is no authentic SDI confirmation email sample. The unrelated campaign Excel report is not an email sample. `SDI_MANUAL_CONFIRMATION_ENABLED` therefore remains **false** in defaults and templates. Do not enable it until SDI/MEKI have validated the real template, trustworthy unique ID, exact reference/money/source matching procedure, authorized mailbox and protected archive, and trained independent finance reviewers. The system cannot authenticate an email from typed metadata; the validated procedure and two reviewers must inspect the retained original. If the original lacks sufficient unique matching information, use PENDING_REVIEW and obtain the official report.

Future gated approval uses a serializable transaction, revalidates evidence and current intent, reserves the same `(sdi_report, external order ID)` unique provider record as the importer, and conditionally advances the payment once. Ticket approvals reuse the existing booking payment pipeline and ledger; no official ticket is issued. Duplicate approvals replay idempotently; competing claims conflict. Verified financial history has no manual edit endpoint. Synthetic/test targets are refused in staging/production. Classification, destination consent and donor intention remain unchanged.

## Official report reconciliation

The CSV/XLSX importer remains available with its existing real-sample mapping and second-admin application requirements. It shares the unique order and entity registry with manual verification. Later equivalent reports are ALREADY_APPLIED and cannot create another payment. Their approved application records `reportReconciledAt` and `reportImportId` on the original evidence without replacing the original email verification source. Preview alone does not reconcile it.

Later reference, money, classification, fund-scope or status conflicts remain report-row exceptions; a verified donation is not downgraded. Unmatched report rows remain in the existing importer exception queue. The original submission/reviewer/approver/time remain available in the private queue and audit log.

Keep these concepts distinct: donor intent; verified payment; matching by a later official report; allocation authorization; payout/settlement. A manually verified donation uses existing VERIFIED/PAID states but has no `reconciledReportId`; the evidence queue separately shows whether an official report has reconciled it. Allocation stays pending authorization; its decision cannot be made by the payment approver. Payout stays NOT_REPORTED. No bank settlement is inferred.

## Independent authorization switches

Every financial switch defaults OFF. No actual `.env` was edited.

| Journey | Required authorization/configuration |
|---|---|
| Ticket handoff | SDI/MEKI launch approval, `GALA_TICKETING_MODE=zeffy_hosted`, `GALA_HOSTED_SALES_ENABLED`, official `ZEFFY_GALA_TICKET_FORM_URL`, published approved event, admin sales enabled, capacity available; verify required EB question and export before launch |
| Gala donation intents | Approved Project Plan/project, public fundraising approval and open closing date; `SDI_GALA_GIVING_ENABLED`, official `ZEFFY_GALA_GIVING_FORM_URL`, `SDI_DONATION_REFERENCE_CONFIRMED` after verifying question/export |
| Programme/general interest → Gala offer | All Gala donation gates above plus `GIVING_GALA_ONLY_MODE=true`, `GIVING_GALA_EVENT_SLUG=gala-night`, explicit donor acceptance |
| Manual confirmation | `SDI_MANUAL_CONFIRMATION_ENABLED=false` until authentic email/procedure/archive verification; independent second-admin finance review required thereafter |
| Official report application | `SDI_REPORT_APPLY_ENABLED`, verified real-sample mapping, different approver; unchanged |
| Zakat | Separately approved religious/finance authority decision + SDI acceptance, two-admin target eligibility, `SDI_DONATION_TYPE_CONFIRMED`, `ZAKAT_GIVING_ENABLED`; remain OFF |

Leave GENERAL_GIVING_AUTHORIZED, PROGRAMME_GIVING_AUTHORIZED, SDI_GENERAL_GIVING_ENABLED, SDI_PROGRAMME_GIVING_ENABLED, SDI_PROGRAMME_DESIGNATION_CONFIRMED and legacy PAYMENTS_ENABLED OFF. A Gala-only launch does not authorize six-programme or unrestricted fundraising. Legacy checkout and automatic hosted confirmation remain refused in staging/production.

## Production deployment checklist and commands

Use the native Ubuntu/MySQL/PM2/nginx instructions in doc 54 and the templates in `deploy/vps`; Docker is only the local staging rehearsal. The production API host and accessible SSH target must be identified before execution. Do not substitute guessed hostnames.

1. Keep the provisioned Node 24 runtime and pnpm 10. Local checks run on Node 24.21.0 and the installed dependency engines support it; the local Docker API image additionally builds on Node 22. Run fresh relevant tests, typechecks, lint and builds. Package the complete preserved working tree into a reviewed release; an old remote commit will omit these uncommitted files.
2. Create a new `/srv/meki/releases/<release>` directory as in doc 54, install frozen dependencies, and build API. Keep the prior release and secure configuration copy for rollback.
3. As root run `/usr/local/sbin/backup-meki`. Verify dump completion, table/trigger inventory, storage archive and SHA256SUMS, and verify restoration into a separate recovery database before migration. Keep an off-host copy. Never overwrite/reset production to test restore.
4. Supply the migrator credential through the operator's secure process environment. From the new release's `apps/api` run `pnpm exec prisma migrate status`, then `pnpm exec prisma migrate deploy`, then status again. Never use migrate dev/reset/db push. Pending Phase 12B/14/14B migrations must be reviewed too, not just the newest evidence migration. The evidence queue and its guards are separate additive migrations (`20261122200000`, `20261122210000`).
5. Run the create-only baseline/permission seed when new versioned grants are needed; review output. Do not run development account seeds. Verify new tables and evidence/classification/interest triggers.
6. Verify `/etc/meki/api.env` ownership root:meki 0640, app DML account, loopback bind, private storage owner/mode, media permissions, secure token secrets, HTTPS API_PUBLIC_URL/WEB_URL and exact CORS origins. Keep every collection/approval flag OFF.
7. Switch `/srv/meki/current` to the new release, then `pm2 startOrReload /srv/meki/current/deploy/vps/ecosystem.config.cjs` and `pm2 save`. Verify health/live and database readiness. PM2 remains single-instance; nginx exposes HTTPS only, not 3306/6666 or private evidence storage.
8. Install the hostname-specific nginx config, validate with `nginx -t`, provision/renew HTTPS using certbot, then reload. Do not enable a TLS server block referencing nonexistent certificates before certificate issuance; use an HTTP ACME-only bootstrap server first if this is a fresh hostname.
9. Website Vercel: set NEXT_PUBLIC_API_URL and API_INTERNAL_URL to `https://<confirmed-api-host>/api/v1`; NEXT_PUBLIC_SITE_URL to the confirmed public origin. Admin Vercel: set `ADMIN_API_UPSTREAM=https://<confirmed-api-host>` for each intended environment. Rebuild both; the admin rewrite is compiled at build time. Keep API allowed origins aligned.
10. Verify admin-origin `/api/v1/health` is 200, invalid login is JSON 401 (not 404), actual admin login/session/logout and first-login password change, CSRF, Secure/HttpOnly cookie, media/report upload, permission restrictions and private evidence queue with final approval disabled. Run `node deploy/staging/smoke.mjs` with explicit API_URL, ADMIN_URL, WEB_URL only against an authorized rehearsal target; its fixtures create operational test records, so review before using on production.
11. Run read-only production health/default-gate checks and desktop/mobile EN/AR pages after release. Record the exact URLs/build IDs and results. Do not claim the prior production admin-login 404 fixed without these checks.

Rollback application by restoring the prior release symlink and reloading PM2; restore prior Vercel deployments using the confirmed project dashboard/CLI. Leave additive schema in place. Data recovery uses the verified separate restore database and coordinated write freeze in doc 54; never attempt destructive down migrations. Record any post-backup writes requiring SDI reconciliation.

No production database backup or production target access was verified during local implementation. The subsequently supplied VPS IP is 138.197.198.151; its API DNS hostname and operator access remain unverified. The final completion instruction explicitly prohibits deployment and Git mutations: the developer performs those separately. Production release and live payment tests must not be claimed from local results.
