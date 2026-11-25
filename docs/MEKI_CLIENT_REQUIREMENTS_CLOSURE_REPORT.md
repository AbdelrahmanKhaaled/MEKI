# MEKI — client requirements closure report (Phase 08.5)

> Historical record. Phase 09 confirms the website Arabic translations and the Disability assignment to program 08. The final website results, public asset locations and remaining external dependencies are in the [final client changes report](MEKI_FINAL_CLIENT_CHANGES_REPORT.md).

**Date:** 25 Nov 2026 · **Scope:** client-requested website changes only. No database, migration, deployment or infrastructure work; nothing committed, pushed or deployed.
**Method:** every client source was re-read in full (the two Word documents were extracted; the 10 images embedded in *Website Comments.docx* were opened, including the agenda graphic) and compared with the **current source code**, not with earlier reports. Evidence = file + test; where a test is named it passes in the 25 Nov run (web 180/180, admin 235/235, `tsc` clean).

## 1. Sources and which one is newer

| # | Source | Date | Role |
|---|---|---|---|
| S1 | `docs/client-requirements/Website Comments.docx` (git-ignored) | 21 Nov | First client comments (Gala + gallery captions + SDI legal wording) |
| S2 | `MEKI-US Website Edits for the IT Team.docx` | 22 Nov | Home + Gala edit list; supersedes S1 where they differ |
| S3 | `client-feedback.md` | 23 Nov | Gallery captions, hero photo, water photo, image quality |
| S4 | `client-confirmations-nov24.md` | 24 Nov | Venue address, experience cards, sponsorship, social URLs, pending list; overrides S1/S2 |
| S5 | `MEKI Website Content (Programs) SHORTENED.docx` | 25 Nov | Programs / Legacy / Enabling copy; **supersedes the "Program copy" of S2** |
| S6 | Project instructions of 25 Nov | 25 Nov | Photos of 24 Nov delivery; host approval; `Inquiries@meki-us.org`; partner logos hidden until signed; Arabic "considered approved" |

Rule applied: the **newest explicit instruction wins**; older wording is kept only where nothing newer exists.

## 2. Conflicts between old and new instructions (reported, not silently resolved)

| # | Conflict | Sources | What the code does | Action needed |
|---|---|---|---|---|
| C1 | Card 3 title: **"Refined Refreshments"** (S1, 21 Nov) → **"Virgin bar"** (S2, 22 Nov) → **"Virgin Drinks"** (S4, 24 Nov) | newest = S4 | Title "Virgin Drinks"; the card text is S1's exact description ("A curated selection of fresh juices, premium teas, coffee, and sparkling beverages, thoughtfully served throughout the evening"). Arabic title "مشروبات منعشة". "Refined Refreshments" appears nowhere in the UI (test `closure-audit`) | None, **but MEKI should confirm they want the 21 Nov description under the 24 Nov title** (S4 only names the title) |
| C2 | Program copy: S2 ("two short sentences", "What we do" tags, 22 Nov) vs S5 (mandate, areas of work with descriptions, 25 Nov) | newest = S5 | S5 implemented; S2 layout superseded (tests `nov25.test.mjs`) | None |
| C3 | Programs intro: "Nine programs. One commitment." + one paragraph (S2) vs "Nine Programs. One Commitment." + three paragraphs (S5) | newest = S5 | S5 | None |
| C4 | Venue photos: "exterior **and the hall**" (S2 #21) vs "exterior photographs only" (S4) | S4 | Exterior only; no interior claim anywhere (test) | Hall photos still not supplied |
| C5 | Current photos stay (S2 intro) vs hero replaced with family / school photos and water photo (S3, S6) | newer | New photos | None |
| C6 | Host photo: "approved by her management" (S2) — consent unknown on 24 Nov — approval granted 25 Nov (S6) | S6 | Host published by the sync (consent set to CONFIRMED) | Written approval itself is not in the repo — keep it on file |
| C7 | Experience photos (S2 #18: venue / dish / drinks / lamps / auction) vs only exteriors exist (S4) | S4 | Exterior on "Black-tie" only; others icons | Photos needed |
| C8 | On-page booking **form** with name, e-mail, city & country, organization & title, food preferences, accessibility (S2 #22) vs the SDI hosted-form flow (S4: "decision pending MEKI/SDI"; the client later confirmed the existing booking works) | S4 / S6 | Existing booking flow untouched (it collects name, e-mail, phone, dietary; **no city/country, organization/title, accessibility**) | MEKI/SDI decision; implementing it needs backend fields → out of scope for this phase |
| C9 | Agenda graphic (S1) names "Mr. Beshir Shousha" and "Raya Abirached · Master of Ceremonies"; S2 #20: "Show only names confirmed in writing", host title changed to "Opening with our host, Raya Abirached" | S2 | Raya only; Beshir Shousha **not** shown | See D3 |
| C10 | Arabic: client approval (S6, "considered approved") vs the draft notice still shown on the Arabic site | — | Notice kept (see D6) | MEKI sign-off |

## 3. Requirements checklist

Status: **C** completed · **CC** completed, needs client content · **P** partial · **N** not implemented · **B** blocked externally.

### 3.1 Homepage
| Req | Status | Evidence |
|---|---|---|
| S1: remove "Luxor · WASH program" badge beside Give today | C | `phase13b.test.mjs`; Hero.tsx comment + no badge |
| S2 #3 hero intro = approved mission (EN; AR mirrors) | C | `nov23.test.mjs` item 3 |
| #4 "Misr El-Kheir" never breaks on mobile | C | `NoBreak`, test item 4 |
| #6 Who we are: two paragraphs, italic line removed | C | test item 6 |
| #7 Programs intro, nine programs, layout, five "How it works" steps | C (copy now S5) | `nov23` item 7 (steps), `nov25.test.mjs` (copy) |
| #9 "enroll" | C | test item 9 (EN copy; the superseded-values list keeps the old spelling only to recognise old DB text) |
| #10 Enabling functions copy; "capabilities, not programs" removed | C (copy now S5: "NGO Engagement & Development") | test item 10, `nov25` |
| #11 "Results are reported back to supporters." in trust strip + Why support MEKI | C. Three other places still say "release it against milestones…" (How we work "Account", process "Accounted for", one FAQ) — the client named only two places; flagged to confirm | `closure-audit` test; `en.ts` lines 162/256/294 |
| #12 every gallery photo captioned (place + program) | C for format and for the 26 homepage photos; **captions are derived/PROPOSED**, not client-approved | test item 12; `docs/MEKI_CLIENT_ASSET_INVENTORY_2026-11-24.md`; media `sourceFolder` now says "caption PROPOSED (not verified by MEKI)" (changed in this audit) |
| #13 button capitalization ("Explore our programs", "Book your place", "Attend the Gala", "View on map") | C | test item 13; no title-cased variants found by grep |
| #14 Follow us (Instagram, LinkedIn, Facebook) in every footer + end of Gala page, new tab | C (URLs from S4) | `nov23` item 14, `nov24.test.mjs` |
| #15 approved logos, favicon (icon only), share image | C | test item 15; logo from Site settings only accepts safe files |
| S3 hero photo of "the lady" replaced by family / community-school photo | C | `nov25-cms-sync.test.mjs` |
| S3 unclear water-pipe photo replaced | C | same |
| S3 "pictures are low quality" | C (originals ≤ 2560 px derivatives; crop-aware `sizes`) | `nov25-cms-sync` quality test |
| S1/S3 wording under pictures "Title – Place" | C | `phase13b`, `nov23` |

### 3.2 About page, MEKI Legacy
| Req | Status | Evidence |
|---|---|---|
| S5 "MEKI Legacy" (title, subtitle, 3 paragraphs) | C — placed on the About page after Vision & Mission, editable (ABOUT labels + `legacy-1…3`). **Placement is a developer decision**: the document does not say where it goes | `nov25.test.mjs`; Admin → Homepage → About |
| About photo captions "Title – Place" | C | `nov23` item 12 |
| About hero photo | C (family photo) | `about/page.tsx` |

### 3.3 Programs landing + nine program pages + Enabling Functions (S5)
| Req | Status | Evidence |
|---|---|---|
| Landing title + 3 paragraphs; nine summaries | C | `nov25.test.mjs` "approved English wording" |
| Per program: title, subtitle, summary, mandate, areas of work (title + description), "The change we aim to create" (all nine) | C — counts 2/3/3/3/3/3/3/3/3 areas and 4–5 outcomes match the document | `nov25.test.mjs` "nine programs × EN/AR" |
| "Emergency Response & Gaza Relief" page title (document) vs "Emergency Response" on the landing list (document) | C — card keeps the brand name, page H1 uses the document's title | test |
| Three enabling functions (names, taglines, text) | C | test |
| Wording normalised from the document (10 × "MEK"→"MEKI", 3 typos, "El Kheir"→"El-Kheir") | C but **needs MEKI to confirm** the substitutions | `docs/MEKI_CLIENT_EDIT_STATUS.md` "Programs (25 Nov)" |
| Program cover photos from the delivery | C | media keys `program-*` |

### 3.4 Gala Night page
| Req | Status | Evidence |
|---|---|---|
| S2 #14 no glowing dots / particles / abstract "lights" image | C | `closure-audit` + `nov23` |
| "Why we gather" real photos | **CC** — slot and Admin control exist; no photos of the evening supplied | `gala-cms.ts`, `GalaSections.tsx` |
| #15 venue photo as full-width hero under dark green overlay | C | `nov24.test.mjs` |
| #17 host section with photo + "Your host for the evening." | C (approval granted 25 Nov; published by the sync run, not yet live) | `nov25-gala.test.mjs` |
| #18 a photo per experience card | **P / CC** — Black-tie card has the exterior; dinner, drinks, lamps, auction have no photos (icons) | `nov25-gala.test.mjs` |
| #19 "Set-menu dinner"; drinks card; no "Craft display"; auction without brands | C (drinks = "Virgin Drinks", see C1) | `closure-audit` |
| #20 "The evening at a glance", no "(America/New_York)", "Welcome reception", "Opening with our host, Raya Abirached" | C | `closure-audit` agenda test |
| S1 four-act agenda graphic, 3:30–8:15 PM | C structure, titles, times and acts identical (EN and AR) | `closure-audit` |
| S1 remove Arrival and Transfers | C | `phase13b` |
| #21 venue photos instead of the drawn map; "View on map"; cross street + ZIP | **CC** — exterior photos done (24 Nov); address "583 Park Avenue (at East 63rd Street), New York, NY 10065"; **no hall/interior photos exist** | `nov24` |
| S1 ticket USD 500; one ticket per guest, own name, no plus-one | C — USD 500 in web EN/AR, FAQ, admin approved list, legal source, seed (`500.00`); no 750 in user-facing copy. **The live DB/Zeffy value is unverified here** (needs the database / SDI) | `closure-audit`, `nov19`, seed |
| S1 dietary: gluten-free, vegan, vegetarian, nut allergy, dairy-free | C (FAQ EN/AR; booking field) | `phase13b` |
| #22 on-page booking form with name, e-mail, city & country, organization & title, food, accessibility; contact e-mail | **P** — contact e-mail (`Inquiries@meki-us.org`) done; the form lacks city/country, organization/title, accessibility (C8). Existing booking/donation flows work per the client and are untouched | booking copy; matrix §1 |
| #23 "Sponsor now" opens the packages | C (PDF) | `nov24` |
| #23 partner logos Bokra / The Waterway "once official" | **CC / B** — dynamic entries exist, hidden, no logo; publication needs an administrator, a logo, and MEKI's written confirmation. Safeguards: only published + visible + logo-bearing partners render; DEMO, PDFs-as-logos and unsafe links are skipped; alt = name | `nov25-gala.test.mjs` (7), `gala.test.mjs` (5) |
| S1 SDI legal wording A/B/C (501(c)(3), EIN, USD 500 = 200 + 300) | **CC** — verbatim source in Admin, published only through the four-eyes Legal-copy card; not published yet | `legal-copy-source.ts`, admin `phase13b`/`nov19` |
| Follow us at the end of the Gala page | C | `nov23` |

### 3.5 Navigation, footer, Site settings
| Req | Status | Evidence |
|---|---|---|
| Header/footer menus equal Admin → Menus | C in code (seed + repair button + sync script) | `nov25-cms-sync`, admin `nov25-menus` |
| Copyright, footer text/note, contact, social, logos, SEO from Site settings | C | `nov25-cms-sync` |
| Contact e-mail `Inquiries@meki-us.org` | C in code; stored by the sync run | `site.mjs` tests |
| Footer "Contact details will be published soon." once an e-mail exists | C (replaced by the e-mail) | test |

### 3.6 Media Library and galleries
| Req | Status | Evidence |
|---|---|---|
| All 102 delivered photos accounted for | C (0 duplicates; HEIC converted) | inventory doc, manifest test |
| Folder → program mapping | C, with one **assumption: *disability* → program 08** (no program of its own) — **not confirmed by MEKI** | inventory doc |
| Captions | **CC** — all derived and PROPOSED; none client-approved | same |
| Consent per photo | **CC** — UNKNOWN for all 102 | same |
| Gallery list-driven; "Show more" | C | `nov25-cms-sync` |

### 3.7 Admin CMS
| Req | Status | Evidence |
|---|---|---|
| Edit every public text/photo (home sections, programs incl. areas of work, About/Legacy, gallery, menus, site settings, Gala sections, partners, PDF) | C in code; **not exercised against the real API/database** | admin tests 235/235; website data-flow smoke against a mock API |
| Save → Publish → revalidation | C (existing); unpublished copies not served | `live-publishing.test.mjs` |
| RBAC | unchanged | — |

### 3.8 English / Arabic
| Req | Status | Evidence |
|---|---|---|
| "Apply every edit to the Arabic site too" | C — every changed string exists in `ar.ts` / `gala.ts` (typed dictionaries; agenda structure equal) | `closure-audit`, `nov25.test.mjs` |
| Arabic approved by the client (S6) | **CC** — the 25 Nov additions (programs, legacy, enabling, Gala admin strings) were translated by the dev team and not reviewed by MEKI | Arabic doc |
| RTL layout | C (screenshot of an Arabic program page, 25 Nov) | — |

### 3.9 Ticketing and donation user-facing content
| Req | Status | Evidence |
|---|---|---|
| SDI hosted Zeffy forms / booking and donation pages | C — untouched; the client reported them working after deployment | `final-zeffy.test.mjs` |
| SDI website statement ("The Egypt Gala is cohosted…") and ticket/donation statement | **CC** — see 3.4 (approval-gated) | admin tests |
| Receipt wording (text B) | **B** — belongs to the receipt/e-mail flow owned by SDI/Zeffy; not published on the website by design | matrix §1 #9 |

## 4. Known discrepancies checked (your list)

| Question | Answer |
|---|---|
| "Refined Refreshments" vs "Virgin Drinks" | See C1. Newer instruction (24 Nov) wins; description from 21 Nov retained |
| Four-act agenda = latest client document? | Yes against the only agenda in the documents (21 Nov graphic) plus the 22 Nov renames. Differences kept on purpose or open: "Mr. Beshir Shousha" not shown (not confirmed in writing, S2 #20); "Every Light Counts" and "To be announced" notes of the graphic are not shown; "Master of Ceremonies" replaced by S2's wording |
| All requested Gala/venue photos available? | **No.** Available: night + day exterior, venue logo, host photo. Missing: hall/interior, "Why we gather" photos, dish, drinks, lamps, auction |
| 102 photos correctly mapped? | Every file is mapped once by the client's folder names (manifest check fails on any unmapped/duplicate file). The mapping is not *confirmed* by MEKI; titles/places are derived |
| Disability folder confirmed? | **No** — assumed program 08 (Heritage, Culture & Identity; where the "Inclusive sports" campaign preview sits) |
| Captions proposed or approved? | **All proposed.** Gallery items carry provenance PROPOSED; the Media Library `sourceFolder` field now also says "caption PROPOSED (not verified by MEKI)" |
| Arabic approval notices still in place? | Yes — home and Gala pages (`closure-audit` test). Intentionally kept (see C10) |
| Partner logos and publication safeguards | Work as specified in code and tests; end-to-end publish/unpublish through the real API is **not verified** (no database) |
| USD 500 everywhere? | In all user-facing code/copy/seed: yes. In the **live** ticket configuration and the Zeffy form: not verifiable from the repository |

## 5. Missing client requests found

1. **Booking form fields** city/country, organization/title, accessibility needs (S2 #22) — not implemented; needs a decision and backend fields (out of scope now).
2. **Experience-card and "Why we gather" photos, hall photos** — slots exist, no material.
3. Agenda graphic details: "Mr. Beshir Shousha", "Every Light Counts" panel note, "To be announced" — deliberately not shown / open question.
4. Three remaining "released against milestones" phrases (see 3.1 #11) — the client only named two places.
No missing design, section, interaction or Arabic-translation gaps were found beyond the above; responsive behaviour was re-checked only for the pages changed on 25 Nov (hero 1440 px, program page EN/AR); no new mobile regression test was run in this audit.

## 6. Changes made during this audit
- `apps/web/tests/closure-audit.test.mjs` (7 tests): agenda vs graphic, experience wording precedence, USD 500 / no 750, Arabic notices present, no decorative lights on the Gala page, milestone wording scope, exterior-only venue copy — all pass.
- `deploy/staging/nov25/images.mjs`: Media Library `sourceFolder` of the 102 photos now states "caption PROPOSED (not verified by MEKI)" so captions can never be mistaken for approved ones (site-images tests 8/8 pass).
- This report. **No product copy, design or behaviour was changed** — nothing else was clearly supported by approved instructions.

## 7. Approvals and assets still required
1. MEKI: confirm C1 (description under "Virgin Drinks"), the 10 "MEK"→"MEKI" substitutions, the Legacy placement, and whether the three other "milestones" phrases change.
2. MEKI: verify the derived captions and the *disability* → program 08 association; confirm photo consent (children / patients appear).
3. MEKI: written confirmation of Bokra / The Waterway partnerships + official logos.
4. MEKI/event agency: hall/interior photos; dinner, drinks, lamps, auction photos; photos for "Why we gather".
5. MEKI/SDI: decision on the on-page booking form and its extra fields (C8); confirmation that the live ticket price is USD 500; SDI wording approval in Admin (four eyes).
6. MEKI: last read of the dev-translated Arabic; then remove the draft notices.
7. MEKI: whether the speaker "Mr. Beshir Shousha" and the graphic's notes may be shown.
8. MEKI: keep Raya Abirached's written approval on file.
9. Optional: completed sponsorship PDF (placeholders on p. 4 and 10).

## 8. Items preventing complete client sign-off
- Gala photography is incomplete (items 4 above) and partner logos are unpublished by design.
- Booking-form fields requested on 22 Nov are not built (C8).
- All derived captions, the disability mapping, photo consent and the dev-translated Arabic are unreviewed by MEKI.
- SDI legal wording is not yet published (approval-gated).
- Everything above is "in code"; **none of it is live** until the database migrations and the content-sync run, and the Admin → API → database path has not been verified in this environment (technical phase, not part of this audit).
