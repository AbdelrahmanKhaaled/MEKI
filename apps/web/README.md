# @meki/web — MEKI landing page (preview)

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · GSAP + ScrollTrigger.
English (`/en`, default) and Arabic RTL (`/ar`, draft translation pending MEKI approval). `/` redirects to `/en`.

```bash
corepack pnpm install
corepack pnpm dev          # http://localhost:3000
corepack pnpm build && corepack pnpm start
corepack pnpm typecheck
corepack pnpm media:build  # regenerate public/images/work from client-resources (read-only)
```

## Content & provenance
- `src/content/en.ts` — verified copy (Brand Guidelines v1.0, Sector Mandates, Portfolio 2026–2030), marked [V]/[P]/[PREVIEW].
- `src/content/ar.ts` — PROPOSED Arabic translation, not approved.
- Proof points always carry "Figures: Misr El-Kheir, Egypt."
- Campaigns are PREVIEW labels from photo folders: no targets, totals, progress or donor counts.
- Photos: `public/images/work/manifest.json` lists the source file of every image. EXIF/GPS stripped; consent UNCONFIRMED; no identifiable children selected.
- Logos/fonts copied unmodified from the brand kit (`public/brand`, `src/fonts`). Secondary logo not used.

## Payments
Not active. Every "Give" opens an informational dialog; no payment data is collected and no success is simulated.

## Before production
MEKI approval of copy, Arabic translation and Arabic fonts (IBM Plex Sans Arabic / Noto Naskh Arabic proposed), photo consent and captions, campaigns; contact and legal pages; CSP with nonces (inline motion bootstrap + JSON-LD scripts); remove `robots: noindex`.
