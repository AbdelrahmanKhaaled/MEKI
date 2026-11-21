# 57 — Phase 13B: hosted payment integration readiness (SDI / Zeffy)

Date: 2026-11-21. This document re-verifies the SDI-hosted model **against the code**, not against earlier reports. It also records where the SDI wording received on 21 Nov 2026 now lives.

**Nothing financial was enabled.** No payment, donation, report application or production switch was turned on. No real transaction was created.

## 1. The model (unchanged since Phase 12 / 12B)

| Responsibility | Owner | Where enforced in code |
|---|---|---|
| Payment processing | Zeffy (SDI's account) | MEKI has no checkout in this mode. `PAYMENTS_ENABLED=true` is refused in staging/production (`env.validation.ts`) |
| Receives the funds | SDI | — |
| Official tax receipts | SDI / Zeffy | MEKI never issues receipts. Receipt wording (B) can never be published by MEKI (`legal-copy.ts`) |
| Gala tickets, QR codes, check-in | Zeffy | `GALA_TICKETING_MODE=zeffy_hosted` is mandatory in staging/production; `meki` mode is refused. No MEKI tickets/PDFs for hosted bookings |
| Booking references, admin records | MEKI | `EB-…` reference issued before the visitor leaves for SDI's form; status `PENDING` / `UNPAID` |
| Payment state | **SDI reconciliation reports only** | `ZEFFY_GALA_AUTO_CONFIRM` conflicts with `zeffy_hosted` → startup error. Return/redirect never confirms anything |
| Account-level API key / webhooks | **Not used** | Without secrets the webhook returns 503 `ZEFFY_NOT_CONFIGURED` and API reads are refused. The staging smoke asserts "no secrets" (doc 53) |

SDI's forms (as supplied in the brief; **to be set by the operator, not committed**):

- Gala ticket form: `https://www.zeffy.com/en-US/ticketing/misr-el-kheir-foundation-gala-new-york` → `ZEFFY_GALA_TICKET_FORM_URL`
- Gala standalone donation form: `https://www.zeffy.com/en-US/donation-form/misr-el-kheir-foundation-gala-new-york-donation` → `ZEFFY_GALA_GIVING_FORM_URL`

Both satisfy the validator: https + allowed Zeffy host. The website additionally re-checks every hosted URL (`isTrustedHostedFormUrl`) before linking it.

## 2. Review checklist (verified in code this phase)

| Item | Status | Evidence |
|---|---|---|
| Hosted checkout link validation | ✔ | `env.validation.ts` (https + Zeffy host allow-list, strict JSON for programme URLs); website `lib/booking.ts` |
| Booking reference generation | ✔ | `generateBookingAttemptReference` (`gala.rules.ts`); reference refused while sales are closed / event unpublished (staging smoke) |
| "MEKI Booking Reference" custom question | ✔ configured label | `SDI_BOOKING_REFERENCE_QUESTION` (default `MEKI Booking Reference`), shown verbatim in the hosted flow. **SDI must confirm that the question exists on the live form** |
| Pending until reconciliation | ✔ | Hosted bookings stay `PENDING`/`UNPAID`; copy says confirmation follows SDI's daily report |
| Report upload + preview | ✔ | CSV/XLSX only (extension + MIME + zip sniff), 5 MB, private storage, SHA-256 duplicate-file rejection (`DUPLICATE_FILE`), formula-injection guard |
| Column mapping profiles | ✔ | `mappingProfileId`, kind-checked; applying requires a profile **verified against a real SDI sample** |
| Unique order/payment ID, idempotent matching | ✔ | `DUPLICATE_ROW` (identical / conflicting rows per order), `ALREADY_APPLIED` (same state from an earlier report) |
| Booking-reference matching | ✔ | `INVALID_REFERENCE` for anything that is not a MEKI reference |
| Status mapping | ✔ | COMPLETED / PENDING / FAILED / CANCELLED / REFUNDED / PARTIALLY_REFUNDED; unknown → `REQUIRES_REVIEW` |
| Ticket vs added-donation separation | ✔ | Line kind TICKET vs Gala donation ticket types; donation rows are kept separate and **never applied** to bookings; `GalaSdiTotals` shows them separately |
| Amount check at the **live** price | ✔ | Expected = configured unit price × quantity; with USD 500 configured, a 750-based row is `AMOUNT_MISMATCH` (nov19 e2e) |
| Currency / date handling | ✔ | Currency column mapped and checked; date column (+ optional separate time column) parsed; ambiguous values are review items |
| Refunds and cancellations | ✔ | Refund amount validated (`REFUND_EXCEEDS_AMOUNT`), refund-after-paid transitions, paid-after-refund → review |
| Two-person approval | ✔ | Uploader cannot approve (`four-eyes`); applying also needs `SDI_REPORT_APPLY_ENABLED` (OFF) |
| Audit trail | ✔ | `sdi.report.upload` / preview / approve / apply, legal copy, CMS and media changes are audited |
| Permissions / private donor data | ✔ | Finance/SDI/guest-list routes refused to content roles (staging RBAC checks); reports never served publicly |

**Not verifiable without SDI:** the real column names, the order-ID column, how the booking-reference answer and the added donation appear, refund representation, currency and time zone. The previously supplied Excel sample belongs to a **different** campaign and has no consistent unique order ID. Therefore:

- no mapping profile is marked "verified against a real sample";
- `SDI_REPORT_APPLY_ENABLED` stays OFF;
- the financial integration is **not** live-tested.

All tests use synthetic fixtures.

## 3. The three SDI texts (received 21 Nov 2026)

The exact wording now exists in the repo as a **verbatim source**: `apps/admin/src/lib/legal-copy-source.ts`. It is unchanged from the document, including two features worth checking with SDI:

- the website text has **no final period**;
- it writes "tax deductible" without the hyphen used in the other two texts.

They were **not** corrected, because the wording must be approved, not rewritten.

| Text | Placement | Who can publish | Status |
|---|---|---|---|
| **A. Ticket purchase disclosure** — "Spring of Dignity International is a tax-exempt organization … Additional donations are tax-deductible to the extent permitted by law." | Hosted booking step, before the visitor opens SDI's form (`HostedBookingFlow`, `disclosure` slot) | MEKI, only after SDI's written approval is recorded by a **second** administrator, and only while the stated USD 500 equals the live ticket price | Source loaded in code · **not saved, not approved, not published** |
| **B. Official ticket receipt wording** — "Thank you for your support of the Egypt Gala. You paid USD 500 per ticket …" | **SDI's Zeffy receipt configuration** (SDI's responsibility) | **Never** published by MEKI. MEKI keeps the agreed text for reference only and issues **no** receipt | Whether SDI's live Zeffy receipt uses it is **unknown** — no evidence |
| **C. Website disclosure** — "The Egypt Gala is cohosted by Misr El Kheir Foundation and Spring of Dignity International …" | Gala page, booking section (`GalaBooking`, `data-testid=gala-website-disclosure`) | Same gate as A | Source loaded in code · **not published** |

Amounts recorded with each text: **ticket 500.00 = fair market value 200.00 + deductible 300.00**; EIN 42-2797838. The gate enforces all-or-none amounts that add up, and refuses publication if the live price differs (wording at USD 750 can never be published). It also hides a published text if the price later changes.

**Approval status.** The document labels these as "Updates from our Fiscal Sponsor SDI". That is MEKI relaying SDI's wording. It is **not** an SDI written approval on record in the system. The approval step is deliberately left to an administrator, who must enter the reference to SDI's written approval (who, date, channel). No approval was fabricated.

**Arabic.** No Arabic wording was supplied. Once published, Arabic pages show the approved **English** text verbatim (`publicDisclosures`: `textAr || textEn`). No translation of tax wording was made. An SDI-approved Arabic text can be pasted into the same record.

**Operator steps (per environment):**

1. Admin → Gala → Settings → "Gala legal copy".
2. For each kind, click "Load the 21 Nov wording (Website Comments)", then "Save draft".
3. A **different** administrator with `events.approve` clicks "Record SDI approval", citing SDI's written approval.
4. Publish A and C.

The price must already be USD 500 in that environment (doc 55 §1).

## 4. Fundraising-agreement boundaries (unchanged, re-verified)

| Switch / record | Value | Meaning |
|---|---|---|
| `GENERAL_GIVING_AUTHORIZED`, `SDI_GENERAL_GIVING_ENABLED` | false | No ongoing general giving |
| `PROGRAMME_GIVING_AUTHORIZED`, `SDI_PROGRAMME_GIVING_ENABLED`, `SDI_PROGRAMME_DESIGNATION_CONFIRMED` | false | No programme-restricted channels; programme pages informational |
| Gala fundraising project (doc 50) | single project, none selected | The six programmes are **not** assumed approved, not selected, not guessed |
| `SDI_GALA_GIVING_ENABLED`, `GALA_HOSTED_SALES_ENABLED` | false | No live SDI link on the site |
| `SDI_REPORT_APPLY_ENABLED` | false | Reports can be previewed and approved, never applied |

- All nine programme information pages remain published.
- The home "Give today" card remains a **preview**.
- Removing the "Luxor · WASH program" badge (doc 56 #1) also removes the visual suggestion that the preview gives to one programme.

Future arrangements supported **without code changes**:

- SDI approves the six programmes as **one** project: create one cause and select it;
- separate general giving: switches plus an SDI-approved form URL.

Six **separately restricted** funds would need a reviewed additive change after SDI defines them (doc 55 §3).

## 5. Dietary requirements and the Zeffy form

- MEKI's website now lists the five dietary options (doc 56 #8).
- In hosted mode, guest details are collected on **SDI's Zeffy ticket form**; MEKI's hosted booking step collects only the purchaser's contact details and quantity.
- **SDI dependency:** add a dietary question (Gluten-free / Vegan / Vegetarian / Nut allergy / Dairy-free / Other) to the Zeffy ticket form, if MEKI wants answers collected at purchase.
- The SDI attendee-list import already keeps custom answers (`answers` mapping), so the answers would reach the admin guest list without code changes once SDI's attendee export includes them.
- Until SDI confirms, nothing claims that dietary answers are collected.

## 6. Ticket price, capacity and event values

| Value | Repo / seed | Local staging DB | Live Zeffy ticket form | Live VPS DB |
|---|---|---|---|---|
| USD 500 | ✔ (web content, admin, seed, tests) | ✔ (applied 19 Nov, audited) | **Unverified** — SDI must update and confirm | **Unknown** — apply via `apply-nov19-gala.mjs` after deployment |
| Capacity 350 | ✔ | ✔ | **Unverified** | **Unknown** |
| 12 Dec 2026, 3:30–8:30 PM America/New_York | ✔ | ✔ | **Unverified** | **Unknown** |

The remaining `750` occurrences in the repo are synthetic arithmetic / historic-record fixtures in tests (e.g. refund maths, a price-change dialog test), not active configuration. They were deliberately not rewritten.

Sales remain **closed** (`salesEnabled=false`, `GALA_HOSTED_SALES_ENABLED=false`).
