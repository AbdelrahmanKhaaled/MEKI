# 08 — Decisions, Open Questions & Risks

## Blocking for P1/P2 start (please answer at sign-off)

| ID | Question | Our recommended default if no answer |
|---|---|---|
| B1 | `client-resources/project-context.md` is empty. Is there a context document we should have? | Proceed with CLAUDE.md + PDFs as the record. I can draft the context file from this pack if you want. |
| B2 | Which entity and audience is this site for: international **MEKI** or **MEKI-US**? This decides spelling (UK vs US), currency, legal entity details and the country beside the logo. | International MEKI, UK English, with no country beside the logo |
| B3 | Default language and Arabic copy: who translates/approves Arabic, and may we launch EN-first if Arabic isn't ready? | Arabic default (`/ar`) once approved. Until then, launch `/en` with `/ar` not indexed |
| B4 | Arabic typefaces are not in the brand kit. May we propose a pairing (for example IBM Plex Sans Arabic for text with a matching serif/naskh for headlines) for brand-owner approval? | Propose 2 options in P3 for approval |
| B5 | Admin users: who are they, how many, and is MFA required at launch? | 2–5 staff; MFA in 4b right after launch |
| B6 | Landing page only, or landing page plus programme pages (old brief Q2)? | Landing page + 9 programme detail pages |

## Content & compliance (needed before launch, not before build)

| ID | Question |
|---|---|
| Q-C1 | Photo consent: do the client photos have participant/guardian consent for web publication? Who are the photographers to credit? What are the places for captions? Many folders (community schools, incubators, student house) likely show children. |
| Q-C2 | Photos are of Misr El-Kheir (Egypt) programmes. Is MEKI permitted to show them, and with what caption wording (for example "Misr El-Kheir programme, Luxor")? |
| Q-C3 | May "over 4,000 local NGOs" (Mandates PDF) be shown as a proof point? It is not in the brand's approved proof-point list. |
| Q-C4 | May the approved public copy (seed JSON) and the Primary/Icon logo files be committed to the repo? `.gitignore` currently excludes all of `client-resources`. The alternative is a private asset/seed source loaded at build time. |
| Q-C5 | Contact details, social URLs, privacy notice, terms, and cookie policy: who supplies them and when? |
| Q-C6 | Which campaigns, if any, does MEKI want to show at launch, with which approved goal figures? (Default: none, and the section is hidden.) |
| Q-L1 | Data retention period for contact/interest submissions; data controller entity. |
| Q-L3 | Arabic numerals: Western (0-9) or Eastern Arabic (٠-٩)? |
| Q-H1 | Hosting, domain(s), and media storage (S3-compatible bucket/CDN); managed MySQL provider with point-in-time recovery. |
| Q4/Q6/Q7 (old brief) | Payment methods, AML jurisdiction/regulator, vendors. These block P6–P8 only. |

## Superseded items from the Shark Clicks brief (recorded)

| Brief said | Now | Source |
|---|---|---|
| React 19 + Vite SPA (FE-01, FE-04, FE-05) | Next.js App Router + TypeScript | CLAUDE.md |
| Laravel API + Sanctum (FE-16, SEC-02, SEC-06) | NestJS API, server sessions + CSRF | CLAUDE.md |
| Filament back office by Shark Clicks | Our Next.js admin app | CLAUDE.md |
| DB unspecified (Laravel) | MySQL + Prisma | CLAUDE.md |

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| No approved Arabic copy | AR launch slips | EN-first fallback (B3); Arabic shown in admin as PROPOSED |
| Image consent unknown | Gallery can't publish | Publish gate on `consentStatus`; launch with fewer, confirmed images, or a text-only programme section |
| Naming inconsistencies across sources | Wrong programme names | Brand Guidelines names locked, with a snapshot test |
| Accidental fake figures | Reputational/legal | Provenance enum, DEMO publish block, no raised-amount columns, attribution required |
| Large media (4.1 GB) and slow LCP | Performance | Curated shortlist, AVIF/WebP variants, priority hero only |
| GPS/EXIF leakage from photos | Privacy | Strip all metadata in the pipeline (tested) |
| DB mishap | Data loss | Separate dev/test DBs, db-guard, no reset scripts, reviewed migrations, backups before deploy |
| Pressure to "turn on donations" early | Compliance/fraud | Dual flag (env + DB), go-live checklist, server-verified webhooks only |
