# 44 — Phase 10: Gala Night content and data audit

Date: 2026-11-19. Inspection only: `meki_dev` and `meki_test` were read with `SELECT`; **no record, status or provenance was changed**. Sales and payments remain disabled.

## 1. Sources inspected and how they relate

| Source | What it holds | Authority |
|---|---|---|
| **Client brief (Phase 5A)**, recorded in `docs/12-phase5a-progress.md` | Title "Every Light Counts", Sat 12 Dec 2026, 583 Park Avenue NY, USD 750 individual ticket (one per guest, own name), black tie, plated halal dinner, alcohol-free, lamp-lighting, craft display, live auction, 8-item running order, "Program subject to change." | Client-confirmed **in writing to the previous team**. The brief itself is **not a file in this repository**. |
| `client-resources/documents/Gala Page.pdf` | Page brief; sponsorship tiers marked "to be validated"; no speaker names until confirmed in writing | Client document. **Not re-read this session**: no PDF tooling is installed and none was added. Its content is taken from the documented reading in docs 12, 28 and 30. |
| `apps/web/src/content/gala.ts` | Public page copy with per-field provenance tags `[C]` confirmed / `[P]` proposed microcopy / `[T]` to be confirmed. Arabic flagged "draft translation". | Code dictionary (what the website shows) |
| **Database** `Event` `EVT-GALA-NIGHT` (`meki_dev`) | `status=DRAFT`, `provenance=PROPOSED`. `sourceRef`: "Client-provided context (Phase 2 brief): event name and 12 December date only". **NULL:** `startsAt`, `endsAt`, `timezone`, venue, address, map, descriptions, Arabic title. `internalNotes`: pending year, time, timezone, venue, agenda, speakers… | Backend record (drives booking, check-in, admin) |
| **Database** `EventTicketConfig` | `ticketPrice 750.000 USD`, `salesEnabled=0`, `maxTicketsPerBooking=10`, `capacity=NULL`, display labels "Every Light Counts" / "Saturday, December 12, 2026" / "583 Park Avenue, New York, USA", `provenance=PROPOSED` | Backend record |
| Public API | `GET /public/events/gala-night` and `/ticketing` → **404** (the event is not approved/published) | Live behaviour |
| Zeffy/SDI docs 31/32, launch blockers doc 30 | Payment, refund, receipt, fair-market-value (FMV) and tax items pending SDI | Fiscal-sponsor decisions |

### The discrepancy, stated plainly

- **The website** shows date, venue, price and experience as **client-confirmed** (from the Phase 5A brief).
- **The database** marks the event and ticket config as **`PROPOSED`, `DRAFT`, unapproved**. Its `sourceRef` predates the later brief, and the record has never been approved in the admin.

The two classifications are **not equivalent**. The brief confirms the *facts*; nobody has yet *approved the database record* through the admin approval flow.

**Not changed in Phase 10, as instructed.** Resolution: a MEKI admin reviews and approves the Gala record (doc 28 workflow), entering time, timezone, venue fields and capacity.

## 2. Field-by-field status

Legend:

| Code | Meaning |
|---|---|
| **V** | Verified from client-provided information |
| **DB** | Stored in the backend (provenance in brackets) |
| **WEB** | Published on the website |
| **P** | Proposed / unapproved |
| **M** | Missing / blocked |
| **A** | Requires approval (MEKI or SDI) |

| Item | Status | Detail |
|---|---|---|
| Event name "MEKI Gala Night" | V · DB (PROPOSED) · WEB | DB `titleEn`; page eyebrow |
| Theme "Every Light Counts" | V · DB ticket label (PROPOSED) · WEB | |
| Tagline "One evening. Many lights…" | **P** · WEB | Development microcopy `[P]`; **A (MEKI)** |
| Event description / purpose copy | **P** · WEB | "Each guest… lights a lamp" drafted from the PDF `[P]`; DB description NULL; **A** |
| Approved event imagery | **M** | No Gala or venue photography supplied. The page uses MEKI field photography (hero, dimmed) and an illustrated lamp motif, **not** pictures of the venue. |
| Date — Saturday 12 Dec 2026 | V · DB label only (PROPOSED) · WEB | DB `startsAt` NULL |
| Doors open | V (conflict) · WEB "3:30 PM" | Brief 3:30 PM vs older RSVP 4:00 PM; **A (MEKI)** |
| Start time / end time / timezone | **M** | DB NULL; not shown anywhere (no countdown or calendar file is generated — the API returns `calendar.available=false`) |
| Venue name | **M** | Only the street address is known; DB `venueNameEn` NULL |
| Full venue address | V (street, city) · DB label (PROPOSED) · WEB | No postcode or room; DB address fields NULL |
| Map / directions | WEB (generic Google Maps search link) · DB `mapUrl` NULL | The page replaces the link only from a published DB `https://` URL |
| Ticket types | V "Individual ticket" · DB (PROPOSED) · WEB | No tables or tiers |
| Ticket price USD 750 | V · DB 750.000 USD (PROPOSED) · WEB | **Phase 10:** the page now shows the API price once the event is published (same source the booking flow charges); until then, the brief text |
| Currency | V USD · DB | |
| Ticket benefits | **M** | None specified beyond attendance |
| Dinner and programme | V (plated halal dinner, alcohol-free; 8-item running order) · WEB | Dietary details beyond halal: **M** |
| Ticket availability | DB `salesEnabled=0` · API 404 · WEB "being confirmed" | Correct |
| Booking limits | DB `maxTicketsPerBooking=10` (PROPOSED) | Page states "one ticket per guest, in the guest's own name". Each guest gets their own named ticket, so the two are consistent. |
| Capacity | **M** | DB NULL; **A (MEKI)** |
| Guest registration requirements | V (guest's own name) · booking flow collects name, e-mail, phone, dietary requirements per guest | |
| Agenda / programme | V 8 items + "subject to change" · WEB | Keynote speaker "to be confirmed"; entertainment "to be announced" |
| Speakers / guests | V from brief (Raya Abirached host; Beshir Shousha; Ahmed Amin) · WEB | `Gala Page.pdf`: no names until confirmed **in writing** — **A (MEKI)** before launch |
| Dress code | V Black tie · WEB | |
| FAQ | WEB (8 items; 6 marked "To be confirmed") | |
| Contact information | **M** | Official contact details not supplied (doc 38 §1) |
| Booking instructions | WEB "Booking details are being confirmed" | Booking UI built and tested (stub) — opens only when the API reports sales open |
| Purchaser / guest / dietary data | Built (booking flow) | Stored only on real bookings; none exist |
| Payment instructions | **M / A (SDI)** | Hosted checkout via SDI/Zeffy; mapping decision pending (doc 32) |
| Confirmation information | Built | Confirmation only from verified provider evidence (server-side) |
| Ticket download / PDF | Built (A5 PDF, EN/AR names, QR) | Tested (doc 41) |
| QR check-in | Built (admin) | Tested; door rehearsal pending |
| Receiving organisation / fiscal sponsor disclosure | **A (SDI)** | The page says arrangements are handled by "our fiscal sponsor"; the sponsor's name and disclosure wording are not approved |
| Donation vs ticket-payment distinction | Built | Ticket money is `EVENT_TICKET_PAYMENT`, never a donation (tested); Gala-specific giving panel disabled |
| Approved tax wording | **M / A (SDI)** | Not shown; no invented wording |
| Fair-market value of dinner/programme | **M / A (SDI)** | Not shown; no deductible amount stated anywhere |
| Refund policy | **M / A (SDI)** | FAQ "Cancellation terms will be confirmed" |
| Receipt issuer | **M / A (SDI)** | FAQ "Receipt and tax information will be confirmed" |
| Sponsorship tiers | **P** | Development preview only (`NEXT_PUBLIC_GALA_PREVIEW=1`, never in production builds) |
| Six supported causes | **M** | Section renders nothing until approved, event-linked data exists |
| Arabic copy | **P** | Draft translation, flagged on the page |

## 3. Booking-integrity verification (unchanged by Phase 10)

| Requirement | Evidence |
|---|---|
| Availability from the backend | The page computes `bookingOpen` only from `/public/events/gala-night/ticketing` (`salesOpen && !soldOut && checkoutAvailable`). It is 404 today, so the action stays disabled. Unit test `phase10.test.mjs`. |
| Price from the backend | `bookings.service.ts` uses `cfg.ticketPrice`; the client cannot send a price (forbidden field, tested). The Gala page now also displays the API price when published. |
| Totals computed by the backend | `unitPrice × guests` server-side (`gala.e2e`) |
| Booking reference + idempotency | Unchanged; covered by `gala.e2e` and `booking.smoke` (58/58 × 3 engines, doc 41) |
| Payment confirmation only from verified evidence | Unchanged (doc 31 / `zeffy.e2e`); the redirect never confirms |
| Ticket issuance via the confirmation pipeline | Unchanged |
| QR tokens never exposed | Unchanged (only hashes stored; masked scanner) |
| Checkout only to allowed hosts | Unchanged (`NEXT_PUBLIC_CHECKOUT_ALLOWED_HOSTS`, tested in `booking.smoke`) |
| No sales, no live payments, no fake Zeffy checkout | Confirmed: DB `salesEnabled=0`, event DRAFT, API 404, `PAYMENTS_ENABLED=false` |

## 4. Missing information requiring approval

**MEKI**

1. Approve and publish the Gala event record in the admin (resolves the PROPOSED/DRAFT status).
2. Start time, end time and time zone; doors-open time (3:30 vs 4:00 PM).
3. Venue name and full address details; map link; arrival, transport and accessibility information; venue photography.
4. Capacity.
5. Written confirmation of speaker and host names; keynote speaker; entertainment.
6. Approval of the tagline and purpose copy (`[P]`) and of the Arabic translation.
7. Dietary details beyond halal; official contact details for the event.
8. The six supported causes (names and texts).
9. Sponsorship tiers, prices and benefits (currently "to be validated").

**SDI (fiscal sponsor)**

1. Fiscal-sponsor disclosure wording and receiving organisation.
2. Tax wording and fair-market value of dinner/programme; deductible portion, if any.
3. Refund and cancellation policy.
4. Receipt issuer and receipt wording.
5. Payment flow: hosted forms, allowed checkout hosts, booking-reference mapping, ticket-issuance ownership (doc 32).
6. A coordinated small live payment + refund test.
