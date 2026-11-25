# MEKI — client photo delivery of 24 Nov 2026: asset inventory and mapping

**Source:** `references/client-edits-2026-11-23/08-client-delivery-originals/TransferNow-20261124v26ETFjR/5-Pic Sit/` (git-ignored, never committed, originals never modified).
**Prepared:** 25 Nov 2026 · generated from `deploy/staging/nov25/client-delivery.manifest.json` (built from `client-delivery.map.mjs` by `build-manifest.mjs`, which fails if any file is unmapped, mapped twice or byte-identical to another).

## Result

| | |
|---|---|
| Files delivered (excluding macOS `._*` / `.DS_Store` metadata) | **102** in 12 folders |
| Byte-identical duplicates (SHA-256) | **0** — nothing was skipped as a duplicate |
| Accounted for | **102 / 102**: every file is uploaded to the Media Library, attached to its program gallery and, where listed below, shown on the homepage / covers |
| Not usable | **0.** `Health/IMG_1746.HEIC` cannot be decoded by the image library (HEVC codec missing); it was converted with the Windows imaging codec to `_converted/IMG_1746.jpg` (`nov25/convert-heic.ps1`; original untouched) and then handled like every other photo |
| Folder → program | Folder names are the client's own organisation by purpose: *Household aid and resiliance* → 01, *Health* → 02, *Education* and *ابن السبيل* (Ibn El-Sabeel students' residence) → 03, *Economic Empowerment* (incl. *استثمار*, the textile-factory complex) → 04, *Housing* → 05, *Wash* → 06, *emergency response* → 07, *Culture and Heritage* and *disability* → 08, *Scientific research* → 09, *home p* → homepage hero |
| Roles | hero-main 1 · hero-secondary 1 · program covers 9 · water photo 1 · homepage gallery 16 · program galleries / library 74 |

**Assumption to confirm with MEKI:** the *disability* folder (inclusive swimming, football on crutches, a performer) has no program of its own among the nine; it is attached to **08 Heritage, Culture & Identity**, where the existing "Inclusive sports" campaign preview already sits.

**Captions:** MEKI supplied no captions with this delivery. Titles/places are **derived** (folder name, file name, what the photo shows) in the agreed format *Title – Place* (EN + AR), stored as **PROPOSED**, and "Egypt" is used wherever nothing names a place (named places: Gaza, Kom Hamada, Abu El Rish, Luxor, Beni Suef). MEKI should verify them — editors correct them in Admin → Media Library / Homepage → Our work in action; an edited caption is never overwritten by the sync script. Consent is recorded as **UNKNOWN** for every photo (never claimed); with `MEDIA_PUBLIC_CONSENT_MODE=confirmed_only` they would not be served until an editor confirms consent.

**How each file is delivered:** the website ships 12 built-in copies (hero ×2, covers ×9, water photo; `apps/web/public/images/work/*.webp`, `build-client-delivery.mjs`) as the fallback; all 102 are uploaded to the Media Library by `deploy/staging/apply-nov25-final-content.mjs` as ≤ 2560 px WebP (q95; the API re-encodes once at q90) — the originals (up to 51 MB) stay in the delivery folder. The Media Library upload limit is 10 MB; the largest derivative is 1.8 MB (total 68.4 MB).

## Per-file mapping

| # | Source folder / file | Size (px) | Role | Program / section | Key | Title – Place (EN) |
|---|---|---|---|---|---|---|
| 1 | home p / DSC06120.JPG | 4240×2384 | hero main | Homepage hero | `hero-family` | A mother with her daughters at a community school – Egypt |
| 2 | home p / 2026-11-18 at 2.23.11 PM.jpeg | 1500×844 | hero secondary | Homepage hero | `hero-school` | Pupils working together in class – Egypt |
| 3 | Household aid and resiliance / 6R6A4043.JPG | 6720×3776 | cover | 01 Social Solidarity | `program-social-solidarity` | Volunteers delivering blankets to families – Egypt |
| 4 | Household aid and resiliance / 6R6A4122.JPG | 6720×3776 | gallery | 01 Social Solidarity | `household-door-delivery` | Door-to-door aid delivery – Egypt |
| 5 | Household aid and resiliance / 6R6A3197.JPG | 6720×3776 | library | 01 Social Solidarity | `household-aid-delivery` | Aid delivery to a village home – Egypt |
| 6 | Household aid and resiliance / 6R6A4071.JPG | 6720×3776 | library | 01 Social Solidarity | `household-blankets-distribution` | Blanket distribution – Egypt |
| 7 | Household aid and resiliance / DOD02119 copy2٢.png | 9504×6336 | library | 01 Social Solidarity | `household-family-meal` | A family sharing a meal – Egypt |
| 8 | Household aid and resiliance / DSC05847.JPG | 9504×6336 | library | 01 Social Solidarity | `household-classroom` | Pupils in a supported classroom – Egypt |
| 9 | Household aid and resiliance / WhatsApp Image 2026-11-18 at 2.58.29 PM(3).jpeg | 4160×3119 | library | 01 Social Solidarity | `household-volunteer-bags` | Volunteer carrying aid bags – Egypt |
| 10 | Health / DSC05616.JPG | 9504×6336 | cover | 02 Health | `program-health` | A patient on a rehabilitation walk with his doctor – Egypt |
| 11 | Health / Screen Shot 2024-07-02 at 1.12.50 PM.png | 3338×1868 | gallery | 02 Health | `health-ward` | Renovated hospital ward – Egypt |
| 12 | Health / كوم حمادة ٢.JPG | 5760×3840 | gallery | 02 Health | `health-dialysis-kom-hamada` | Dialysis unit – Kom Hamada |
| 13 | Health / Screen Shot 2024-07-02 at 1.15.39 PM.png | 3332×1872 | library | 02 Health | `health-ward-2` | Hospital ward – Egypt |
| 14 | Health / Screen Shot 2024-07-02 at 1.19.17 PM.png | 3346×1870 | library | 02 Health | `health-neonatal-room` | Neonatal room – Egypt |
| 15 | Health / Screen Shot 2024-07-02 at 1.22.09 PM.png | 3348×1862 | library | 02 Health | `health-children-corridor` | Children's hospital corridor – Egypt |
| 16 | Health / Screen Shot 2024-07-02 at 1.23.01 PM.png | 3338×1880 | library | 02 Health | `health-nurses-station` | Nurses' station – Egypt |
| 17 | Health / WhatsApp Image 2024-07-01 at 12.38.43 PM.jpeg | 1280×852 | library | 02 Health | `health-children-corridor-2` | Children's hospital corridor – Egypt |
| 18 | Health / WhatsApp Image 2024-07-01 at 12.38.51 PM (3).jpeg | 1280×852 | library | 02 Health | `health-ward-3` | Hospital ward – Egypt |
| 19 | Health / ابو الريش قبل.JPG | 5760×3240 | library | 02 Health | `health-corridor-before-abu-el-rish` | Hospital corridor before renovation – Abu El Rish |
| 20 | Health / IMG_1746.HEIC | 3024×4032 (HEIC→JPEG) | library | 02 Health | `health-dialysis-patient` | Dialysis session – Egypt |
| 21 | Education / khairy (46 of 191).jpg | 6720×4480 | cover | 03 Education | `program-education` | Pupils on a bench in the school yard – Egypt |
| 22 | Education / 1S9A3753.JPG | 6000×4000 | gallery | 03 Education | `education-school-building` | Community school building – Egypt |
| 23 | Education / تعليم.jpg | 6016×4000 | gallery | 03 Education | `education-graduation-stage` | Graduation ceremony – Egypt |
| 24 | Education / 1J2A8512-1.png | 1920×1080 | library | 03 Education | `education-flag-ceremony` | Pupils at the morning flag ceremony – Egypt |
| 25 | Education / 52.jpeg | 1500×844 | library | 03 Education | `education-pupils-writing` | Pupils writing in class – Egypt |
| 26 | Education / DSC05908.jpg | 1616×1080 | library | 03 Education | `education-classroom` | Classroom – Egypt |
| 27 | Education / Khairy (10 of 199).jpg | 4480×6720 | library | 03 Education | `education-schoolgirl` | Schoolgirl with her backpack – Egypt |
| 28 | Education / Khairy (13 of 199).jpg | 4480×6720 | library | 03 Education | `education-schoolboy` | Schoolboy with his backpack – Egypt |
| 29 | Education / khairy (40 of 191).jpg | 6720×4480 | library | 03 Education | `education-playground-swings` | School playground – Egypt |
| 30 | Education / khairy (45 of 191).jpg | 4480×6720 | library | 03 Education | `education-tire-swing` | A pupil on a swing – Egypt |
| 31 | Education / khairy (56 of 64).jpg | 5835×3890 | library | 03 Education | `education-school-colourful` | School building – Egypt |
| 32 | Education / Screenshot 2026-01-22 at 6.15.01 PM.png | 2892×1798 | library | 03 Education | `education-graduates` | Graduates in academic dress – Egypt |
| 33 | ابن السبيل / 1J0A6168.JPG | 5760×3240 | gallery | 03 Education | `ibn-el-sabeel-dorm` | Students' residence bedroom – Egypt |
| 34 | ابن السبيل / 6R6A3154.01_08_54_24.Still014.png | 1920×1080 | library | 03 Education | `ibn-el-sabeel-entrance` | Students' residence entrance – Egypt |
| 35 | Economic Empowerment / khairy (50 of 183).jpg | 6720×4480 | cover | 04 Economic Empowerment | `program-economic-empowerment` | Sewing workshop – Egypt |
| 36 | Economic Empowerment / khairy (18 of 183).jpg | 6720×4480 | gallery | 04 Economic Empowerment | `economic-greenhouse-harvest` | Greenhouse harvest – Beni Suef |
| 37 | Economic Empowerment / 300A2807.jpg | 6720×4480 | gallery | 04 Economic Empowerment | `economic-carpet-showroom` | Handmade carpets showroom – Egypt |
| 38 | Economic Empowerment / 1S9A6324.JPG | 1620×1080 | library | 04 Economic Empowerment | `economic-carpentry-workshop` | Carpentry workshop – Egypt |
| 39 | Economic Empowerment / 2M5A4533.JPG | 6720×4480 | library | 04 Economic Empowerment | `economic-livestock-shed` | Livestock shed – Egypt |
| 40 | Economic Empowerment / 44.jpg | 1080×1920 | library | 04 Economic Empowerment | `economic-livestock-shed-2` | Livestock shed – Egypt |
| 41 | Economic Empowerment / DSC04504.JPG | 2000×1336 | library | 04 Economic Empowerment | `economic-fishermen-boats` | Fishermen preparing their boats – Egypt |
| 42 | Economic Empowerment / DSC04530.JPG | 2000×1336 | library | 04 Economic Empowerment | `economic-fisherman-nile` | A fisherman on the river – Egypt |
| 43 | Economic Empowerment / khairy (5 of 183).jpg | 4331×6497 | library | 04 Economic Empowerment | `economic-greenhouse-farmer` | Greenhouse farmer – Beni Suef |
| 44 | Economic Empowerment / khairy (6 of 64).jpg | 6720×4480 | library | 04 Economic Empowerment | `economic-carpentry-craftsman` | Carpentry craftsman – Egypt |
| 45 | Economic Empowerment / WhatsApp Image 2026-11-18 at 2.17.09 PM.jpeg | 4032×3024 | library | 04 Economic Empowerment | `economic-farmer-tiller` | Farmer with a tiller – Egypt |
| 46 | Economic Empowerment/استثمار / 1.png | 1920×1080 | library | 04 Economic Empowerment | `investment-factory-complex` | Textile factories complex – Egypt |
| 47 | Economic Empowerment/استثمار / 5.png | 1920×1080 | library | 04 Economic Empowerment | `investment-factory-building` | Textile factories complex building – Egypt |
| 48 | Economic Empowerment/استثمار / 6.png | 1920×1080 | library | 04 Economic Empowerment | `investment-factory-building-2` | Textile factories complex building – Egypt |
| 49 | Economic Empowerment/استثمار / 12.png | 1920×1080 | library | 04 Economic Empowerment | `investment-cutting-machine` | Automatic fabric cutting – Egypt |
| 50 | Economic Empowerment/استثمار / 32.png | 1920×1080 | library | 04 Economic Empowerment | `investment-fabric-spreading` | Fabric spreading – Egypt |
| 51 | Economic Empowerment/استثمار / 36.png | 1920×1080 | library | 04 Economic Empowerment | `investment-sewing-line` | Sewing line – Egypt |
| 52 | Economic Empowerment/استثمار / 51.png | 1920×1080 | library | 04 Economic Empowerment | `investment-ironing` | Garment pressing – Egypt |
| 53 | Economic Empowerment/استثمار / 53.png | 1920×1080 | library | 04 Economic Empowerment | `investment-production-floor` | Production floor – Egypt |
| 54 | Economic Empowerment/استثمار / 55.png | 1920×1080 | library | 04 Economic Empowerment | `investment-factory-hall` | Factory hall – Egypt |
| 55 | Economic Empowerment/استثمار / 63.png | 1920×1080 | library | 04 Economic Empowerment | `investment-sewing-workers` | Garment workers – Egypt |
| 56 | Economic Empowerment/استثمار / 65.png | 1920×1080 | library | 04 Economic Empowerment | `investment-cutting-table` | Cutting tables – Egypt |
| 57 | Economic Empowerment/استثمار / 66.png | 1920×1080 | library | 04 Economic Empowerment | `investment-factory-sign` | Textile factories complex sign – Egypt |
| 58 | Economic Empowerment/استثمار / 68.png | 1920×1080 | library | 04 Economic Empowerment | `investment-factory-gate` | Textile factories complex gate – Egypt |
| 59 | Economic Empowerment/استثمار / 69.png | 1920×1080 | library | 04 Economic Empowerment | `investment-factory-entrance` | Textile factories complex entrance – Egypt |
| 60 | Housing / 6R6A0542.JPG | 6720×4480 | cover | 05 Housing | `program-housing` | A newly built family home – Egypt |
| 61 | Housing / Screen Shot 2025-04-30 at 1.33.44 AM.png | 3546×1986 | gallery | 05 Housing | `housing-painted-home` | Painted family home – Egypt |
| 62 | Housing / 6R6A4044.JPG | 6720×4480 | library | 05 Housing | `housing-renovated-home` | Renovated home – Egypt |
| 63 | Housing / Screen Shot 2025-04-30 at 1.33.56 AM.png | 3546×1992 | library | 05 Housing | `housing-painted-home-2` | Painted family home – Egypt |
| 64 | Housing / Screen Shot 2025-04-30 at 1.34.12 AM.png | 3532×2002 | library | 05 Housing | `housing-painted-home-3` | Painted family home – Egypt |
| 65 | Housing / Screen Shot 2025-04-30 at 1.36.48 AM.png | 3526×1992 | library | 05 Housing | `housing-girl-at-home` | A girl outside her family's home – Egypt |
| 66 | Wash / khairy (63 of 155).jpg | 6720×4480 | cover | 06 WASH | `program-wash` | Water station and storage tank – Luxor |
| 67 | Wash / EE1A4743.jpg | 3648×5472 | water | 06 WASH | `water-pipeline` | Laying a drinking-water pipeline – Egypt |
| 68 | Wash / 22.jpg | 1080×1920 | gallery | 06 WASH | `wash-girl-drinking` | A girl drinking clean water – Egypt |
| 69 | Wash / EE1A4541.jpg | 3648×5472 | library | 06 WASH | `wash-tap-hands` | Clean water from the tap – Egypt |
| 70 | Wash / EE1A4568.jpg | 3648×5472 | library | 06 WASH | `wash-water-splash` | Fresh water flowing – Egypt |
| 71 | Wash / EE1A4901.jpg | 3648×5472 | library | 06 WASH | `wash-girl-glass` | A girl filling a glass of water – Egypt |
| 72 | emergency response / 10.png | 3574×2000 | cover | 07 Emergency Response | `program-emergency-response` | Aid convoy on the road – Egypt |
| 73 | emergency response / معبر20.JPG | 4240×2384 | gallery | 07 Emergency Response | `emergency-convoy-launch` | Aid convoy departure with volunteers – Egypt |
| 74 | emergency response / 15 gaza.png | 3524×1982 | gallery | 07 Emergency Response | `emergency-gaza-aid-box` | A child carrying an aid box – Gaza |
| 75 | emergency response / 16 gaza.png | 3384×1896 | library | 07 Emergency Response | `emergency-gaza-distribution` | Aid distribution – Gaza |
| 76 | emergency response / 17 gaza.png | 3364×1892 | library | 07 Emergency Response | `emergency-gaza-distribution-2` | Aid distribution to families – Gaza |
| 77 | emergency response / 18 gaza.png | 3382×1896 | library | 07 Emergency Response | `emergency-gaza-mother-child` | Relief worker with a mother and child – Gaza |
| 78 | emergency response / 12.png | 1366×768 | library | 07 Emergency Response | `emergency-trucks` | Aid trucks – Egypt |
| 79 | emergency response / 13 معبر.png | 3534×1980 | library | 07 Emergency Response | `emergency-border-trucks` | Aid trucks at the border crossing – Egypt |
| 80 | emergency response / 14معبر.png | 3310×1852 | library | 07 Emergency Response | `emergency-border-volunteers` | Volunteers at the border crossing – Egypt |
| 81 | emergency response / معبر19.png | 1366×768 | library | 07 Emergency Response | `emergency-border-flags` | Volunteers with flags at the crossing – Egypt |
| 82 | emergency response / 1.JPG | 1280×720 | library | 07 Emergency Response | `emergency-packing-tent` | Relief packing hall – Egypt |
| 83 | emergency response / 2.JPG | 1280×720 | library | 07 Emergency Response | `emergency-sorting` | Sorting relief supplies – Egypt |
| 84 | emergency response / 3.JPG | 1280×720 | library | 07 Emergency Response | `emergency-medical-supplies` | Packing medical supplies – Egypt |
| 85 | emergency response / 4.JPG | 1280×720 | library | 07 Emergency Response | `emergency-volunteers-packing` | Volunteers packing aid – Egypt |
| 86 | emergency response / 5.JPG | 1280×720 | library | 07 Emergency Response | `emergency-relief-hall` | Volunteers in the relief hall – Egypt |
| 87 | emergency response / 6.JPG | 1280×720 | library | 07 Emergency Response | `emergency-convoy-truck` | Aid truck – Egypt |
| 88 | emergency response / 7.JPG | 1280×720 | library | 07 Emergency Response | `emergency-convoy-truck-2` | Aid truck – Egypt |
| 89 | emergency response / 8.JPG | 1280×720 | library | 07 Emergency Response | `emergency-convoy-volunteer` | Volunteer beside the aid convoy – Egypt |
| 90 | emergency response / 9.JPG | 4240×2384 | library | 07 Emergency Response | `emergency-convoy-line` | Aid convoy leaving – Egypt |
| 91 | Culture and Heritage / khairy (13 of 64).jpg | 6720×4480 | cover | 08 Heritage, Culture & Identity | `program-heritage-culture` | Women weaving at the loom – Egypt |
| 92 | Culture and Heritage / 300A2665.jpg | 4480×6720 | gallery | 08 Heritage, Culture & Identity | `heritage-weaver` | Hand-weaving workshop – Egypt |
| 93 | Culture and Heritage / ارتكاز دعم الفنون والثقافة.jpg | 6720×4480 | gallery | 08 Heritage, Culture & Identity | `heritage-arts-concert` | Arts and culture concert – Egypt |
| 94 | Culture and Heritage / 300A2669.jpg | 6720×4480 | library | 08 Heritage, Culture & Identity | `heritage-weaving-hands` | Weaving a carpet by hand – Egypt |
| 95 | Culture and Heritage / khairy (20 of 64).jpg | 6414×4276 | library | 08 Heritage, Culture & Identity | `heritage-stage-event` | Cultural event on stage – Egypt |
| 96 | Culture and Heritage / Khairy (8 of 72).jpg | 8192×5464 | library | 08 Heritage, Culture & Identity | `heritage-handicrafts-showcase` | Handicrafts showcase – Egypt |
| 97 | Culture and Heritage / نور والامل ٢.jpg | 5760×3840 | library | 08 Heritage, Culture & Identity | `heritage-orchestra` | Orchestra at the International Handicrafts Show – Egypt |
| 98 | disability / khairy (91 of 183).jpg | 6720×4480 | gallery | 08 Heritage, Culture & Identity | `disability-swimmer` | Inclusive swimming – Egypt |
| 99 | disability / 18.jpg | 1080×1920 | library | 08 Heritage, Culture & Identity | `disability-football` | Playing football on crutches – Egypt |
| 100 | disability / 77.jpg | 1080×1920 | library | 08 Heritage, Culture & Identity | `disability-performer` | Musician performing on stage – Egypt |
| 101 | Scientific research / DSC00190.jpg | 7747×5167 | cover | 09 Scientific Research | `program-scientific-research` | A researcher at work in a greenhouse lab – Egypt |
| 102 | Scientific research / DSC07575.JPG | 9504×6336 | gallery | 09 Scientific Research | `research-laboratory` | Research laboratory – Egypt |

## Destinations by role

- **hero-main** (1): Homepage hero — main arched photo (built-in default + CMS Hero image) · Media Library
- **hero-secondary** (1): Homepage hero — secondary circle photo (built-in default + CMS Hero) · Media Library
- **cover** (9): Program cover (built-in + Programme.coverMedia) · homepage gallery · program gallery · Media Library
- **water** (1): Clear water-project photo: Wash program (homepage gallery, program gallery), campaign card "Water for families", Give page · Media Library
- **gallery** (16): Homepage gallery "Our work in action" · program gallery · Media Library
- **library** (74): Program gallery (program page) · Media Library

## Repeat / verify

```
node deploy/staging/nov25/build-manifest.mjs      # coverage + duplicate check (fails on any unmapped file)
node apps/web/scripts/build-client-delivery.mjs   # the 12 built-in web copies
node deploy/staging/apply-nov25-final-content.mjs # dry run (default) → review → DRY_RUN=0
```
