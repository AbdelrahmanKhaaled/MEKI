# 60 — Phase 14: Zakat / Sadaqah and the financial model

Date: 2026-11-21.

## 1. Principles

1. **One donation system.** A hosted donation intent is a row in the existing `Donation` table (provider `sdi_hosted`), with its intended destination in the existing `DonationAllocation`. Gala tickets stay `EventBooking`. No second gateway, ledger or donor store was created.
2. **Three independent dimensions**, never derived from each other:
   - **classification**: the donor's Zakat/Sadaqah choice;
   - **payment verification**: from an approved SDI report only;
   - **fund-allocation authorization**: decided by an administrator.
3. **Nothing is eligible for Zakat by default.** Eligibility is an explicit, audited, two-person decision per target.
4. **The donor's choice is immutable.** It is never converted between Zakat and Sadaqah, and is never inferred.
5. **Tickets are not donations.** Gala tickets have no charitable classification and are never mixed with donations.

## 2. Concepts → storage

| Concept | Where | Notes |
|---|---|---|
| Payment intent type | `Donation.intentType` = `GALA_DONATION` / `PROGRAM_DONATION` / `GENERAL_DONATION`; `GALA_TICKET` = `EventBooking` | Enum `PaymentIntentType` (4 values). Immutable (trigger) |
| Donation classification | `Donation.charitableClassification` = `ZAKAT` / `SADAQAH` | Immutable (trigger) + recorded in the append-only audit log (`giving.intent.create`) |
| Selected program / project / campaign | `DonationAllocation.designation` = `PROGRAMME` (programmeId) / `PROJECT` (projectId, **new** value + column) / `GENERAL_FUND` | The donor's **intention** |
| Authorized destination / fund | `Donation.allocationStatus` (`PENDING_AUTHORIZATION` / `AUTHORIZED` / `REJECTED`), `authorizedFund`, `allocationDecidedById/At`, `allocationNote` | Separate from verification |
| Donor-entered amount + currency | `Donation.amount`, `currency` = USD | The intended amount; MEKI never charges it |
| SDI-reported amount | `Donation.reportedAmount` | May differ (donor changed it on Zeffy) → review |
| Unique MEKI reference | `Donation.reference` `DN-` + 12 chars (unique index) | Generated server-side; retried on the (astronomically unlikely) collision |
| External Zeffy / SDI payment id | `Donation.externalPaymentId` (**unique**) + `ProviderPayment` (provider `sdi_report`, unique per order, `matchedEntityType='Donation'`) | One order ↔ one intent |
| Payment status | `Donation.paymentStatus` (`UNPAID` → `PAID`) and `status` (`PENDING` → `COMPLETED`) | Set only when an approved report is applied |
| Reconciliation status | `Donation.reconciliationStatus` = `AWAITING_REPORT` / `VERIFIED` / `NEEDS_REVIEW` / `REPORTED_UNPAID` | — |
| Payout (settlement) status | `Donation.payoutStatus` = `NOT_REPORTED` | No reliable source exists (Zeffy payouts are SDI-side), so it is never set automatically: a completed charge ≠ settled funds |
| Source report + audit | `reconciledReportId` + `reconciledReportRow`; `ProviderReportRow.donationId`; audit actions `giving.intent.create / verified / needs_review / reported_unpaid`, `giving.allocation.authorize / reject` | The SDI file's SHA-256 is kept on the import |
| Creation / approval timestamps | `createdAt`, `reconciledAt`, `allocationDecidedAt`; Zakat `requestedAt` / `decidedAt` | — |

## 3. Zakat eligibility

Model `ZakatEligibilityDecision`:

- target type (`PROGRAMME` / `PROJECT` / `CAMPAIGN`) and target id;
- requested `eligible` value;
- status: `PENDING_APPROVAL` / `APPROVED` / `REJECTED` / `REVOKED` / `SUPERSEDED`;
- **authorityReference**: MEKI's designated religious/finance authority decision;
- **sdiAcceptanceReference**: SDI's acceptance of the accounting restriction;
- requester and decider, with timestamps and notes.

Rules:

- **Effective eligibility** = the latest `APPROVED` decision says `eligible=true` **and** carries both references. No decision means **not eligible**.
- **Request**: `zakat.manage` (Administrator, Finance Manager). `eligible=true` without both references is refused (`ZAKAT_REFERENCES_REQUIRED`). Only one pending request per target is allowed; DEMO records are refused.
- **Approve / reject**: `zakat.approve` (Administrator), by a **different** administrator (`FOUR_EYES_REQUIRED`). Approving supersedes the previous approval.
- **Revoke**: `zakat.approve`. Immediate; no four-eyes, because it only reduces what is offered. Gifts already recorded keep their original classification.
- All steps are audited (`zakat.eligibility.request / approve / reject / revoke`). Decisions are never deleted.

**Where Zakat may be selected** (server gate `zakatGate` — all must hold):

1. `ZAKAT_GIVING_ENABLED=true`;
2. `SDI_DONATION_TYPE_CONFIRMED=true` (SDI's form records Zakat/Sadaqah and exports it; this also requires `SDI_DONATION_REFERENCE_CONFIRMED`);
3. the gift has a target:
   - Program gift → that `PROGRAMME`;
   - Gala gift → the approved Gala `PROJECT`;
   - **General gifts have no Zakat target**, so Zakat is never offered there (`NO_ZAKAT_TARGET`);
4. the target is effectively eligible.

A Zakat intent that fails any rule is refused (`422 ZAKAT_NOT_ALLOWED` with the reason). The website shows the reason and never offers the option.

**Campaign targets.** Campaign-level decisions are recorded and listed. No campaign giving flow exists today (campaign donations remain outside the agreement), so a campaign decision has no public effect yet.

**Public wording** never states that a program "is Zakat-eligible" as a religious fact. It says the option is offered where MEKI's authority approved it and SDI accepted it, and points donors to their scholar.

## 4. Gala tickets versus donations

- Tickets: `EventBooking` / `EVENT_TICKET_PAYMENT`. No Zakat/Sadaqah.
- Additional donations made **on SDI's ticket form** remain review items (Phase 12B), because SDI's real report structure is unknown.
- Expose Zakat on Gala donations only if the approved Gala project is approved for Zakat (same gate). Today it is not.
- Reconciled totals keep three Gala categories apart:
  - ticket revenue;
  - Phase 12B standalone Gala gifts;
  - Phase 14 Gala gifts verified against a MEKI intent (`galaDonationIntentsVerified`).

## 5. Database changes (migration `20261121200000_phase14_giving_intents_zakat`)

**Additive only.**

- **`Donation`**: 14 nullable columns, a unique index on `externalPaymentId`, and an index on `(intentType, reconciliationStatus)`. Legacy rows keep `NULL`.
- **`DonationAllocation`**: `projectId` (nullable, FK `Project`, index). The enum `DonationDesignation` gains `PROJECT`, appended; the same enum widening applies to `RecurringDonation`.
- **`ProviderReportRow`**: 6 nullable columns + an index on `donationId`.
- **New table**: `ZakatEligibilityDecision`.
- **Trigger** `Donation_intent_classification_immutable` (BEFORE UPDATE): once set, `charitableClassification` and `intentType` cannot change. Other columns are unaffected.
- No `DROP`, no data rewrite, no default changed on existing columns.

**Applied to:**

- `meki_test` (via `prisma migrate deploy`);
- the local staging rehearsal DB (doc 62).

**Not applied to** `meki_dev` or any live database.

**Verification:**

- The SQL was generated by diffing `meki_test` against the schema, then reviewed.
- The trigger syntax was proven on a throwaway probe table in `meki_test`, which was then dropped. No scratch database could be created by the restricted user, and none was.
- Integration tests prove the trigger blocks a Zakat↔Sadaqah or intent-type change while allowing other updates.

**Legacy checkout.** The DTO now accepts only `GENERAL_FUND | CAMPAIGN | PROGRAMME`, so `PROJECT` can never enter through the legacy checkout. The legacy checkout itself stays disabled in staging/production.
