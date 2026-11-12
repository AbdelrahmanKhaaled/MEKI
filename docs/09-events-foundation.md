# 09 — Events & Gala Night Foundation (Phase 2)

Status: implemented in `apps/api` (`src/modules/events`), migration `20261106120000_phase2_events`.

## What exists

- `Event` (bilingual content, schedule with IANA timezone, venue, CTAs, SEO, hero/cover media, visibility PUBLIC/UNLISTED, featured, ordering, approval, provenance, soft delete).
- `EventMedia` (ordered gallery/supporting images from the existing Media Library).
- `EventCampaign` (promotion links to existing campaigns; no financial data).
- Each event owns one Phase 1 CMS `Page`; its sections use `EVENT_*` section keys (hero, about, highlights, agenda, speakers, venue, sponsorship, campaigns, FAQ, registration, contact) with the same items, visibility, ordering and publish snapshots as the homepage.
- Registration modes: `NONE` and `EXTERNAL_LINK` only. Neither collects personal data.

## Rules enforced by the API

- Publishing needs: recorded client approval (`events.approve`), `titleEn`, `shortDescEn`, a confirmed `startsAt` + valid IANA `timezone`, non-DEMO provenance, a date that has not passed.
- Event pages are served only while the event is public (PUBLISHED, CANCELLED after publication, COMPLETED) and never through `/public/pages/:slug`. Site CMS endpoints refuse event pages (`EVENT_PAGE_SCOPE`).
- Linked campaigns are filtered through the campaign public rules; linking or publishing an event never changes a campaign.
- Live events can't be deleted or lose their confirmed schedule; completed events can only be archived.

## Gala Night

Seeded as `EVT-GALA-NIGHT` / `gala-night`: DRAFT, unapproved, `scheduleNoteEn = "12 December — year, time and venue to be confirmed"`, an empty `EVENT_*` section skeleton, and no campaign links. Everything else is empty until confirmed. Pending items are listed in `internalNotes`.

## Future extension points (not implemented — need client approval first)

| Capability | Planned shape | Hook in current code |
|---|---|---|
| RSVP / guest registration | `EventRegistration` (eventId, minimal contact fields, consent version, status, idempotency key) and new mode `RSVP` | `EventRegistrationMode` enum; `EVENT_REGISTRATION` section |
| Ticket categories & capacity | `EventTicketType` (bilingual name, price minor units + currency, capacity, sales window) and `EventTicketReservation` with stock decremented in a transaction | new mode `TICKETED` |
| Ticket purchase / event donations | Reuse the future `Donation` / `PaymentAttempt` / `WebhookEvent` models with a nullable `eventId`, verified server-side webhooks only | `EventsService.assertNoFinancialRecords` must then block deletion |
| Sponsorship packages | `EventSponsorshipPackage` (bilingual name/benefits, optional approved amount) and `EventSponsor` (organisation, logo media, tier) | `EVENT_SPONSORSHIP` section |
| Speakers / guests | Can stay as CMS section items (name, role, photo). Promote to a model only if they're reused across events | `EVENT_SPEAKERS` section |

## Client decisions required before those are built

1. Gala Night year, start/end time, timezone, venue and address, description, Arabic copy and imagery.
2. Is registration needed (none / RSVP / paid tickets / an external platform)? If so, what attendee data is the minimum, and what are the retention and consent rules?
3. Ticket categories, prices, currency and capacity. A payment provider is needed (same dependency as donations).
4. Sponsorship packages and amounts, and approval of sponsor names and logos.
5. Whether a specific campaign is promoted at the event. That campaign still needs its own approval.
6. Who approves event content (and sets `events.approve`).
