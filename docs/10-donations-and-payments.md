# 10 — Donations & Payment Architecture (Phase 3)

Code: `apps/api/src/modules/donations`. Migrations: `20261106180000_phase3_donations` and `20261106190000_phase3_idempotency_hash`, both additive. **No real gateway is integrated, and live payments are not enabled.**

## 1. Activation: every condition must hold

1. Server env: `PAYMENTS_ENABLED=true`, an implemented `PAYMENT_PROVIDER`, its credentials, and a `DONATION_TOKEN_SECRET` of at least 32 characters.
2. Admin enables the provider record: `PATCH /admin/payments/providers/:code`. This is refused unless the provider is configured on the server.
3. Admin enables payments: `PATCH /admin/settings/donation { paymentsEnabled: true }`. This is refused unless steps 1 and 2 are done.
4. The currency is enabled (`PATCH /admin/payments/currencies/:code`).
5. For campaign donations: the campaign is published, approved, not DEMO, `donationsOpen` is on, it is within its dates, and its programme is published.

The `mock` provider exists only in development and test. Env validation rejects it in staging and production. It never moves money, its checkout URL is `mock://…` (not a real page), and every record it creates has `isTest=true`. Reports exclude test records unless you pass `includeTest=true`.

## 2. Amount format (API contract)

- **Requests:** amounts are **decimal strings**, for example `"50"` or `"50.25"`. JSON numbers are rejected. Up to 3 decimals are accepted, further limited by the currency's ISO 4217 minor units (USD 2).
- **Responses:** amounts are strings fixed to the currency's minor units, for example `"50.00"`.
- **Storage:** `Decimal(18,3)`. All arithmetic uses `Prisma.Decimal`; floats are never used.
- Every amount is stored in its **original currency**. Settlement amount, settlement currency and exchange rate are separate, provider-reported columns on the ledger. Nothing is ever converted, and totals are always **per currency**.

## 3. Models

| Model | Purpose |
|---|---|
| `Donor` | Guest donor. One record per guest donation; records are **never merged by e-mail**. Linking needs reliably established identity (future verified portal). |
| `Donation` | The intent. Has a public reference (`DN-…`), a hashed access token, an idempotency key + request hash, `status` and `paymentStatus`, and `refundedAmount`. |
| `DonationAllocation` | Where the money goes (general fund / campaign / programme). One per donation now; the model allows splits later. |
| `RecurringDonation` | Monthly agreement: provider agreement ref, next billing date, failed-attempt count, retry limit. |
| `PaymentAttempt` | One per checkout session, with provider session and payment refs. |
| `PaymentTransaction` | **Append-only ledger** of verified events: authorization, capture, failure, cancellation, refund. Database triggers block UPDATE and DELETE. |
| `PaymentWebhookEvent` | Stored provider events, `UNIQUE(provider, providerEventId)`, with status, attempts and last error. |
| `Refund` | Request → approval → execution → provider result. |
| `DonationReceipt` + `ReceiptSequence` | Frozen snapshot plus a gap-free yearly number. Test receipts use a separate `TEST-` series. |
| `Currency`, `PaymentProvider` | Admin-managed capability and activation records. They never hold credentials. |

Deleting donations, allocations, refunds and receipts is blocked by database triggers.

## 4. Lifecycles

**One-time donation**

1. `POST /public/donations` (requires an `Idempotency-Key`) creates the donation as `PENDING` / `UNPAID` and returns the reference and access token **once**.
2. `POST /public/donations/:ref/payment-session` creates an attempt and returns the provider checkout URL. An open attempt is reused.
3. A **verified** `payment.succeeded` event moves the donation to `COMPLETED` / `PAID`, appends a CAPTURE row to the ledger, issues a receipt and notifies the donor.
4. `payment.failed` moves it to `FAILED`. The donor can open a new session, which returns the donation to `PENDING`.
5. The return page (`/confirmation`) only displays the status. It never confirms payment.

**Payment status:** `UNPAID → AUTHORIZED → PAID → PARTIALLY_REFUNDED → REFUNDED`, with `FAILED` possible.

Transitions use conditional updates inside a database transaction.

**Recurring donation (monthly)**

1. The first payment carries the provider agreement. A verified success that matches the stored agreement ref moves the agreement from `PENDING_ACTIVATION` to `ACTIVE` and sets `nextBillingDate`.
2. Each `subscription.charge.succeeded` creates a new `COMPLETED` donation with an attempt and a ledger row. A charge reference that has already been seen is ignored.
3. `subscription.charge.failed` records a `FAILED` donation (for history, never counted) and moves the agreement to `PAST_DUE`.
4. When failures exceed `RECURRING_MAX_RETRY_ATTEMPTS`, the agreement becomes `FAILED` and is cancelled at the provider.
5. Admins can pause, resume or cancel. Each action is applied only after the provider call succeeds, and is refused if the provider doesn't support it.
6. MEKI never triggers charges itself. `RecurringService.sendUpcomingReminders()` is a hook for a future scheduler.

**Refund**

1. `REQUESTED` (`refunds.request`).
2. `APPROVED` or `REJECTED` (`refunds.approve`; the approver must be a different person from the requester).
3. `PROCESSING` (`refunds.execute` sends it to the provider).
4. `SUCCEEDED` or `FAILED`, set **only** by a verified provider event.

Refund amounts are checked against the refundable balance (paid − refunded − pending). Partial refunds are allowed only if the provider supports them. The original donation and ledger are never rewritten.

## 5. Webhook security

1. The signature is verified on the **raw body**, with a constant-time compare and a 5-minute timestamp tolerance (mock adapter: HMAC-SHA256).
2. The event is stored under `UNIQUE(provider, eventId)`. A duplicate delivery is acknowledged without being applied again.
3. Processing happens in a database transaction and must match **our** attempt/refund/agreement reference, the stored provider session/refund/agreement ref, and the **exact amount and currency**. A mismatch is stored as `FAILED` (`REJECTED: …`) and acknowledged, so the provider stops retrying and the event stays visible for review.
4. Unexpected errors are stored as `FAILED` (`TRANSIENT: …`) and return 503, so the provider retries. Admins can also retry (`payments.manage`).
5. Ledger uniqueness `(provider, ref, type)` stops a second capture even if a duplicate gets past step 2.
6. A capture for a donation that is already paid is recorded but not counted, and flagged `REVIEW` for a refund.
7. Queue-ready: `WebhooksService.process(eventId)` is the unit a future worker calls.

## 6. Receipts

- Bilingual HTML template (Arabic right-to-left), with all content escaped.
- A PDF renderer port exists; requests for PDF return `501` until a renderer with Arabic text shaping is chosen.
- Issuer name, tax ID label/value and footer text are configurable on `DonationSetting` and **empty by default**. The template makes **no tax-deductibility claim**.
- Regenerating a receipt voids the old one and issues a new number linked to it. Donors can view their receipt using their access token.

## 7. Security fixes from the Phase 1 + 2 review

- Media storage keys use `crypto.randomBytes(12)`. URLs keep the same shape: `/media/<key>`.
- `/media/*` is now served by a controller, not a static file handler:
  - Unknown, deleted or non-local files return **404**.
  - The consent policy comes from `MEDIA_PUBLIC_CONSENT_MODE`.
  - Admins with `media.read` can preview any non-deleted file (`Cache-Control: private, no-store`).
  - Curated website images in `apps/web/public` are unaffected.
- `LOGIN_RATE_LIMIT_PER_MINUTE`, `MEDIA_MAX_UPLOAD_MB` and `DONATION_RATE_LIMIT_PER_MINUTE` are now read from validated config.
- `TRUST_PROXY` is validated: it accepts a hop count or a subnet list, and rejects `true`.
- Rate-limit storage is pluggable through `createThrottlerStorage`. `RATE_LIMIT_STORE=redis` deliberately fails fast until a Redis adapter (for example `@nest-lab/throttler-storage-redis`) is installed.

**Image consent — needs client approval:** the default `MEDIA_PUBLIC_CONSENT_MODE=not_denied` keeps today's behaviour. Uploaded images with consent `UNKNOWN` stay public; only `NOT_GRANTED` and deleted images are hidden. MEKI should decide whether production should switch to `confirmed_only`, which publishes an uploaded image only after consent is recorded as `CONFIRMED`.

## 8. Client decisions still needed

1. Payment provider and merchant account (implement a `PaymentProviderAdapter`, register it, add env vars).
2. Approved currencies, suggested amounts and min/max per currency. EUR, GBP and EGP are seeded **disabled**.
3. Whether monthly giving is offered (`allowRecurring` defaults to false) and the retry policy.
4. Legal and receipt wording: issuer legal name, tax identifier, footer, tax status. Also whether receipts are needed for test or partial-refund cases.
5. Refund policy and who approves refunds.
6. Privacy notice version, donor data retention period, and the erasure process (`donors.anonymize` keeps financial records).
7. E-mail/SMS provider for donor notifications (currently logged by reference only).
8. KYC/AML/sanctions screening requirements before live collection (from the former contractor's brief; still undecided).
9. Image consent mode (see section 7).
