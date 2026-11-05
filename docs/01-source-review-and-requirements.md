# 01 — Source Review & Requirements

## 1. Sources reviewed

| Source | Location (local, git-ignored) | Status | Notes |
|---|---|---|---|
| Project context | `client-resources/project-context.md` | ⚠️ **Empty (0 bytes)** | Referenced by CLAUDE.md but has no content. Decisions below rely on CLAUDE.md and the PDFs. Fill it or confirm it can be dropped (see doc 08, B1). |
| Front-End Scope & Requirements v2 (Shark Clicks, 28 Oct 2026, 16 pp.) | `documents/MEKI_Front-End_Scope_and_Requirements_v2.pdf` | Primary for requirements, **superseded for tech and ownership** | It assumes React + Vite SPA, Laravel, and Filament back office by Shark Clicks. CLAUDE.md replaces these with Next.js, NestJS, MySQL + Prisma, and a custom Next.js admin built by our team. Requirement IDs (RD, SEC, FRD, AML) still apply where relevant. |
| MEK Updated Sector Mandates (3 pp.) | `documents/MEK - Updated Sector Mandates.pdf` | **Verified source** | Long-form mandate for 9 sectors and the NGO Development enabling function. Contains "over 4000 local NGOs". |
| MEKI Brand Guidelines v1.0 (Oct 2026, 31 pp.) | `brand-kit/.../MEKI_Brand_Guidelines.pdf` | **Verified source, authoritative for naming and copy** | Palette, type, logo rules, voice, the 9 programme names "use exactly", approved boilerplates and proof points. |
| Brand kit files | `brand-kit/MEKI_Brand_Kit/MEKI_Brand_Kit/` | Verified | Logo SVG/PDF/PNG (Primary, Icon, Secondary), colours (css/json/ase/txt), fonts (Lato, Source Serif 4, OFL), templates. |
| Service portfolio 2026–2030 screenshot | `references/WhatsApp Image 2026-11-05 at 12.57.39 PM.jpeg` | Verified as a reference (low-resolution image) | Short mandates plus 3 sub-themes per directorate; 3 enabling functions. Use it as structure/copy reference, not as a page asset. |
| Programme photography | `Imgaes/client-images/` (note the folder typo "Imgaes") | Verified as MEKI/MEK media; **consent and captions not yet confirmed** | ~1,040 files, **4.1 GB**: 1,005 jpg, 16 png, 3 jpeg, 2 HEIC, 1 CR2, 15 .DS_Store. Inventory in doc 04. Folder names in `nada/` were zip-mojibake and are decoded in doc 04. |
| `images/client-images/` | | Empty (`.gitkeep`) | Intended destination? See doc 04. |

Images were **inventoried by filename only**. No bulk image ingestion was done. Selection happens in a curated step (doc 04).

## 2. Data classification

### 2.1 Verified source data (may be published as fact, with the stated attribution)

| Item | Source | Usage rule |
|---|---|---|
| Tagline "Lasting Change, Built Together." | Brand p.5 | Exact wording; title case in lock-ups |
| Vision, mission, "Who we are" text | Brand p.4 | Verbatim |
| Connect / Unite / Empower / Account (+ descriptions) | Brand p.5 | "Use them to structure… the About section of any MEKI website" |
| Boilerplates (short, standard) | Brand p.25 | Verbatim |
| Legacy line "Inspired by the legacy of Misr El-Kheir." | Brand p.7 | Under/near logo, footer, About |
| Proof points: 20 years · 27 governorates · 35M+ beneficiaries · $300M programme expenditure (past four years) | Brand p.25 | **Must carry the attribution "Figures: Misr El-Kheir, Egypt."** Never present them as MEKI's own results |
| 9 programme names + one-line descriptions | Brand p.24 | Names exactly as written |
| 3 enabling functions (NGO Development, Field Offices, Business Intelligence) | Brand p.24, portfolio image | "Capabilities, not programs" |
| Long sector mandates | Mandates PDF | Programme detail copy |
| Short mandates + sub-themes | Portfolio image | Programme cards |
| "over 4000 local NGOs" | Mandates PDF | MEK figure; attribute like the other proof points |
| Palette, typography, logo files | Brand kit | Use as supplied |

### 2.2 Naming conflicts to resolve (Brand Guidelines win by default)

| Brand Guidelines (use) | Mandates PDF | Portfolio image |
|---|---|---|
| Social Solidarity & Household Resilience | Social Solidarity & Family Resilience | Social Protection & Household Resilience |
| Health Access, Coverage & Quality | Health | Health Access, Coverage & Quality |
| WASH, Environment & Climate Resilience | WASH & Environmental Resilience | WASH, Environment & Climate Resilience |
| Emergency Response | Emergency Relief & Humanitarian Response | Emergency Response |
| Heritage, Culture & Identity | Heritage, Culture & Identity | Culture, Identity & Heritage |
| Scientific Research & Research Ecosystem | Scientific Research | Scientific Research & Research Ecosystem Support |

The mandates PDF text also flows across columns. The WASH/Emergency/Heritage paragraphs must be re-assigned carefully during seeding. The seed file is reviewed line by line (doc 04).

### 2.3 Not supplied (must not be invented)

- **Arabic copy and translations** for any of the above. Machine-translated drafts are allowed only with provenance `PROPOSED` until MEKI approves them.
- Contact details: phone, address, email (the brand owner's email shows only as "[email]").
- Donation campaigns, goals, totals, progress, donor counts, testimonials, partner logos.
- Legal pages: privacy notice, terms, AML/CTF policy, cookie policy.
- Country organisation and legal entity (MEKI vs MEKI-US), registration numbers, tax-deductibility statements.
- Photo captions, places, photographer credits and consent records.
- Social media URLs.

### 2.4 Proposed content (editable drafts, never shown as verified)

- Draft campaigns per programme (for example "Water access in Luxor"), created as `PROPOSED`/`DRAFT` with **no goal and no raised amount** unless MEKI supplies them.
- Section headings and microcopy that we write (CTA labels, empty states).

### 2.5 Demo data (development only)

- Any filler such as fake totals for a progress bar component is tagged `DEMO`. The API never returns `DEMO` records when `NODE_ENV=production`. Seeds for demo data live in a separate script that refuses to run against production.

## 3. Requirement traceability (urgent scope)

The requirements below come from the Shark Clicks brief and still apply. They are adapted to the new stack.

| ID | Requirement | Applies to | Plan reference |
|---|---|---|---|
| FE-02 | Tailwind v4 CSS-first `@theme`, tokens defined once, no v3 config | web, admin | 02 §3, 05 §1 |
| FE-03 | TypeScript strict | all | 02 |
| FE-06 | Shared schema per form (Zod) for both languages | web, admin, api | 06 §5 |
| FE-07 | All strings externalised; ar/en resources; locale-aware number/date/currency | web, admin | 05 §4 |
| FE-11 | ESLint/Prettier, tests, CI green | all | 07 P1 |
| FE-13 | Permissive licences only, licence list | all | 07 P5 |
| FE-14 | Env-driven config, no secrets committed | all | 02 §5 |
| FE-15 | Analytics only via consent-gated loader | web | 05 §2.3 |
| RD-01..03 | 360→1920 px, 44 px targets, keyboard, focus | web, admin | 05 |
| RD-04 | Logical properties only (`ms-/me-/ps-/pe-`), mirrored icons, `dir` from locale | web, admin | 05 §4 |
| RD-05 | WCAG 2.2 AA | web, admin | 07 P5 |
| RD-06 | Lighthouse ≥ 90, LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1, WebP/AVIF + srcset | web | 04 §3, 07 P5 |
| RD-09 | Arabic + Latin typefaces with matching weights | web | 08 B4 |
| RD-10 | prefers-reduced-motion | web | 05 |
| SEC-01..03 | No secrets; httpOnly/Secure/SameSite cookies; Zod validation server-authoritative | api, admin | 06 §3 |
| SEC-05 | Strict CSP (nonce) | web, admin | 02 §5 |
| SEC-06 | CSRF protection on state-changing requests | admin↔api | 06 §3 |
| SEC-09/10 | Generic errors; no PII in logs/console | all | 06 §6 |
| SEC-12 | Dependency audit, SBOM | all | 07 P5 |
| SEC-13 | Upload type/size checks; no untrusted SVG rendering | admin, api | 06 §4 |
| SEC-14 | 401/403/429 handling | admin | 06 |
| SEC-15 | `frame-ancestors 'none'` | web, admin | 02 §5 |
| SEC-16 | Consent banner before non-essential scripts; privacy links | web | 05 |
| FRD-01 | Bot protection + honeypot on public forms | web (contact/interest form) | 06 §2 |
| — | Payments: server-verified webhooks, idempotent | **deferred** | 03 §5, 07 P7 |
| Auth/KYC/AML/FRD-02..12, payment screens | Donor portal scope | **deferred, gated** | 07 P6–P8 |

## 4. Brand rules that constrain the UI (summary)

- Palette proportion is roughly 50 Limestone / 25 Deep Green / 15 MEKI Green / 6 Gold / 4 other. MEKI Green is for actions, and **one gold button per screen** for the main action.
- Harvest Gold `#D6A146` is not used for small text on light backgrounds. Use Gold Text `#7A5818` there, and Glow `#E6C36F` on dark backgrounds.
- Hero: "lit Deep Green hero, quick give card, gold hairlines and Limestone sections". Points of light appear on Deep Green only, never on Limestone.
- Logo: Primary logo top-left, minimum 120 px wide, clear space = symbol head height. Below that size, use the Icon. The Secondary logo is reserved and is **not used**.
- Icons: Lucide, 1.6 stroke, round ends, MEKI Green or Glow.
- Voice: say "programmes", not "causes" or "cases". No "the poor"/"victims", no religious giving terms, no unsourced superlatives. Every figure needs a source and period.
- Spelling: UK English for international MEKI (programme, organisation), or US English if the site is MEKI-US (doc 08 B2).
- Photography: real, consented, dignified. **No identifiable children without guardian consent.** Caption with place and programme, and credit the photographer.
