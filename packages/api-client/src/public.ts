/**
 * Response types for the PUBLIC MEKI API, as returned with `?locale=en|ar` (bilingual `xEn`/`xAr` pairs are
 * flattened to `x`; Arabic falls back to English and lists the field in `translationFallback`).
 *
 * The OpenAPI document does not yet declare response schemas, so these are maintained by hand and mirror:
 *   apps/api/src/modules/public/public.module.ts          (site, home)
 *   apps/api/src/modules/cms/cms.service.ts               (getPublishedPage / section snapshots)
 *   apps/api/src/modules/programmes/programmes.service.ts (publicView)
 *   apps/api/src/modules/campaigns/campaigns.service.ts   (publicView)
 *   apps/api/src/modules/statistics/statistics.module.ts  (listPublished)
 *   apps/api/src/modules/faq/faq.module.ts                (listPublished)
 *   apps/api/src/modules/donations/*                      (config, create, session, status)
 * Money is ALWAYS a decimal string. Every success body is wrapped as { data } (see ApiEnvelope).
 */

export type Locale = 'en' | 'ar';

export interface ApiEnvelope<T> {
  data: T;
}

export interface ApiErrorBody {
  error: { statusCode: number; code: string; message: string; details?: unknown; requestId?: string };
}

interface Localized {
  translationFallback?: string[];
}

export interface PublicMedia {
  id?: string;
  url: string;
  width: number | null;
  height: number | null;
  alt?: string | null;
  caption?: string | null;
}

export interface PublicSectionItem extends Localized {
  id: string;
  code: string | null;
  sortOrder: number;
  title: string | null;
  text: string | null;
  icon: string | null;
  href: string | null;
  media: PublicMedia | null;
}

export type SectionKey =
  | 'HERO' | 'QUICK_DONATE' | 'TRUST' | 'ABOUT' | 'VISION_MISSION' | 'HOW_WE_WORK' | 'IMPACT' | 'PROGRAMMES'
  | 'ENABLING' | 'CAMPAIGNS' | 'WHY' | 'PROCESS' | 'GALLERY' | 'FAQ' | 'FINAL_CTA' | 'FOOTER';

export interface PublicSection extends Localized {
  id: string;
  key: SectionKey | string;
  anchor: string | null;
  sortOrder: number;
  isVisible: boolean;
  eyebrow: string | null;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  ctaPrimaryLabel: string | null;
  ctaPrimaryHref: string | null;
  ctaSecondaryLabel: string | null;
  ctaSecondaryHref: string | null;
  labels: Record<string, string> | null;
  media: PublicMedia | null;
  items: PublicSectionItem[];
}

export interface PublicPage extends Localized {
  slug: string;
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
  publishedAt: string | null;
  /** Phase 6D: keys of sections published as hidden (absent on older API builds). */
  hiddenSectionKeys?: string[];
  sections: PublicSection[];
}

export interface PublicProgramme extends Localized {
  id: string;
  slug: string;
  kind: 'PROGRAMME' | 'ENABLING_FUNCTION';
  number: number | null;
  name: string;
  shortDesc: string | null;
  mandate: string | null;
  description: string | null;
  focusAreas: string[] | null;
  icon: string | null;
  isFeatured: boolean;
  sortOrder: number;
  seoTitle: string | null;
  seoDescription: string | null;
  cover: PublicMedia | null;
  gallery: (PublicMedia | null)[];
}

export interface PublicCampaign extends Localized {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  status: 'PUBLISHED' | 'PAUSED' | 'COMPLETED';
  isFeatured: boolean;
  programme: ({ slug: string; name: string } & Localized) | null;
  cover: PublicMedia | null;
  gallery: (PublicMedia | null)[];
  currency: string;
  suggestedAmounts: (string | number)[] | null;
  allowCustomAmount: boolean;
  minCustomAmount: string | null;
  maxCustomAmount: string | null;
  targetAmount: string | null;
  startsAt: string | null;
  endsAt: string | null;
  acceptingDonations: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface PublicStatistic extends Localized {
  code: string;
  label: string;
  description: string | null;
  /** Decimal string, e.g. "35" */
  value: string;
  unit: string | null;
  prefix: string | null;
  suffix: string | null;
  displayFormat: 'NUMBER' | 'COMPACT' | 'CURRENCY' | 'PERCENT';
  programmeSlug: string | null;
  attribution: string | null;
  reportingPeriod: string | null;
  sourceRef: string | null;
  sortOrder: number;
}

/** Phase 11A — verified fundraising figures. Decimal strings, never floats; one currency per object (never combined). */
export interface PublicProgress {
  currency: string;
  goal: string;
  collected: string;
  remaining: string;
  /** collected / goal × 100, one decimal, rounded down (may exceed 100 when a goal is surpassed) */
  percent: string;
}

export interface PublicCollected {
  currency: string;
  net: string;
  donations: number;
}

export interface PublicCampaignWithFundraising extends PublicCampaign {
  fundraising: { collected: PublicCollected[]; progress: PublicProgress | null };
}

export interface PublicCause extends Localized {
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  cover: PublicMedia | null;
  campaigns: PublicCampaignWithFundraising[];
}

/** GET /public/programmes/:slug/detail — the single programme page. */
export interface PublicProgrammeDetail {
  programme: Omit<PublicProgramme, 'gallery'> & { gallery: PublicMedia[] };
  fundraising: {
    /** MEKI-approved programme goal; null → no progress is shown */
    goal: { amount: string; currency: string } | null;
    progress: (PublicProgress & { donations: number }) | null;
    collected: PublicCollected[];
    note: string;
  };
  causes: PublicCause[];
  otherCampaigns: PublicCampaignWithFundraising[];
  statistics: PublicStatistic[];
}

export interface PublicFaq extends Localized {
  id: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
}

export interface PublicSite extends Localized {
  orgName: string;
  tagline: string | null;
  legacyLine: string | null;
  logos: { primary: string | null; inverse: string | null; icon: string | null };
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  socialLinks: { network: string; url: string }[];
  defaultLocale: string;
  supportedLocales: string[];
  footerText: string | null;
  footerNote: string | null;
  copyright: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
}

/** GET /public/home */
export interface PublicHome {
  site: PublicSite;
  donation: Record<string, unknown>;
  page: PublicPage;
  programmes: PublicProgramme[];
  campaigns: PublicCampaign[];
  statistics: PublicStatistic[];
  faqs: PublicFaq[];
}

// ───────────── donations ─────────────

export type DonationFrequency = 'ONE_TIME' | 'MONTHLY';
export type DonationDesignation = 'GENERAL_FUND' | 'CAMPAIGN' | 'PROGRAMME';

export interface PublicDonationCurrency {
  code: string;
  nameEn: string;
  nameAr: string | null;
  symbol: string | null;
  minorUnits: number;
  /** Decimal strings formatted to minor units, e.g. "25.00" */
  suggestedAmounts: string[];
  minAmount: string | null;
  maxAmount: string | null;
}

/** GET /public/donations/config */
export interface PublicDonationConfig {
  paymentsEnabled: boolean;
  /** true when the active provider is a test provider — UI must label payments as TEST */
  testMode: boolean;
  defaultCurrency: string;
  allowCustomAmount: boolean;
  frequencies: DonationFrequency[];
  designations: DonationDesignation[];
  amountFormat: 'decimal-string';
  currencies: PublicDonationCurrency[];
}

/** POST /public/donations → 201 */
export interface CreatedDonation {
  reference: string;
  /** Shown once. Keep client-side only (never in URLs or logs). */
  accessToken: string;
  status: string;
  paymentStatus: string;
  amount: string;
  currency: string;
  frequency: DonationFrequency;
  isTest: boolean;
  replayed?: boolean;
}

/** POST /public/donations/:reference/payment-session → 200 */
export interface PaymentSessionResponse {
  attemptReference: string;
  checkoutUrl: string | null;
  expiresAt: string | null;
  provider: string;
  isTest: boolean;
}

/** GET /public/donations/:reference/status | /confirmation */
export interface PublicDonationStatus {
  reference: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  paymentStatus: 'UNPAID' | 'AUTHORIZED' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'FAILED';
  /** Only true after a VERIFIED provider event. Never infer success from a redirect. */
  confirmed: boolean;
  message: 'confirmed' | 'failed' | 'processing' | string;
  amount: string;
  currency: string;
  frequency: DonationFrequency;
  designation: DonationDesignation;
  purpose: string | null;
  confirmedAt: string | null;
  createdAt: string;
  receiptNumber: string | null;
  isTest: boolean;
}

// ───────────── Gala ticket booking (Phase 5B/5B.1 backend contract; docs/16-phase5b-api-reference.md) ─────────────

/** GET /public/events/:slug/ticketing */
export interface PublicTicketing {
  event: { slug: string; name: string; dateLabel: string; venue: string };
  ticket: { name: string; type: 'INDIVIDUAL'; price: string; currency: string; tablesAvailable: false; perGuest: true };
  classification: 'EVENT_TICKET_PAYMENT';
  salesOpen: boolean;
  soldOut: boolean;
  maxTicketsPerBooking: number;
  /** All payment gates are open on the server (provider enabled, env, settings). */
  checkoutAvailable: boolean;
  calendar: { available: true; url: string } | { available: false; reason: 'SCHEDULE_PENDING' };
  /** Phase 12: "zeffy_hosted" = payment, tickets and receipts happen on SDI's Zeffy form; MEKI only issues a booking reference. */
  mode?: 'meki' | 'zeffy_hosted';
  /** Present only in zeffy_hosted mode. */
  hosted?: HostedGalaGate | null;
}

/** Phase 12 — the SDI-hosted Gala form gate. formUrl is present ONLY while hosted sales are switched on. */
export interface HostedGalaGate {
  available: boolean;
  formUrl?: string;
  /** Exact label of SDI's custom question the buyer must answer with the MEKI booking reference. */
  referenceQuestion: string;
  referenceFormat: 'EB-XXXXXXXXXXXX';
  ticketsIssuedBy: 'ZEFFY';
  /** false: the reference is NOT pre-filled into the form (not confirmed by SDI) — the buyer copies it. */
  referencePrefill: false;
}

/** POST /public/events/:slug/hosted-bookings (header Idempotency-Key). Creates a reference only; no price, no guests. */
export interface CreateHostedBookingRequest {
  purchaser: { fullName: string; email: string };
  ticketCount: number;
  locale?: 'en' | 'ar';
  privacyConsent: true;
}

export type CreatedHostedBooking = CreatedBooking & { hosted: HostedGalaGate };

/** GET /public/hosted-forms — SDI-hosted giving forms. URLs appear only when the matching switch is on. */
export interface PublicHostedForms {
  mode: 'sdi_hosted_forms';
  general: { available: boolean; url: string | null };
  programmeDesignationConfirmed: boolean;
  programmes: { slug: string; code: string; available: boolean; url: string | null }[];
}

/** POST /public/events/:slug/bookings (header Idempotency-Key). There is deliberately NO price field. */
export interface CreateBookingRequest {
  purchaser: { fullName: string; email: string; phone: string };
  guests: { fullName: string; email: string; phone: string; dietaryRequirements: string; isPurchaser?: boolean }[];
  ticketCount?: number;
  locale?: 'en' | 'ar';
  privacyConsent: true;
}

export interface CreatedBooking {
  reference: string;
  /** Shown on creation (and on an idempotent replay); needed for status, checkout and downloads. */
  accessToken: string;
  bookingStatus: 'PENDING';
  paymentStatus: 'UNPAID';
  ticketCount: number;
  unitPrice: string;
  totalAmount: string;
  currency: string;
  classification: 'EVENT_TICKET_PAYMENT';
  isTest: boolean;
  replayed?: boolean;
}

/** POST /public/bookings/:reference/checkout (header X-Booking-Token) */
export interface BookingCheckoutSession {
  attemptReference: string;
  checkoutUrl: string | null;
  expiresAt: string | null;
  provider: string;
  isTest: boolean;
}

/** GET /public/bookings/:reference/status | /confirmation (header X-Booking-Token). No guest/purchaser PII. */
export interface PublicBookingStatus {
  reference: string;
  bookingStatus: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'REFUND_PENDING' | 'REFUNDED';
  paymentStatus: 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  /** true only after a VERIFIED provider event — never infer it from a redirect. */
  confirmed: boolean;
  message: 'awaiting_payment' | 'processing' | 'payment_failed' | 'confirmed' | 'cancelled' | 'refund_pending' | 'refunded' | 'awaiting_sdi_report' | 'confirmed_by_sdi';
  ticketCount: number;
  totalAmount: string;
  currency: string;
  classification: 'EVENT_TICKET_PAYMENT';
  event: { slug: string; name: string; dateLabel: string; venue: string } | null;
  calendar: { available: true; url: string } | { available: false; reason: 'SCHEDULE_PENDING' };
  tickets: { ticketNumber: string; status: string; pdfReady: boolean; downloadPath: string }[];
  /** Phase 12: ZEFFY = tickets, QR codes and receipts are issued by Zeffy (tickets is then always empty). */
  ticketIssuer?: 'MEKI' | 'ZEFFY';
  hosted?: HostedGalaGate | null;
}
