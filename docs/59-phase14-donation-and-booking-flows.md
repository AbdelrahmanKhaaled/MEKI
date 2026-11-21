# 59 — Phase 14: donation and booking flows

Date: 2026-11-21.

Read with:

- [doc 60](60-phase14-zakat-sadaqah-financial-model.md): financial model;
- [doc 61](61-phase14-zeffy-handoff-and-reconciliation.md): hand-off and reconciliation;
- [doc 62](62-phase14-tests-and-launch-gates.md): tests and launch gates.

**Rule throughout:** MEKI records a donor's *intention* and issues a reference. Payment happens only on SDI's hosted Zeffy forms, and is verified only from an approved SDI report. No real payment, financial switch or SDI approval was used or assumed.

## 1. Three payment-intent flows (one per form, never mixed)

| Flow | Starts at | MEKI record | Reference | SDI form | Open today? |
|---|---|---|---|---|---|
| **A. Gala ticket** | Gala page → *Book Your Place* → `/events/gala-night/book` | `EventBooking` (Phase 12, unchanged) | `EB-XXXXXXXXXXXX` | Gala ticket form | **No** (`GALA_HOSTED_SALES_ENABLED=false`, sales closed) |
| **B. Gala donation** | Gala page → *Donate Without Attending* → `/events/gala-night/donate` | `Donation` (intent type `GALA_DONATION`, designation `PROJECT` = the approved Gala project) | `DN-XXXXXXXXXXXX` | Gala donation form | **No** (no approved Gala project, `SDI_GALA_GIVING_ENABLED=false`, reference question not confirmed) |
| **C. Program / general donation** | Program page → *Give* / the general Give page → `/give#prepare` | `Donation` (`PROGRAM_DONATION` / `GENERAL_DONATION`) | `DN-XXXXXXXXXXXX` | SDI's **own** program / general form (never the Gala form) | **No** — outside the written SDI agreement (`*_GIVING_AUTHORIZED=false`) |

### A. Gala ticket booking — already complete (Phase 12)

Re-verified, not rebuilt:

- minimal contact data;
- `EB-` reference;
- `PENDING` booking;
- hand-off to SDI's ticket form only when the sales switch is on;
- copy-the-reference instructions;
- no MEKI tickets, receipts or QR codes.

Price and capacity come from the server ticket configuration (USD 500, capacity 350, doc 55). Zeffy is the capacity authority for hosted sales, and MEKI never claims inventory from local holds.

### B. Gala donation (new)

`/events/gala-night/donate` is a dedicated page, separate from booking: "This is a donation, not admission", with a link to book a ticket instead. The page shows one of three things:

- **Intent flow**: amount, Sadaqah / Zakat, contact, review + terms, then the `DN-` reference and the hand-off to SDI's Gala donation form. Used when the Gala gate is open AND SDI has confirmed the "MEKI Donation Reference" question.
- **Phase 12B direct link**: when the Gala gate is open but the reference question is NOT confirmed (reconciled as a standalone Gala gift).
- **Not open**: otherwise.

The Gala page's *Donate Without Attending* points to the intent page only when the API says intents are available. Otherwise the Phase 12B behaviour is unchanged.

### C. Program and general giving (new, preview-only)

The reusable `GivingForm` appears on `/give` (section `#prepare`):

1. **Your gift**:
   - destination: *Where it is needed most*, or one of the published programs (the donor's intention);
   - **Sadaqah / Zakat** (Zakat disabled unless approved, with the reason);
   - amount in USD (presets + custom, server limits).
2. **Your details**: full name + e-mail only. Payment details are entered on SDI's form, never here.
3. **Review**: destination, type, intended amount, payment by SDI · Zeffy, three terms, explicit confirmation.
4. **Reference**:
   - the `DN-` reference, with a copy button;
   - the exact instructions: the reference question, the Donation Type answer, and the program designation to choose;
   - an *Open SDI's secure form* link to the URL the API returned for this flow;
   - "MEKI does not issue tax receipts".

**Program preselection.** Every program page links to `/give?programme=<slug>#prepare`, and the form preselects that program. Only slugs the API lists are accepted.

**While a channel is closed** (today: all of them), the form is a **preview**:

- step 2 is skipped (no personal data is collected);
- the review explains why giving is not open (stable reason code → EN/AR text);
- there is no submit button, no reference and no SDI link.

## 2. Public UX — before and after

| Area | Before (Phase 13B) | After (Phase 14) |
|---|---|---|
| Program page | Informational panel; a direct Zeffy link if programme giving were ever enabled | Same informational panel + "Preview a gift intention for this program" (internal link). If programme giving is enabled, the CTA goes through MEKI's intent flow (reference first) instead of a reference-less Zeffy link |
| `/give` | No form (contact channel only) | Giving form (preview while closed), with Sadaqah/Zakat, preselection, review and terms |
| Gala *Donate Without Attending* | Direct SDI link when authorized | Intent page when SDI confirms the reference question; direct link otherwise |
| Return / pending page | None for donations | `/give/status/DN-…`: "Your payment is being verified" + a four-stage tracker; token only in the browser tab (never in a URL) |
| Status distinctions | — | **Intention** → **pending on SDI's form** → **verified (SDI report)** → **allocation approved**; review / not-completed outcomes are never shown as verified |

**Design.** All new UI uses the existing tokens and components: dark green / gold, serif headings, `btn-gold` / `btn-green`, step indicator, cards. The layout uses logical properties (RTL-safe) and a single column on mobile. Inputs have labels, `aria-invalid` and `role="alert"` errors; the step heading receives focus after each step.

**Copy.** EN/AR copy is in `apps/web/src/content/giving.ts`. It is proposed microcopy, and the Arabic is a draft for MEKI review. Zakat copy never states a ruling: "Offered only where MEKI's designated authority has approved it … If you are unsure whether your gift is Zakat, please ask your scholar."

## 3. Admin

| Screen | What it shows / does | Permission |
|---|---|---|
| **Giving intents** (`/giving-intents`) | Reference, flow, Zakat/Sadaqah, intended destination, intended vs SDI-reported amount, verification, allocation, created. Filters on each. Totals by flow × classification × status (USD, real intents only). Donor name/e-mail **only** with `donors.read` | `donations.read` |
| **Intent detail** (`/giving-intents/:id`) | The donor's original choice (immutable); SDI evidence (report file, row, SDI order, reported type/designation, match result, applied); recorded SDI order; audit history; settlement "not reported"; **allocation decision** | read: `donations.read`; decide: `donations.allocate` |
| **Zakat eligibility** (`/zakat-eligibility`) | Every program / project / campaign: effective Zakat state (default **not eligible**), pending request, history; request / approve / reject / revoke | read: `donations.read`; request: `zakat.manage`; decide/revoke: `zakat.approve` |
| **SDI reconciliation** (existing) | New report types GENERAL / PROGRAM donations; columns MEKI Donation Reference, Donation Type, Program/Fund; Donation Type and designation answer maps | unchanged (`sdi.reports.upload` / `sdi.reports.approve`) |
| **Gala ticket references** | Unchanged: Gala → Bookings (EB- references) | unchanged |

There is **no public six-causes dashboard**: the client stated that the six causes dashboard is event-specific.

## 4. Files

**API**

- `src/modules/giving/` (new): `giving.rules.ts`, `giving.service.ts`, `zakat-eligibility.service.ts`, `giving.module.ts`, `giving.spec.ts`
- `src/modules/sdi/sdi-reports.service.ts`: donation-intent matching, apply, flags
- `src/modules/fundraising/fundraising.module.ts`: `galaGivingState`
- `src/modules/donations/donation-config.service.ts`: hosted amount rules
- `src/modules/donations/donations.dto.ts`: the legacy checkout accepts only its three designations
- `src/modules/users/permissions.catalog.ts`: 3 permissions + versioned grant
- `src/config/env.validation.ts`: 5 switches + guards
- `src/app.module.ts`
- `prisma/schema.prisma` + migration `20261121200000_phase14_giving_intents_zakat`
- `.env.example`
- tests: `test/phase14-giving.e2e-spec.ts`, `test/giving-env.ts`

**Web**

- `src/lib/giving.ts`
- `src/content/giving.ts`
- `src/components/giving/{GivingForm,GiftStages,IntentStatus}.tsx`
- `src/app/[locale]/give/page.tsx`, `give/status/[reference]/page.tsx`, `events/gala-night/donate/page.tsx`, `events/gala-night/page.tsx`
- `src/components/gala/GalaSections.tsx`
- `src/components/programme/ProgrammeDonate.tsx`
- `src/content/pages.ts`
- tests: `tests/phase14.test.mjs`, `tests/e2e/agreement.smoke.mjs`

**Admin**

- `src/features/giving/{GivingIntentsPage,GivingIntentDetailPage,ZakatEligibilityPage}.tsx`
- `src/services/giving.ts`
- `src/lib/{giving-schemas,i18n-giving}.ts`
- `src/lib/{i18n,i18n-sdi,navigation,sdi}.ts`
- `src/components/layout/Sidebar.tsx`
- `src/features/finance/sdi/SdiReportDetailPage.tsx`
- routes: `giving-intents`, `giving-intents/[id]`, `zakat-eligibility`
- tests: `tests/phase14.test.mjs`, plus two navigation allow-lists updated

**Contract and ops**

- `packages/api-client`: `openapi.json` (214 paths, +12), `schema.d.ts`, `public.ts` types
- `deploy/vps/api.env.example`
