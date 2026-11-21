# 61 — Phase 14: Zeffy hand-off and SDI reconciliation

Date: 2026-11-21. No API key or webhook is available from SDI. Payment is confirmed **only** by an approved SDI report (four-eyes apply).

## 1. Hand-off

| Flow | Form URL (secret store, never in git) | Question the donor answers on Zeffy |
|---|---|---|
| Gala ticket | `ZEFFY_GALA_TICKET_FORM_URL` — SDI's `…/ticketing/misr-el-kheir-foundation-gala-new-york` | **MEKI Booking Reference** (`EB-…`) |
| Gala donation | `ZEFFY_GALA_GIVING_FORM_URL` — SDI's `…/donation-form/misr-el-kheir-foundation-gala-new-york-donation` | **MEKI Donation Reference** (`DN-…`); **Donation Type** (Zakat / Sadaqah) once confirmed |
| General donation | `ZEFFY_DONATION_FORM_URL` (none supplied) | MEKI Donation Reference; Donation Type |
| Program donation | `SDI_PROGRAMME_FORM_URLS` — one SDI form per program (none supplied) | MEKI Donation Reference; Donation Type; **approved Program / Fund** |

Rules:

- **No URL pre-fill is assumed.** No query parameters are guessed. The donor copies the reference, and the instructions name the exact question label (`SDI_DONATION_REFERENCE_QUESTION`, `SDI_DONATION_TYPE_QUESTION`).
- Every URL is validated twice:
  - server: https + Zeffy host;
  - website: `isTrustedHostedFormUrl`.
- A program or general gift is **never** routed to the Gala-only form. Each flow's gate returns its own form URL.
- **Return page** (`/give/status/DN-…`): "Your payment is being verified." It only displays the server's state.
  - There is no confirm endpoint (a `POST …/confirm` returns 404).
  - The access token stays in the browser tab (sessionStorage) and is sent in a header, never in a URL.
  - The response contains no personal data.

## 2. Separate switches (all OFF by default; every one also needs its written authorization)

| Channel | Switches that must ALL be on |
|---|---|
| Gala ticket sales | `GALA_HOSTED_SALES_ENABLED` + `ZEFFY_GALA_TICKET_FORM_URL` + admin sales switch |
| Gala donations (Phase 12B direct link) | `SDI_GALA_GIVING_ENABLED` + form URL + approved project, Project Plan, public-fundraising authorization and closing date |
| Gala donation **intents** (Phase 14) | the above **+ `SDI_DONATION_REFERENCE_CONFIRMED`** |
| General donations | `GENERAL_GIVING_AUTHORIZED` + `SDI_GENERAL_GIVING_ENABLED` + `ZEFFY_DONATION_FORM_URL` + `SDI_DONATION_REFERENCE_CONFIRMED` |
| Program donations | `PROGRAMME_GIVING_AUTHORIZED` + `SDI_PROGRAMME_GIVING_ENABLED` + `SDI_PROGRAMME_DESIGNATION_CONFIRMED` + that program's URL in `SDI_PROGRAMME_FORM_URLS` + `SDI_DONATION_REFERENCE_CONFIRMED` |
| Zakat | `ZAKAT_GIVING_ENABLED` + `SDI_DONATION_TYPE_CONFIRMED` (startup refuses it otherwise) + an approved target |
| Applying reports | `SDI_REPORT_APPLY_ENABLED` + a mapping profile verified against a **real** SDI sample + a second administrator |

**Startup guards:**

- `SDI_DONATION_TYPE_CONFIRMED` requires `SDI_DONATION_REFERENCE_CONFIRMED`;
- `ZAKAT_GIVING_ENABLED` requires `SDI_DONATION_TYPE_CONFIRMED`;
- the question labels are validated;
- all Phase 12 guards still apply (e.g. `PAYMENTS_ENABLED` is refused in staging/production).

## 3. Fields SDI must configure in Zeffy

| Form | Custom question | Required? | Must appear in SDI's export? |
|---|---|---|---|
| Gala ticket | **MEKI Booking Reference** (text) | Yes, once per order | Yes |
| Gala donation | **MEKI Donation Reference** (text) | Yes, once per gift | Yes |
| Gala donation (if Zakat is to be accepted) | **Donation Type**: Zakat / Sadaqah | Yes | Yes |
| General donation (if authorized) | MEKI Donation Reference; Donation Type | Yes | Yes |
| Program donation (if authorized) | MEKI Donation Reference; Donation Type; **approved Program / Fund** designation | Yes | Yes |
| Gala ticket (optional, MEKI request) | Dietary requirement (doc 57 §5) | MEKI to decide | Attendee export |

**Not assumed:** that the existing Gala-only donation form supports six restricted programs; that these questions exist; or that they appear in the export. Each `*_CONFIRMED` switch is set only on SDI's written confirmation after a live test.

## 4. Reconciliation (existing SDI CSV/XLSX pipeline, extended)

Report types:

- `GALA_TICKETS` (unchanged);
- `GALA_DONATIONS`;
- **new** `GENERAL_DONATIONS`;
- **new** `PROGRAMME_DONATIONS`.

New mapping columns:

- `donationReference`: required for general/program; optional for Gala, where it switches on intent matching;
- `donationType`, with a `donationTypeMap` (answer → `ZAKAT`/`SADAQAH`; defaults cover zakat/zakah/sadaqah/sadaqa and Arabic);
- `designation`, with a `designationMap` (value → `GENERAL` | `GALA_PROJECT` | `programme:<slug>`). Required for program reports.

Mappings are edited in the admin importer and saved in verified profiles.

**Per row (donation report with the reference column):**

| Situation | Result | Effect on apply |
|---|---|---|
| Paid, reference matches an intent, form/amount/currency/type/designation all agree | `MATCHED` | Intent → `PAID`/`COMPLETED`/`VERIFIED`; `externalPaymentId`, `reportedAmount` and report provenance set; one `ProviderPayment` (`CHARITABLE_DONATION`, category = intent type, linked to the Donation); audit `giving.intent.verified`. **Allocation stays `PENDING_AUTHORIZATION`; payout `NOT_REPORTED`; no receipt** |
| No reference / not a `DN-` reference (e.g. an `EB-` booking reference) | `UNMATCHED` / `INVALID_REFERENCE` | — |
| Reference with no intent | `UNMATCHED` | — |
| Intent of another flow on this form (e.g. a program gift paid on the Gala form) | `REQUIRES_REVIEW` (wrong form; never re-designated) | Intent → `NEEDS_REVIEW` |
| Amount ≠ intended | `AMOUNT_MISMATCH` | Intent → `NEEDS_REVIEW` (reported amount kept) |
| Donation Type ≠ the donor's choice, unknown, or missing on a Zakat intent | `REQUIRES_REVIEW` ("never converted") | Intent → `NEEDS_REVIEW` |
| Designation ≠ intention, unknown value, or missing on a program intent | `REQUIRES_REVIEW` | Intent → `NEEDS_REVIEW` |
| Two different orders with the same reference | `AMBIGUOUS` (both) | Intent → `NEEDS_REVIEW` |
| Intent already verified by another order / order already linked to another intent | `AMBIGUOUS` | — |
| Same order and state as an earlier applied report | `ALREADY_APPLIED` | Nothing (idempotent) |
| Unpaid / abandoned order with a valid reference | `INFO` | Intent → `REPORTED_UNPAID` (if still awaiting) |
| Refund on a donation | `REQUIRES_REVIEW` (SDI: donations not refundable; never applied automatically) | Intent → `NEEDS_REVIEW` |
| Currency ≠ USD, formula-like cells, bad dates | `INVALID` | — |

**Unchanged safeguards:**

- preview changes nothing;
- the exact file is stored privately, with its SHA-256;
- an identical file is refused (`DUPLICATE_FILE`);
- re-evaluation happens inside one transaction at apply;
- the uploader can never apply (four eyes);
- synthetic files are never applied in staging/production;
- full audit.

A verified intent is never downgraded by a later row; that row is itself a review item.

**Without the reference column**, the Gala donation report keeps the Phase 12B behaviour: standalone gifts, with no MEKI donor record created from a report.

**Never evidence of payment:** the donor's selection, a Zeffy redirect, the return page, a thank-you page, an unapproved preview.

## 5. Allocation (after verification)

`POST /admin/donation-intents/:id/allocation` (`donations.allocate`):

- only for `VERIFIED` + `PAID`;
- not by the administrator who approved the verifying report;
- requires a fund text to authorize;
- decided once;
- audited.

The decision records what MEKI/SDI authorized. It does not move money.

## 6. What only SDI can confirm

- The real Gala report layout: order-ID column, reference column, Donation Type column, ticket vs added-donation lines, refunds, currency, time zone.
- That the custom questions exist, are required, appear once per order, and are exported.
- Whether program / general / Zakat-restricted giving is authorized, and which programs/funds.
- Settlement (payout) data. Until a reliable source exists, payouts stay `NOT_REPORTED`.
