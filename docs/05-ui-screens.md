# 05 — UI Screens & Design System

## 1. Design tokens (`packages/tokens`, Tailwind v4 `@theme`)

The tokens are generated from `MEKI_Colours.json`, so values are never retyped by hand.

| Token | Value | Use |
|---|---|---|
| `--color-meki-green` | #008066 | Primary actions, links, icons, logo on light |
| `--color-deep-green` | #0B3B30 | Hero, dark sections, footer |
| `--color-harvest-gold` | #D6A146 | Hairlines, shapes, large display type, **one gold CTA per screen** |
| `--color-limestone` | #F6F2EA | Page background |
| `--color-ink` | #13241F | Headlines/body |
| `--color-paper` | #FFFDF8 | Cards, panels |
| `--color-body-grey` | #46564E | Body text |
| `--color-mint-line` | #CFE0D6 | Text/lines on dark |
| `--color-stone-line` | #E2DACB | Borders on Limestone |
| `--color-gold-text` | #7A5818 | Small gold labels on light |
| `--color-glow` | #E6C36F | Gold text on dark |
| `--font-serif` | Source Serif 4 (300/400/italic) | Display, headlines, quotes |
| `--font-sans` | Lato (400/700, 300 for large captions) | Body, labels (labels uppercase, +0.22em) |
| `--font-arabic-*` | **TBD (B4)** | Arabic display + text |

Type scale (brand p.18): Display 72–104 / Headline 40–56 / Heading 22–28 / Lead 19–22 / Body 15–17 / Label 11–13. Sizes are fluid with `clamp()`.

Fonts are self-hosted from the brand kit TTFs, converted to WOFF2 (OFL permits this) and loaded with `next/font/local`, so there is no third-party font request and CSP stays strict.

Accessibility: we check contrast pairs in CI with a token test that asserts every allowed text/background pairing is at least 4.5:1. Gold on Limestone for body text is disallowed by lint rule and docs.

## 2. Public landing page (`apps/web`) — `/{locale}` (ar | en)

Every section below is an admin-editable `PageSection`, can be reordered and hidden, and has its own provenance.

| # | Section | Content source | Notes |
|---|---|---|---|
| 0 | Header | Primary logo (Green on Limestone, White on Deep Green when over the hero), nav anchors, language switch, **CTA "Donate (coming soon)"** disabled/secondary | Logo ≥ 120 px; Icon on small mobile if needed |
| 1 | Hero | Lit Deep Green + points of light, eyebrow, tagline (Display serif light), short boilerplate, one gold CTA (anchor to Programmes or "Register interest"), quick-give card **in "coming soon" state** | Brand p.27. The quick-give card shows no amounts while payments are gated |
| 2 | Who we are / Mission & Vision | Standard boilerplate + vision + mission | Verified |
| 3 | How we work | Connect · Unite · Empower · Account (4 columns, gold hairlines) | Verified |
| 4 | Proof points | 20 years · 27 governorates · 35M+ · $300M + mandatory **"Figures: Misr El-Kheir, Egypt."** | Verified + attribution. No count-up animation if reduced motion is on |
| 5 | Programmes | 9 programme cards (number, Lucide icon, name, one-liner, 3 sub-themes) → detail drawer/page | Verified |
| 6 | Enabling functions | NGO Development · Field Offices · Business Intelligence | Verified |
| 7 | Our work in pictures | Curated gallery per programme, captions + credits | Only images with `consent=CONFIRMED` |
| 8 | Campaigns preview | **Hidden by default.** Shows only MEKI-approved campaigns, without fake progress | Proposed → needs approval |
| 9 | CTA band | "Partner with us" / register interest | Microcopy is PROPOSED |
| 10 | Footer | Logo, legacy line, nav, legal links (privacy/terms placeholders render "coming soon" until MEKI text exists), contact (hidden while null), social (hidden while null) | — |

Additional routes:
- `/{locale}/programmes/[slug]` uses the long mandate, sub-themes and gallery. Q2 decides between single page and multi-page; the recommendation is the landing page plus these 9 lightweight detail pages for SEO.
- `/{locale}/privacy`, `/{locale}/terms` are shells that are not linked until text is supplied.
- `404`, `500`, and a maintenance page.
- A cookie consent banner. Analytics load only after consent (FE-15, SEC-16). Analytics are off by default until a vendor is chosen.

States: loading skeletons only for client-side pieces; everything else is static HTML. Empty states: a section with no published items does not render, so there are no "0 campaigns" placeholders.

### 2.1 Responsive

Mobile-first from 360 px. Programme grid is 1 → 2 (sm) → 3 (lg) columns, with a container max-width of about 1280 px. Touch targets are at least 44 px.

## 3. Admin dashboard (`apps/admin`)

| Screen | Purpose | Roles |
|---|---|---|
| Sign in (+ lockout, generic errors) / MFA (4b) | Staff auth | all |
| Dashboard | Draft/review counts, items missing Arabic/alt/consent, recent audit activity, "Payments: OFF" status badge | all |
| Landing page builder | Ordered list of sections; per-section form (Zod-driven) with EN/AR tabs side by side; drag to reorder; show/hide; preview (EN and AR, mobile/desktop); Submit for review → Publish | Editor submits, Reviewer/Super publishes |
| Programmes | List + edit (names locked to brand strings unless Super Admin), mandates, sub-themes, icon, cover, gallery ordering | Editor |
| Proof points | Edit display value, label, period, **attribution required** | Editor; publish by Reviewer |
| Media library | Upload (jpeg/png/webp; max 15 MB), grid with filters (programme, consent, missing alt), detail form (alt EN/AR, caption, place, photographer, consent, minors) | Editor |
| Campaigns (Proposed) | Draft campaigns with a big **PROPOSED / not approved** badge; approval fields (who at MEKI, date, note); donations toggle locked while payments are gated | Editor drafts; Super records approval |
| Site settings | Tagline, legacy line, contact (empty until supplied), social, SEO, default locale | Super Admin |
| Navigation | Header/footer items | Editor |
| Inquiries (Phase 3) | List, mark handled, CSV export; PII masked for Viewer role | Super / designated |
| Users & roles | Invite, deactivate, reset MFA | Super Admin |
| Audit log | Read-only, filterable | Super / Reviewer |
| Version history | Per-section snapshots + restore (restore creates a new draft) | Reviewer |

Admin UX rules:
- Provenance is shown as badges: `VERIFIED` green, `PROPOSED` gold-outline, `DEMO` red. The Publish button is disabled with a reason when integrity rules fail (doc 03 §2).
- The admin UI is bilingual. Default locale is English for staff, which MEKI can change, and the UI is fully RTL-capable.
- Unsaved-change guard, autosave of drafts, and an idle timeout warning at 13 minutes with sign-out at 15 minutes (SEC-07, adapted).

## 4. Internationalisation & RTL

- Locale is in the URL (`/ar`, `/en`), `<html lang dir>` is set server-side, and `hreflang` alternates are added.
- Only logical utilities are used (`ms-*`, `pe-*`, `start-*`, `text-start`). An ESLint rule forbids `ml-/mr-/pl-/pr-/left-/right-` classes.
- Directional icons (arrows, chevrons) are mirrored using `rtl:` variants.
- Numerals: Western Arabic digits vs Eastern Arabic in `ar` is decision Q-L3. They are formatted through `Intl.NumberFormat`.
- Proof-point strings like "35M+" are stored as display strings per locale, so they are not computed or mistranslated.
