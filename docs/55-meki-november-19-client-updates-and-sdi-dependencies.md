# 55 — MEKI November 19, 2026 client updates and remaining SDI dependencies

Date: 2026-11-19.

**Rule applied throughout:** MEKI's confirmations are implemented as client-approved **content and configuration**. Anything that depends on SDI (fiscal sponsor, payment collector, receipt issuer) stays **gated** until SDI confirms it in writing.

No sale, donation, report application or financial switch was enabled.

## 1. Client-approved Gala updates and where they live

| Item (MEKI, 19 Nov 2026) | Implementation |
|---|---|
| Event: Every Light Counts / Egypt Gala, **Saturday 12 December 2026**, existing venue (583 Park Avenue, New York) | Unchanged existing content (no contradicting evidence) |
| **USD 500 per guest** (supersedes USD 750) | Website price and Bookings FAQ (EN/AR); admin "approved details"; seed ticket config `500.00`; API Swagger examples; README. The public price shown once the event is published still comes from the API ticket configuration (single source) |
| **Capacity 350** | Seed ticket config `capacity: 350`; admin "approved details". On staging, set through the audited admin API |
| **3:30–8:30 PM, America/New_York** | Website hero shows the hours (EN/AR); agenda header; seed event `startsAt 2026-12-12T20:30Z`, `endsAt 2026-12-13T01:30Z`, `timezone America/New_York` (verified 3:30 PM → 8:30 PM New York) |
| **Speakers: to be confirmed** | The agenda shows **roles only**. The three names previously published in the old timeline (host and two speakers) were **removed**. Note "Speakers to be confirmed." |
| Agenda **"The Evening in a Glimpse"** (four acts) | Structured `timeline.acts` (act label, title, time window; items with time, title, role) in `apps/web/src/content/gala.ts`, EN + AR draft. Rendered as four headed sections with `<time>` elements in the existing Gala design |
| Agenda ends **8:15 PM**; event ends **8:30 PM** | Kept exactly. The hours line says 8:30 PM, the agenda ends with "8:15 PM — The Light Carries On / Close of the evening". **Nothing was invented** for 8:15–8:30 |
| MEKI proposes donations **through December 2027** | **Not applied** — §3 |

**Existing databases:** the seed is create-only and never rewrites rows. `meki_staging` was updated through the admin API: price 750 → 500, capacity 350, schedule, sales still closed. Both changes are audited (`gala.ticketing.update`, `event.update`).

**`meki_dev` was deliberately not changed** (local data). Use the admin UI, or `deploy/staging/apply-nov19-gala.mjs` against it.

On the VPS, do this once after deployment (doc 54 §3).

**Agenda storage:** the Gala page's approved copy lives in the website content file, as before. The CMS event page has an `EVENT_AGENDA` section skeleton, but the Gala page has never been CMS-driven, so moving it would be a redesign. **Agenda status:** published with the new times and roles. The Arabic translation is a technical draft pending MEKI review (as for all Arabic Gala copy).

## 2. Changed files (this update)

- **Website:**
  - `apps/web/src/content/gala.ts` (types, EN/AR price, hero hours, agenda acts, FAQ);
  - `components/gala/GalaSections.tsx` (hero time, act-based timeline, approved website disclosure slot);
  - `app/[locale]/events/gala-night/page.tsx` and `book/page.tsx` (disclosures from the API);
  - `components/booking/{BookingFlow,HostedBookingFlow}.tsx` (approved ticket-purchase disclosure slot);
  - `tests/nov19.test.mjs`;
  - `tests/e2e/site.smoke.mjs` (now asserts the confirmed facts and no speaker names).
- **Admin:**
  - `lib/i18n-gala.ts` (approved details EN/AR);
  - `lib/i18n-sdi.ts` (legal-copy and pending-agreement copy, EN/AR, error codes);
  - `lib/legal-copy-schemas.ts`, `services/legal-copy.ts`;
  - `features/gala/settings/{LegalCopyCard,GalaSettingsPage,FundraisingCard}.tsx`;
  - `tests/nov19.test.mjs`.
- **API:**
  - `prisma/schema.prisma` + migration `20261121100000_gala_legal_copy_drafts` (additive: `EventLegalCopy`);
  - `src/modules/fundraising/legal-copy.ts` + `fundraising.module.ts`;
  - `prisma/seed/gala-night.ts`;
  - `src/modules/gala/ticket-config.service.ts` (examples);
  - `README.md`;
  - `test/nov19-client-updates.e2e-spec.ts`.
- **Contract:** `packages/api-client` (`openapi.json` 202 paths, `schema.d.ts`, `PublicEventFundraising.disclosures`).
- **Ops:** `deploy/staging/apply-nov19-gala.mjs`.

## 3. Contradictions between MEKI and SDI — recorded, NOT resolved by assumption

These are shown to administrators in Gala settings ("Pending SDI agreement"). No gate changed.

| # | MEKI says | SDI said | System behaviour until written agreement |
|---|---|---|---|
| C-1 | Gala fundraising should cover **six programmes** | The Gala Pre-Agreement supports **one project in Egypt** under a written Project Plan; multiple restricted programmes need additional approval, due diligence, reporting and financial arrangements | The single-project rule (doc 50) stays enforced. All nine programme pages remain **informational**; none hidden or deleted; no six designated funds. Which six programmes is **not guessed** |
| C-2 | Donations **through December 2027, "until further notice"** | Proposed **31 January 2027** | `donationsCloseAt` stays empty, so public Gala giving cannot be authorized. No exact day, time or time zone is inferred. The Zeffy campaign is not touched |
| C-3 | The agreement covers **ongoing** giving beyond the Gala | The standalone link is **Gala-only**; ongoing giving needs separate arrangements | `GENERAL_GIVING_AUTHORIZED=false`, `PROGRAMME_GIVING_AUTHORIZED=false`; programme donation controls inactive; nothing redirected to the Gala form |
| C-4 | Tax breakdown USD 500 = **200** fair market value + **300** potentially deductible | Not yet confirmed by SDI (SDI issues the receipts) | Legal copy is stored only as drafts. Publication requires recorded SDI approval (§4) |

**Can the future model be supported without a schema change?**

- *Six programmes approved by SDI as **one** project* (one Project Plan): **yes**. Create one project (cause) record for it and select it in the existing single-project configuration.
- *Six **separately restricted** funds*: **no**. The configuration links exactly one project, and allocations would need per-fund reporting. That needs a reviewed additive change **after** SDI defines the arrangement. It is not built now, to avoid an unapproved model.
- *Separate general giving*: **yes**, through the existing switches (`GENERAL_GIVING_AUTHORIZED` + `SDI_GENERAL_GIVING_ENABLED` + an SDI-approved form URL) once a separate agreement exists.

## 4. Ticket and donation legal wording — status

MEKI supplied three drafts:

- **A.** Ticket purchase disclosure
- **B.** Ticket receipt
- **C.** Website disclosure

Their substance: SDI is a US 501(c)(3), EIN 42-2797838; ticket USD 500, estimated fair market value USD 200, potentially deductible USD 300 to the extent permitted by law; additional donations potentially deductible; all funds collected by SDI, which retains discretion and control.

**The exact wording of the three drafts was not included in what reached the development team.** Only this summary was. It was **not paraphrased or invented**.

Built (approval-gated, additive table `EventLegalCopy`):

1. **Paste the exact text.** Admin → Gala settings → "Gala legal copy": an administrator pastes the **exact** text (EN, and AR if supplied), the stated amounts and the source.
   - The amounts must be all-or-none and **fair market value + deductible = price**.
   - Any edit clears approval and publication.
2. **Record SDI's approval.** A **different** administrator (`events.approve`) records SDI's **written** approval, with a reference.
3. **Publish.** Only **A** and **C** can be published, and only when the stated price equals the **live ticket price**. Wording that still says USD 750 can never be published, and a published disclosure disappears automatically if the price later changes.
4. **The receipt wording (B) can never be published by MEKI.** It is SDI's text for SDI's own Zeffy receipts. MEKI issues **no** tax receipts and does not modify SDI/Zeffy receipt output.
5. **Where it appears.** Published A appears in the hosted booking step; published C appears in the Gala page's booking section. Nothing is shown today.

Also:

- SDI's "donations are not refundable" notice keeps its own approval (doc 50).
- The **ticket** cancellation/refund policy remains pending.
- Privacy Policy, Terms and the refund policy are not invented.

Tests:

- `test/nov19-client-updates.e2e-spec.ts`: amounts, four-eyes, permissions, receipt never publishable, stale-price refusal, localized publication, edit unpublishes, price change hides;
- `apps/admin/tests/nov19.test.mjs`.

## 5. Financial integrity (unchanged, re-verified)

- Hosted Zeffy checkout only, with no account-level API or webhooks.
- Confirmation only from approved SDI daily reports, with preview and second-admin approval.
- One booking reference per order; never confirmed by a browser redirect.
- Ticket revenue and donations kept separate, with no double counting.
- No MEKI tickets, QR codes or receipts for Zeffy bookings.
- Refunds and corrections auditable.
- SDI amount matching uses the **configured** price. With 500 configured, a report row at an old 750-based amount is `AMOUNT_MISMATCH` (test).
- **The real SDI Gala report is still outstanding;** no column names or IDs were invented.

## 6. Test results (this update)

| Suite | Result |
|---|---|
| `test/nov19-client-updates.e2e-spec.ts` (meki_test) | **10/10** |
| Web unit/static (incl. `nov19.test.mjs`) | **85/85** |
| Admin unit/static/contract (incl. `nov19.test.mjs`) | **200/200** |
| Staging (USD 500 / 350 / schedule applied via admin API, audited, sales closed) | Verified |

Full regression and build results: doc 53.

## 7. VPS native MySQL deployment checklist

Doc 54 is the procedure. In short:

- [ ] Confirm the target host and that database `meki` is the intended one; back it up if it exists.
- [ ] `log_bin_trust_function_creators=1`, `bind-address=127.0.0.1`; create `meki_migrator` / `meki_app` / `meki_backup`.
- [ ] `/etc/meki/api.env` (0640) with fresh secrets, https URLs, all financial switches OFF; no `.env` in the release directory.
- [ ] Build → backup → `prisma migrate deploy` (migrator) → seed (first install) → PM2 (1 instance) → `pm2 startup`.
- [ ] nginx + certbot on the API host; ports 6666 and 3306 closed.
- [ ] Bootstrap the Super Admin (once); apply the 19 Nov Gala values in the admin.
- [ ] Nightly backup + off-server copy; one restore drill.

## 8. Vercel admin login — current status

- **Not fixed live.** Not verified: no Vercel or VPS access.
- The root cause (rewrite compiled to localhost) is fixed in code and proven locally (doc 51 §1).
- **Operator steps:** API on the VPS with HTTPS → `ADMIN_API_UPSTREAM=https://<api host>` in the admin Vercel project → redeploy without cache → `GET https://admin-anhk.vercel.app/api/v1/health` returns ok, and a wrong login returns 401 rather than 404 (doc 54 §7).

## 9. Ready for deployment (code)

- API with the pool fix, the atomic password change, the lockout CLI, strict URL validation, the legal-copy gate and the Nov 19 seed values.
- Website with USD 500, the hours, the four-act agenda, no speaker names, and approval-gated disclosures.
- Admin with the legal-copy workflow, the pending-agreement notice and the hosted-build upstream guard.
- Migrations: 11, all additive.
- Rehearsed on local staging (57/57 smoke, restore drill).

## 10. External blockers to go-live

**SDI:**

- The real Gala reconciliation report and the live purchase / standalone donation / refund test.
- Confirmation of:
  - the order-ID column;
  - the booking-reference column;
  - ticket vs added-donation structure;
  - refund representation;
  - currency and time zone.
- **The Zeffy form updated to USD 500 and capacity 350**, and verified (not assumed).
- Approval of the exact wording and the **500 / 200 / 300** breakdown (A, B, C).
- The project scope for six programmes (C-1); the closing date (C-2); ongoing giving (C-3).
- The Gala donation form URL; report delivery details.

**MEKI:**

- The **exact text** of drafts A, B and C.
- The selected project and signed Project Plan.
- Confirmed speaker names (if they are to be published).
- The ticket refund policy.
- Review of the Arabic agenda.
- Approval of the closing date with SDI.
- Content, legal and launch approvals.

**Operator:**

- VPS deployment (doc 54).
- Vercel environment variables and redeploy.
- Rotation of the developer-machine secrets (doc 52 §2).
- Verification of the live login, uploads through the proxy, and the client-IP chain.
