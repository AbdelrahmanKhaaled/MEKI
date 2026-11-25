# MEKI final client website changes

25 November 2026 · Phase 09 · Local production build of `apps/web`

The website now ships the two hero photographs, the 100 program photographs, Raya Abirached’s approved portrait, the venue exteriors and the original sponsorship PDF. The homepage features 26 program photographs. Each program has its own gallery. The bilingual content and the Gala assets work in a production build with the public API offline.

The November 25 Programs document governs the programs, enabling functions and Legacy copy. The November 24 confirmations govern the address, drinks title, sponsorship PDF and social URLs. Phase 09 confirms the existing Arabic translations, host publication and Disability assignment. The dated closure audit and approval sheets document earlier decisions.

## Requirement register

| Client requirement | Final status | Evidence and public result |
|---|---|---|
| IT edits 3, 4 and 6. Mission, brand name and Who we are | IMPLEMENTED & VERIFIED | Approved mission in both languages, nonbreaking Misr El-Kheir, two distinct About paragraphs and removal of the repeated italic line. `nov23.test.mjs`, EN/AR home browser checks. |
| Hero and unclear water photograph | IMPLEMENTED & VERIFIED | Family photograph in the main arch, community-school pupils in the circle, pipeline photograph in the water project, Give mosaic and homepage Vision & Mission section. The specified old seeded hero images yield to the new defaults. |
| IT edits 7 and 9. Program introduction, five steps, education spelling | IMPLEMENTED & VERIFIED | Latest three-paragraph introduction and nine summaries, five numbered steps, American English wording. `nov23.test.mjs`, `nov25.test.mjs`. |
| Programs Word document. Nine detail pages | IMPLEMENTED & VERIFIED | Each has its title, subtitle, mandate, named areas with descriptions and intended outcomes. The nine pages share one layout. The emergency program detail includes Gaza Relief. Browser checked all 18 localized pages. |
| IT edit 10 and Programs Word document. Enabling functions and Legacy | IMPLEMENTED & VERIFIED | NGO Engagement & Development, Field Offices and Business Intelligence have their revised taglines and text. MEKI Legacy retains its subtitle and three paragraphs on About after Vision & Mission. The supplied document leaves placement open. `nov25.test.mjs`. |
| IT edit 11. Reporting language | IMPLEMENTED & VERIFIED | Trust strip and Why support MEKI use “Results are reported back to supporters.” The two passages identified in the brief are covered by `closure-audit.test.mjs`. |
| IT edit 12 and November image feedback. Galleries, captions and resolution | IMPLEMENTED & VERIFIED | Source-folder assignments, bilingual title and place, homepage program labels, responsive images and program lightboxes. Opening Show more exposes all 26 homepage figures. Published lists accept arbitrary lengths, including zero. Byte hashes and dimensions tested for all 100 program images. |
| IT edits 13–15. Buttons, header, navigation, footer, email, official accounts and logos | IMPLEMENTED & VERIFIED | Sentence-case calls to action, localized navigation, current-year fallback copyright, approved green/white marks, icon-only favicon and sharing image. LinkedIn, Facebook and Instagram open in a new tab. Shared footer also included on booking, giving and return routes. Confirmed public contact is Inquiries@meki-us.org. `nov23`, `nov24`, `nov25-cms-sync` and browser checks. |
| Gala edits 14–15. Hero and decorative lights | IMPLEMENTED & VERIFIED | Supplied night exterior under green overlay. Removed abstract lights and particles. The former WASH badge and Arrival and Transfers block also remain removed. |
| Gala edit 17. Host | IMPLEMENTED & VERIFIED | Approved Raya Abirached portrait, name and host line in both languages. Browser decoded the portrait. |
| Gala edits 18–19. Experience | IMPLEMENTED & VERIFIED | Day exterior on Black-tie evening. Five cards include Set-menu dinner with plated halal menu, Virgin Drinks, lamp lighting and unbranded live auction. Craft display removed. November 24 title supersedes “Virgin bar” and “Refined Refreshments”. |
| Gala edit 20. Four-act agenda | IMPLEMENTED & VERIFIED | Matching English and Arabic times and act structure from 3:30 to 8:15 PM, Welcome reception and Opening with our host, Raya Abirached. No technical timezone suffix or unconfirmed speaker name. `closure-audit.test.mjs`. |
| Gala edit 21. Venue | IMPLEMENTED & VERIFIED | Both exterior photos, venue mark and View on map. Approved English address is 583 Park Avenue (at East 63rd Street), New York, NY 10065. Arabic includes the cross street and ZIP. |
| Gala edits 22–23. Attendance and sponsorship | IMPLEMENTED & VERIFIED | USD 500 published fallback, named individual ticket, no plus-one, dietary information and inquiries contact. Sponsor now opens the byte-identical informational PDF. Existing Bokra and The Waterway positions remain hidden with no logos. `closure-audit`, `nov25-gala`, PDF hash and browser assertions. |
| Existing Arabic translations and RTL | IMPLEMENTED & VERIFIED | Approval applies to the website translations including Programs and Gala. Arabic draft messages removed. Arabic templates render with RTL direction. Browser tested layout, captions and lightboxes in both locales. |
| Meta and TikTok page views, Google Ads base tag and donation conversion | IMPLEMENTED — VERIFICATION LIMITED | Identifiers verified against the three PowerPoint slides. Local browser initialized the queues. Simulated authenticated donation status produced the prescribed Google command once. Vendor ingestion and attribution require external account evidence. |
| Existing SDI/Zeffy booking and giving | IMPLEMENTED — VERIFICATION LIMITED | Booking and donation entry routes rendered. Existing tests exercise form validation, provider gates, references, redirect trust and verified status. Actual hosted form availability, price, charge, receipt and reconciliation require SDI/Zeffy. |

## Unresolved material and earlier requests

| Requirement | Final status | Exact reason |
|---|---|---|
| Why we gather photo, plated dish, drinks, lamps and auction photos | NOT IMPLEMENTED | The Gala delivery contains a host portrait, two exterior photos, two venue logo variants and the PDF. It contains none of these subjects. The four experience cards retain their icons. Program photos belong to their program galleries. |
| Hall photo in the older IT document | NOT IMPLEMENTED | Only exteriors were delivered and subsequently authorized. |
| Visible partner logos | NOT IMPLEMENTED | Official Bokra and The Waterway artwork and partnership release are absent. Hidden positions satisfy the current brief. |
| Older on-page RSVP form with city/country, organization/title and accessibility fields | NOT IMPLEMENTED | The current instruction preserves the existing SDI/Zeffy booking process. No approved replacement workflow or field contract was supplied. |
| Public SDI legal statements and receipt text from Website Comments | IMPLEMENTED — VERIFICATION LIMITED | The existing website can display approved statements returned by the API. This phase had no published legal approval record. Receipt wording is controlled by SDI/Zeffy. |
| Other names and provisional annotations in the early agenda graphic | NOT IMPLEMENTED | The later brief limits names to those confirmed in writing and preserves the confirmed agenda. No additional speaker confirmation was supplied. |

## Tracking evidence

| Presentation | Implemented identifier or event |
|---|---|
| Meta slide | Pixel `2209802356282055`, `PageView` |
| Google slide | `AW-11325728548/Hbz7CN6amN0YEKTOw5gq`, event `conversion`, fixed reporting value 1.0 EGP |
| TikTok slide | Pixel `DC25E8RC77U703IGFBB0`, `page()` |

All four identifiers match the request. The 1 EGP value comes from the presentation and is independent of the gift amount. The slide leaves the transaction ID blank. The website uses the existing server-returned donation reference for deduplication. No new identifier is issued. A direct donation requires matching reference, confirmed, completed, paid and explicitly non-test status. Hosted gifts require matching reference, verified timestamp and verified or allocated status. Opening a form, booking a ticket or returning from an external site cannot establish success. Browser memory and local storage suppress replay, with the same transaction ID passed to Google across browsers. No sitewide advertising consent control was found. The existing booking and donor privacy consents retain their original purpose.

## Verification

- Website unit tests passed **182/182**, including original-to-derivative checks and sponsorship PDF checksum.
- TypeScript passed. ESLint returned zero errors and two warnings in the existing PostCSS default export and an unused test parameter in `nov25.test.mjs`.
- The production build completed and generated 50 static pages. Public API requests were unavailable locally. The site rendered built-in content and exercised its availability gates.
- The local Chromium suite exercised the homepage, Gala and nine program details in both locales at 390, 768 and 1440 pixels. It checked layout overflow, navigation/footer presence, RTL, gallery expansion, last-image lightboxes, host image decoding, sponsorship link and hidden partners. It also opened booking, donation, About and Contact entry routes. Screenshots for home, health and Gala were reviewed.
- Vendor scripts were intercepted in the browser. With fixture data, pending status queued zero Google conversions, verified status queued one, and reload queued zero additional conversions. No real payment, receipt or advertising-platform conversion was observed.

## Photo distribution

The client’s folders determine the program. Education includes the student-residence folder. Economic Empowerment includes the investment subfolder. Disability remains with program 08, Heritage, Culture & Identity. Counts for programs 01–09 are **7, 11, 14, 25, 6, 6, 19, 10 and 2**. The 26 homepage selections reuse the same files. Captions use the delivery inventory’s English and Arabic descriptions and place information. The source inventory does not document individual consent for the 102 program/home photographs. Raya’s publication approval is confirmed separately.

The following paths are relative to `apps/web/public`. The gallery builder verifies source hashes, reuses the 12 existing hero/cover/water derivatives and creates the remaining 90 WebPs without enlarging their originals. The HEIC image uses the supplied verified JPEG conversion. Source files were preserved.

| Gala original | Website file | Placement |
|---|---|---|
| Raya Abirached.png | `gala/host-raya-abirached.png` | Host |
| 15.jpg.jpeg | `gala/venue-exterior-night.jpeg` | Hero and venue |
| images.jpeg | `gala/venue-exterior-day.jpeg` | Venue and Black-tie evening |
| 583-Park-Ave-Logo_1_white.png | `gala/venue-logo-white.png` | Venue mark |
| sponsorship-06/Sponsorship Packages.pdf | `gala/sponsorship-packages.pdf` | Sponsor now |

The remaining `583_park_avenue_cover.jpeg` is a logo on white. The supplied PDF retains its original placeholders. The eight approved MEKI logo sources and their derivatives are recorded in `apps/web/public/brand/approved-logo-manifest.json`.

| Original folder and file | Website file | Placement |
|---|---|---|
| `home p/DSC06120.JPG` | `images/work/hero-family.webp` | Homepage main hero and About |
| `home p/2026-11-18 at 2.23.11 PM.jpeg` | `images/work/hero-school.webp` | Homepage circle |
| `Household aid and resiliance/6R6A4043.JPG` | `images/work/program-social-solidarity.webp` | social-solidarity program gallery, program cover, homepage gallery |
| `Household aid and resiliance/6R6A4122.JPG` | `images/gallery/household-door-delivery.webp` | social-solidarity program gallery, homepage gallery |
| `Household aid and resiliance/6R6A3197.JPG` | `images/gallery/household-aid-delivery.webp` | social-solidarity program gallery |
| `Household aid and resiliance/6R6A4071.JPG` | `images/gallery/household-blankets-distribution.webp` | social-solidarity program gallery |
| `Household aid and resiliance/DOD02119 copy2٢.png` | `images/gallery/household-family-meal.webp` | social-solidarity program gallery |
| `Household aid and resiliance/DSC05847.JPG` | `images/gallery/household-classroom.webp` | social-solidarity program gallery |
| `Household aid and resiliance/WhatsApp Image 2026-11-18 at 2.58.29 PM(3).jpeg` | `images/gallery/household-volunteer-bags.webp` | social-solidarity program gallery |
| `Health/DSC05616.JPG` | `images/work/program-health.webp` | health program gallery, program cover, homepage gallery |
| `Health/Screen Shot 2024-07-02 at 1.12.50 PM.png` | `images/gallery/health-ward.webp` | health program gallery, homepage gallery |
| `Health/كوم حمادة ٢.JPG` | `images/gallery/health-dialysis-kom-hamada.webp` | health program gallery, homepage gallery |
| `Health/Screen Shot 2024-07-02 at 1.15.39 PM.png` | `images/gallery/health-ward-2.webp` | health program gallery |
| `Health/Screen Shot 2024-07-02 at 1.19.17 PM.png` | `images/gallery/health-neonatal-room.webp` | health program gallery |
| `Health/Screen Shot 2024-07-02 at 1.22.09 PM.png` | `images/gallery/health-children-corridor.webp` | health program gallery |
| `Health/Screen Shot 2024-07-02 at 1.23.01 PM.png` | `images/gallery/health-nurses-station.webp` | health program gallery |
| `Health/WhatsApp Image 2024-07-01 at 12.38.43 PM.jpeg` | `images/gallery/health-children-corridor-2.webp` | health program gallery |
| `Health/WhatsApp Image 2024-07-01 at 12.38.51 PM (3).jpeg` | `images/gallery/health-ward-3.webp` | health program gallery |
| `Health/ابو الريش قبل.JPG` | `images/gallery/health-corridor-before-abu-el-rish.webp` | health program gallery |
| `Health/IMG_1746.HEIC` | `images/gallery/health-dialysis-patient.webp` | health program gallery |
| `Education/khairy (46 of 191).jpg` | `images/work/program-education.webp` | education program gallery, program cover, homepage gallery |
| `Education/1S9A3753.JPG` | `images/gallery/education-school-building.webp` | education program gallery, homepage gallery |
| `Education/تعليم.jpg` | `images/gallery/education-graduation-stage.webp` | education program gallery, homepage gallery |
| `Education/1J2A8512-1.png` | `images/gallery/education-flag-ceremony.webp` | education program gallery |
| `Education/52.jpeg` | `images/gallery/education-pupils-writing.webp` | education program gallery |
| `Education/DSC05908.jpg` | `images/gallery/education-classroom.webp` | education program gallery |
| `Education/Khairy (10 of 199).jpg` | `images/gallery/education-schoolgirl.webp` | education program gallery |
| `Education/Khairy (13 of 199).jpg` | `images/gallery/education-schoolboy.webp` | education program gallery |
| `Education/khairy (40 of 191).jpg` | `images/gallery/education-playground-swings.webp` | education program gallery |
| `Education/khairy (45 of 191).jpg` | `images/gallery/education-tire-swing.webp` | education program gallery |
| `Education/khairy (56 of 64).jpg` | `images/gallery/education-school-colourful.webp` | education program gallery |
| `Education/Screenshot 2026-01-22 at 6.15.01 PM.png` | `images/gallery/education-graduates.webp` | education program gallery |
| `ابن السبيل/1J0A6168.JPG` | `images/gallery/ibn-el-sabeel-dorm.webp` | education program gallery, homepage gallery |
| `ابن السبيل/6R6A3154.01_08_54_24.Still014.png` | `images/gallery/ibn-el-sabeel-entrance.webp` | education program gallery |
| `Economic Empowerment/khairy (50 of 183).jpg` | `images/work/program-economic-empowerment.webp` | economic-empowerment program gallery, program cover, homepage gallery |
| `Economic Empowerment/khairy (18 of 183).jpg` | `images/gallery/economic-greenhouse-harvest.webp` | economic-empowerment program gallery, homepage gallery |
| `Economic Empowerment/300A2807.jpg` | `images/gallery/economic-carpet-showroom.webp` | economic-empowerment program gallery, homepage gallery |
| `Economic Empowerment/1S9A6324.JPG` | `images/gallery/economic-carpentry-workshop.webp` | economic-empowerment program gallery |
| `Economic Empowerment/2M5A4533.JPG` | `images/gallery/economic-livestock-shed.webp` | economic-empowerment program gallery |
| `Economic Empowerment/44.jpg` | `images/gallery/economic-livestock-shed-2.webp` | economic-empowerment program gallery |
| `Economic Empowerment/DSC04504.JPG` | `images/gallery/economic-fishermen-boats.webp` | economic-empowerment program gallery |
| `Economic Empowerment/DSC04530.JPG` | `images/gallery/economic-fisherman-nile.webp` | economic-empowerment program gallery |
| `Economic Empowerment/khairy (5 of 183).jpg` | `images/gallery/economic-greenhouse-farmer.webp` | economic-empowerment program gallery |
| `Economic Empowerment/khairy (6 of 64).jpg` | `images/gallery/economic-carpentry-craftsman.webp` | economic-empowerment program gallery |
| `Economic Empowerment/WhatsApp Image 2026-11-18 at 2.17.09 PM.jpeg` | `images/gallery/economic-farmer-tiller.webp` | economic-empowerment program gallery |
| `Economic Empowerment/استثمار/1.png` | `images/gallery/investment-factory-complex.webp` | economic-empowerment program gallery |
| `Economic Empowerment/استثمار/5.png` | `images/gallery/investment-factory-building.webp` | economic-empowerment program gallery |
| `Economic Empowerment/استثمار/6.png` | `images/gallery/investment-factory-building-2.webp` | economic-empowerment program gallery |
| `Economic Empowerment/استثمار/12.png` | `images/gallery/investment-cutting-machine.webp` | economic-empowerment program gallery |
| `Economic Empowerment/استثمار/32.png` | `images/gallery/investment-fabric-spreading.webp` | economic-empowerment program gallery |
| `Economic Empowerment/استثمار/36.png` | `images/gallery/investment-sewing-line.webp` | economic-empowerment program gallery |
| `Economic Empowerment/استثمار/51.png` | `images/gallery/investment-ironing.webp` | economic-empowerment program gallery |
| `Economic Empowerment/استثمار/53.png` | `images/gallery/investment-production-floor.webp` | economic-empowerment program gallery |
| `Economic Empowerment/استثمار/55.png` | `images/gallery/investment-factory-hall.webp` | economic-empowerment program gallery |
| `Economic Empowerment/استثمار/63.png` | `images/gallery/investment-sewing-workers.webp` | economic-empowerment program gallery |
| `Economic Empowerment/استثمار/65.png` | `images/gallery/investment-cutting-table.webp` | economic-empowerment program gallery |
| `Economic Empowerment/استثمار/66.png` | `images/gallery/investment-factory-sign.webp` | economic-empowerment program gallery |
| `Economic Empowerment/استثمار/68.png` | `images/gallery/investment-factory-gate.webp` | economic-empowerment program gallery |
| `Economic Empowerment/استثمار/69.png` | `images/gallery/investment-factory-entrance.webp` | economic-empowerment program gallery |
| `Housing/6R6A0542.JPG` | `images/work/program-housing.webp` | housing program gallery, program cover, homepage gallery |
| `Housing/Screen Shot 2025-04-30 at 1.33.44 AM.png` | `images/gallery/housing-painted-home.webp` | housing program gallery, homepage gallery |
| `Housing/6R6A4044.JPG` | `images/gallery/housing-renovated-home.webp` | housing program gallery |
| `Housing/Screen Shot 2025-04-30 at 1.33.56 AM.png` | `images/gallery/housing-painted-home-2.webp` | housing program gallery |
| `Housing/Screen Shot 2025-04-30 at 1.34.12 AM.png` | `images/gallery/housing-painted-home-3.webp` | housing program gallery |
| `Housing/Screen Shot 2025-04-30 at 1.36.48 AM.png` | `images/gallery/housing-girl-at-home.webp` | housing program gallery |
| `Wash/khairy (63 of 155).jpg` | `images/work/program-wash.webp` | wash program gallery, program cover, homepage gallery |
| `Wash/EE1A4743.jpg` | `images/work/water-pipeline.webp` | wash program gallery, water project and Give, homepage gallery |
| `Wash/22.jpg` | `images/gallery/wash-girl-drinking.webp` | wash program gallery, homepage gallery |
| `Wash/EE1A4541.jpg` | `images/gallery/wash-tap-hands.webp` | wash program gallery |
| `Wash/EE1A4568.jpg` | `images/gallery/wash-water-splash.webp` | wash program gallery |
| `Wash/EE1A4901.jpg` | `images/gallery/wash-girl-glass.webp` | wash program gallery |
| `emergency response/10.png` | `images/work/program-emergency-response.webp` | emergency-response program gallery, program cover, homepage gallery |
| `emergency response/معبر20.JPG` | `images/gallery/emergency-convoy-launch.webp` | emergency-response program gallery, homepage gallery |
| `emergency response/15 gaza.png` | `images/gallery/emergency-gaza-aid-box.webp` | emergency-response program gallery, homepage gallery |
| `emergency response/16 gaza.png` | `images/gallery/emergency-gaza-distribution.webp` | emergency-response program gallery |
| `emergency response/17 gaza.png` | `images/gallery/emergency-gaza-distribution-2.webp` | emergency-response program gallery |
| `emergency response/18 gaza.png` | `images/gallery/emergency-gaza-mother-child.webp` | emergency-response program gallery |
| `emergency response/12.png` | `images/gallery/emergency-trucks.webp` | emergency-response program gallery |
| `emergency response/13 معبر.png` | `images/gallery/emergency-border-trucks.webp` | emergency-response program gallery |
| `emergency response/14معبر.png` | `images/gallery/emergency-border-volunteers.webp` | emergency-response program gallery |
| `emergency response/معبر19.png` | `images/gallery/emergency-border-flags.webp` | emergency-response program gallery |
| `emergency response/1.JPG` | `images/gallery/emergency-packing-tent.webp` | emergency-response program gallery |
| `emergency response/2.JPG` | `images/gallery/emergency-sorting.webp` | emergency-response program gallery |
| `emergency response/3.JPG` | `images/gallery/emergency-medical-supplies.webp` | emergency-response program gallery |
| `emergency response/4.JPG` | `images/gallery/emergency-volunteers-packing.webp` | emergency-response program gallery |
| `emergency response/5.JPG` | `images/gallery/emergency-relief-hall.webp` | emergency-response program gallery |
| `emergency response/6.JPG` | `images/gallery/emergency-convoy-truck.webp` | emergency-response program gallery |
| `emergency response/7.JPG` | `images/gallery/emergency-convoy-truck-2.webp` | emergency-response program gallery |
| `emergency response/8.JPG` | `images/gallery/emergency-convoy-volunteer.webp` | emergency-response program gallery |
| `emergency response/9.JPG` | `images/gallery/emergency-convoy-line.webp` | emergency-response program gallery |
| `Culture and Heritage/khairy (13 of 64).jpg` | `images/work/program-heritage-culture.webp` | heritage-culture program gallery, program cover, homepage gallery |
| `Culture and Heritage/300A2665.jpg` | `images/gallery/heritage-weaver.webp` | heritage-culture program gallery, homepage gallery |
| `Culture and Heritage/ارتكاز دعم الفنون والثقافة.jpg` | `images/gallery/heritage-arts-concert.webp` | heritage-culture program gallery, homepage gallery |
| `Culture and Heritage/300A2669.jpg` | `images/gallery/heritage-weaving-hands.webp` | heritage-culture program gallery |
| `Culture and Heritage/khairy (20 of 64).jpg` | `images/gallery/heritage-stage-event.webp` | heritage-culture program gallery |
| `Culture and Heritage/Khairy (8 of 72).jpg` | `images/gallery/heritage-handicrafts-showcase.webp` | heritage-culture program gallery |
| `Culture and Heritage/نور والامل ٢.jpg` | `images/gallery/heritage-orchestra.webp` | heritage-culture program gallery |
| `disability/khairy (91 of 183).jpg` | `images/gallery/disability-swimmer.webp` | heritage-culture program gallery, homepage gallery |
| `disability/18.jpg` | `images/gallery/disability-football.webp` | heritage-culture program gallery |
| `disability/77.jpg` | `images/gallery/disability-performer.webp` | heritage-culture program gallery |
| `Scientific research/DSC00190.jpg` | `images/work/program-scientific-research.webp` | scientific-research program gallery, program cover, homepage gallery |
| `Scientific research/DSC07575.JPG` | `images/gallery/research-laboratory.webp` | scientific-research program gallery, homepage gallery |

## Phase 09.1 — visual closure

### Client-facing requirements

| Requirement | Final status | Placement or decision |
|---|---|---|
| Black-tie evening and venue exterior photography | IMPLEMENTED | The daytime exterior (`images.jpeg`, 547 × 365) illustrates arrival on the Black-tie evening card and appears with its caption in the venue section. Fixed the venue gallery enlarging this small photograph across the desktop container. It now displays at its native proportions up to 547 CSS pixels. |
| Set-menu dinner, Virgin Drinks, Lamp-lighting moment and Live auction | IMPLEMENTED | Each retains its approved bilingual text and its own activity icon, as permitted by the current brief. Neither façade photograph depicts a meal, drinks service, lamp lighting or auction. |
| Dedicated activity photographs | BLOCKED | The delivery contains no plated-dish, drinks, lamp-lighting or auction photograph. |
| Why we gather | IMPLEMENTED | The existing heading and two paragraphs describe guests lighting lamps together. The section retains its text layout. The supplied portrait and exterior photographs have distinct subjects and placements elsewhere. |
| Photograph of the gathering | BLOCKED | No supplied photograph documents the guests or the shared lamp-lighting moment. |
| Gala hero, host, venue, agenda, sponsorship and inquiries | IMPLEMENTED | The night exterior (`15.jpg.jpeg`) serves as the hero under a green overlay and the lead venue photo. Raya’s portrait stays in Host. The white 583 Park Avenue mark stays in Venue. The address includes East 63rd Street and ZIP 10065. The four-act agenda, named-guest rules, booking link, inquiries address and supplied Sponsor now PDF retain their existing placements. |
| Interior hall photograph | NOT APPLICABLE | The current instruction authorizes exterior photography. A hall photograph was never supplied. |
| Bokra and The Waterway | IMPLEMENTED | Both positions stay hidden. Publication still depends on official artwork and approval. |
| Home and program photography | IMPLEMENTED | Main family portrait, secondary community-school circle and clear pipeline image retain their assignments. The circle follows the existing responsive breakpoint. The 26 homepage selections reuse the program images. The nine program galleries contain 100 photos in the distribution recorded above. |
| Branding | IMPLEMENTED | Approved white logo on dark hero and footer surfaces, green logo on the light header and open mobile menu, icon-only favicon and branded sharing image. |
| Earlier RSVP replacement, SDI legal/receipt publication, live payment checks and advertising-platform confirmation | NOT APPLICABLE | The current phase covers visual closure. The external dependencies and earlier verification limits in the requirement register still apply. |
| Provisional agenda annotations or additional speaker names | NOT APPLICABLE | The current brief preserves the approved four-act wording. |

### Files changed in Phase 09.1

- `apps/web/src/components/gala/GalaSections.tsx` — responsive rendering of a single gallery photograph with known dimensions.
- `apps/web/tests/e2e/client-delivery.smoke.mjs` — browser assertions for source-width rendering, decoded images, brand variants, gallery and Gala content.
- `docs/MEKI_FINAL_CLIENT_CHANGES_REPORT.md` — this phase’s decisions and verification evidence.

The review covered the full tracked diff against HEAD, the staging area and the untracked file inventory. The working tree includes earlier changes to Admin, API, database and deployment files. Phase 09.1 changed none of those files. All work remains local and uncommitted.

### Verification and release readiness

| Check | Phase 09.1 result |
|---|---|
| Website unit suite | 182 passed in 15 suites, 0 failures, 0 skipped. Includes source-derived dimensions, program assignments, image uniqueness and the sponsorship PDF checksum. |
| TypeScript and production build | Standalone typecheck passed. Next.js production build passed and generated 50 of 50 static pages. The final build used a localhost site origin so the approved social-sharing image could be checked in the rendered metadata. |
| ESLint | 0 errors and 2 existing warnings, in `postcss.config.mjs` (anonymous default export) and `tests/nov25.test.mjs` (unused parameter). |
| Mobile, 390 px | English and Arabic homepage, Gala and all nine programs passed, 22 page checks. |
| Tablet, 768 px | The same 22 page checks passed. |
| Desktop, 1440 px | The same 22 page checks passed. |
| Rendering and interaction | Across all 66 checks, Chromium decoded the page images, verified document direction and checked horizontal overflow. The homepage gallery expanded to 26 visible figures. Each program’s final photo opened in its captioned lightbox. The daytime venue image stayed within 547 CSS pixels and retained its 547:365 aspect ratio at every width. |
| Branding and links | White header and footer logos, green scrolled/open header, mobile and tablet menu destinations, favicon and branded sharing-image metadata passed. All 37 distinct local link destinations found on the reviewed pages returned HTTP 200. |
| Visual review | Reviewed bilingual Gala section captures, including the experience cards, purpose, venue, portrait, timeline, attendance, sponsorship, FAQ, booking and footer. The section layout follows the reading direction in both languages. The supplied building photographs retain their exterior context. |
| Scope of verification | Local production rendering with the public API offline. The existing hosted-flow entry and simulated donation replay checks also passed with advertising requests intercepted. External transactions, live partner approval and vendor attribution remain outside visual QA. |

**Release readiness:** the frontend is ready for client review with the supplied artwork. The four activity icons and text-only purpose section are the agreed fallbacks. Optional photography and future partner publication depend on the assets listed above.
