/**
 * Phase 6D response schemas, hand-written from the NestJS services (cms.service.ts getPage/listPages/getSection,
 * faq.module.ts, statistics.module.ts, settings.module.ts getSite). A response that does not match is an error state.
 * Unknown extra fields are stripped by zod; edits only PATCH the fields the editor changed, so nothing the editor does not
 * understand is ever overwritten.
 */
import { z } from "zod";
import { MediaSchema } from "./content-schemas.ts";

const strN = z.string().nullable();
const iso = z.string();
const isoN = z.string().nullable();
const labels = z.record(z.string(), z.string()).nullable();

export const SECTION_KEYS = ["HERO", "QUICK_DONATE", "TRUST", "ABOUT", "VISION_MISSION", "HOW_WE_WORK", "IMPACT", "PROGRAMMES", "ENABLING", "CAMPAIGNS", "WHY", "PROCESS", "GALLERY", "FAQ", "FINAL_CTA", "FOOTER"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const PageRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  titleEn: z.string(),
  titleAr: strN,
  status: z.string(),
  provenance: z.string(),
  publishedAt: isoN,
  updatedAt: iso,
  updatedById: strN.optional(),
  /** Phase 6D additive fields */
  updatedByName: strN.optional(),
  isEventPage: z.boolean().optional(),
  _count: z.object({ sections: z.number() }),
});
export type PageRow = z.infer<typeof PageRowSchema>;

export const SectionItemSchema = z.object({
  id: z.string(),
  sectionId: z.string(),
  code: strN,
  sortOrder: z.number(),
  isVisible: z.boolean(),
  titleEn: strN,
  titleAr: strN,
  textEn: strN,
  textAr: strN,
  icon: strN,
  href: strN,
  mediaId: strN,
  media: MediaSchema.nullable(),
  provenance: z.string(),
});
export type SectionItem = z.infer<typeof SectionItemSchema>;

export const SectionSchema = z.object({
  id: z.string(),
  pageId: z.string(),
  key: z.string(),
  anchor: strN,
  sortOrder: z.number(),
  isVisible: z.boolean(),
  eyebrowEn: strN,
  eyebrowAr: strN,
  titleEn: strN,
  titleAr: strN,
  subtitleEn: strN,
  subtitleAr: strN,
  bodyEn: strN,
  bodyAr: strN,
  ctaPrimaryLabelEn: strN,
  ctaPrimaryLabelAr: strN,
  ctaPrimaryHref: strN,
  ctaSecondaryLabelEn: strN,
  ctaSecondaryLabelAr: strN,
  ctaSecondaryHref: strN,
  mediaId: strN,
  media: MediaSchema.nullable(),
  labelsEn: labels,
  labelsAr: labels,
  provenance: z.string(),
  sourceRef: strN,
  status: z.string(),
  /** the published snapshot (what the public API serves); null when never published / unpublished */
  publishedData: z.record(z.string(), z.unknown()).nullable(),
  publishedAt: isoN,
  hasUnpublishedChanges: z.boolean(),
  updatedAt: iso,
  items: z.array(SectionItemSchema),
});
export type Section = z.infer<typeof SectionSchema>;

export const PageDetailSchema = z.object({
  id: z.string(),
  slug: z.string(),
  titleEn: z.string(),
  titleAr: strN,
  seoTitleEn: strN,
  seoTitleAr: strN,
  seoDescriptionEn: strN,
  seoDescriptionAr: strN,
  ogImageId: strN,
  ogImage: MediaSchema.nullable(),
  status: z.string(),
  provenance: z.string(),
  publishedAt: isoN,
  updatedAt: iso,
  sections: z.array(SectionSchema),
});
export type PageDetail = z.infer<typeof PageDetailSchema>;

/** POST/PATCH section items return the raw row (no media relation). */
export const ItemWriteSchema = SectionItemSchema.omit({ media: true });

export const FaqSchema = z.object({
  id: z.string(),
  code: strN,
  questionEn: z.string(),
  questionAr: strN,
  answerEn: z.string(),
  answerAr: strN,
  category: z.string(),
  sortOrder: z.number(),
  status: z.string(),
  provenance: z.string(),
  publishedAt: isoN,
  createdAt: iso,
  updatedAt: iso,
});
export type Faq = z.infer<typeof FaqSchema>;

export const StatisticSchema = z.object({
  id: z.string(),
  code: z.string(),
  labelEn: z.string(),
  labelAr: strN,
  descriptionEn: strN,
  descriptionAr: strN,
  /** Decimal(18,2) — always a decimal string */
  value: z.string().regex(/^-?\d+(\.\d+)?$/),
  unit: strN,
  prefix: strN,
  suffix: strN,
  displayFormat: z.string(),
  programmeId: strN,
  sourceRef: strN,
  attributionEn: strN,
  attributionAr: strN,
  reportingPeriodEn: strN,
  reportingPeriodAr: strN,
  verificationStatus: z.string(),
  verifiedAt: isoN,
  sortOrder: z.number(),
  status: z.string(),
  provenance: z.string(),
  publishedAt: isoN,
  updatedAt: iso,
});
export type Statistic = z.infer<typeof StatisticSchema>;

export const SOCIAL_NETWORKS = ["facebook", "instagram", "x", "linkedin", "youtube", "tiktok", "whatsapp", "telegram", "website"] as const;

export const SiteSettingsSchema = z.object({
  orgNameEn: z.string(),
  orgNameAr: strN,
  legalNameEn: strN,
  legalNameAr: strN,
  taglineEn: strN,
  taglineAr: strN,
  legacyLineEn: strN,
  legacyLineAr: strN,
  logoPrimaryUrl: strN,
  logoInverseUrl: strN,
  logoIconUrl: strN,
  contactEmail: strN,
  contactPhone: strN,
  addressEn: strN,
  addressAr: strN,
  socialLinks: z.array(z.object({ network: z.string(), url: z.string() })).nullable(),
  defaultLocale: z.string(),
  supportedLocales: z.array(z.string()),
  footerTextEn: strN,
  footerTextAr: strN,
  footerNoteEn: strN,
  footerNoteAr: strN,
  copyrightEn: strN,
  copyrightAr: strN,
  seoTitleEn: strN,
  seoTitleAr: strN,
  seoDescriptionEn: strN,
  seoDescriptionAr: strN,
  ogImageId: strN,
  ogImage: MediaSchema.nullable(),
  updatedAt: iso,
});
export type SiteSettings = z.infer<typeof SiteSettingsSchema>;
