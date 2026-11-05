# 03 — Database Design (MySQL 8 + Prisma)

> This is a proposal only. No `schema.prisma` and no migrations have been created. The first migration will be generated with `prisma migrate dev --create-only` against a **new empty** `meki_dev` database and reviewed before it is applied.

## 1. Design principles

1. **Provenance on every content row.** The `provenance` enum is `VERIFIED_SOURCE | PROPOSED | DEMO`, and each content row also has a `sourceRef` (for example `"Brand Guidelines v1.0 p.24"`).
2. **Publishing workflow.** The `status` enum is `DRAFT | IN_REVIEW | PUBLISHED | ARCHIVED`. Public endpoints return only rows that are `PUBLISHED` and not `DEMO`. In production, a DB-level check plus a service guard reject `DEMO` publishing.
3. **Bilingual fields as paired columns** (`titleEn`, `titleAr`). There are exactly two languages, columns are simpler to validate and query, and a missing translation is visible in admin. If more languages arrive later, we migrate to a translation table (doc 08 Q8).
4. **Real money data is isolated.** Campaign drafts store **no raised totals**. Totals will be derived from verified `PaymentTransaction` rows (Phase 7) and never typed in by hand.
5. **No hard deletes for content.** Content is archived, and the audit log records who changed what.
6. IDs are `cuid2` strings (`VarChar(30)`), timestamps are `DateTime(3)` in UTC, money is `Decimal(14,2)` plus an ISO currency code, and the charset is `utf8mb4` (Arabic).

## 2. Phase-2 models (landing + admin)

```prisma
// ---------- enums ----------
enum Provenance   { VERIFIED_SOURCE PROPOSED DEMO }
enum PubStatus    { DRAFT IN_REVIEW PUBLISHED ARCHIVED }
enum StaffRole    { SUPER_ADMIN CONTENT_EDITOR REVIEWER VIEWER }
enum ProgrammeKind { PROGRAMME ENABLING_FUNCTION }
enum SectionType  { HERO HOW_WE_WORK PROGRAMMES PROOF_POINTS GALLERY CAMPAIGNS_PREVIEW CTA_BAND ABOUT CONTACT }
enum ConsentStatus { UNKNOWN CONFIRMED NOT_GRANTED }

// ---------- staff & security ----------
model StaffUser {
  id            String    @id @default(cuid())
  email         String    @unique @db.VarChar(191)
  name          String    @db.VarChar(120)
  passwordHash  String    @db.VarChar(255)        // argon2id
  role          StaffRole @default(CONTENT_EDITOR)
  mfaSecretEnc  String?   @db.VarChar(255)        // Phase 4b, encrypted at rest
  isActive      Boolean   @default(true)
  failedLogins  Int       @default(0)
  lockedUntil   DateTime?
  lastLoginAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  sessions      StaffSession[]
}

model StaffSession {
  id          String   @id                       // random 256-bit, hashed
  userId      String
  user        StaffUser @relation(fields: [userId], references: [id])
  ipHash      String?  @db.VarChar(64)
  userAgent   String?  @db.VarChar(255)
  expiresAt   DateTime
  revokedAt   DateTime?
  createdAt   DateTime @default(now())
  @@index([userId])
}

model AuditLog {                                  // append-only; no update/delete in code
  id         BigInt   @id @default(autoincrement())
  actorId    String?
  action     String   @db.VarChar(60)           // e.g. programme.publish
  entityType String   @db.VarChar(60)
  entityId   String   @db.VarChar(40)
  diff       Json?                               // before/after (no secrets)
  ip         String?  @db.VarChar(64)
  createdAt  DateTime @default(now())
  @@index([entityType, entityId])
  @@index([createdAt])
}

// ---------- site ----------
model SiteSettings {                              // singleton row id = "default"
  id               String  @id @default("default")
  siteNameEn       String  @default("MEKI")
  siteNameAr       String?
  taglineEn        String                          // "Lasting Change, Built Together."
  taglineAr        String?
  legacyLineEn     String
  legacyLineAr     String?
  defaultLocale    String  @default("ar") @db.VarChar(5)   // confirm Q8
  contactEmail     String?                         // null until MEKI supplies
  contactPhone     String?
  addressEn        String? @db.Text
  addressAr        String? @db.Text
  socialLinks      Json?                           // [{network,url}]
  paymentsEnabled  Boolean @default(false)         // ALSO gated by env flag; both must be true
  seoTitleEn String? 
  seoTitleAr String?
  seoDescEn  String? @db.Text
  seoDescAr  String? @db.Text
  ogImageId  String?
  updatedAt        DateTime @updatedAt
}

model NavItem {
  id        String  @id @default(cuid())
  location  String  @db.VarChar(20)               // header | footer
  labelEn   String
  labelAr   String?
  href      String  @db.VarChar(255)              // internal anchors/paths only, validated
  sortOrder Int
  status    PubStatus @default(DRAFT)
}

// ---------- landing page ----------
model Page {
  id          String   @id @default(cuid())
  slug        String   @unique @db.VarChar(80)    // "home", "about", later "privacy"…
  titleEn     String
  titleAr     String?
  status      PubStatus @default(DRAFT)
  provenance  Provenance
  publishedAt DateTime?
  sections    PageSection[]
  updatedAt   DateTime @updatedAt
}

model PageSection {
  id         String      @id @default(cuid())
  pageId     String
  page       Page        @relation(fields: [pageId], references: [id])
  type       SectionType
  sortOrder  Int
  isVisible  Boolean     @default(true)
  contentEn  Json                                 // validated by a Zod schema per SectionType
  contentAr  Json?
  provenance Provenance
  sourceRef  String?     @db.VarChar(255)
  status     PubStatus   @default(DRAFT)
  updatedById String?
  updatedAt  DateTime    @updatedAt
  versions   ContentVersion[]
  @@index([pageId, sortOrder])
}

model ContentVersion {                             // snapshot on every publish → rollback
  id          String   @id @default(cuid())
  sectionId   String?
  section     PageSection? @relation(fields: [sectionId], references: [id])
  entityType  String   @db.VarChar(60)
  entityId    String   @db.VarChar(40)
  snapshot    Json
  createdById String?
  createdAt   DateTime @default(now())
  @@index([entityType, entityId])
}

// ---------- programmes ----------
model Programme {
  id              String        @id @default(cuid())
  slug            String        @unique @db.VarChar(80)
  kind            ProgrammeKind
  number          Int?                              // 1..9 per brand guide
  nameEn          String                            // EXACT brand name
  nameAr          String?
  shortDescEn     String        @db.Text           // brand one-liner
  shortDescAr     String?       @db.Text
  mandateShortEn  String?       @db.Text           // portfolio image
  mandateShortAr  String?       @db.Text
  mandateLongEn   String?       @db.Text           // Mandates PDF
  mandateLongAr   String?       @db.Text
  icon            String?       @db.VarChar(40)    // lucide icon name
  coverMediaId    String?
  sortOrder       Int
  provenance      Provenance
  sourceRef       String?       @db.VarChar(255)
  status          PubStatus     @default(DRAFT)
  subThemes       ProgrammeSubTheme[]
  media           MediaOnProgramme[]
  campaigns       Campaign[]
  updatedAt       DateTime      @updatedAt
}

model ProgrammeSubTheme {
  id          String    @id @default(cuid())
  programmeId String
  programme   Programme @relation(fields: [programmeId], references: [id])
  labelEn     String
  labelAr     String?
  sortOrder   Int
  provenance  Provenance
}

// ---------- proof points ----------
model Stat {
  id            String     @id @default(cuid())
  key           String     @unique @db.VarChar(60)  // years_service, governorates…
  valueDisplay  String     @db.VarChar(20)          // "35M+", "$300M" (display string, not computed)
  labelEn       String
  labelAr       String?
  periodEn      String?                              // "past four years"
  periodAr      String?
  attributionEn String                               // REQUIRED: "Figures: Misr El-Kheir, Egypt."
  attributionAr String?
  provenance    Provenance
  sourceRef     String     @db.VarChar(255)
  sortOrder     Int
  status        PubStatus  @default(DRAFT)
}

// ---------- media ----------
model MediaAsset {
  id             String   @id @default(cuid())
  originalName   String   @db.VarChar(255)         // client filename (for traceability)
  sourceFolder   String?  @db.VarChar(255)         // e.g. "محطة مياه تحليه بالاقصر"
  checksum       String   @unique @db.VarChar(64)  // sha256 of original, dedupe
  mimeType       String   @db.VarChar(60)          // jpeg/png/webp/avif only; no SVG uploads
  width          Int
  height         Int
  storageKey     String   @db.VarChar(255)         // optimised master (EXIF stripped)
  variants       Json                               // [{format,width,key}]
  blurDataUrl    String?  @db.Text
  altEn          String?  @db.VarChar(300)         // required before publish
  altAr          String?  @db.VarChar(300)
  captionEn      String?  @db.Text                 // place + programme (brand rule)
  captionAr      String?  @db.Text
  placeEn        String?
  placeAr        String?
  photographer   String?
  consentStatus  ConsentStatus @default(UNKNOWN)   // publish blocked unless CONFIRMED
  containsMinors Boolean?                           // if true, guardian consent required
  provenance     Provenance
  status         PubStatus @default(DRAFT)
  uploadedById   String?
  createdAt      DateTime @default(now())
  programmes     MediaOnProgramme[]
}

model MediaOnProgramme {
  mediaId     String
  programmeId String
  sortOrder   Int      @default(0)
  media       MediaAsset @relation(fields: [mediaId], references: [id])
  programme   Programme  @relation(fields: [programmeId], references: [id])
  @@id([mediaId, programmeId])
}

// ---------- proposed campaigns (drafts only) ----------
model Campaign {
  id            String     @id @default(cuid())
  slug          String     @unique @db.VarChar(100)
  programmeId   String
  programme     Programme  @relation(fields: [programmeId], references: [id])
  titleEn       String
  titleAr       String?
  summaryEn     String?    @db.Text
  summaryAr     String?    @db.Text
  locationEn    String?
  locationAr    String?
  goalAmount    Decimal?   @db.Decimal(14, 2)     // null unless MEKI approves a figure
  currency      String?    @db.Char(3)
  coverMediaId  String?
  provenance    Provenance                          // PROPOSED by default
  status        PubStatus  @default(DRAFT)
  approvedById  String?                             // MEKI approval recorded before PUBLISHED
  approvedAt    DateTime?
  approvalNote  String?    @db.Text
  donationsOpen Boolean    @default(false)          // cannot be true while payments gated
  startsAt      DateTime?
  endsAt        DateTime?
  updatedAt     DateTime   @updatedAt
  // NO raisedAmount / donorCount columns — derived from PaymentTransaction later.
}

// ---------- inquiries (Phase 3, needs privacy notice) ----------
model Inquiry {
  id          String   @id @default(cuid())
  type        String   @db.VarChar(30)           // contact | partner_interest | donate_interest
  name        String   @db.VarChar(120)
  email       String   @db.VarChar(191)
  phone       String?  @db.VarChar(40)
  message     String?  @db.Text
  locale      String   @db.VarChar(5)
  consentText String   @db.VarChar(40)           // privacy notice version accepted
  handled     Boolean  @default(false)
  createdAt   DateTime @default(now())
  // retention: purge policy per privacy notice (Q-L1)
}
```

### Integrity rules enforced in the service layer (with tests)

- `publish(entity)` is rejected when any of these is true:
  - `provenance = DEMO` and the environment is production;
  - a `Stat` has no `attributionEn`;
  - a `MediaAsset` has `consentStatus ≠ CONFIRMED`, or is missing `altEn`/`altAr`;
  - a `Campaign` with `provenance = PROPOSED` has no `approvedAt`;
  - the default locale's translation is missing.
- `Campaign.donationsOpen = true` is rejected unless `env.PAYMENTS_ENABLED && SiteSettings.paymentsEnabled`. Phase 7 adds a check for a completed compliance checklist.
- Every mutation writes an `AuditLog` row in the same transaction.

## 3. Phase-6+ models (designed now, created later)

These are listed so that Phase-2 names don't clash later. **They are not part of the first migration.**

- `Donor`, `DonorSession`, `DonorVerification` (tiered KYC, AML-01), `Declaration` (with text version and timestamp, AML-04), `PolicyAcceptance` (versioned, AML-09).
- `Donation` (intent): amount, currency, campaign/programme, donorId nullable for guest, and status `PENDING | SUCCEEDED | FAILED | REFUNDED | CANCELLED`.
- `PaymentTransaction`: provider, providerRef **unique**, amount, currency, status, rawStatus, and maskedInstrument.
- `WebhookEvent`: provider plus providerEventId with `@@unique([provider, providerEventId])` (**idempotency**). It also stores the signature-verified flag, payload hash, processedAt and attempts.
- `Receipt`: unique reference (FRD-11).

## 4. Payment status rule (for when payments are allowed)

The redirect back from the payment page only shows "processing". A `Donation` becomes `SUCCEEDED` only when a **signature-verified** webhook arrives (or a server-to-server status query succeeds). That webhook is stored first in `WebhookEvent` under its unique key, and duplicates are no-ops. Status transitions are guarded so they move only forward.
