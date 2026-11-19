# 43 — Phase 10: Website visual enhancement and motion design (all pages except the homepage)

Date: 2026-11-19. Scope: every public route of `apps/web` **except `/{locale}` (homepage)**. No new dependency was added; motion uses the existing GSAP `MotionRoot` (`data-*` hooks) and CSS keyframes.

## 1. Route inventory (inspected)

| Route | Before Phase 10 | Changed |
|---|---|---|
| `/{l}` Homepage | — | **Excluded; verified unchanged (doc 45 §2)** |
| `/{l}/about` | Arch hero; reused homepage sections; legacy note as a small text strip | ✔ |
| `/{l}/programs` | Backdrop hero (photo repeated in the grid); card grid | ✔ |
| `/{l}/give` | **Plain hero, three text-only sections** | ✔ |
| `/{l}/faq` | Plain hero; text pill navigation; accordion | ✔ |
| `/{l}/contact` | **Plain hero; text-only details column** | ✔ |
| `/{l}/privacy`, `/terms`, `/cookies` | Plain hero; plain text or pending note | ✔ |
| `/{l}/events/gala-night` | Designed, but text-led: experience list, programme, venue | ✔ |
| `/{l}/events/gala-night/book` | **Bug: white header links on a light background** (invisible) | ✔ fixed + band |
| `/{l}/events/gala-night/booking`, `…/booking/[reference]` | Same header bug | ✔ fixed |
| `/{l}/donation/return` | Same header bug | ✔ fixed |
| 404 (`not-found`, catch-all) | Static dark panel | ✔ |

## 2. Design system additions (homepage-safe by construction)

- **CSS:** one appended block of **new `p10-` classes only** (`globals.css`, last section). No existing rule was edited. The homepage uses none of these classes (unit test `phase10.test.mjs` checks that the block contains only `p10-` selectors). The global `prefers-reduced-motion` rule neutralises all of them.

  | Class | Effect |
  |---|---|
  | `p10-lift` | Card elevation on hover/focus |
  | `p10-zoom` | Controlled image zoom |
  | `p10-underline` | Animated underline, RTL-aware |
  | `p10-nudge` | Icon nudge |
  | `p10-icon` | Icon tile tilts and fills on group hover/focus |
  | `p10-lamp` | Flickering lamp, infinite |
  | `p10-drift` | Slow drifting glow, infinite |
  | `p10-travel` | Light travelling down the Gala programme line, infinite |
  | `p10-row` | Timeline row slide on hover, RTL-aware |
  | `p10-progress` | Reading-progress bar (CSS scroll-driven; hidden where unsupported) |

- **Components used only by secondary pages:**
  - `PageHero` (new `mosaic` layout; floating second photo for `arch`; Ken Burns + parallax for `backdrop`; ambient rings and glow);
  - `PageCta` (optional parallax photo, slow ring, glow);
  - **new** `FlowBand` (dark band for transactional pages);
  - `ProgramsGrid`, `FaqAccordion`, `LegalPage`, `GalaSections`.
- **Not touched** (shared with the homepage): `Header`, `MotionRoot`, `Footer`, `DonateProvider`, `components/sections/*`, `Decor`, existing CSS.

## 3. Page-by-page

| Page | Issues found | Improvements | Images (all MEKI-owned field photography from `client-resources/Imgaes`, already in `public/images/work`) | Motion | Tests (doc 45) |
|---|---|---|---|---|---|
| About | Legacy note was a small grey line between sections | Arch hero gains a floating second photo + slow dashed ring. The legacy note becomes a **full-bleed parallax photo band** with the note set large over a gradient and a drawn gold line. | hero-field, **weaver** (floating), **weavers-loom** (band) | Hero timeline, `float-y`, `spin-slow`, `data-parallax`, `data-line`, `data-reveal` | ✔ |
| Programs | Hero photo duplicated in the grid | **Mosaic hero** (three program photos not used in the grid). Cards: curtain image reveal, hover shadow + green wash, icon tilt, gold hairline that grows, title colour. CTA band with parallax photo. Ordinal numerals use the darker brand gold (WCAG, doc 40 decision (a) applied here). | **operating-room, water-station, painted-house** (previously unused), greenhouse-harvest (CTA) | `data-clip`, stagger, parallax, `pulse-soft`, `float-y` | ✔ |
| Give | Plain hero; steps, trust and "never" lists were text-only | **Mosaic hero** of campaign photos. Steps beside a **sticky photo** with parallax; step numbers fill gold on hover. Trust commitments become **icon cards** (lift, glow, icon tilt). "We never" list becomes a dashed panel with marks. Availability band gets a turning ring and drifting glow. | **incubator, water-pipe, carpentry** (hero), **housing-site** (steps) | Clip reveal, parallax, stagger, `spin-slow`, `p10-drift` | ✔ |
| FAQ | Text-only navigation | Category links become **icon cards with question counts** (lift, icon tilt). Accordion: gold accent bar grows beside the open question. Hero motif rings and glow. | — (no photo fits a question list; not added for decoration) | Ambient hero, accordion transitions | ✔ |
| Contact | Plain hero; details were a text list | **Arch hero** with portrait. Details become a **deep-green card** with icons, pattern, points of light, turning ring and animated underlines. The form sits in a raised card. | **farmer-portrait** | Hero timeline, `spin-slow`, `twinkle`, underline transitions | ✔ |
| Privacy / Terms / Cookies | Plain | **Reading-progress bar**. When CMS sections exist: sticky numbered table of contents + numbered sections with reveals. Pending state: a designed card with a pulsing light. No photography (legal reading should stay calm). | — | `p10-progress` (scroll-driven), reveals | ✔ |
| Gala Night | Text-led experience list; text-only programme; venue as plain text | Hero: Ken Burns + parallax photo, **flickering lamp field**, slow ring, scroll cue. Purpose: an **illustrated "many lamps, one glow" panel** (the evening's own metaphor). Experience: **six icon cards**. Programme: a **light travelling down the timeline**, rows slide on hover. Venue: **stylised location card** (city grid, pulsing pin, links to the map). Attendance: check-mark rules, lamp beside the price, **API price when published**. Booking band: lamp field. FAQ: hover state. | field-sky (existing); **no venue photo exists**, so none is shown | Lamps (infinite), `spin-slower-rev`, `float-y`, `p10-travel`, stagger, reveals, parallax | ✔ |
| Booking / booking status / donation return | **Header links invisible** (white on limestone) | `FlowBand`: dark band behind the header. On `/book` it carries the eyebrow, title and back link. Status/return pages get a slim band. Booking logic untouched. | — | `spin-slow`, `twinkle` | ✔ booking smoke 3 engines |
| 404 | Static | Radial glow, pattern, points of light, two counter-rotating rings, glowing "404" | — | `spin-slow`, `spin-slower-rev`, `twinkle` | ✔ |

## 4. Images

- **Sources:** client-supplied Misr El-Kheir programme photography, already in the repository. Web copies are generated by `pnpm media:build` from `client-resources` (originals untouched, EXIF/GPS stripped; source paths in `public/images/work/manifest.json`).
  - **No external, stock or AI images were added.**
  - **Consent status is UNCONFIRMED** (`content/media.ts`). This applies to every page that shows people, including the photos newly used here: weaver, farmer-portrait, carpentry, housing-site and incubator. MEKI must confirm before production publication (existing blocker).
- **Formats:** WebP, served through `next/image` (AVIF/WebP, responsive `sizes`, lazy below the fold, `fill` inside fixed aspect-ratio boxes, so no layout shift).
- **Alt text:** all added photos are decorative (`alt=""`); headings carry the meaning. Content images inside cards keep the existing behaviour.
- **No image repeats on the same page.** `painted-house` was previously unused.
- **Not added (honest gaps):** Gala/venue photography, event-night imagery, portraits of speakers — none approved.

## 5. Motion principles

- **Scroll-triggered:** `data-reveal`, `data-stagger`, `data-clip`, `data-line`, `data-parallax` (one-shot or scrubbed to native scroll; no scroll hijacking).
- **Infinite:** only on decorative layers (rings, lamps, glows, travelling light). Never on text or controls.
- **Hover/focus:** every hover effect also triggers on `:focus-visible` / `:focus-within`, so keyboard users get the same feedback.
- **Reduced motion:** the existing global rule stops every animation and transition. GSAP shows the final state. Verified in doc 45.
- **Properties animated:** transform, opacity, clip-path, background-size/position only.
