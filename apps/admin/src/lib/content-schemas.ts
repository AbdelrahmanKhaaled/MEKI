/**
 * Phase 6C response schemas, hand-written from the NestJS services (OpenAPI does not describe admin bodies, docs/23 G8):
 *   programmes.service.ts (present/list/get, listProjects/getProject) · campaigns.service.ts (present) ·
 *   media.service.ts (present/get + usage) · settings (donation) · donation-config.service.ts (publicConfig).
 * A response that does not match is an error state, never rendered. Decimal columns arrive as strings.
 */
import { z } from "zod";

const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const strN = z.string().nullable();
const iso = z.string();
const isoN = z.string().nullable();

export const PROVENANCES = ["VERIFIED_SOURCE", "PROPOSED", "DEMO"] as const;
export const PUBLICATION_STATUSES = ["DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED"] as const;
export const CAMPAIGN_STATUSES = ["DRAFT", "IN_REVIEW", "PUBLISHED", "PAUSED", "COMPLETED", "ARCHIVED"] as const;
export const PROGRAMME_KINDS = ["PROGRAMME", "ENABLING_FUNCTION"] as const;
export const MEDIA_CATEGORIES = ["BRAND", "HERO", "PROGRAMME", "CAMPAIGN", "GALLERY", "OTHER"] as const;
export const CONSENT_STATUSES = ["UNKNOWN", "CONFIRMED", "NOT_GRANTED"] as const;

export const MediaSchema = z.object({
  id: z.string(),
  code: strN.optional(),
  storageDriver: z.string(),
  storageKey: z.string(),
  originalName: strN,
  mimeType: z.string(),
  sizeBytes: z.number(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  category: z.string(),
  altEn: strN,
  altAr: strN,
  captionEn: strN,
  captionAr: strN,
  credit: strN,
  sourceFolder: strN,
  consentStatus: z.string(),
  provenance: z.string(),
  uploadedById: strN.optional(),
  createdAt: iso,
  updatedAt: iso.optional(),
  url: z.string(),
});
export type Media = z.infer<typeof MediaSchema>;

export const MediaUsageSchema = z.object({
  total: z.number(),
  programmeCovers: z.number(),
  campaignCovers: z.number(),
  programmeGallery: z.number(),
  campaignGallery: z.number(),
  sections: z.number(),
  sectionItems: z.number(),
  pages: z.number(),
  settings: z.number(),
  eventImages: z.number(),
  eventGallery: z.number(),
});
export const MediaDetailSchema = MediaSchema.extend({ usage: MediaUsageSchema });
export type MediaDetail = z.infer<typeof MediaDetailSchema>;

const GalleryEntry = z.object({ sortOrder: z.number(), media: MediaSchema });

const ProjectRow = z.object({
  id: z.string(),
  code: z.string(),
  slug: z.string(),
  programmeId: strN,
  nameEn: z.string(),
  nameAr: strN,
  locationEn: strN,
  locationAr: strN,
  sourceFolder: strN,
  // Phase 11A (additive; optional so older payloads still parse)
  summaryEn: strN.optional(),
  summaryAr: strN.optional(),
  descriptionEn: strN.optional(),
  descriptionAr: strN.optional(),
  coverMediaId: strN.optional(),
  sortOrder: z.number().optional(),
  publishedAt: iso.nullable().optional(),
  provenance: z.string(),
  sourceRef: strN,
  status: z.string(),
  createdAt: iso,
  updatedAt: iso,
});

export const ProgrammeSchema = z.object({
  id: z.string(),
  code: z.string(),
  slug: z.string(),
  kind: z.string(),
  number: z.number().nullable(),
  nameEn: z.string(),
  nameAr: strN,
  altNameEn: strN,
  altNameAr: strN,
  shortDescEn: strN,
  shortDescAr: strN,
  mandateEn: strN,
  mandateAr: strN,
  descriptionEn: strN,
  descriptionAr: strN,
  focusAreasEn: z.array(z.string()).nullable(),
  focusAreasAr: z.array(z.string()).nullable(),
  /** MEKI client edits (25 Nov 2026) — optional so an older API build still parses */
  focusAreaDetailsEn: z.array(z.string()).nullable().optional(),
  focusAreaDetailsAr: z.array(z.string()).nullable().optional(),
  pageTitleEn: strN.optional(),
  pageTitleAr: strN.optional(),
  /** MEKI client edits (22 Nov 2026) — optional so an older API build still parses */
  summaryEn: strN.optional(),
  summaryAr: strN.optional(),
  outcomesEn: z.array(z.string()).nullable().optional(),
  outcomesAr: z.array(z.string()).nullable().optional(),
  icon: strN,
  coverMediaId: strN,
  coverMedia: MediaSchema.nullable(),
  /** Phase 11A: MEKI-approved programme goal (decimal string) + currency; null when not approved */
  targetAmount: z.string().nullable().optional(),
  targetCurrency: strN.optional(),
  gallery: z.array(GalleryEntry),
  projects: z.array(ProjectRow),
  sortOrder: z.number(),
  isFeatured: z.boolean(),
  status: z.string(),
  provenance: z.string(),
  sourceRef: strN,
  seoTitleEn: strN,
  seoTitleAr: strN,
  seoDescriptionEn: strN,
  seoDescriptionAr: strN,
  publishedAt: isoN,
  createdAt: iso,
  updatedAt: iso,
  _count: z.object({ campaigns: z.number() }),
});
export type Programme = z.infer<typeof ProgrammeSchema>;

const ProgrammeRef = z.object({ id: z.string(), nameEn: z.string(), nameAr: strN.optional(), slug: z.string(), status: z.string().optional(), kind: z.string().optional() });

/** GET /admin/projects rows (Phase 6C adds programme status/kind/nameAr and the campaign count). */
export const ProjectSchema = ProjectRow.extend({ programme: ProgrammeRef.nullable(), _count: z.object({ campaigns: z.number() }).optional() });
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectDetailSchema = ProjectRow.extend({
  coverMedia: MediaSchema.nullable().optional(),
  programme: ProgrammeRef.nullable(),
  campaigns: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      slug: z.string(),
      titleEn: z.string(),
      titleAr: strN,
      status: z.string(),
      provenance: z.string(),
      approvedAt: isoN,
      currency: z.string(),
      targetAmount: money.nullable(),
      startsAt: isoN,
      endsAt: isoN,
    }),
  ),
});
export type ProjectDetail = z.infer<typeof ProjectDetailSchema>;

/** POST/PATCH /admin/projects return the raw row (no relations). */
export const ProjectWriteSchema = ProjectRow;

export const CampaignSchema = z.object({
  id: z.string(),
  code: z.string(),
  slug: z.string(),
  programmeId: strN,
  projectId: strN,
  programme: z.object({ id: z.string(), slug: z.string(), nameEn: z.string(), nameAr: strN, status: z.string() }).nullable(),
  project: z.object({ id: z.string(), code: z.string(), nameEn: z.string(), nameAr: strN, sourceFolder: strN }).nullable(),
  titleEn: z.string(),
  titleAr: strN,
  summaryEn: strN,
  summaryAr: strN,
  descriptionEn: strN,
  descriptionAr: strN,
  locationEn: strN,
  locationAr: strN,
  coverMediaId: strN,
  coverMedia: MediaSchema.nullable(),
  gallery: z.array(GalleryEntry),
  currency: z.string(),
  suggestedAmounts: z.array(z.union([z.number(), z.string()])).nullable(),
  allowCustomAmount: z.boolean(),
  minCustomAmount: money.nullable(),
  maxCustomAmount: money.nullable(),
  /** only a MEKI-approved figure is ever stored */
  targetAmount: money.nullable(),
  startsAt: isoN,
  endsAt: isoN,
  isFeatured: z.boolean(),
  sortOrder: z.number(),
  status: z.string(),
  provenance: z.string(),
  sourceRef: strN,
  approvedById: strN,
  approvedBy: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
  approvedAt: isoN,
  approvalNote: strN,
  donationsOpen: z.boolean(),
  seoTitleEn: strN,
  seoTitleAr: strN,
  seoDescriptionEn: strN,
  seoDescriptionAr: strN,
  publishedAt: isoN,
  createdAt: iso,
  updatedAt: iso,
});
export type Campaign = z.infer<typeof CampaignSchema>;

/** GET /admin/settings/donation (settings.read): `paymentsEffective` is exactly what PATCH …/donations checks. */
export const DonationSettingsSchema = z.object({ paymentsEnabled: z.boolean(), paymentsEffective: z.boolean() });
/** GET /public/donations/config: fallback (no permission needed) + the enabled currency list. */
export const PublicDonationConfigSchema = z.object({
  paymentsEnabled: z.boolean(),
  testMode: z.boolean(),
  currencies: z.array(z.object({ code: z.string(), minorUnits: z.number() })),
});

/** By-campaign report rows (reports.read) — per currency, test records excluded by the API. */
export const CampaignTotalsSchema = z.object({
  campaign: z.object({ id: z.string(), slug: z.string(), titleEn: z.string(), currency: z.string(), targetAmount: money.nullable() }),
  totals: z.array(z.object({ currency: z.string(), count: z.number(), gross: money, net: money })),
});
