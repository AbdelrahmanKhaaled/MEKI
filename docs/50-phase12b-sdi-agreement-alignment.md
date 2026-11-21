# 50 — Phase 12B: SDI agreement alignment, Gala donation scope and reconciliation readiness

Date: 2026-11-19 (recorded with SDI's 2026-11 clarification).

**What did not change:**

- Nothing was committed, pushed or deployed.
- No `.env` value was edited.
- No sale, payment, donation, report-application or financial-confirmation switch was turned on.
- No live purchase or refund was made.
- No donor or booking record was modified.
- No database was reset.

**Superseded in part by [doc 55](55-meki-november-19-client-updates-and-sdi-dependencies.md):** MEKI's 19 Nov 2026 update (USD 500, capacity 350, hours, agenda, legal drafts) and the MEKI-vs-SDI contradictions on six programmes, the December 2027 closing date and ongoing giving.

**Builds on:**

- [doc 46](46-phase11a-program-detail-and-donation-experience.md): programme pages;
- [doc 47](47-phase12-sdi-hosted-forms-implementation.md): hosted forms;
- [doc 48](48-phase12-reconciliation-and-financial-integrity.md): reconciliation;
- [doc 49](49-phase12-sdi-final-handoff-checklist.md): handoff checklist, now updated.

## 1. Verified SDI requirements (SDI's written clarification)

| # | SDI statement | How MEKI applies it |
|---|---|---|
| 1 | The Gala agreement supports **one Project in Egypt**, approved in writing in the Project Plan | One project per Gala event, selected and approved by MEKI administrators (§4). Never auto-selected. |
| 2 | Donor-directed donations to the nine programmes are **not authorized** | Programme pages are informational only. Programme designations are refused by the API. |
| 3 | Programme restrictions need separate legal, financial, reporting and due-diligence arrangements | `PROGRAMME_GIVING_AUTHORIZED` (default false) records such an agreement; nothing else can enable programme giving. |
| 4 | Ticket sales and donations use SDI's hosted Zeffy forms only | Gala ticket form (Phase 12) plus Gala donation form (`SDI_GALA_GIVING_ENABLED`). MEKI-native checkout is refused in staging/production. |
| 5 | No Zeffy API key, no webhooks | Unchanged from Phase 12: the 8A API/webhook code stays dormant, and confirmation comes only from approved reports. |
| 6 | SDI sends reconciliation reports after a live purchase, standalone donation and refund test | Applying reports stays off (`SDI_REPORT_APPLY_ENABLED=false`) until then. |
| 7 | The booking reference is a custom question, **stored exactly as entered** | MEKI keeps the raw value (`bookingReferenceRaw`) and a normalised copy. Nothing is "corrected" (§6). |
| 8 | SDI will verify the reference appears in the real report | Open dependency S-2. |
| 9 | Ticket money and additional donations are recorded separately | Separate categories end to end (§3). Additional-donation lines stay in review until the real structure is known. |
| 10 | The standalone donation form is for **the Gala campaign only** | The general giving page offers no checkout. The form is linked only on the Gala page, only for the approved project. |
| 11 | Ongoing donations after the campaign need a separate agreement | Recurring gifts in any report → review. The donation link closes at the approved closing date. |
| 12 | Proposed campaign end **31 January 2027**, pending approval | Stored only when MEKI approves it (`donationsCloseAt`). Public giving requires it. |
| 13 | **Donations are not refundable** (says nothing about tickets) | A donation refund notice is published only after approval. A refund reported on a donation → review. Ticket refunds remain a separate, independently approved policy. |

## 2. Changes made

**API:**

- **Migration** `20261120100000_phase12b_gala_fundraising_project` (additive: one new table, two foreign keys).
  - Applied to `meki_test`, then to `meki_dev` after a backup: `scratchpad/meki_dev-before-phase12b-2026-11-19T16-53-11.sql`, 49 tables, completion marker present.
  - `meki_dev` still has 0 bookings, 7 donations and 0 provider payments. The new table is empty.
- **`EventFundraisingConfig` + `FundraisingModule`:**
  - `GET/PUT /admin/events/:eventId/fundraising`;
  - `POST …/fundraising/approve`, `POST …/fundraising/revoke`;
  - `GET /public/events/:slug/fundraising?locale=`.
- **Env** (all default false):
  - `SDI_GALA_GIVING_ENABLED`, `GENERAL_GIVING_AUTHORIZED`, `PROGRAMME_GIVING_AUTHORIZED`.
  - New guards:
    - Gala giving requires `zeffy_hosted` and `ZEFFY_GALA_GIVING_FORM_URL`;
    - SDI general giving requires `GENERAL_GIVING_AUTHORIZED`;
    - SDI programme giving requires `PROGRAMME_GIVING_AUTHORIZED`;
    - `PAYMENTS_ENABLED` (MEKI-native checkout) is refused in staging/production.
- **Donation designations:** `DonationConfigService.resolveDesignation` refuses `GENERAL_FUND`/`CAMPAIGN` without `GENERAL_GIVING_AUTHORIZED`, and `PROGRAMME` without `PROGRAMME_GIVING_AUTHORIZED` (`422 DESIGNATION_NOT_AUTHORIZED`). The public config lists only authorized designations. Only *new* donations are affected; historical donations, allocations, refunds and webhooks are untouched.
- **`GET /public/hosted-forms`:** adds `scope: 'GALA_SINGLE_PROJECT'`, `generalAuthorized`, `programmeAuthorized`. General and programme URLs also require the agreement switches.
- **SDI importer** (details in §5):
  - report type `GALA_TICKETS` | `GALA_DONATIONS`;
  - separate time column and IANA time zone (DST-aware);
  - fund and recurring columns;
  - `abandoned` → FAILED default;
  - unpaid rows without an amount → `INFO`;
  - Gala donations recorded in their own category;
  - `ProviderPayment.type = imported_test` for test or synthetic data;
  - `status.galaTotals` per category.
- **Test env:**
  - `test/load-test-env.ts` sets both `*_GIVING_AUTHORIZED` flags for the legacy MEKI-native donation-pipeline suites only;
  - `test/agreement-env.ts` and `test/phase12b-agreement.e2e-spec.ts` (15 tests) run with them off.

**Contract:** `packages/api-client`:
- `openapi.json` and `schema.d.ts` regenerated (197 paths);
- `public.ts` gains `PublicEventFundraising` and the `PublicHostedForms` scope fields.

**Web:**
- **Programme pages** (`ProgrammeDonate`): informational "Giving to this program is not open" panel, with no amounts and no payment button, unless the API reports programme giving authorized. The Phase 11A form is kept behind that gate for a future agreement.
- **Gala page:**
  - The "Donate Without Attending" panel links to SDI's donation form only when `giving.available`, and only to an https `zeffy.com` URL. It opens in a new tab with no referrer.
  - It names the approved project only after authorization.
  - It shows "campaign closed" after the closing date.
  - FAQ: the donation refund item appears only when approved; the "Cancellations" answer is replaced only by an approved ticket policy.
  - The give text now refers to the Gala campaign, not "MEKI's work".
- **`/give`:** "General online giving is not open", the agreement explanation, and an *information* link to the Gala campaign. Still no payment.

**Admin:**
- **Gala settings → "Gala fundraising project" card:**
  - project chosen from existing non-DEMO projects, never preselected;
  - Project Plan reference, closing date, and ticket refund policy text in EN and AR;
  - four approval/revoke actions, with four-eyes enforced in the UI and the API.
- **SDI reconciliation:**
  - report-type selector; time-zone and Gala-fund inputs; time, fund and recurring columns;
  - ticket-only columns hidden for donation reports;
  - Gala totals by category on the page and the dashboard card.
- **Donations list:** a note that SDI-hosted Gala gifts are reconciled separately and not listed there.
- **Copy:** EN/AR strings and error codes for all of the above.

## 3. Donation architecture after this decision

| Channel | Where the money is paid | Status | What MEKI records |
|---|---|---|---|
| Gala tickets | SDI Gala ticket form (Zeffy) | Built; sales switch off | Booking reference (pending) → confirmed **only** from an approved SDI report. Ledger `EVENT_TICKET_PAYMENT`. No MEKI tickets. |
| Additional donation during ticket checkout | Same Zeffy ticket form | Handled by Zeffy | Report lines kept as `REQUIRES_REVIEW` (separate from tickets) until SDI's real report structure is verified. Never added to ticket revenue. |
| Gala standalone donation | SDI Gala donation form (Zeffy) | Built; switch off; needs approved project + authorization + closing date | Approved `GALA_DONATIONS` report → `ProviderPayment` (`CHARITABLE_DONATION`, `GALA_STANDALONE_DONATION`), with no donor data and no MEKI `Donation` row. SDI issues the receipt. |
| General (unrestricted) giving | — | **Not authorized** | Refused by the API (`DESIGNATION_NOT_AUTHORIZED`). `/give` explains the current scope. |
| Programme-designated giving | — | **Not authorized** | Refused by the API. Programme pages are informational. The future path is gated by `PROGRAMME_GIVING_AUTHORIZED` plus SDI's programme forms and designation confirmation. |

**No double counting:**

- Ticket money lives on bookings and booking transactions.
- SDI's view of tickets and Gala donations lives in `ProviderPayment` (provider `sdi_report`) and is shown as "as reported by SDI".
- MEKI's donation totals (`ReportsService`) count only MEKI `Donation` records, and no SDI report ever creates one.
- `galaTotals` never sums categories, and test or synthetic records are excluded.

**Never by redirect:** donation and booking status change only through an approved, four-eyes SDI report. Refunds are never issued by MEKI; it only records what SDI reports.

## 4. Gala single-Project model

`EventFundraisingConfig` (one row per event, absent = nothing selected):

| Step | Who | Effect | Cleared when |
|---|---|---|---|
| Select project (existing Project/cause record, not DEMO) and enter the **Project Plan reference** | `events.manage` | Stored. Nothing public. | — |
| **PROJECT_PLAN** approval | `events.approve`, a different user from the last editor | Records that MEKI + SDI approved the project in the signed plan | Project or plan reference changes; revoked |
| **PUBLIC_FUNDRAISING** authorization (needs the plan approval and a **future closing date**) | same | The project name appears publicly; SDI's Gala donation form is linked while the campaign is open and `SDI_GALA_GIVING_ENABLED` is on | Project, plan reference or closing date changes; plan revoked; revoked |
| **DONATION_REFUND_NOTICE** | same | Publishes SDI's "donations are not refundable" wording (Gala FAQ) | revoked |
| **TICKET_REFUND_POLICY** (needs the text) | same | Publishes the separately confirmed ticket policy (replaces the "Cancellations" answer) | Text changes; revoked |

Every change is audited:

- `event.fundraising.update`, with the changed fields and the approvals cleared;
- `event.fundraising.approve`;
- `event.fundraising.revoke`.

Historical donations and allocations are untouched.

**How MEKI enters the approved project after sign-off:**

1. **Admin → Causes:** create or confirm the project record. Name, location and description are entered by MEKI from the signed Project Plan; nothing is invented. Do not use DEMO.
2. **Admin → Gala → Settings → Gala fundraising project:** select the project, enter the Project Plan reference (title, version, signature date) and the approved closing date (e.g. `2027-01-31T23:59:59-05:00` once MEKI approves SDI's proposal), then save.
3. **A second administrator records "Project Plan approval",** noting the signed document.
4. When MEKI decides to fundraise publicly, the second administrator records **"Public fundraising authorization"**.
5. **Operations** set `ZEFFY_GALA_GIVING_FORM_URL` (the exact URL SDI sent) and `SDI_GALA_GIVING_ENABLED=true` in the hosting secret store, with written approval.
6. **Optional:** approve the donation refund notice. When the ticket policy is confirmed, enter its text and approve it.

## 5. Spreadsheet compatibility and limitations

**Sample:** `Train, Earn, and Give Back_ Change campgain sample 1-19-2026.xlsx` (a different campaign).

**How it was handled:**

- It was used **only as a structural reference**. It was read from a private scratch copy by a script that printed headers, row counts and masked value shapes; no names, e-mails, phones, addresses or receipt URLs were printed.
- It was **not** uploaded to any database and **not** copied into the repository.
- The scratch copy was deleted at the end of the phase.

**Structure:**

- 1 sheet ("Export"), 20 columns, 11 data rows, no formulas.
- **Columns:**
  - `Payment Date (America/New_York)` (M/D/YYYY) and `Payment Time (America/New_York)` (h:mm AM/PM);
  - `Total Amount` (numeric cells), `DAF provider`, `Payment Method`, `Payment Status` (Succeeded / Abandoned), `Payout Date`, `Refund Amount` (empty in the sample);
  - `Recurring Status` (Monthly or empty), `Fund` (two fund names, neither Gala);
  - donor identity columns (first/last name, e-mail, company, address, city, phone);
  - `Tax Receipt #`, `Tax Receipt URL`, `Note`.

**Dry run through the Phase 12B parser** (aggregates only, no database):

- all 11 date+time values parse in America/New_York, converting to UTC+5 in winter and UTC+4 in summer;
- 9 amounts parse; 2 are empty, both on "Abandoned" rows, which now become `INFO`;
- recurring rows → review; fund names outside the configured Gala fund → review.

| Supported now | Limitation, left for review / SDI |
|---|---|
| Separate date and time columns, 12-hour clock, header time zone (suggested automatically), DST | **No order/payment ID column.** Reconciliation needs a unique per-order key; `Tax Receipt #` exists on only 6 of 11 rows. Rows without the mapped key are `INVALID` (`ORDER_ID_MISSING`). **SDI must confirm the order ID column (S-3).** |
| Numeric amount cells, empty amount on unpaid rows | **No currency column:** USD is assumed (Zeffy US). Confirm. |
| `Abandoned` → FAILED (default suggestion) | **No booking-reference column:** the Gala ticket report must contain the custom question (S-2). |
| `Fund` → must equal the configured Gala fund name(s) | **Ticket vs donation amounts:** the sample is a donation form and does not show how a ticket order with an added donation is split (S-4). |
| `Recurring Status` → recurring gifts always reviewed | **Refund representation** (cumulative column vs separate rows) is unproven: the sample has no refunds (S-5). |
| Donor columns are simply never mapped, so no personal data is stored on rows | The raw file is still stored privately on upload, so production uploads follow the existing private-storage rules. |

Applying real reports remains disabled. A mapping profile must be verified against the **real Gala report** by a second administrator.

## 6. Booking reference format for SDI

| Item | Value |
|---|---|
| Format | `EB-` followed by **12** characters from the Crockford base-32 alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (15 characters in total) |
| Never contains | `I`, `L`, `O`, `U` |
| Example (synthetic) | `EB-8T0DKJRECQF3` |
| Generation | `generateBookingReference()` in `apps/api/src/modules/gala/gala.rules.ts`: 12 CSPRNG bytes, each mod 32 (no modulo bias, 60 bits) |
| Uniqueness | Database unique index on `EventBooking.publicReference`. Tested with 5,000 generated references. A collision (≈1 in 10¹² at 1,000 bookings) fails that request safely and the buyer retries. |
| Storage | `EventBooking.publicReference`. From reports: `ProviderReportRow.bookingReferenceRaw` (exactly as typed, ≤ 80 characters) and `bookingReference` (normalised). |
| Validation (import) | Case, spaces and typographic dashes are normalised, and a missing dash after `EB` is restored. **Nothing else is corrected**: a mistyped character (e.g. `O` for `0`) → `INVALID_REFERENCE`, and a valid-format unknown reference → `UNMATCHED`. |
| Checkout | Manual copy-and-paste into SDI's question. No URL pre-fill is assumed. |

**Copy-ready message to SDI:**

> Subject: MEKI Booking Reference — format for the Gala custom question
>
> Dear SDI team,
>
> For the custom question **"MEKI Booking Reference"** on the Gala ticket form, buyers will paste a reference that MEKI generates before they open your form. Format:
>
> - `EB-` followed by 12 characters (letters and digits), 15 characters in total — for example `EB-8T0DKJRECQF3` (a test value).
> - The 12 characters never include the letters I, L, O or U, so there is no 0/O or 1/I/L confusion.
> - Each reference is unique to one booking.
>
> Please keep the answer exactly as the buyer entered it (no reformatting). MEKI tolerates differences in letter case, spaces and dash style when reconciling, but never corrects other characters.
>
> To complete reconciliation, could you please confirm in the real Gala report:
> 1. the exact column name in which this answer appears;
> 2. the column containing a unique order or payment ID for each purchase;
> 3. how ticket amounts and additional donations appear (separate columns or separate rows), and how refunds are shown;
> 4. the currency and the time zone of the date/time columns.
>
> Thank you.

## 7. Test results

Recorded 2026-11-19 against `meki_test`, with synthetic fixtures only:

| Check | Command | Result |
|---|---|---|
| Phase 12B API integration (15 tests) | `cd apps/api && npx jest --runInBand test/phase12b-agreement.e2e-spec.ts` | **15/15 passed** |
| Full API suite: unit + integration, including donations, programmes (11A), Gala booking/webhook/tickets/check-in, Zeffy 8A, Phase 12 SDI | `cd apps/api && npx jest --runInBand` | **28/28 suites, 432/432 tests passed** |
| Web unit/static | `pnpm --filter @meki/web test` | **79/79 passed** |
| Admin unit/static/OpenAPI contract | `pnpm --filter @meki/admin test` | **188/188 passed** |
| Browser smoke: programme pages informational, `/give` without checkout, Gala page without SDI link while not authorized (EN desktop, AR mobile; web production build + dev API) | `node apps/web/tests/e2e/agreement.smoke.mjs` with `BROWSER=chromium\|firefox\|webkit` | **18/18 in each engine** |
| Typecheck + lint + build, all packages | `pnpm turbo run typecheck lint build --force --concurrency=1` (dev watcher stopped, then restarted) | **10/10 tasks successful**; the 6 lint warnings are pre-existing, in files this phase did not touch |
| OpenAPI | `node dist/openapi-export.js` + `openapi-typescript` | 197 paths, including the 4 fundraising endpoints |

**What the Phase 12B API suite covers:**

- **Giving scope:**
  - designations refused (`DESIGNATION_NOT_AUTHORIZED`), with an empty public list;
  - the `hosted-forms` scope flags.
- **Config guards:**
  - Gala giving needs the form URL and `zeffy_hosted`;
  - general and programme giving need the agreement switches;
  - MEKI-native checkout is refused in production.
- **Single project:**
  - nothing is selected or shown by default;
  - DEMO and unknown projects are refused; content managers cannot approve;
  - four-eyes; plan approval before authorization; a future closing date is required;
  - the localized project name appears only after authorization;
  - edits clear approvals; a past closing date closes giving; revocation is immediate.
- **Refund notices:**
  - the donation notice and the ticket policy are independent;
  - an edit clears the ticket-policy approval;
  - actions are audited.
- **Gala donation report** (sample layout, synthetic data):
  - America/New_York → UTC with DST;
  - abandoned/no amount → `INFO`; recurring, other fund and refund-on-donation → review;
  - formula, missing order ID and bad time → `INVALID`.
- **Apply:**
  - recorded as `CHARITABLE_DONATION / GALA_STANDALONE_DONATION / imported_test`, with no personal data;
  - no `Donation` or booking rows; the totals exclude test data;
  - `ALREADY_APPLIED`, changed amount → review, older → `STALE`;
  - an order already reconciled as a ticket → `AMBIGUOUS`.
- **Ticket reports:** additional-donation lines stay in review; a bad time zone and an unknown report type are refused.
- **Unit:**
  - booking references: 5,000 unique, never I/L/O/U, normalised but not corrected;
  - 12- and 24-hour times, DST conversion, explicit offsets, time given twice, invalid dates.

**Fixed during the run:**

- **Real defect:** an abandoned row without a fund was sent to review before the "nothing to record" rule. The fund and recurring checks now apply only to paid rows.
- **Admin contract guards:**
  - the Gala totals component moved from `features/finance` to `features/gala`, because Phase 6B forbids ticket revenue in donation pages;
  - the fundraising service paths are spelled out literally, so the OpenAPI contract test can verify them.
- **Arabic arrow:** it was double-mirrored in RTL and now points the right way.
- **Phase 12 unit test:** one assertion updated, because programme hosted giving now requires `PROGRAMME_GIVING_AUTHORIZED` before the designation check (an intended rule change).

## 8. Remaining dependencies — SDI

| # | Needed |
|---|---|
| S-1 | The live purchase, standalone donation and refund test, and the resulting **real Gala reconciliation report(s)** |
| S-2 | Confirmation that the "MEKI Booking Reference" answer appears in the real report, and its exact column name |
| S-3 | The **unique order/payment ID column** (absent from the sample) |
| S-4 | Final field structure for ticket amounts vs additional donations on the ticket form (columns or rows; ticket type and quantity columns) |
| S-5 | How refunds appear (cumulative refund column, or separate rows / statuses) and the full list of status values |
| S-6 | Currency column or confirmation that every amount is USD; time zone of the date/time columns |
| S-7 | Report delivery: secure channel, cadence, cut-off, business-day calendar |
| S-8 | Confirmation that ticket price and capacity are enforced on the Zeffy form and match MEKI's configuration |
| S-9 | The Gala **fund name** as it will appear in reports (so the mapping can restrict to it) |
| S-10 | Staff check-in access to Zeffy for the event night (Zeffy owns check-in) |

## 9. Remaining dependencies — MEKI

| # | Needed |
|---|---|
| M-1 | Selection of **the single Project** and the **signed Project Plan** (name, location, description, target — entered by MEKI, never invented) |
| M-2 | Approval (or change) of SDI's proposed donation closing date, **31 January 2027** |
| M-3 | Ticket refund policy (independent of donations) and approval to publish it |
| M-4 | Approval to publish SDI's donation refund statement |
| M-5 | Decision whether to pursue general and/or programme-restricted giving under a **separate agreement** with SDI (legal, financial, reporting, due diligence) |
| M-6 | The exact SDI Gala donation form URL entered in the secret store (`ZEFFY_GALA_GIVING_FORM_URL`). SDI confirmed the form; its URL is not in the repository. |
| M-7 | Content (EN/AR), legal and production launch approvals; written approval for each production switch |

## 10. Production launch blockers

1. S-1 to S-6: there is no real Gala report yet, so no mapping profile can be verified and `SDI_REPORT_APPLY_ENABLED` stays off.
2. M-1: no approved project or Project Plan, so public Gala giving cannot be authorized.
3. M-2: no approved closing date, so public giving cannot be authorized.
4. M-3 / S-8: the ticket refund policy, price and capacity verification are not confirmed. Ticket sales stay closed (`GALA_HOSTED_SALES_ENABLED=false`).
5. M-7: content, legal and launch approvals.

What remains disabled:
- hosted ticket sales;
- the Gala donation link;
- report application;
- general and programme giving;
- MEKI-native checkout (refused in production).
