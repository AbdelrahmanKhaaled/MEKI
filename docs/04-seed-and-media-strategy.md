# 04 — Real-Data Seed & Media Strategy

## 1. Seed tiers (separate scripts, separate safety rules)

| Tier | Script | Contents | Allowed envs | Idempotent? |
|---|---|---|---|---|
| **S1 Verified** | `pnpm --filter api seed:verified` | Site settings (tagline, legacy line), 9 programmes + 3 enabling functions, sub-themes, short and long mandates, boilerplates and How-We-Work as page sections, 4 attributed proof points (+ "4000+ NGOs" pending decision Q-C3) | all | Yes: **upsert by stable key** (slug/key). It never deletes and **never overwrites rows edited in admin** (it skips a row when `updatedAt > seededAt`, and logs the skip) |
| **S2 Proposed** | `seed:proposed` | Draft campaigns (title + programme + location only, from media folder names), proposed microcopy. Everything is `PROPOSED` and `DRAFT` | dev, staging | Yes |
| **S3 Demo** | `seed:demo` | Fake goals/progress for component development, tagged `DEMO` | **dev only**: the script exits if `NODE_ENV=production` or the DB host is not on an allow-list | Yes |
| — | none | Real transactions, donors, inquiries | **never seeded** | — |

Bootstrap of the first staff admin is a separate CLI command, `admin:create`, which prompts for the email and password. There are no default credentials in the seed.

### Source of truth for S1

`scripts/seed-data/verified/*.json`, hand-transcribed from the PDFs. Each record includes `sourceRef` (document + page), and the files are reviewed in a PR **by someone other than the transcriber**. The PDF text extraction mixes columns (mandates p.1–2), so automated extraction is **not** trusted for seeding.

These JSON files contain short, approved public copy and no images. Confirm with MEKI that committing them is acceptable (doc 08 Q-C4). Otherwise they live in a private seed-data path loaded from env.

### Arabic

No Arabic source copy was supplied. `*Ar` fields are left `null` in S1. Machine/drafted Arabic may be added via admin as `PROPOSED`. The landing page publishes Arabic only after MEKI's translator approves it (doc 08 B3). Until then, `/ar` either falls back per section with a visible language notice or stays unpublished. That choice is decision B3.

## 2. Programme seed mapping (names per Brand Guidelines p.24)

| # | slug | Name (EN, exact) | Long mandate source | Sub-themes (portfolio image) |
|---|---|---|---|---|
| 1 | social-solidarity | Social Solidarity & Household Resilience | Mandates §1 | Safety-net support · Household stabilization · Protecting the vulnerable |
| 2 | health | Health Access, Coverage & Quality | §4 | Access to care · Continuity of treatment · Patient support & quality |
| 3 | education | Education | §3 | Community education · Access & scholarships · Learner progression |
| 4 | economic-empowerment | Economic Empowerment & Labour Market Activation | §2 | Employability · Technical education · Enterprise & livelihoods |
| 5 | housing | Housing & Safe Living Conditions | §5 | Safer housing · Temporary shelter · Rehab & co-financing |
| 6 | wash | WASH, Environment & Climate Resilience | §6 | Water & sanitation access · Environmental protection · Climate-risk reduction |
| 7 | emergency-response | Emergency Response | §7 | Readiness · Humanitarian response · Transition & recovery |
| 8 | heritage-culture | Heritage, Culture & Identity | §8 | Participation · Cultural engagement · Identity-building opportunities |
| 9 | scientific-research | Scientific Research & Research Ecosystem | §9 | MEK-sponsored research · Grants & fellowships · Research capacity building · Partnerships for evidence |
| E1 | ngo-development | NGO Development | Mandates "Enabling function" | — |
| E2 | field-offices | Field Offices | portfolio image | — |
| E3 | business-intelligence | Business Intelligence | portfolio image | — |

The portfolio image uses US "stabilization" and the brand uses UK English for international materials. Spelling is normalised once B2 is decided.

## 3. Media inventory → proposed programme mapping

The mapping below is based on **folder names only**. It is a *proposal* for MEKI to confirm. No image content has been reviewed yet.

| Folder (decoded) | Meaning | Files | Proposed programme |
|---|---|---|---|
| nada/education | — | 16 | Education |
| nada/health | — | 16 (2 HEIC) | Health |
| nada/scientific research | — | 4 | Scientific Research |
| nada/takafol (تكافل) | Solidarity | 18 | Social Solidarity |
| nada/الغارمين | Debtors relief | 13 | Social Solidarity |
| nada/manahy el hayah (مناحي الحياة) | Arts/culture, people with disabilities | 8 | Heritage, Culture & Identity |
| nada/تحسين بيئة سكن | Housing improvement | 10 | Housing |
| nada/الاغاثة | Relief | 6 | Emergency Response |
| مدارس مجتمعية | Community schools | 131 | Education |
| بيت الطلبة الوافدين | International students' house | 25 | Education |
| مستشفيات | Hospitals | 59 | Health |
| الحضانات بمستشفي القاهرة التخصصي | Incubators, Cairo Specialized Hospital | 42 | Health |
| الصوب ببني سويف | Greenhouses, Beni Suef | 40 | Economic Empowerment |
| مشغل ببني سويف | Workshop, Beni Suef | 32 | Economic Empowerment |
| سجاد ابيس بالاسكندرية | Abis carpets, Alexandria | 62 | Economic Empowerment |
| التسقيف في الاقصر | Roofing, Luxor | 30 | Housing |
| سكن ودفا | Shelter & warmth | 116 | Housing (or Social Solidarity seasonal; confirm) |
| محطة مياه تحليه بالاقصر | Desalination station, Luxor | 19 | WASH |
| شق الطرق لتوصيل المياه بالاقصر | Trenching for water lines, Luxor | 56 | WASH |
| دخول المياه لبيت بالاقصر | Household water connection, Luxor | 14 | WASH |
| الاعاقة الذهنية باستاد القاهرة / بالملعب الاليمبي بالمعادي | Intellectual-disability sports events | 61 + 48 | Heritage, Culture & Identity (participation/sports; confirm) |
| فرع الاسكندرية | Alexandria branch | 15 | Field Offices |
| صور مجمعة | Mixed collection | 33 | Unassigned, needs manual tagging |
| Smash | Mixed, unlabelled | 167 (incl. 1 CR2, video stills) | Unassigned, needs manual tagging |

These are **MEK (Misr El-Kheir, Egypt) programme photos**. Captions must say so and must not imply that MEKI delivered the work, in line with the attribution rule for the proof points (doc 08 Q-C2).

## 4. Media pipeline (Phase 2, read-only on originals)

1. **Shortlist**, not bulk import. A script generates a contact sheet of low-resolution thumbnails (outside the repo, in `.tmp/`). MEKI marketing or our designer picks about 3–6 images per programme plus 3–5 hero candidates. The output is `selection.csv` with columns: path, programme, role (hero/card/gallery), contains minors (y/n), consent (y/n/unknown), place, and photographer.
2. **Process** the selected files with `scripts/media/process.ts` (sharp):
   - auto-orient, then strip all EXIF/XMP, **including GPS**;
   - produce a 2560 px master plus AVIF and WebP variants at 480, 768, 1080, 1440 and 1920 px, and a blur placeholder;
   - compute the sha256 for dedupe;
   - convert HEIC only if it is selected; skip CR2 and `.DS_Store`.
3. **Import** through the API's media service (the same validation as admin uploads). Rows are created with `consentStatus` taken from the CSV, `UNKNOWN` by default, so **they cannot be published until consent is confirmed**.
4. Originals in `client-resources/` are never modified, moved or renamed. The typo folder `Imgaes/` is left as is.
5. Brand assets: the Primary/Icon SVGs and app icons are **copied byte-for-byte** into `packages/ui/assets/brand/` (or loaded from a private path, pending Q-C4). They are never edited or optimised in a way that changes paths. The Secondary logo is not copied.

## 5. Verification of the seed

- Unit test: every S1 record has a `sourceRef`, and every `Stat` has an attribution.
- Snapshot test: programme names equal the exact Brand Guidelines strings.
- A dry-run flag (`--dry-run`) prints the planned upserts without writing.
- The seed only runs against databases that `scripts/db-guard` recognises (host/db-name allow-list). This is confirmed before every run.
