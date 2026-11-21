# 58 — Phase 13B: final QA and launch blockers

Recorded 2026-11-21 on the developer machine.

- Integration tests ran against `meki_test` (the suite refuses any non-`*_test` database).
- The staging rehearsal ran against the isolated `meki_staging` database (Docker, 127.0.0.1:3308).
- `meki_dev` was not modified. No live system was reached.
- Synthetic data only. Nothing was paid, applied or e-mailed.
- Exit codes below are the tools' own codes.

## 1. Test results

| Check | Command | Result |
|---|---|---|
| API unit + integration | `cd apps/api && npx jest --runInBand` | **32/32 suites, 452/452 tests** (444 s, Jest exit 0) |
| Website unit/static | `pnpm --filter @meki/web test` | **92/92** (85 previous + 7 new `phase13b.test.mjs`) |
| Admin unit/static/OpenAPI contract | `pnpm --filter @meki/admin test` | **209/209** (200 previous + 9 new `phase13b.test.mjs`) |
| Typecheck + lint + production build, all packages | `pnpm turbo run typecheck lint build --force --concurrency=1` | **10/10 tasks** (exit 0). 6 lint warnings, all pre-existing and in files this phase did not touch |
| Staging website/admin builds | `next build` in `apps/web` (`NEXT_PUBLIC_API_URL=http://localhost:4200/api/v1`) and `apps/admin` (`ADMIN_API_UPSTREAM=http://localhost:4200`) | Both exit 0 |
| Staging end-to-end smoke | `node deploy/staging/smoke.mjs` | **54/54**. Doc 53's 57 included 3 one-time first-login rotation checks that run only while the bootstrap password is unchanged |
| Cross-browser smoke vs staging (EN desktop 1440×900, AR mobile 390×844) | `WEB_URL=http://localhost:3200 BROWSER=… node apps/web/tests/e2e/agreement.smoke.mjs` | **Chromium 42/42 · Firefox 42/42 · WebKit 42/42** (28 previous + 14 Phase 13B checks) |
| Caption script on staging | `DRY_RUN=0 node deploy/staging/apply-nov21-captions.mjs` | 7 gallery items, 4 About labels, 7 media captions updated; both sections republished (clean before); second dry run: **0 changes** (idempotent) |
| Visual review (reduced motion) | Playwright screenshots | Refreshments card, venue without Arrival, AR dietary FAQ (RTL), home hero without the WASH badge: as intended |

**Build note.** `pnpm turbo run build` does not pass `NEXT_PUBLIC_API_URL` / `ADMIN_API_UPSTREAM` through to the Next builds (Turbo strict environment mode). The first staging admin build therefore compiled its rewrite to `localhost:4000`, and `/api/v1/health` through the admin returned 500.

- Building the app directly with the variable fixed it.
- On Vercel, each project builds on its own with its own variables, so production is not affected.
- For local or CI release builds of a hosted target, build web/admin directly, or declare these variables in `turbo.json`. This is a follow-up, not changed here to avoid altering build caching unreviewed.

The admin's hosted-build guard (doc 51 D-1) still protects Vercel/staging/production targets.

**Phase 13B browser checks (per locale and engine):**

- Refined Refreshments replaces the alcohol-free card.
- No Arrival/Transfers content; address and map link kept.
- Dietary options listed.
- Venue photos only when published (0 today).
- No horizontal scroll on the Gala page.
- Home: no WASH badge beside Give today.
- Home gallery captions all "Title – Place".

**Not tested in a browser:**

- The venue photo gallery **with photos**. No authentic photos exist, and synthetic images were not inserted into staging, to avoid presenting fake venue imagery. Covered by unit tests: selection, URL safety, DEMO exclusion, captions, empty state.
- The new admin "Venue photos" card. Covered by static, permission and i18n tests and the type check.

## 2. Areas re-verified

Homepage, programme pages (informational), `/give` (no checkout), Gala page in full, booking/donation controls (disabled), admin Gala settings, the SDI importer (doc 57 §2), EN/AR and RTL, desktop/mobile, security headers, CORS, rate limit, RBAC and logout (staging smoke), and SEO.

SEO:

- metadata unchanged;
- no price in structured data;
- robots still closed until launch approval.

## 3. Infrastructure readiness (Phase 13A review)

| Item | Status |
|---|---|
| API build / image | ✔ builds; the VPS uses PM2, not Docker (doc 54) |
| Prisma migrations | 11, all additive. **Phase 13B adds none.** Procedure: backup → `migrate deploy` with the migrator account (doc 54 §3) |
| DB pool | ✔ `withPoolDefaults` (doc 51 D-2) |
| Backup + restore drill | ✔ on staging (doc 53). **Must be repeated on the VPS** |
| Auth / sessions / cookies | ✔ `__Host-`, HttpOnly, Secure, SameSite=Strict (staging smoke) |
| Admin proxy / login 404 | Fixed in code. **Live: unverified** — the operator must set `ADMIN_API_UPSTREAM=https://<api host>` on Vercel and redeploy (doc 54 §7) |
| Health checks / env validation | ✔ readiness + liveness; strict URL/financial validation |
| Cross-browser | ✔ (§1) |
| Live Vercel + VPS | **Not accessed.** No claim of live deployment |
| `pnpm audit --prod` | Not re-run (needs registry access). Remains a release gate |

## 4. Go-live readiness

| Area | Ready? |
|---|---|
| **Website** (content, Gala page, EN/AR) | **Code ready for deployment.** It still needs the deployment itself, MEKI review of the Arabic drafts, and launch/indexing approval. Venue photos appear when MEKI uploads them |
| **Admin** | **Code ready for deployment.** The live login needs the Vercel variable and a redeploy |
| **Financial operations** (ticket sales, Gala giving, report application) | **Not ready, by design.** Blocked on SDI items S-1…S-6 below. Every switch stays OFF |

## 5. Remaining external requirements (only open items)

### SDI

1. **Real Gala reconciliation report sample** with a unique order/payment ID. Plus the live small purchase + refund (and standalone donation) test using a MEKI staging reference.
2. Confirm in the real report:
   - the order-ID column;
   - the "MEKI Booking Reference" answer column (required, once per order);
   - ticket vs added-donation lines;
   - refund representation;
   - currency;
   - time zone and cut-off.
3. **Update and confirm the live Zeffy ticket form**: USD 500, capacity 350, 12 Dec 2026 3:30–8:30 PM America/New_York.
4. **Written approval on record** of the exact wording A (ticket disclosure) and C (website disclosure), including the 200/300 breakdown. Confirm that receipt wording B is configured on SDI's Zeffy receipts. Optionally: the missing final period in C, and an approved Arabic version.
5. Add a **dietary question** (Gluten-free / Vegan / Vegetarian / Nut allergy / Dairy-free) to the Zeffy ticket form, if MEKI wants answers collected. Include it in the attendee export.
6. Agreement scope:
   - the six programmes (C-1);
   - the Gala donation closing date (C-2);
   - ongoing giving (C-3).

### MEKI

1. **Authentic venue photographs** of 583 Park Avenue, with publication rights and alt text. Upload them in Admin → Gala → Settings → Venue photos.
2. The selected project and signed Project Plan (single-project rule), and alignment with SDI on C-1…C-3.
3. Confirm the three caption/wording decisions in doc 56 §4:
   - alcohol-free removed from the FAQ;
   - "Egypt" as the place where no city is known;
   - the hero badge removed.
4. Confirmed speaker names, if they are to be published.
5. Ticket refund/cancellation policy.
6. Review of the Arabic Gala copy, including the new refreshments and dietary text.
7. Written go-ahead per financial switch, and launch/indexing approval.

### Operator (deployment only — no external party needed)

1. Deploy the API to the VPS (doc 54).
2. Set Vercel variables and redeploy website + admin.
3. Rotate developer secrets.
4. On the VPS database:
   - apply the 19 Nov Gala values (`apply-nov19-gala.mjs`);
   - run the caption script (dry run first);
   - load the three legal texts as drafts.
5. Verify the live login, uploads through the proxy and the client-IP chain.
6. Run a VPS backup/restore drill.

## 6. Next action

The smallest step the team can complete without waiting for anyone: **deploy this build to the VPS and Vercel (doc 54 §3–§7), then run the post-deploy steps on the VPS database.** The post-deploy steps are:

1. `apply-nov19-gala.mjs`;
2. `apply-nov21-captions.mjs`, dry run, then apply;
3. load the three SDI texts as unapproved drafts.

Then verify `GET https://<admin>/api/v1/health` returns ok, and that a wrong login gives 401, not 404.

This puts every client comment except the venue photos live in preview, and fixes the live admin login.
