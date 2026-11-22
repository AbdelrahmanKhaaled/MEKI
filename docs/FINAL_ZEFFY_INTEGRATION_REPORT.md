# FINAL — Zeffy integration report

**Date:** 2026-11-22 · **Base:** `6b37e9c` plus the uncommitted final-release changes · **Status keys:** PASS / FIXED / BLOCKED_EXTERNAL / FAIL / NOT_APPLICABLE

SDI (MEKI's fiscal sponsor) owns the Zeffy organization. MEKI never takes card payments, never holds a Zeffy credential today, and never marks anything paid from a browser redirect.

## 1. The two official forms

| Form | Exact URL (client-supplied) | Where used |
|---|---|---|
| Gala tickets | `https://www.zeffy.com/en-US/ticketing/misr-el-kheir-foundation-gala-new-york` | `/{en,ar}/events/gala-night/book` |
| Gala donation | `https://www.zeffy.com/en-US/donation-form/misr-el-kheir-foundation-gala-new-york-donation` | `/{en,ar}/events/gala-night/donate` |

Both URLs are fixed constants in `apps/web/src/lib/official-forms.ts`. A guard (`isOfficialZeffyUrl`) also accepts only https URLs on `www.zeffy.com` with no credentials, query, fragment or port.

## 2. Why the deployed pages said "not available" — diagnosis

| Page | Message | Root cause |
|---|---|---|
| `/en/events/gala-night/book` | "Ticket booking is not available yet." | `BookingFlow` reads `GET /api/v1/public/events/gala-night/ticketing` in the browser. On the deployed site the API was unreachable, so the page fell back to the closed state. With the API up, the result is the same by design: the event is not published or approved, sales are closed, and `GALA_HOSTED_SALES_ENABLED=false`. |
| `/donate` → Gala | "Gala giving is not open" | The page reads `GET /api/v1/public/events/gala-night/giving-options`. The API was unreachable; and with the API up there is no approved Gala project and `SDI_DONATION_REFERENCE_CONFIRMED=false`. |

These were not bugs in the gates. The pages had **no path that works without the API**, and the only path that existed (the EB-/DN- reference flow) is correctly closed until SDI confirms the reference questions.

## 3. Fix — official-form hand-off (status: **FIXED**, switch default OFF)

- New: `src/lib/official-forms.ts`, `src/content/official-forms.ts` (EN/AR) and `src/components/booking/OfficialFormHandoff.tsx`.
- Changed: `BookingFlow` (a new `officialFormUrl` prop) and the Gala donate page.

**Release switches** (public, build-time, default `false`):

- `NEXT_PUBLIC_GALA_TICKET_FORM_HANDOFF`
- `NEXT_PUBLIC_GALA_DONATION_FORM_HANDOFF`

Only the exact value `"true"` enables a switch, and the two are independent.

**Order of preference on each page:**
1. If the API reports the MEKI reference flow open → the existing EB-/DN- flow (reference first, then SDI's form).
2. Otherwise, if the form's switch is on → a clearly labelled hand-off panel. This covers the API being offline, closed, or unreachable.
3. Otherwise → the existing truthful "not open" panel (Phase 14B behaviour).

**Honest copy (EN/AR):**
- the visitor leaves meki-us.org for zeffy.com;
- SDI handles payment, tickets and receipts;
- MEKI never sees card data;
- opening the form books or confirms nothing — confirmation is only the e-mail or receipt from SDI/Zeffy;
- no MEKI reference is shown in this mode, and no price is hard-coded.

**Link:** `target="_blank"`, `rel="noopener noreferrer external"`, `referrerPolicy="no-referrer"`. A screen-reader "(opens in a new tab)" label is included.

**Tests:** `apps/web/tests/final-zeffy.test.mjs` (5/5) covers:
- the exact URLs;
- switch strictness (`'1'`, `'TRUE'` and `' true'` are refused);
- look-alike, insecure and decorated URLs are refused;
- no `<iframe>`;
- reference-first ordering;
- honest EN/AR copy.

The Phase 14B test was updated to the new rule: no **ungated** link, and no hard-coded Zeffy URL on the page.

**Consequence of the hand-off mode (state it to SDI and the client):**
- Payments made through it carry no EB-/DN- reference.
- Attendee and dietary data are collected by SDI's form, not MEKI.
- Reconciliation in MEKI is then by SDI report or manual evidence matched on name, e-mail, amount and time, not by reference.

Turning the switch on is therefore a business release decision. It must follow SDI's written confirmation that the form is open for collection.

## 4. Embed vs redirect (status: **BLOCKED_EXTERNAL** for embed; redirect used)

Official sources:
- Zeffy docs "Partager la billetterie" and "Partager (formulaire de don)";
- "How do I add my form to my website".

Facts from those sources:
- The embed `<iframe>` code is available only from the organization's dashboard: Share → "Embed your form on your site" → copy the snippet.
- Embedded forms omit the description, images and logo.
- There is no public, documented way to derive the embed URL from the public form URL.

**Decision:** no iframe was fabricated. The site uses an external hand-off.

**To embed later**, SDI must send the two iframe snippets from its dashboard. Then:
- the web CSP needs `frame-src https://www.zeffy.com`;
- add a component that renders only the verified `src`.

## 5. Zeffy API, webhooks, e-mail (verified from official sources)

| Capability | Official fact | MEKI status |
|---|---|---|
| Authentication | Org admin generates an API key (Settings → Integrations); `Authorization: Bearer`; regenerating invalidates the old key | `ZEFFY_API_KEY` (server only). **BLOCKED_EXTERNAL:** SDI has not provided a key |
| Payments read | `GET https://api.zeffy.com/api/v1/payments`, cursor pagination (`starting_after` / `next_cursor`), filters currency, status, type, contact | `zeffy.client.ts` (read-only, GET-only retries). PASS in unit tests with a fake fetch; never called live |
| Payment / campaign detail | Used by the Phase 8A client (`/payments/:id`, `/campaigns/:id`). The fetched official page explicitly shows only the list endpoint | Confirm against the first real key before enabling reconciliation |
| Writes | Offline-payment record and delete exist; writes need Stripe verification | Deliberately **not implemented** (would never be proof of payment) |
| Rate limits | 100/min and 20/s per organization; 200/400/401/404/429 | Client retries 429/5xx with back-off, GET only |
| Webhooks | Configured in Settings → Integrations; POST on `payment.completed` (event type, timestamp, payment object); retried until 2xx | Endpoint exists (`POST /api/v1/integrations/zeffy/webhook`), **disabled** (503 `ZEFFY_NOT_CONFIGURED`) without a secret |
| Webhook authenticity | **No signature mechanism is documented** | **Risk:** Phase 8A's `zeffy-signature.ts` assumes a `Zeffy-Signature: t=…,v1=…` header that Zeffy does not document. Keep `ZEFFY_WEBHOOK_SECRET` unset. If webhooks are ever used, treat the body only as a *trigger* and re-fetch the payment through the authenticated API before trusting anything. |
| E-mail | Zeffy sends tickets and receipts from SDI's organization | MEKI sends nothing (`MAIL_TRANSPORT=none`); hand-off copy says confirmation comes from SDI/Zeffy |

## 6. Payment lifecycle and reconciliation (unchanged, verified by tests)

- **Statuses:** a reference stays `PENDING` until it is confirmed by one of two server-side paths:
  - an **approved SDI report import** — four-eyes: upload `sdi.reports.upload`, apply `sdi.reports.approve` by a different admin, `SDI_REPORT_APPLY_ENABLED`;
  - **manual SDI evidence** — immutable, decided by a different admin, approval gated by `SDI_MANUAL_CONFIRMATION_ENABLED=false`.
- **Redirects:** a browser return never changes a status. Duplicate external payment IDs are refused (`EXTERNAL_ID_ALREADY_RECORDED` / `…CLAIMED`). DB triggers make evidence and transactions append-only.
- **Admin finance** shows only DB rows: SDI reconciliation, SDI evidence, giving intents, Gala bookings. No real transactions are seeded; the empty-DB seed was verified to create 0.
- **New this release:** Users & Roles plus the forced first-sign-in password change in the admin. Without them the four-eyes rule could not be satisfied in production (no way to create the second approver). See the readiness report.

## 7. What SDI must provide (external)

1. Written confirmation that both official forms are open for collection. This is what allows the two hand-off switches to be turned on.
2. Iframe snippets, only if embedding is wanted.
3. Confirmation that the forms ask the "MEKI Booking/Donation Reference" questions, plus a sample export. This unlocks the reference-first flows: `GALA_HOSTED_SALES_ENABLED`, `SDI_DONATION_REFERENCE_CONFIRMED`.
4. The daily report format and the person who sends it, or an API key (read-only use) if SDI agrees.
5. An authentic confirmation-e-mail sample. This is required before `SDI_MANUAL_CONFIRMATION_ENABLED` can be considered.

## Sources

- https://docs.zeffy.com/org/billets/partager-la-billetterie.md
- https://docs.zeffy.com/org/suivi-des-donations/partager.md
- https://www.zeffy.com/integration/api
- https://zeffy.hc.ferndesk.com/get-started-with-the-zeffy-api-yourg
- https://support.zeffy.com/how-do-i-add-my-form-to-my-website
