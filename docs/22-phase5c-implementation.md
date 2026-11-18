# 22 — Phase 5C: Public Gala booking frontend

Frontend-only phase: no backend, schema, migration or payment code changed. Backend contract: [16](16-phase5b-api-reference.md). Nothing is committed or deployed.

## Routes (`apps/web`, both `/en` and `/ar`)

| Route | Purpose |
|---|---|
| `/[locale]/events/gala-night/book` | 3-step booking flow (Tickets → Guests → Review). Dynamic, `noindex`, `no-referrer` |
| `/[locale]/events/gala-night/booking/[reference]` | Booking status / tickets |
| `/[locale]/events/gala-night/booking?reference=EB-…` | Landing page for the provider return URL and e-mail links (the backend's `EVENT_BOOKING_RETURN_URL` shape); same component |
| `/[locale]/events/gala-night` (existing) | Unchanged content; the "Book Your Place" action becomes a link **only** when the API reports sales open **and** checkout available, otherwise it stays the original disabled button. "Donate Without Attending" untouched |

## Files

Created: `src/lib/booking.ts` (pure logic), `src/content/booking.ts` (EN + AR copy), `src/components/booking/BookingFlow.tsx`, `BookingStatus.tsx`, the three route files, `tests/booking.test.mjs`, `tests/e2e/booking.smoke.mjs`. Modified: `src/lib/api.ts` (`bookingToken` header option, `clientApiBlob`), `src/components/gala/GalaSections.tsx` (link variant of the panel), `gala-night/page.tsx` (reads `/public/events/gala-night/ticketing`), `packages/api-client/src/public.ts` (booking types derived from the implemented DTOs), `apps/web/package.json` (`test` script). No dependency was added.

## API endpoints used (all existing)

`GET /public/events/gala-night/ticketing` · `POST /public/events/gala-night/bookings` (Idempotency-Key) · `POST /public/bookings/:ref/checkout` (X-Booking-Token) · `GET /public/bookings/:ref/status` (X-Booking-Token) · `GET /public/bookings/:ref/tickets/:no/pdf` (X-Booking-Token, fetched as a blob). The calendar `.ics` link is shown only when the status response says it is available.

## Flow

1. **Availability (live, `no-store`).** Form shown only if `salesOpen && !soldOut && checkoutAvailable`; otherwise "Ticket booking is not available yet." (no form, no button). Price (`750.00`), currency and `maxTicketsPerBooking` come from the API; nothing is hard-coded. No table option, no packages, no availability numbers.
2. **Tickets.** Quantity 1…max; display total = API unit price × quantity in integer cents (display only).
3. **Guests.** Purchaser (name, e-mail, phone) separate from attendees; "I am attending" makes guest 1 the purchaser (`isPurchaser: true`, contact fields mirrored). Per guest: name, e-mail, phone, dietary requirements (the API takes one required free-text field ≤ 500 chars, "None" allowed — no structured options were invented). Validation mirrors the API: required fields, e-mail, phone ≥ 7 digits, name pattern, **Latin/Arabic-only names** (same rule as the PDF safety check; Arabic accepted, CJK/emoji/Cyrillic get a respectful specific message), distinct e-mails, consent. Data is kept in React state when navigating back/forward; staying on the page is the only "persistence" (no storage of guest data).
4. **Review.** Event, tickets, guests, purchaser, total (USD), SDI as payment recipient, and "A ticket is not a charitable donation…" note. Button: **"Continue to secure payment"** (never "Pay now"), present only when checkout is actually available.
5. **Submit.** One `POST …/bookings` with a fresh `Idempotency-Key` (UUID). Same payload → same key (network retry returns the same booking); any material change → new key. A synchronous lock + disabled button prevent double submits (verified: a double-click created one booking). The body has **no price/total/currency**. On success the booking token is kept only in this tab's `sessionStorage` (`meki:booking:<ref>` → token, no PII) and `POST …/checkout` is called.
6. **Checkout boundary.** The destination is followed only if the **backend** returned it and `isTrustedCheckoutUrl` passes: https, no credentials, host (or subdomain) in `NEXT_PUBLIC_CHECKOUT_ALLOWED_HOSTS` (empty = nothing is followed; no provider URL is hard-coded). Test/mock sessions are refused in production builds and, outside production, accepted only on this platform's own API origin. If checkout is unavailable (503), untrusted, or the URL fails the check, the visitor lands on the booking status page (booking saved, "Payment not completed yet", notice, no redirect, no success message).
7. **Status page.** Token from `sessionStorage`, or once from the secure link (`?token=` / `#token=`) and then **removed from the address bar**; reference alone shows only a generic "can't show this booking". States from the API's `message` + `confirmed` (processing is polled ~1 min): awaiting, processing, failed, **confirmed (only when `confirmed === true`)**, cancelled, refund pending, refunded. Confirmed shows tickets; download is available only for `pdfReady` tickets via a header-authenticated fetch; calendar link only if the API says available (same-origin check), otherwise "will be available once the schedule is confirmed". No e-mail-sent claim is made. Returning from hosted checkout changes nothing by itself.

## Error handling

API failures map to stable keys (network, closed, unavailable/503, too many tickets, capacity, duplicate e-mail, unsupported name, invalid, 429, 409, 404, unknown) with EN/AR text; raw server messages never reach the visitor; the form data is kept on every failure.

## Localization / RTL / responsive

All strings in EN + AR (`content/booking.ts`). **The Arabic text is a technical interface draft for MEKI review**, not approved promotional wording (the existing "draft translation" note is shown). RTL via the document `dir`; logical Tailwind utilities (`ps-`, `text-start`), e-mail/phone fields forced LTR, API-provided English event strings isolated with `<bdi>`, ordered markers replaced by explicit numbers (two bidi defects found in screenshots and fixed). Step indicator, buttons and arrows follow direction. Existing brand tokens/classes only (`btn-gold/green/outline`, serif headings, limestone surface); `lg` two-column with sticky summary, single column below. Reduced motion: no custom animation added.

## Security / privacy

No card or payment fields; no provider code; no mock checkout reachable in a production build; no redirect to anything the backend did not return and the allow-list does not permit; no confirmation from redirects; booking token only in a header (never in a URL, and stripped from the address bar); no guest PII in URLs, analytics (none added), `localStorage`, cookies or `sessionStorage`; status pages are `noindex`, `no-referrer`, never cached. Static tests guard these properties.

## Tests and results

| Check | Result |
|---|---|
| `pnpm --filter @meki/web test` (Node built-in runner, pure logic) | **38 / 38 pass** — quantity & guest generation, totals, validation (Arabic valid, CJK/emoji/Cyrillic rejected, duplicates, dietary), purchaser vs attendee, request contract (no price), idempotency, error mapping, checkout trust (13 URL cases), status derivation (message alone ≠ confirmed), reference/storage, EN/AR key parity + placeholders, no tax/"pay now" claims, static source guards (no mock/provider URL/card/localStorage, redirect only via trusted URL) |
| Real-browser smoke (`tests/e2e/booking.smoke.mjs`, Playwright + system Chrome, against a **stub** API on a production build) | **58 / 58 pass**, run twice (Gala page built with sales closed, then open): closed/open CTA, closed booking page, quantity/limits/totals, validation messages, Arabic name accepted, CJK refused, back keeps data, double-click → 1 booking, Idempotency-Key present, no price in body, trusted redirect only, untrusted/mock/503 → no redirect and pending page, all 6 status states, ticket download, reference-only/wrong-token/malformed → generic, token stripped from URL, RTL + LTR phone/e-mail, no horizontal overflow at 1440/1024/768/390/360 in EN and AR |
| `tsc --noEmit`, `eslint` (web) | 0 errors (3 pre-existing warnings in untouched files) |
| `pnpm turbo run typecheck lint build --force` | 7/7 tasks successful |

Visual review of screenshots (1440 review step, 390 Arabic guest step) done; the screenshots are in the scratch folder, not the repo.

## Not verified / limitations

- Tests ran against a **stub** of the booking API, not the live backend with real payments; the backend itself is covered by its own 333 tests. No end-to-end run with a real provider exists.
- Visual checks used Chrome only (no Safari/Firefox, no real phones); the Arabic copy is unreviewed.
- The Gala page CTA is statically generated and cached for 5 minutes, so it can lag a sales switch by up to 5 minutes (the booking page itself reads availability live and enforces it, and the backend refuses closed sales regardless).
- The e-mail link sent by the backend carries `?token=` in the query string; the page strips it from the address bar, but it will appear in server/proxy logs of the web host. Recommended backend follow-up: put the token in the URL fragment (`#token=`), which this page already accepts.
- A reload during submission generates a new Idempotency-Key (the key is deliberately memory-only); the backend's duplicate-guest and capacity rules still apply.
- The booking is created only when checkout can also start (`checkoutAvailable`); a "reserve now, pay later" flow was deliberately not offered.

## Blocked / waiting

- **Zeffy/SDI**: no adapter, so `checkoutAvailable` is false in production and the flow is closed. Needed: how the hosted checkout is created and bound to our attempt reference, the verified payment/refund notification, and the checkout hostname(s) to put in `NEXT_PUBLIC_CHECKOUT_ALLOWED_HOSTS`.
- **MEKI**: approval of ticket sales, of the Arabic interface text, and the event time/zone (calendar).
- **Config at deploy time:** `NEXT_PUBLIC_API_URL` (+ `API_INTERNAL_URL` for server fetches) and `NEXT_PUBLIC_CHECKOUT_ALLOWED_HOSTS`; the backend `EVENT_BOOKING_RETURN_URL` must point to `/{locale}/events/{slug}/booking`.
