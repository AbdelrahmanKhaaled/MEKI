# 30 — Launch blockers and client requirements (handoff checklist)

Date: 2026-11-18. Companion to [29](29-phase7-launch-readiness-report.md).

**How to read the "Blocks" column:**

| Value | Meaning |
|---|---|
| **WEB** | Blocks the public informational website launch |
| **SALES** | Blocks paid Gala ticket sales |
| **OPT** | Optional or quality item; can follow launch |

The public website can launch with ticket sales closed (the current, safe state). Paid ticket sales need every **SALES** item in sections 2–4 and 5, plus the sales approval in section 1.

## 1. MEKI

| # | Required information / action | Why | Feature blocked | Provider | Blocks |
|---|---|---|---|---|---|
| M1 | Approved **Privacy Policy, Terms & Conditions, Cookie Policy**, published as CMS pages `privacy`, `terms`, `cookies` | Legal requirement before collecting any personal data. The pages currently show a pending state (API 404) | Legal pages; booking/donation consent | MEKI legal | **WEB** |
| M2 | **Official contact e-mail, phone, address** (Site settings → Contact) | Contact and Give pages; e-mail footers. All empty today | Contact page | MEKI | **WEB** |
| M3 | **Approval to open search indexing**, then a developer sets `PUBLIC_INDEXING = true` in `apps/web/src/lib/site.ts` and sets `NEXT_PUBLIC_SITE_URL` | All pages are `noindex` and `robots.txt` disallows crawling | Search visibility, sitemap | MEKI → dev | **WEB** (launch decision) |
| M4 | Review of all **Arabic text**: interface and content drafts | Arabic is a technical draft | Arabic site | MEKI | **WEB** |
| M5 | **Programme 6 name:** "W.A.S.H, Environment & Climate Resilience" (brief) or the stored "WASH, Environment & Climate Resilience" | Official name must match the brand guidelines | Programs page, homepage | MEKI | **WEB** |
| M6 | **English spelling:** US ("Labor", applied on English pages today) or UK ("Labour", as stored) | `americanize()` changes stored wording on English pages | English copy | MEKI | **WEB** |
| M7 | **Gala doors-open time:** 3:30 PM (latest brief, shown now) or 4:00 PM (older RSVP document) | Conflicting client sources | Gala page | MEKI | **WEB** |
| M8 | **Publication of names** in the Gala running order (Raya Abirached, Beshir Shousha, Ahmed Amin): written confirmation, or remove them | `Gala Page.pdf` asks for no names until confirmed in writing | Gala page | MEKI | **WEB** |
| M9 | **Statistics:** confirm the 4 published figures with source and attribution. Figures from Misr El-Kheir (Egypt) must not be presented as MEKI results | Credibility / accuracy | Homepage impact section | MEKI | **WEB** (or hide the section) |
| M10 | **Header/footer menu entries.** An admin replaces the old `#anchor` links in Admin → Menus and publishes | The stored menu is invalid, so the website uses its built-in menu | Navigation | MEKI admin | OPT |
| M11 | **Gala event record:** approve and publish the event in Events. Provide the **start/end time and time zone** and the **capacity** | Event not published in `meki_dev`; no calendar file without time and zone; no capacity configured | Gala calendar link; booking readiness | MEKI | **SALES** |
| M12 | **Approval to open ticket sales.** Only after sections 2 and 4 are done and an end-to-end payment test passes; an account with `events.approve` opens sales | Sales are closed by design | Paid bookings | MEKI + SDI | **SALES** |
| M13 | **Door staffing:** who receives `gala.checkin.manage` (supervisors), and whether door staff may see guest names in the lookup | Least-privilege decision | Check-in operations | MEKI | **SALES** (event night) |
| M14 | **Approved fundraising campaigns** and giving categories | No campaign is approved and published, so Featured campaigns are hidden and donations go to the general fund | Campaign giving | MEKI | OPT |
| M15 | **Social media accounts** (https links) | Site settings → Social is empty | Footer social links | MEKI | OPT |
| M16 | **Agenda, speaker and entertainment confirmations**, venue arrival information | Shown as "to be confirmed" today | Gala page detail | MEKI | OPT |

## 2. SDI / Zeffy

| # | Required information / action | Why | Feature blocked | Provider | Blocks |
|---|---|---|---|---|---|
| S1 | **Final provider confirmation:** Zeffy or Givebutter | The adapter depends on the provider | Ticket payments | SDI | **SALES** |
| S2 | **How a hosted checkout is created per booking:** an API endpoint plus the credential type that can create it (a read-only key cannot), or the agreed alternative such as a pre-configured hosted form with a hidden field | MEKI must create a checkout for each booking with a server-calculated amount | Checkout | SDI / Zeffy | **SALES** |
| S3 | **Correlation:** which field carries our attempt reference (`BA-…`) or booking reference (`EB-…`) and comes back unchanged in webhooks and reports | Without it a payment cannot be matched to a booking | Confirmation | SDI / Zeffy | **SALES** |
| S4 | **Webhook contract:** signature method and header, secret delivery, event types for success / failure / refund / cancellation, retry behaviour, unique event ID. Example payloads (redacted) for each type | The server confirms only from verified events | Confirmation, refunds | SDI / Zeffy | **SALES** |
| S5 | **Refund and failure notifications:** are they sent? Example payloads | Refunds otherwise stay "Refund pending" | Refund handling | SDI / Zeffy | **SALES** |
| S6 | **Read-only API scope** for reconciliation: which fields, filter by date/reference, rate limits | Detect missed or late webhooks | Reconciliation | SDI | **SALES** (recommended) |
| S7 | **Checkout host names** for `NEXT_PUBLIC_CHECKOUT_ALLOWED_HOSTS` | Redirects only go to allow-listed hosts | Checkout redirect | SDI | **SALES** |
| S8 | **Coordinated live test:** one small payment and one refund, with SDI watching | No sandbox exists | Go-live | SDI + MEKI | **SALES** |
| S9 | **Ticket receipt/tax wording** (no fair-market value or deductible amount is shown today) | SDI determines the tax treatment | Booking page / e-mail wording | SDI | **SALES** |

## 3. E-mail provider

| # | Required information / action | Why | Feature blocked | Provider | Blocks |
|---|---|---|---|---|---|
| E1 | **Choice of e-mail provider** (SMTP or API) | Only `none` / dev / test transports exist | Confirmation and ticket e-mails | MEKI | **SALES** |
| E2 | **Sender domain and address** (e.g. `tickets@<domain>`), reply-to address | Branding, deliverability | E-mails | MEKI | **SALES** |
| E3 | **DNS: SPF, DKIM, DMARC** records for the sender domain | Without them mail lands in spam or is rejected | Delivery | MEKI IT / DNS owner | **SALES** |
| E4 | **Provider credentials** in the hosting secret store (never in Git); a developer then implements the `MailTransport` adapter and sets `MAIL_TRANSPORT` | The production guard refuses dev transports | Delivery | DevOps + dev | **SALES** |
| E5 | **Approval of the Arabic e-mail templates** (`GALA_EMAIL_ARABIC_APPROVED`) | Arabic e-mails are drafts | Arabic e-mails | MEKI | OPT |

## 4. Hosting / DevOps

| # | Required information / action | Why | Blocks |
|---|---|---|---|
| H1 | **Domains + HTTPS** for the website, admin and API | Secure cookies need HTTPS | **WEB** |
| H2 | **Reverse proxy** routes `/api/v1/*` and `/media/uploads/*` from the admin host to the API, accepting **12 MB** request bodies; the API keeps its 10 MB file limit | Same-origin admin sessions; uploads | **WEB** (admin) |
| H3 | **Website build variables:** `NEXT_PUBLIC_API_URL` (**including `/api/v1`**), `NEXT_PUBLIC_SITE_URL`, optional `API_INTERNAL_URL`; later `NEXT_PUBLIC_CHECKOUT_ALLOWED_HOSTS`. Fixed at build time: changing them needs a rebuild | Without `/api/v1` the site silently shows only built-in content (logged since Phase 7) | **WEB** |
| H4 | **Admin build variable** `ADMIN_API_UPSTREAM`, fixed at build time (or the H2 proxy rules) | Admin API access | **WEB** |
| H5 | **API variables** — see the list below | Startup validation | **WEB** |
| H6 | **MySQL 8 over TLS** for the API, or another approved auth setup; daily backups with tested restores; migrations via `prisma migrate deploy` only | Data safety; the `caching_sha2_password` behaviour after a restart (doc 29 §4, bug 5) | **WEB** |
| H7 | **Persistent storage** for `LOCAL_STORAGE_DIR` (media) and `PRIVATE_STORAGE_DIR` (ticket PDFs), backed up and never public | Uploaded media; tickets | **WEB** / **SALES** |
| H8 | **One running job poller** (Gala jobs) and error monitoring / alerting for API and web logs (incl. `[meki-web] CMS content unavailable`) | Tickets, e-mails; operations | **SALES** |
| H9 | **Payment webhook endpoint** `POST /api/v1/webhooks/<provider>` reachable over HTTPS, with the secret from S4 | Payment confirmation | **SALES** |

**API environment variables (H5)** — names only; real values belong in the hosting secret store:

- **Runtime:** `NODE_ENV=production`, `DATABASE_URL`, `PORT`, `TRUST_PROXY`.
- **Web origins and return links:** `CORS_ORIGINS` (website origin), `WEB_URL`, `API_PUBLIC_URL`, `EVENT_BOOKING_RETURN_URL`, `DONATION_RETURN_URL`.
- **Secrets:** `EVENT_BOOKING_TOKEN_SECRET`, `DONATION_TOKEN_SECRET`.
- **Storage and media:** `STORAGE_DRIVER`, `LOCAL_STORAGE_DIR`, `PRIVATE_STORAGE_DIR`, `PUBLIC_MEDIA_BASE_URL`, `MEDIA_MAX_UPLOAD_MB`.
- **Rate limiting:** `RATE_LIMIT_STORE`, plus `REDIS_URL` when running more than one instance.
- **Sessions:** `SESSION_IDLE_MINUTES`, `SESSION_ABSOLUTE_HOURS`.
- **Logging and API docs:** `LOG_LEVEL`, `SWAGGER_ENABLED=false`.
- **E-mail:** `MAIL_TRANSPORT=none` until E4.
- **Payments:** `PAYMENT_PROVIDER` and `PAYMENTS_ENABLED` only after section 2.

## 5. Physical Gala check-in testing

| # | Action | Why | Blocks |
|---|---|---|---|
| P1 | Print a real A5 ticket (EN and AR names) and scan it from paper | QR size and contrast on print are unverified | **SALES** (event night) |
| P2 | Test camera scanning on the actual door devices. iOS Safari may not support the browser's QR reader; plan USB/Bluetooth handheld scanners as the fallback | Only verified in a headless browser ("unsupported" fallback) | Event night |
| P3 | Test a handheld (keyboard-wedge) scanner with the masked scanner field | Unverified with real hardware | Event night |
| P4 | Door rehearsal: venue Wi-Fi or mobile data, two simultaneous doors, a duplicate scan, a revoked ticket, a supervisor manual check-in and undo | Operational readiness | Event night |

## Next actions

1. **MEKI:**
   - provide M1, M2 and M4–M9, then approve M3, to launch the public website
   - in parallel provide M11 and M13, choose the e-mail provider (E1–E3), and hold the sales approval (M12) until SDI's items are complete
2. **SDI:** send S1–S7 with redacted example payloads; schedule the live test S8; confirm the wording S9.
3. **DevOps:** prepare H1–H9 in staging first, then rehearse the deployment with `prisma migrate deploy` and a database backup.
