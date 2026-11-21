# 62 — Phase 14: tests and launch gates

Recorded 2026-11-21 on the developer machine.

- Integration tests ran against `meki_test` (the suite refuses any other database).
- The rehearsal ran against the isolated local staging database `meki_staging`, which was backed up first.
- **`meki_dev` and every live system were not touched.**
- All reports are synthetic fixtures. No payment, real transaction or e-mail took place.

## 1. Test results

| Check | Command | Result |
|---|---|---|
| API unit + integration (all suites) | `cd apps/api && npx jest --runInBand` | **34/34 suites, 476/476 tests**, Jest exit 0 (303 s; a second, independent run: same result, 376 s) |
| Phase 14 API integration | `npx jest test/phase14-giving.e2e-spec.ts --runInBand` | **16/16** |
| Phase 14 API unit (gates, references, stages, config guards) | `npx jest src/modules/giving/giving.spec.ts` | **8/8** |
| Website unit/static | `pnpm --filter @meki/web test` | **104/104** (92 + 12 Phase 14) |
| Admin unit/static/OpenAPI contract | `pnpm --filter @meki/admin test` | **219/219** (209 + 10 Phase 14) |
| Typecheck + lint + production build, all packages | `pnpm turbo run typecheck lint build --force --concurrency=1` | **10/10 tasks**, exit 0. 6 lint warnings, all pre-existing (same files as Phase 13A/13B) |
| Staging backup before migrating | `docker compose … run --rm backup` | `meki_staging-20261121T112732Z.sql` (51 tables, 14 triggers, checksum file) |
| Staging migration + seed | `… run --rm migrate` / `… run --rm seed` | Phase 14 migration finished; trigger present; seed created only the 3 new permissions + 1 versioned grant |
| Staging end-to-end smoke | `node deploy/staging/smoke.mjs` | **54/54** |
| Staging with production-default switches | `GET /public/giving/options`; `POST /public/donation-intents` | 9 programmes listed, **0 payable, 0 Zakat**; intent POST → **409** (nothing written) |
| Cross-browser journeys vs staging (EN 1440×900, AR 390×844) | `BROWSER=… node apps/web/tests/e2e/agreement.smoke.mjs` | **Chromium 56/56 · Firefox 56/56 · WebKit 56/56** |
| Admin pages on staging (authenticated) | Playwright | Giving intents, Zakat eligibility (EN + AR): render, 0 page errors, all 28 targets "Not eligible" |

### 1a. Full API suite

- **First full run:** 34 suites, **475/476** tests. One failure: a Phase 12B assertion pinned the exact key list of the Gala totals, and Phase 14 intentionally adds a separate `galaDonationIntentsVerified` category. The assertion was updated (not removed); that suite was re-run: **15/15**.
- **Final clean runs (after every change):** **34/34 suites, 476/476 tests**, exit 0. Two independent full runs gave the same result.

### 1b. Spec items covered by automated tests

| Requirement | Where |
|---|---|
| Gala booking intent creation | existing Phase 12 suites (`phase12-sdi.e2e-spec.ts`, booking references) — unchanged and passing |
| Gala donation intent creation | phase14 e2e: "Gala donation: DN reference before hand-off…" |
| Program preselection | phase14 e2e (programme form, designation); web `preselect` unit tests; browser `?programme=health` |
| Zakat vs Sadaqah; ineligible Zakat rejected | phase14 e2e Zakat suite; web `validateGift`; browser "Zakat cannot be selected" |
| Disabled channels | phase14 e2e "each channel is refused on its own switch"; unit "production defaults"; staging 409 |
| Duplicate reference protection | phase14 e2e idempotency + unique-index test; web `IntentKeeper` |
| Abandoned checkout | phase14 e2e (status stays pending); report `Abandoned` row → `REPORTED_UNPAID` |
| Missing / mismatched Zeffy references | phase14 e2e rows: missing, unknown DN, EB reference, malformed |
| Incorrect amount / wrong program / wrong donation type | phase14 e2e: `AMOUNT_MISMATCH`, designation review, type review, unknown type, wrong form |
| Repeated import idempotency | phase14 e2e: `ALREADY_APPLIED`, one provider record, `DUPLICATE_FILE` |
| Two-person approval | phase14 e2e: uploader cannot apply; Zakat four-eyes; allocation not by the report approver |
| No payment confirmation from redirect | phase14 e2e: no confirm endpoint; status unchanged; browser status page "being verified" |
| Immutable classification | phase14 e2e: DB trigger blocks Zakat↔Sadaqah and intent-type changes |
| Arabic / English and mobile journeys | browser smoke (AR mobile RTL); EN/AR copy parity tests (web + admin) |
| Existing regression suites | all API / web / admin suites above |

## 2. Implemented vs disabled

**Fully implemented (code + tests):**

- the three intent flows;
- `DN-` references;
- first-class immutable Zakat/Sadaqah;
- Zakat eligibility with four eyes;
- per-channel gates;
- the preview mode;
- the return/status page with the four-stage tracker;
- donation-report reconciliation (reference, type, designation, wrong form, duplicates, idempotency, review flags);
- allocation authorization;
- admin intents / detail / Zakat screens;
- the importer UI for the new mappings;
- separate Gala totals;
- OpenAPI contract;
- EN/AR copy.

**Disabled (production defaults, unchanged by this phase):**

| Switch | Value |
|---|---|
| `GALA_HOSTED_SALES_ENABLED`, admin sales switch | off / closed |
| `SDI_GALA_GIVING_ENABLED` | false |
| `GENERAL_GIVING_AUTHORIZED`, `SDI_GENERAL_GIVING_ENABLED` | false |
| `PROGRAMME_GIVING_AUTHORIZED`, `SDI_PROGRAMME_GIVING_ENABLED`, `SDI_PROGRAMME_DESIGNATION_CONFIRMED` | false |
| `SDI_DONATION_REFERENCE_CONFIRMED`, `SDI_DONATION_TYPE_CONFIRMED`, `ZAKAT_GIVING_ENABLED` (new) | false |
| `SDI_REPORT_APPLY_ENABLED` | false (no verified real-sample mapping) |
| `PAYMENTS_ENABLED` (legacy MEKI checkout) | false; refused in staging/production |
| Zakat-eligible targets | none |

## 3. SDI configuration still required

1. On the **Gala donation form**:
   - add **"MEKI Donation Reference"** (required, once per gift);
   - if Zakat is to be accepted, add **"Donation Type: Zakat / Sadaqah"** (required);
   - make sure both appear in the export.
2. On the **Gala ticket form**: confirm **"MEKI Booking Reference"** is required, once per order, and exported. Also confirm the USD 500 price and capacity of 350.
3. **Written answer on scope** (MEKI's draft e-mail of 21 Nov covers exactly this):
   - may SDI accept program-designated and/or general gifts?
   - may it accept Zakat-restricted gifts, and with which accounting treatment?
   - which programs / funds?
   - if yes, the SDI form URL(s) per program/fund, with the **approved Program/Fund** question.
4. **Live tests** (small purchase, standalone donation, refund) using MEKI staging references, followed by the **actual itemized report** with:
   - unique transaction IDs;
   - statuses;
   - ticket vs donation amounts;
   - every custom-question answer;
   - currency and time zone.
5. Settlement / payout data, if MEKI needs settlement tracking. There is none today, so payouts stay `NOT_REPORTED`.

## 4. MEKI policy approvals still required

1. A written decision from MEKI's **designated religious/finance authority** on which programs / projects / campaigns may receive Zakat. Each one is then recorded by one administrator and approved by another, citing SDI's acceptance.
2. Agreement with SDI on the scope above (six programs vs one project; closing date; ongoing giving).
3. Approval of the public giving copy (EN, and the AR drafts), including the Zakat wording and the review terms.
4. Fund-allocation policy: who authorizes allocations, and how verified gifts map to SDI funds.
5. Written go-ahead per switch (doc 49 D-12).

## 5. Answers

| Question | Answer |
|---|---|
| **Is the code safe to commit?** | **Yes, subject to the normal review.** The migration is additive (reviewed SQL, applied cleanly to `meki_test` and `meki_staging`). No secret, real `.env`, client resource or credential is included (staging secrets and backups are git-ignored; verified). All switches default to off. Nothing was committed, by instruction |
| **Is Gala ticketing technically ready for an authorized launch?** | **Yes, technically** (unchanged since Phase 12/13). It still needs SDI's confirmation of the reference question, a 500/350 form, the live test, the real report sample and a verified mapping, plus MEKI's go-ahead. Sales stay closed |
| **Can program and Zakat giving be activated?** | **Not legally today.** The current SDI agreement covers one Gala project; program, general and Zakat-restricted giving are not authorized, and no target has an approved Zakat decision. **Technically, yes, once authorized:** set the switches in order (reference confirmed → type confirmed → channel authorized + enabled + form URL → Zakat enabled), record Zakat decisions with two administrators, and verify a real-sample mapping before applying reports |

## 6. Next action (no external party needed)

1. Deploy this build to the VPS / Vercel (doc 54), then run `prisma migrate deploy` there after a backup (migration `20261121200000`), and the create-only seed for the three new permissions.
2. Then prepare, in the admin importer, a **draft** GALA_DONATIONS / PROGRAMME_DONATIONS mapping profile with the expected column names, ready to be verified the day SDI's real report arrives.

## Closing note: final verification (2026-11-21)

- **API:** 34/34 suites, 476/476 tests (two independent full runs, both exit 0).
- **Migration `20261121200000_phase14_giving_intents_zakat`:** finished on `meki_test` and `meki_staging`; trigger `Donation_intent_classification_immutable` present on both; no probe objects left behind.
- **Staging:** the 3 new permissions exist; **0** Zakat decisions (nothing eligible); **0** donation intents (the production-default switches refused the check request with 409).
- **Contract:** 214 OpenAPI paths (12 Phase 14).
