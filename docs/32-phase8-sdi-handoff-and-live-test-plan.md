# 32 — Phase 8: SDI handoff and live-test plan

Date: 2026-11-18. For Spring of Dignity International (SDI), MEKI and the MEKI development team. Technical background: [31](31-phase8-zeffy-integration-implementation.md).

**What is ready.** MEKI can securely receive Zeffy webhooks, read SDI's payments through the Zeffy API, and match them to MEKI Gala bookings without guessing. Card data is never involved; payments go only to SDI.

**What is missing.** MEKI cannot sell Gala tickets through Zeffy yet. Two things are needed from SDI:

1. **Credentials and identifiers** (items 1–7).
2. **A reliable way for a MEKI booking reference to reach the Zeffy payment** (item 10).

## Secure transmission (please read first)

- **Never** send the API key or the webhook signing secret by ordinary e-mail, chat or document.
- Use an encrypted channel agreed with MEKI's technical lead, such as a password manager share or an end-to-end encrypted message with the password sent over a different channel.
- Each secret is entered only in the hosting secret store, never in source code.
- SDI can **regenerate** both secrets at any time in Zeffy → Settings → Integrations. Generating a new API key invalidates the old one immediately.

## Information SDI must provide

**How to read the "Blocks" column:**

| Code | Meaning |
|---|---|
| WEB | Public informational website launch |
| DON | General donations through SDI |
| SALES | Paid Gala ticket sales |
| REC | Payment reconciliation in MEKI |
| TIX | MEKI ticket issuance |
| REF | Refund processing |

| # | Item | Why | Blocks |
|---|---|---|---|
| 1 | **Approved Gala ticket form URL** (Zeffy ticketing campaign) | Where buyers pay; needed for the host allow-list | SALES |
| 2 | **Approved general donation form URL** | Donate links on the MEKI site | DON |
| 3 | **Approved Gala giving form URL**, if separate (one-time / monthly Gala gifts) | Gala giving section | DON |
| 4 | **Read API key** (organization owner generates it in Settings → Integrations → API Key), sent securely | MEKI reads payments to verify bookings and recover missed notifications | REC, TIX, REF |
| 5 | **Webhook signing secret**, sent securely | Authenticates every notification | REC, TIX, REF |
| 6 | **Webhook registration:** add MEKI's endpoint `https://<MEKI API host>/api/v1/integrations/zeffy/webhook` and subscribe to `payment.completed`, `payment.updated`, `payment.deleted` (MEKI provides the host at go-live) | Real-time notification | REC, TIX, REF |
| 7 | **Zeffy campaign IDs:** the Gala ticketing campaign, the donation forms and the Gala giving form (from the campaigns list or the admin) | Only payments on these campaigns are considered | SALES, REC |
| 8 | **Refund practice:** who issues refunds (SDI in Zeffy), whether partial refunds are possible, and confirmation that refunds trigger `payment.updated` | MEKI reconciles refunds; partial refunds go to manual review | REF |
| 9 | **One real, redacted example** of a ticket payment and a refunded payment, as returned by `GET /api/v1/payments/{id}`. Remove names, e-mails and addresses; keep the structure, `items`, `buyer_questions`, amounts and tip handling | Confirms the item structure (one item per ticket?), whether `amount` includes the optional Zeffy tip, and the status strings | SALES, TIX |
| 10 | **Booking-reference mapping (critical).** How a MEKI booking reference (e.g. `EB-7K3QX9M2PA4T`) reaches the Zeffy payment. Options below. | Without it a payment cannot be tied to a booking safely, and automatic confirmation stays off | SALES, TIX |
| 11 | **Ticket issuance ownership:** MEKI issues individual QR tickets per guest today, while Zeffy also issues tickets for ticketing campaigns. Who is authoritative at the door? | Avoids two conflicting tickets per guest | SALES, TIX |
| 12 | **Allowed checkout domains** (e.g. `www.zeffy.com`) for MEKI's redirect allow-list | MEKI only redirects to approved hosts | SALES, DON |
| 13 | **Small live payment and refund test:** date, amount, who pays, who refunds (procedure below) | No sandbox exists | SALES (go-live) |
| 14 | **Receipt and fair-market-value rules** for tickets: SDI's wording, whether any part of USD 750 is tax-deductible, and how Zeffy's `eligible_amount` should be presented. MEKI shows no deductible amount today | Accurate public wording | SALES |
| 15 | **Linked vs embedded forms:** any restriction on embedding Zeffy forms in MEKI pages (MEKI currently plans links) | Page design and allow-list | DON, SALES |

None of these items blocks the **public informational website**. Its blockers are in doc [30](30-meki-launch-blockers-and-client-requirements.md) §1.

## Item 10: options for the booking-reference mapping

The documented Zeffy payment object has no field for a merchant reference: `metadata` is "reserved for future key-value pairs".

| Option | How it works | Trust level | MEKI work |
|---|---|---|---|
| **A. Custom question on the ticket form** (recommended to evaluate first) | SDI adds a required text question "MEKI booking reference" to the Gala ticket form. MEKI shows the buyer their `EB-…` reference before redirecting. Zeffy returns the answer in `buyer_questions` | Medium: the buyer types it. MEKI also requires campaign, amount, currency, status, ticket count and single-use checks (all implemented) | Ready; only the question title must be confirmed. Ideally SDI/Zeffy confirm whether the answer can be **pre-filled from the link** (not documented) |
| **B. Zeffy-supported pre-fill or URL parameter** | Zeffy fills the reference automatically | High, if Zeffy confirms it is returned unchanged | Small change once documented |
| **C. Zeffy `metadata` when released** | Zeffy stores a merchant key-value pair | High | Small change once released |
| **D. Manual review only** | MEKI shows matches; an authorised person verifies each one before confirmation | High, but labour-intensive | A reviewed-confirmation action would be built in 8B. Today MEKI has **no** "mark paid" button by design |

**MEKI's position:**

- Until SDI confirms A, B or C in writing and the live test passes, automatic confirmation stays **off**. MEKI's configuration refuses to switch it on in production.
- Payments without a usable reference are kept for review. They are never matched by e-mail, name or amount.

## Live-test plan (with SDI; no sandbox exists)

**Prerequisites:**

- Items 1, 4–7, 9, 10 and 12 delivered.
- The MEKI staging environment deployed with the `ZEFFY_*` secrets.
- `ZEFFY_GALA_AUTO_CONFIRM=false`.
- Admin → SDI / Zeffy shows "Connected".
- The webhook is registered.

**Steps:**

1. **Connectivity:** Admin → SDI / Zeffy → status shows API "Connected" and webhook secret "Configured".
2. **Test booking:** create a booking on staging for **1 guest** (lowest amount SDI agrees to; the Gala ticket is USD 750 unless SDI configures a test rate).
3. **Pay:** pay on SDI's form with a real card owned by the tester, entering the booking reference as agreed in item 10.
4. **Within minutes:**
   - a verified `payment.completed` appears (Admin → status → last verified delivery)
   - the provider payment shows **MATCHED** with all rules passed
   - the booking is still pending, because automatic confirmation is off
5. **Rehearse confirmation:** decision by MEKI and SDI. Enable confirmation in staging only, or apply the reviewed path once built. Expect one ticket per guest, PDF/e-mail jobs, and a single ledger capture.
6. **Duplicates:** check that duplicate deliveries changed nothing. In Zeffy the delivery log shows retries; in MEKI there is one event per event ID.
7. **Refund:** SDI issues a **full refund** in Zeffy. Expect `payment.updated`, then MEKI re-reads the payment. The refund shows on the provider record and the booking moves to review or to REFUNDED, depending on the confirmation mode.
8. **Reconciliation:** run Reconcile now (7 days) and check that nothing duplicates and the counts are correct.
9. **Record the evidence:**
   - redacted payment JSON
   - MEKI admin screenshots
   - audit-log entries
   - both organisations' sign-off
10. **Clean-up:** revert any staging-only setting and document the result in doc 31.

**Abort criteria.** Stop the test if any of these happen:

- a signature failure on a genuine delivery
- an amount different from the booking (e.g. a tip included)
- a missing or unexpected reference
- any second capture

Then capture the redacted payload and adjust the rules **before** retrying.

## What would allow Phase 8B to start

**Required:**

- Items **4, 5, 6, 7** (credentials, webhook, campaign IDs).
- Item **9** (redacted real examples).
- A written decision on item **10** (reference mapping) and item **11** (ticket ownership).

**Phase 8B scope:**

- verification against real data
- the hosted-form handoff on the website (redirect with the approved allow-list, booking reference shown to the buyer)
- a reviewed-confirmation action if option D is chosen
- donation import rules
- the live test above

Ticket sales open only after the live test passes and MEKI and SDI approve sales (doc 30, M12).

## Commands (MEKI team)

1. **Run the tests:**
   - API (test DB only): `cd apps/api && npx jest --runInBand`
   - Zeffy unit tests only: `npx jest --selectProjects unit --testPathPatterns zeffy`
   - Zeffy integration tests only: `npx jest --runInBand test/zeffy.e2e-spec.ts`
2. **Validate the workspace:** `pnpm turbo run typecheck lint build --force --concurrency=1`. Stop `nest start --watch` first, or restart it afterwards (doc 31 §11).
3. **Apply the migration:** `pnpm --filter @meki/api db:migrate:deploy`, after a database backup.
