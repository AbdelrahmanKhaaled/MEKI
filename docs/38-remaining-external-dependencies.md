# 38 — Remaining external dependencies (MEKI, SDI, providers, hosting)

Date: 2026-11-18. A consolidated, current list. Details and rationale are in docs 30 (launch blockers) and 32 (SDI handoff).

**Blocks column:**

| Code | Blocks |
|---|---|
| WEB | Informational website launch |
| DON | Donations through SDI |
| SALES | Paid Gala ticket sales |
| OPS | Production operations |

## 1. MEKI

| # | Needed | Blocks |
|---|---|---|
| 1 | Approved Privacy Policy, Terms & Conditions, Cookie Policy (published as CMS pages `privacy`, `terms`, `cookies`) | WEB |
| 2 | Official contact e-mail, phone, address; social accounts (optional) | WEB |
| 3 | Review of all Arabic text (interface and content drafts) | WEB |
| 4 | Programme 6 name: "W.A.S.H, Environment & Climate Resilience" vs the stored "WASH, …" | WEB |
| 5 | English spelling: US ("Labor", applied on English pages) or UK ("Labour", as stored) | WEB |
| 6 | Gala doors-open time (3:30 vs 4:00 PM) and written OK to publish speaker names | WEB |
| 7 | Confirmation of the 4 published statistics, with sources and attribution | WEB |
| 8 | Approval to switch on search indexing (`PUBLIC_INDEXING`) and the production domain (`NEXT_PUBLIC_SITE_URL`) | WEB |
| 9 | Gala event record: approve and publish; start/end time + time zone; capacity | SALES |
| 10 | Door roles: who gets `gala.checkin.manage`; whether door staff may see guest names | SALES |
| 11 | E-mail provider choice, sender domain/address, DNS SPF/DKIM/DMARC records | SALES |
| 12 | **New (Phase 9A):** approval of derived WOFF2 versions of the brand fonts (Source Serif 4, Lato) for a further ~40 % font saving. The originals stay untouched; licence/brand decision | optional |
| 13 | Approval to open ticket sales — only after section 2 and the live test | SALES |

## 2. SDI / Zeffy (doc 32 for secure transmission and details)

| # | Needed | Blocks |
|---|---|---|
| 1 | Read API key and webhook signing secret, sent through an encrypted channel | SALES, DON (reconciliation) |
| 2 | Webhook registration for `https://<api>/api/v1/integrations/zeffy/webhook` (`payment.completed`, `.updated`, `.deleted`) | SALES |
| 3 | Zeffy campaign IDs (Gala tickets, donation forms, Gala giving) | SALES, DON |
| 4 | Hosted form URLs and allowed checkout domains | SALES, DON |
| 5 | Redacted real example payloads (a ticket payment and a refunded payment), incl. item structure and tip handling | SALES |
| 6 | **Booking-reference mapping decision** (custom question / pre-fill / future metadata / manual review) | SALES |
| 7 | Ticket issuance ownership (Zeffy vs MEKI QR tickets) | SALES |
| 8 | Refund practice; receipt and fair-market-value wording | SALES |
| 9 | Coordinated small live payment + refund test | SALES (go-live) |

## 3. Hosting / DevOps

| # | Needed | Blocks |
|---|---|---|
| 1 | Domains and TLS for website, admin, API; reverse-proxy rules (`/api/v1`, `/media/uploads`, 12 MB) | WEB |
| 2 | MySQL 8 with TLS, a least-privilege app user and a separate operator account; backups and a **restore drill** | WEB / OPS |
| 3 | Persistent, backed-up storage volumes (media, private ticket PDFs) | WEB / SALES |
| 4 | Secret store holding the token secrets (and later the Zeffy and e-mail secrets) | WEB |
| 5 | Monitoring wired to `/health`, `/health/live`, `/admin/system/status`; JSON logs collected | OPS |
| 6 | Decision to stay on ONE API instance at launch; scaling out needs a shared (e.g. Redis) rate-limit store to be implemented first (doc 36 A) | OPS |
| 7 | HSTS `includeSubDomains`/preload decision once the domain plan is known | optional |

## 4. Physical Gala check-in

| # | Needed | Blocks |
|---|---|---|
| 1 | Print a real A5 ticket (EN and AR names) and scan it from paper | SALES (event night) |
| 2 | Camera scanning on the actual door devices. The admin now permits the camera on its own origin (Phase 9A fix). iOS Safari may lack the browser QR reader → plan handheld scanners | event night |
| 3 | Handheld (keyboard-wedge) scanner test with the masked scanner field | event night |
| 4 | Door rehearsal: connectivity, two doors, duplicate / revoked tickets, supervisor manual check-in and undo | event night |

**Nothing in this list is required for the code to keep running safely.** Sales stay closed, payments stay disabled, and Zeffy auto-confirmation is refused in production until these items are resolved.
