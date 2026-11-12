# 11 — Landing Page ↔ API Integration (Phase 4)

## How content flows

- `apps/web/src/lib/content.ts` makes one server-side request for each locale (`GET /public/home?locale=…`), cached by ISR for 300 s.
- It overlays the published content onto the built-in dictionaries (`content/en.ts`, `content/ar.ts`) **field by field**. The section components are unchanged and still receive the same `t` object.
- Fallbacks are layered:
  - API unset, unreachable, slow (4 s timeout) or returning an error → the built-in copy is used.
  - An empty field → the built-in value for that field.
  - A fixed-layout list (trust points, verbs, steps, 9 programmes, 3 enabling functions, 4 figures, gallery, navigation) is replaced **only when the item count matches**.
- Campaigns: approved, published campaigns from the API replace the preview cards. While none are approved, the preview cards stay as they are today.
- FAQ accepts any number of published questions.
- Images: curated `/images/work/<key>.webp` URLs map back to local assets. Uploaded Media Library URLs are rendered from the API origin (`next.config.ts → images.remotePatterns`).
- Not reflected on the landing page:
  - Section **reordering** (the layout and animations have a fixed order).
  - Section **hiding** (hidden or unpublished sections fall back to the built-in copy).
  - Site contact details (the footer component has no field for them yet).

## Donation flow (browser)

1. `DonateProvider` loads `GET /public/donations/config` (no cache).
   - If the call fails, or `paymentsEnabled=false`, the original preview dialog is shown, exactly as on the current site.
2. `QuickDonate` uses the backend's currencies, suggested amounts, min/max and whether monthly giving is allowed. Destinations are the general fund, each programme, and any live campaign that is accepting donations.
3. The dialog's details step sends `POST /public/donations` with an `Idempotency-Key`. One key is used per dialog opening, so retries and double-clicks create a single donation.
4. It then calls `POST /public/donations/:ref/payment-session` and redirects to the provider's `checkoutUrl` (http/https only).
5. The access token is kept in **sessionStorage for that tab only**. It never appears in URLs, cookies, logs or `NEXT_PUBLIC_*` config, and is sent only in the `X-Donation-Token` header.
6. `/[locale]/donation/return?reference=…[&cancelled=1]` polls `GET …/status`. It shows success **only when `confirmed=true`**, which comes from a verified provider webhook. The page offers retry after a failure or cancellation, and opens the receipt with the token in a header.

The integration is provider-independent: the web app only follows `checkoutUrl` and reads status. A real gateway requires no web changes.

## Development: mock payment flow

```sh
# API with the dev-only mock provider (never in staging/production)
PAYMENTS_ENABLED=true PAYMENT_PROVIDER=mock pnpm --filter @meki/api start
# then, as an admin: enable the mock provider and payments
#   PATCH /api/v1/admin/payments/providers/mock   { "isEnabled": true }
#   PATCH /api/v1/admin/settings/donation         { "paymentsEnabled": true, "allowRecurring": true }
# web (apps/web/.env.local: NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1)
pnpm --filter @meki/web build && pnpm --filter @meki/web start
```

- The mock provider's checkout page (`/api/v1/dev/mock-checkout/:session`) is labelled **TEST MODE** and offers simulated success, decline and cancel. Each outcome goes through the signed-webhook pipeline.
- Every resulting record is `isTest`, receipts use the `TEST-` series, and the UI shows test banners.

## API client

`packages/api-client`:
- Request types are generated from `openapi.json`: `pnpm --filter @meki/api openapi:export && pnpm --filter @meki/api-client generate`.
- Public response types are hand-maintained in `src/public.ts`, because the OpenAPI document does not declare response schemas yet.
