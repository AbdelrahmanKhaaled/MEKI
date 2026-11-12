# 12 — Phase 5A: Client-approved website updates & Gala Night page

Status: implemented in `apps/web` only. No backend, schema, migration, seed or database changes. Nothing committed or deployed.

## Confirmed vs pending (Gala)
| Confirmed by client (published on the page) | Pending approval (shown as "to be confirmed" or withheld) |
|---|---|
| Title "Every Light Counts"; Sat Dec 12, 2026; 583 Park Avenue, New York | Doors-open time: latest brief **3:30 PM**, older RSVP document **4:00 PM**. Page uses 3:30 PM. **Confirm.** |
| USD 750 individual ticket, one per guest, guest's own name | Booking/payment flow (fiscal sponsor); refunds, cancellations, tax, receipts |
| Black tie, plated halal dinner, alcohol-free, lamp-lighting, craft display, live auction | Wording of the experience items (events team) |
| Running order (8 items) and "Program subject to change." | Keynote speaker, entertainment. Names Raya Abirached, Beshir Shousha and Ahmed Amin come from the brief; `Gala Page.pdf` says no names until confirmed in writing, so confirm before launch. |
| — | Sponsorship tiers/prices/benefits (all "to be validated"): kept in `PROPOSED_SPONSORSHIP`, rendered only in non-production with `NEXT_PUBLIC_GALA_PREVIEW=1` |
| — | Six supported causes: `GalaCauses` renders nothing until approved data is passed |
| — | Venue photo, arrival/transport/accessibility info, Arabic copy approval |

## Events integration
- Route `/{en,ar}/events/gala-night`. The page shell carries client-confirmed facts; it does **not** read draft CMS data.
- `GET /public/events/gala-night` is fetched (ISR 300 s). A draft/unapproved event returns 404, so nothing unpublished leaks. If published, only `mapUrl` (https only) refines the map link.
- The `gala-night` event record is untouched and still DRAFT. Publishing needs the existing approval flow (`events.approve`) and the missing fields (startsAt, timezone, venue, descriptions).
- Not wired (Phase 5B): `/page` sections, `/campaigns`, `EXTERNAL_LINK` registration URL.

## Homepage CMS consistency
Published CMS values override built-in copy. Nothing was seeded, overwritten or republished. `src/lib/content.ts` `finish()` therefore: (a) swaps untouched legacy seed values for the approved wording (hero CTAs, mission, tagline), keeping any value an admin edited; (b) applies display-only US spelling to English strings; (c) removes `#campaigns` from nav when the section is hidden. The hero primary CTA is a fixed Gala link.

**Recommended admin step (needs approval, via admin UI, then publish):** HERO ctaPrimaryLabel → "Attend the Gala" (href `/en/events/gala-night`), ctaSecondaryLabel → "Explore Our Programs"; VISION_MISSION mission item and tagline → client wording; FAQ + PROCESS items that mention receipts; US spelling in programme/section copy. Arabic wording needs translator approval.

## Featured Campaigns
Hidden: shown only when the API returns approved published campaigns **and** the CMS `CAMPAIGNS` section is published. Component and records untouched.

## Donation UI
Removed card logos, monthly toggle and receipt promises. The widget is one-off only; it opens the "Online giving opens soon" dialog while the backend reports `paymentsEnabled=false`. Backend models and the live path are unchanged (gated by the backend flag).

## Social metadata
`src/lib/site.ts`: origin from `NEXT_PUBLIC_SITE_URL` → Vercel production URL → Vercel URL → localhost only in development. With none set in a production build, image tags are omitted rather than pointing to localhost. Image: `public/og/meki-og.jpg` (1200×630 JPEG from curated `field-sky`). **Set `NEXT_PUBLIC_SITE_URL` in Vercel.**

## Verification commands
`pnpm --filter @meki/web exec tsc --noEmit`, `... exec eslint src`, `... build`.

---
# Phase 6 — Core pages (About, Programs, Give, FAQ, Contact, legal shells)

Routes (en + ar): `/about`, `/programs`, `/give`, `/faq`, `/contact`, `/privacy`, `/terms`, `/cookies`. Shared frame: `components/pages/PageShell.tsx` (header, footer, motion, preview note, donation provider). Copy: `content/pages.ts`. Metadata: `lib/page-meta.ts` (canonical, hreflang, OG via `lib/site.ts`).

Content sources (no duplicated data stores): About reuses the homepage components (VisionMission, HowWeWork, Impact, Enabling); Programs reads `t.programmes` (built-in source content overlaid with published CMS programs); Give reads `t.process`/`t.trust`; FAQ uses published CMS FAQs grouped by `category`, else built-in homepage questions + Gala FAQ; Contact uses `GET /public/home → site` (email, phone, address, social). Legal pages try `GET /public/pages/{privacy|terms|cookies}` and otherwise show "coming soon".

Behavior decisions
- Navigation is now page routes (Home, About, Programs, Give, FAQ, Contact + Gala). Active link = `aria-current="page"`; the language switch keeps the current page. Footer lists the same pages. The old CMS anchor nav links are no longer used by the header/footer.
- Program cards link nowhere (no detail pages exist); mandate/focus areas open inline. No "Give to this program" CTA.
- Contact form: no backend endpoint exists. With a published email it validates and opens the visitor's own email app (`mailto:`), never claiming delivery. Without one it is disabled with a notice.
- Legal footer links are not shown (no published legal content); the footer keeps the "coming soon" text.
- Fixed a Phase 5A gap: the Gala page now has the donation provider, so the header "Give" opens the dialog.

Needs client approval / backend before launch
- Official email, address, social links in Site Settings (otherwise contact shows "published soon").
- Privacy, Terms, Cookie text from legal counsel + fiscal sponsor (publish as CMS pages with slugs `privacy`, `terms`, `cookies`; then add footer links).
- Program names: the page uses the existing source names (Brand Guidelines p.24), which differ from the shorter list in the brief (e.g. "Health Access, Coverage & Quality" vs "Health"). MANDATE_WORDING in the seed holds the alternative; MEKI must choose.
- Impact figures have no reporting period fields; confirm periods.
- Contact submission endpoint (rate-limited, validated, stored/forwarded to an approved address); interest/notify-me endpoint for Give.
- Program detail pages (Phase 2 of the client plan): approved copy + one photo per program, route `/programs/{slug}`.
