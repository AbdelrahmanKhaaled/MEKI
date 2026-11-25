/**
 * Seed source data. Website copy is imported from the IMPLEMENTED landing page dictionaries
 * (apps/web/src/content/en.ts + ar.ts) so the CMS reproduces the live site exactly.
 *
 * Provenance per item (see en.ts legend):
 *   VERIFIED_SOURCE — MEKI Brand Guidelines v1.0 (Oct 2026) / MEK Updated Sector Mandates / Portfolio graphic
 *   PROPOSED        — development-team microcopy, all Arabic translations, preview campaigns, project mappings
 * No donors, donations, transactions, targets, totals or progress are seeded.
 */
import { en } from '../../../web/src/content/en';
import { ar } from '../../../web/src/content/ar';
import { media as webMedia } from '../../../web/src/content/media';

export { en, ar, webMedia };

export const SOURCES = {
  brand24: 'MEKI Brand Guidelines v1.0 (Oct 2026) p.24',
  brand25: 'MEKI Brand Guidelines v1.0 (Oct 2026) p.25',
  brand4: 'MEKI Brand Guidelines v1.0 (Oct 2026) p.4',
  portfolio: 'MEK Integrated Service Portfolio 2026–2030 (graphic)',
  mandates: 'MEK - Updated Sector Mandates.pdf',
  landing: 'Implemented landing page copy (apps/web/src/content) — development-team draft',
} as const;

/**
 * Alternative sector wording from the Updated Sector Mandates PDF. Both wordings are preserved
 * (project-context §5): which set appears publicly is an open MEKI decision. Arabic = proposed translation.
 */
export const MANDATE_WORDING: Record<string, { en: string; ar: string }> = {
  'social-solidarity': { en: 'Social Solidarity & Family Resilience', ar: 'التكافل الاجتماعي وصمود الأسرة' },
  'economic-empowerment': { en: 'Economic Empowerment & Labour Market Activation', ar: 'التمكين الاقتصادي وتنشيط سوق العمل' },
  education: { en: 'Education', ar: 'التعليم' },
  health: { en: 'Health', ar: 'الصحة' },
  housing: { en: 'Housing & Safe Living Conditions', ar: 'الإسكان وظروف المعيشة الآمنة' },
  wash: { en: 'WASH & Environmental Resilience', ar: 'المياه والصرف الصحي والمرونة البيئية' },
  'emergency-response': { en: 'Emergency Relief & Humanitarian Response', ar: 'الإغاثة الطارئة والاستجابة الإنسانية' },
  'heritage-culture': { en: 'Heritage, Culture & Identity', ar: 'التراث والثقافة والهوية' },
  'scientific-research': { en: 'Scientific Research', ar: 'البحث العلمي' },
};

export const ENABLING_SLUGS = ['ngo-development', 'field-offices', 'business-intelligence'] as const;

/**
 * Preview campaign → client photo folder (project subject). These are PROPOSED drafts only:
 * the folder is evidence of field work, NOT approval to fundraise (OPEN_DECISIONS #1).
 */
export const CAMPAIGN_SOURCES: Record<string, { folder: string; locationEn?: string; locationAr?: string }> = {
  hospitals: { folder: 'مستشفيات' },
  neonatal: { folder: 'الحضانات بمستشفي القاهرة التخصيصي', locationEn: 'Cairo', locationAr: 'القاهرة' },
  water: { folder: 'دخول المياه لبيت بالاقصر', locationEn: 'Luxor', locationAr: 'الأقصر' },
  'shelter-warmth': { folder: 'سكن ودفا' },
  'community-schools': { folder: 'مدارس مجتمعية' },
  workshops: { folder: 'مشغل ببني سويف', locationEn: 'Beni Suef', locationAr: 'بني سويف' },
  greenhouses: { folder: 'الصوب ببني سويف', locationEn: 'Beni Suef', locationAr: 'بني سويف' },
  'inclusive-sports': { folder: 'الاعاقة الذهنية باستاد القاهرة', locationEn: 'Cairo', locationAr: 'القاهرة' },
};

/** Impact proof points: Brand Guidelines p.25 — must always carry the Misr El-Kheir attribution. */
export const STAT_META = [
  { code: 'years-of-service', unit: 'years', displayFormat: 'NUMBER' as const, periodEn: null, periodAr: null },
  { code: 'governorates-served', unit: 'governorates', displayFormat: 'NUMBER' as const, periodEn: null, periodAr: null },
  { code: 'beneficiaries-reached', unit: 'people', displayFormat: 'COMPACT' as const, periodEn: null, periodAr: null },
  { code: 'programme-expenditure', unit: 'USD', displayFormat: 'CURRENCY' as const, periodEn: 'Past four years', periodAr: 'خلال السنوات الأربع الماضية' },
];

/** Landing page images and which section/caption they serve. */
export const SECTION_MEDIA: Partial<Record<string, string>> = {
  HERO: 'hero-family', // approved "Home P" family / community-school photo (client delivery 24 Nov 2026); replaces the older hero-field photo
  ABOUT: 'weaver',
  IMPACT: 'water-pump',
  WHY: 'greenhouse',
  FINAL_CTA: 'field-sky',
};
