# FINAL — Client requirements matrix

**Date:** 2026-11-22 · **Sources:**
- `docs/client-requirements/Website Comments.docx` (client, 21 Nov 2026; byte-identical, by SHA-256, to the copy fully inspected in Phase 13B, including all 10 embedded images and the agenda graphic);
- docs 49–65;
- the latest instructions ("Final pre-production completion").

**Status keys:** PASS (implemented and verified) · FIXED (fixed in this pass) · BLOCKED_EXTERNAL · FAIL · NOT_APPLICABLE

The client DOCX is proprietary. It is now git-ignored (`docs/client-requirements/`) and must not be committed.

## 1. Website Comments (client document)

| # | Requirement (client) | Implementation | Evidence (tests) | Status |
|---|---|---|---|---|
| 1 | Remove the "Luxor · WASH program" label beside "Give today" (the WASH programme itself stays) | Badge removed from the donation section; programme 06 "WASH, Environment & Climate Resilience" unchanged | `apps/web/tests/phase13b.test.mjs` "donation section…" | PASS |
| 2 | Venue photos on the Gala page | Rendered only from the event's published `EVENT_VENUE` section (admin: Gala → Settings → Venue photos; edit `events.manage`, publish `events.publish`). Nothing is rendered when there are no photos, so none are invented | web phase13b "venue photos…"; admin phase13b "Gala venue photos…" | PASS. The client must upload and publish the photos in the admin |
| 3 | Captions in the format "Title – Place" | `photoCaption()` (web) and the admin preview; gallery and About photos EN/AR | web phase13b "captions…"; admin phase13b "caption preview…" | PASS |
| 4 | "Refined Refreshments" (exact text) replaces the alcohol-free card | `content/gala.ts` uses the exact client wording; the other five cards are unchanged | web phase13b "refreshments…" | PASS |
| 5 | Four-act agenda ("The Evening in a Glimpse", from the DOCX image) | Acts I–IV with the exact times: 3:30 pre-event … 8:15 close of the evening. Speakers are shown by role only (names are not published until MEKI confirms them) | web nov19 "agenda…", "speakers are not named…", "timeline renders…" | PASS |
| 6 | Remove the Arrival and Transfers content | Removed in EN/AR; the venue address and map link are kept | web phase13b "arrival and transfers removed…" | PASS |
| 7 | Ticket price USD 500 everywhere (supersedes 750) | Web Gala page, admin approved facts and legal copy. The live price comes from the API ticket config (500.00; runbook step) | web nov19 "price…"; admin nov19 "approved list shows USD 500…" | PASS |
| 8 | Dietary options: gluten-free, vegan, vegetarian, nut allergy, plus "other" | Gala FAQ (EN/AR) and the booking guest field (MEKI reference flow). In hand-off mode SDI's form collects attendee details, and the copy says so | web phase13b "dietary…"; admin phase13b "approved details list…" | PASS |
| 9 | SDI legal wording: 501(c)(3), EIN 42-2797838, USD 500 = 200 fair market value + 300 deductible (texts A/B/C) | `apps/admin/src/lib/legal-copy-source.ts` holds the verbatim source. It is published only through the approval-gated Legal copy card (four eyes; the receipt text is never published on the website) | admin phase13b "21 Nov SDI wording…" (4 tests); admin nov19 legal-copy gate tests | PASS. Publishing requires an MEKI approver in the admin |

## 2. Final-release instructions (this pass)

| Requirement | Result | Status |
|---|---|---|
| Use the TWO official Zeffy forms | Exact URLs in `src/lib/official-forms.ts`; labelled hand-off on book/donate; reference-first flow preferred | FIXED (switch default OFF until SDI confirms collection is open) |
| Pages never useless when the backend is offline | With the switch on, the hand-off renders without any API call; with it off, the truthful closed panel is shown | FIXED |
| Embed only with official code | Embed code is available only from SDI's dashboard; no iframe was fabricated | BLOCKED_EXTERNAL |
| Preserve EB-/DN- references and the lifecycle; never paid from a redirect | Unchanged; API 490/490 tests | PASS |
| Zeffy API/webhooks only where verifiable | Read-only client against the documented payments list; webhook kept disabled (no documented signature) | PASS / BLOCKED_EXTERNAL (no key from SDI) |
| No dead buttons, no fake success; all API calls real | 230 call sites → 0 without a backend route. Two dead ends found and fixed: forced password change, Users & Roles | FIXED |
| Admin finance shows real data | Pages read DB rows only; the seed creates 0 transactions (verified on an empty DB) | PASS |
| Migrations apply to an EMPTY MySQL 8 | 15/15, 53 tables, 18 triggers, no drift, idempotent; migrator vs runtime users verified | PASS |
| VPS-only hosting (meki-us.org; 3000/3001/6666; .com/.net → .org) | PM2, nginx (validated on nginx 1.24), env templates, HTTPS-Git deploy and rollback scripts, runbook | PASS (config). Live VPS not touched |
| Security: secrets, dependencies | gitleaks on history and tracked files: only 3 test fixtures; `pnpm audit --prod` clean after 2 narrow overrides | FIXED |
| Arabic RTL + English LTR | All new copy EN/AR with parity tests; browser checks in EN desktop and AR mobile | PASS |
| No commit, push, deploy or live financial switch | Nothing was committed, pushed or deployed; all switches remain false | PASS |

## 3. Confirmed vs proposed data (CLAUDE.md guardrail)

- **Confirmed (client/SDI):**
  - USD 500;
  - capacity 350;
  - 12 Dec 2026, 3:30–8:30 PM America/New_York;
  - the agenda acts and times;
  - Refined Refreshments text;
  - dietary list;
  - SDI legal texts and EIN;
  - the two official form URLs.
- **Proposed / editable drafts:** the 8 campaigns and 4 statistics in the seed are drafts. **0 are published** on an empty DB (verified). Anything shown before MEKI approval is marked as a preview.
- **Never seeded:** donations, bookings, payments, evidence, admin accounts (all verified as 0 on the empty-DB seed).
