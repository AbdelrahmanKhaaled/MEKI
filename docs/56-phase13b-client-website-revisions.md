# 56 — Phase 13B: client website revisions ("Website Comments.docx")

Date: 2026-11-21. Source: MEKI, `Website Comments.docx` (10 embedded screenshots + text). The file is a client resource and is **not** committed; it was read from the developer's Downloads folder into a scratch directory.

Every screenshot was inspected, not just the extracted text. The screenshots were taken from the **live preview deployment**, which still runs a build from before the 19 November update (it shows USD 750 and the old agenda). Several comments were therefore already implemented in the repository on 19 November (doc 55) and only need deployment.

Status keys: **Done** = implemented and tested in this repo · **Done (Nov 19)** = already in the repo before this phase, re-verified · **Ready, blocked** = code ready, waiting for an external input · **Deploy** = needs a deployment step.

## 1. Comment-by-comment checklist

| # | Client comment (screenshot) | Where it lives | Change | Status |
|---|---|---|---|---|
| 1 | "Luxor - WASH program" is out of place (badge on the home hero photo, beside the **Give today** preview card) | `apps/web/src/components/sections/Hero.tsx`; value `hero.photoCaption` in `content/en.ts` / `ar.ts` and the CMS HERO labels | The badge is **no longer rendered** in the donation section. It implied programme-specific giving, which SDI has not authorized. The WASH programme, its page, its images and the CMS value are **untouched** (no data deleted). The Give today card stays a **preview** (no payment). | **Done** |
| 2 | Pictures of the Gala venue to be added (Gala hero screenshot) | `components/gala/GalaSections.tsx` (`VenuePhotos`), `lib/venue-photos.ts`, `app/[locale]/events/gala-night/page.tsx` | New venue-photo gallery under the venue section: one lead image + up to four, responsive (1 / 2 / mosaic columns), `next/image` optimization, alt text from the Media Library, caption "Title – Place". **Source: the published `EVENT_VENUE` section of the Gala event page** (existing Events API; no schema change), managed in the new admin card **Gala → Settings → Venue photos** (add photo, Title / Place EN+AR, Media Library image, show/hide, publish with confirmation; `events.manage` / `events.publish`). Photos appear only while the event itself is published. **No authentic photo of 583 Park Avenue exists in the client resources**, so nothing is rendered — no stock or unrelated image is shown as the venue. | **Ready, blocked** on MEKI photos |
| 3 | Wording under pictures must be unified, e.g. "title – place" (home gallery screenshot) | `content/en.ts` / `ar.ts` (gallery items, About `captionA`/`captionB`); seed reads these; `deploy/staging/apply-nov21-captions.mjs` for existing DBs | All captions now **"Title – Place"** with an en dash (EN and AR). Places come **only from the source-folder names** (doc: `public/images/work/manifest.json`). Where the folder names a programme but no city, the place is "Egypt", which the gallery intro already states. Same typography as before (`text-sm font-bold`). | **Done** in code · **Deploy**: run the caption script on existing DBs (§3) |
| 4 | Instead of "Alcohol-free": **Refined Refreshments** — "A curated selection of fresh juices, premium teas, coffee, and sparkling beverages, thoughtfully served throughout the evening" | `content/gala.ts` `experience.items[2]` | Exact client text (no final period, as supplied). Arabic: draft translation "ضيافة راقية — تشكيلة مختارة من العصائر الطازجة والشاي الفاخر والقهوة والمشروبات الفوّارة، تُقدَّم بعناية طوال الأمسية" (MEKI review, like all Arabic Gala copy). Other five cards unchanged; icon unchanged. The Dining FAQ no longer repeats "alcohol-free" either (consistency with this comment — MEKI to confirm, §4). | **Done** |
| 5 | Agenda: old → new ("The Evening in a Glimpse") | `content/gala.ts` `timeline.acts`, `GalaTimeline` | Already the four-act agenda since 19 Nov (§2). Re-verified against the new image: all 10 times, titles and roles match. | **Done (Nov 19)** · **Deploy** |
| 6 | Arrival and Transfer part to be removed (venue "Arrival" block + "Transfers" FAQ) | `content/gala.ts` (`venue.arrival*`, FAQ "Transfers"), `GalaVenue` | Arrival block and Transfers FAQ removed (EN/AR) and the type fields deleted, so they cannot return by accident. Address, "View on map" and the map card kept. **Accessibility** FAQ kept (it is not transport). No database records existed for this content. | **Done** |
| 7 | Ticket price is USD 500 (screenshot shows USD 750) | Website, admin, seed, staging DB | Already USD 500 everywhere active since 19 Nov (§5). The live preview still shows 750 only because it has not been redeployed. | **Done (Nov 19)** · **Deploy** + apply values on the VPS DB |
| 8 | Other dietary requirements: Gluten-free, Vegan, Vegetarian, Nut allergy, Dairy-free | `content/gala.ts` FAQ "Dining and dietary requirements"; admin approved-details list | FAQ now: "Dinner is a plated, halal meal. Other dietary requirements: gluten-free, vegan, vegetarian, nut allergy and dairy-free." (EN/AR). "To be confirmed" label removed for this item. **Collection:** in the active SDI-hosted mode, guest details are collected on **SDI's Zeffy form**, so MEKI's site collects nothing; SDI must add a dietary question to the Zeffy ticket form (doc 57 §5). The legacy MEKI checkout (inactive) keeps its existing free-text dietary field. | **Done** (display) · **SDI** (Zeffy question) |
| 9 | SDI wording: ticket disclosure, receipt, website disclosure | Admin → Gala settings → "Gala legal copy" (`LegalCopyCard`, `lib/legal-copy-source.ts`) | The **exact text** is now in the repo as a verbatim source. An administrator can load it into the existing approval-gated drafts with one click; nothing is saved, approved or published automatically. Details: doc 57 §3. | **Ready, blocked** on SDI written approval record |

## 2. Agenda — old vs new

**Old (live preview screenshot):** 01 Welcome reception (doors 3:30 PM) · 02 Opening with our host, *[name]* · 03 Keynote address (speaker TBC) · 04 *[name]* · 05 Guest of Honor panel and Every Light Counts! · 06 …

**New — "The Evening in a Glimpse" (authoritative, in the repo since 19 Nov):**

| Act | Time (America/New_York) | Title | Shown role |
|---|---|---|---|
| I — The Spark (3:30–5:00) | 3:30 PM | Where Connections Begin | Pre-event |
| | 4:30 PM | The First Spark | Master of Ceremonies |
| | 4:45 PM | A Vision Beyond Borders | Keynote Speaker |
| II — The Stories and the People (5:00–6:15) | 5:00 PM | Every Light Has a Story | Film |
| | 5:10 PM | Voices That Illuminate | Guest of Honor Panel |
| | 6:00 PM | A Legacy of Giving | Egypt's Timeless Tradition of Generosity |
| III — The Power of Giving (6:15–7:00) | 6:15 PM | The Moment to Make It Count | Auction |
| IV — A Shared Celebration (7:00–8:15) | 7:00 PM | A Celebration of Shared Light | Entertainment |
| | 7:30 PM | A Table of Shared Purpose | Dinner |
| | 8:15 PM | The Light Carries On | Close of the evening |

- Event hours: **3:30–8:30 PM**. Nothing is shown between 8:15 and 8:30.
- The client's image also prints two names (an MC and a 6:00 PM speaker) and "Entertainment · To be announced". Speaker identities are **not confirmed**, so the site shows **roles only** with the note "Speakers to be confirmed. Program subject to change." MEKI can ask for the names to be published once confirmed (doc 58 §5).
- The agenda stays in the website content file. The Gala page has never been CMS-driven, and moving it now would be a redesign (doc 55 §1).

## 3. Captions — old vs new, and existing databases

| Image (source folder) | Old EN | New EN | New AR |
|---|---|---|---|
| weavers-loom (Abis carpets, Alexandria) | Hand-weaving workshop · Alexandria | Hand-weaving workshop – Alexandria | ورشة السجاد اليدوي – الإسكندرية |
| water-station (desalination station, Luxor) | Water desalination station · Luxor | Water desalination station – Luxor | محطة تحلية مياه – الأقصر |
| greenhouse-harvest (greenhouses, Beni Suef) | Greenhouses · Beni Suef | Greenhouses – Beni Suef | الصوب الزراعية – بني سويف |
| housing-site (Shelter & Warmth) | Housing works · Shelter & warmth | Shelter & Warmth housing works – Egypt | أعمال إسكان «سكن ودفا» – مصر |
| mobile-clinic (hospitals) | Mobile medical unit | Mobile medical unit – Egypt | قافلة طبية متنقلة – مصر |
| farmer-portrait (water trenching, Luxor) | Luxor | Water-connection project – Luxor | مشروع توصيل المياه – الأقصر |
| operating-room (agency set) | Hospital support | Hospital support – Egypt | دعم المستشفيات – مصر |
| About photo A (Alexandria carpets) | Alexandria · Economic Empowerment | Hand-weaving workshop – Alexandria | ورشة السجاد اليدوي – الإسكندرية |
| About label B | Luxor | Water-connection project – Luxor | مشروع توصيل المياه – الأقصر |

The home gallery, the About labels and the Media Library captions are **CMS data**. The seed is create-only, so an existing database keeps the old labels until updated through the admin. Run the audited script once per existing database:

```sh
ADMIN_URL=<admin origin> node deploy/staging/apply-nov21-captions.mjs              # dry run (default): prints what would change
ADMIN_URL=<admin origin> DRY_RUN=0 node deploy/staging/apply-nov21-captions.mjs    # apply
```

The script:

- replaces a value **only** if it still equals the exact old seeded text (editor changes are never overwritten);
- changes a Media Library caption only on the curated image it was seeded for (another photo captioned "Luxor" is left alone);
- republishes a CMS section **only** if it was published with no other pending edits (otherwise the change waits in the working copy for an editor);
- deletes nothing and is audited (`section_item.update`, `section.update`, `section.publish`, `media.update`).

New venue photos follow the same convention automatically: the admin enters **Title** in the item title and **Place** in the item text.

## 4. Decisions made, for MEKI to confirm

1. **"Alcohol-free" removed from the Dining FAQ as well as the card**, because the client replaced that wording. The evening's refreshment list (juices, teas, coffee, sparkling beverages) is unchanged in meaning. If MEKI wants the explicit "alcohol-free" statement kept in the FAQ, it is a one-line change.
2. **"Egypt" as the place** for three photos whose source folder names no city. This avoids inventing a city. MEKI can supply the exact places.
3. **Hero badge**: removed from the donation section rather than renamed. If MEKI wants a caption on that photo, the convention would be "Water-connection project – Luxor".

## 5. Files changed in this phase

- **Website:**
  - `src/content/gala.ts` (refreshments, venue type, FAQ);
  - `src/content/en.ts`, `src/content/ar.ts` (captions);
  - `src/components/gala/GalaSections.tsx` (venue: arrival removed, photo gallery);
  - `src/components/sections/Hero.tsx` (badge removed);
  - `src/lib/venue-photos.ts` (new);
  - `src/app/[locale]/events/gala-night/page.tsx` (venue photos from the API);
  - `tests/phase13b.test.mjs` (new, 7 tests);
  - `tests/e2e/agreement.smoke.mjs` (+7 checks per locale).
- **Admin:**
  - `src/lib/legal-copy-source.ts` (new, verbatim SDI wording);
  - `src/features/gala/settings/LegalCopyCard.tsx` (load button);
  - `src/features/gala/settings/VenuePhotosCard.tsx`, `src/services/venue-photos.ts` (new: venue photo management);
  - `src/features/gala/settings/GalaSettingsPage.tsx` (card added);
  - `src/lib/i18n-sdi.ts`, `src/lib/i18n-gala.ts` (EN/AR);
  - `tests/phase13b.test.mjs` (new, 9 tests).
- **Ops:** `deploy/staging/apply-nov21-captions.mjs` (new).
- **API / database:** no change. No migration, no schema change, no seed change (the seed already reads the website content files).
