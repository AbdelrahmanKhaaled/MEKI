# MEKI — pending client assets and decisions (updated 25 Nov 2026)

> Historical record. Phase 09 confirms the website Arabic translations and the Disability assignment to program 08. The final website results, public asset locations and remaining external dependencies are in the [final client changes report](MEKI_FINAL_CLIENT_CHANGES_REPORT.md).

Every item below already has its slot, Admin control, API path and responsive layout. Nothing is shown publicly until MEKI supplies the material and an editor publishes it, so the site never shows a broken button, placeholder or unapproved content. Full status: `docs/MEKI_CLIENT_EDIT_STATUS.md` §0.

## Received and integrated

| Material (date) | Used for | Status |
|---|---|---|
| **Photo delivery 24 Nov (TransferNow, 102 files in 12 folders)** | Homepage hero (*Home P*), nine program covers and galleries, homepage gallery, clear water photo, Media Library | **All 102 accounted for** (`docs/MEKI_CLIENT_ASSET_INVENTORY_2026-11-24.md`): 0 duplicates, 0 unusable (the one HEIC is converted). Integrated by `apply-nov25-final-content.mjs` |
| `MEKI Website Content (Programs) SHORTENED.docx` (25 Nov) | Programs landing, nine program pages, enabling functions, MEKI Legacy | Integrated (EN + AR) |
| Written approval to publish Raya Abirached's photo (25 Nov) | Gala host section | Integrated — the sync publishes the host section |
| `Inquiries@meki-us.org` (25 Nov) | Site settings contact e-mail (footer, Contact, Give pages) and the Gala inquiry e-mail | Integrated (editable in Admin) |
| `15.jpg.jpeg`, `images.jpeg`, `583-Park-Ave-Logo_1_white.png`, `Sponsorship Packages.pdf` (24 Nov) | Gala hero, venue photo, venue logo, "Sponsor now" | Integrated |
| LinkedIn, Facebook, Instagram URLs (24 Nov) | Follow us (footer, Gala page) | Integrated in Site settings |
| `583_park_avenue_cover.jpeg` | — | Not used: it is the venue logo on white, not a photograph |

## Still pending — only what genuinely remains

| # | What MEKI must send / decide | Used for | Where an editor adds it | Until then |
|---|---|---|---|---|
| 1 | **Verification of the derived photo captions** (title / place / program) and of the assumption that the *disability* folder belongs to program 08 | Gallery, program galleries | Homepage → Our work in action; Media Library | Proposed captions ("Egypt" where no place is named) |
| 2 | **Photo consent** for the 102 photos (identifiable children / patients appear); recorded as UNKNOWN | All photos | Media Library → consent | Served (default `MEDIA_PUBLIC_CONSENT_MODE=not_denied`); with `confirmed_only` they are not |
| 3 | Official **Bokra** and **The Waterway** logos + written confirmation the partnerships are signed | Gala partner logos | Gala → Settings → Gala page → Sponsorship | Entries exist, hidden, no logo — nothing public |
| 4 | Photos of the plated dish, drinks, lamps, auction items | Gala experience cards (the venue exterior is deliberately **not** used for them) | Gala → Settings → Gala page → Experience card photos | Icons |
| 5 | Optional: a completed sponsorship PDF (the supplied one still shows "[Contact name] · [Email] [Telephone]" p. 10 and "[Partner Name]" p. 4) | Sponsor now | Gala page → Sponsorship → Replace PDF → Save → Publish | Supplied PDF, unchanged |
| 6 | Last read of the Arabic strings the dev team translated on 25 Nov (the client approved the existing Arabic) | Arabic site | `docs/MEKI_ARABIC_CONTENT_FOR_APPROVAL.md` | Published as translated |
| 7 | On-page booking form vs SDI's hosted Zeffy form | Gala booking | Development after the decision | SDI-hosted flow unchanged |

Interior / hall photographs of 583 Park Avenue were **never supplied** (exteriors only); the website never presents an exterior as an interior.

## Rules for anyone adding assets
- Only authentic material MEKI approved and may publish; never stock or generated images. Record consent and EN/AR alt text in the Media Library entry.
- Captions: "Title – Place". A PDF can only be used as a document (the API refuses it as an image).
- Each Gala block is published separately and appears only while the Gala event itself is published.
- Partner logos: upload the official file, tick "Show on the website" and publish the section only after MEKI's written confirmation.

## Assets required for the release
- **Packaged with the release (committed, built into the apps):** approved logo derivatives (`apps/web/public/brand/`, `apps/admin/public/brand/`, `apps/web/public/og/`), the earlier curated photos and, new on 25 Nov, 12 web copies of the delivery (`apps/web/public/images/work/hero-*.webp`, `program-*.webp`, `water-pipeline.webp`, `client-delivery.json`; built by `apps/web/scripts/build-client-delivery.mjs`).
- **NOT in the repository — uploaded by the sync scripts into the Media Library** (persistent `/var/lib/meki/uploads`, outside releases, so they survive every deploy and rollback): the Gala files (checksums in `deploy/staging/apply-nov23-client-edits.data.json`) and the 102 delivery photos as WebP derivatives (checksums of the originals in `deploy/staging/nov25/client-delivery.manifest.json`; the script verifies each original before deriving).
- **Never committed:** `/references/` (git-ignored, including the delivery and `_converted/IMG_1746.jpg`) and `/client-resources/`.

## Deployment and rollback
Deployment order (migrate first, then switch, then the content sync) is in `docs/MEKI_CLIENT_EDIT_STATUS.md` §0 item 9. Rollback:
- **Before the switch:** nothing to roll back in code; the migrations may stay (the current release ignores the new columns).
- **After the switch:** `deploy/vps/rollback.sh /srv/meki/releases/<previous>` (printed by `switch.sh`). Do **not** roll back the migrations: they are additive and the previous release runs against them.
- **Content:** every sync write is an audited CMS change; nothing is deleted. To undo a published section, unpublish it in Admin (the site refreshes immediately); hidden seeded gallery photos can be shown again in Admin; uploaded files stay in the Media Library.
- **Database restore** from the pre-deployment backup only if explicitly decided — it also discards any editor work done since.
