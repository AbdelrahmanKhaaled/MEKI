/**
 * Phase 6B response schemas — hand-written from the NestJS services (OpenAPI does not describe admin bodies, docs/23 G8):
 *   donations.service.ts (adminView/adminGet) · donors.service.ts · refunds.service.ts · receipts.service.ts ·
 *   recurring.service.ts · PaymentsAdminService (donations.controllers.ts) · webhooks.service.ts#list · reports.service.ts.
 * A response that does not match is an error state, never rendered. Money is ALWAYS a decimal string.
 * Optional/nullable is used only where the backend can legitimately omit a value.
 */
import { z } from "zod";

export const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const cur = z.string().regex(/^[A-Z]{3}$/);
const iso = z.string();
const isoN = z.string().nullable();
const strN = z.string().nullable();

// ───────────── donations ─────────────

const Allocation = z.object({
  designation: z.string(),
  campaign: z.object({ id: z.string().optional(), titleEn: z.string(), slug: z.string().optional() }).nullable(),
  programme: z.object({ id: z.string().optional(), nameEn: z.string(), slug: z.string().optional() }).nullable(),
  amount: money.nullable().optional(),
  currency: cur.optional(),
});

/** Present only when the admin holds donors.read (the API omits it otherwise). */
const DonationDonor = z.object({
  id: z.string().optional(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().optional(),
  organizationName: strN.optional(),
  countryCode: strN.optional(),
  anonymizedAt: isoN.optional(),
});

export const DonationListRowSchema = z.object({
  id: z.string(),
  reference: z.string(),
  amount: money,
  refundedAmount: money,
  netAmount: money,
  currency: cur,
  frequency: z.string(),
  status: z.string(),
  paymentStatus: z.string(),
  isAnonymous: z.boolean(),
  isTest: z.boolean(),
  provider: strN.optional(),
  source: strN.optional(),
  confirmedAt: isoN,
  createdAt: iso,
  allocations: z.array(Allocation),
  donorId: z.string().optional(),
  donor: DonationDonor.optional(),
});
export type DonationListRow = z.infer<typeof DonationListRowSchema>;

const Attempt = z.object({
  id: z.string(),
  reference: z.string(),
  provider: z.string(),
  providerSessionRef: strN,
  providerPaymentRef: strN,
  amount: money.nullable(),
  currency: cur,
  status: z.string(),
  failureCode: strN,
  failureReason: strN,
  isTest: z.boolean(),
  initiatedAt: iso,
  expiresAt: isoN,
  completedAt: isoN,
});

export const TransactionSchema = z.object({
  id: z.string(),
  donationId: z.string(),
  paymentAttemptId: strN.optional(),
  refundId: strN.optional(),
  webhookEventId: strN.optional(),
  provider: z.string(),
  providerTransactionRef: z.string(),
  type: z.string(),
  status: z.string(),
  amount: money.nullable(),
  currency: cur,
  settlementAmount: money.nullable().optional(),
  settlementCurrency: strN.optional(),
  feeAmount: money.nullable().optional(),
  failureCode: strN.optional(),
  isTest: z.boolean(),
  occurredAt: iso,
  donation: z.object({ reference: z.string() }).optional(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

export const RefundRowSchema = z.object({
  id: z.string(),
  reference: z.string(),
  donationId: z.string(),
  amount: money,
  currency: cur,
  reason: z.string(),
  status: z.string(),
  requestedById: z.string(),
  decidedById: strN,
  decisionNote: strN,
  executedById: strN,
  provider: strN,
  providerRefundRef: strN,
  failureReason: strN,
  requestedAt: iso,
  decidedAt: isoN,
  executedAt: isoN,
  completedAt: isoN,
  /** additive Phase 6B field (refunds.service list); absent on older API builds */
  donation: z.object({ reference: z.string(), isTest: z.boolean().optional() }).optional(),
});
export type RefundRow = z.infer<typeof RefundRowSchema>;

export const RefundDetailSchema = RefundRowSchema.extend({
  donation: z.object({ reference: z.string(), amount: money, refundedAmount: money, currency: cur }),
  requestedBy: z.object({ id: z.string(), name: z.string() }),
  decidedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
});
export type RefundDetail = z.infer<typeof RefundDetailSchema>;

const ReceiptBase = z.object({
  id: z.string(),
  receiptNumber: z.string(),
  donationId: z.string(),
  version: z.number(),
  status: z.string(),
  locale: z.string(),
  issuedAt: iso,
  voidedAt: isoN,
  replacesReceiptId: strN,
});
export const ReceiptRowSchema = ReceiptBase.extend({
  /** additive Phase 6B field (receipts.service list); absent on older API builds */
  donation: z.object({ reference: z.string(), isTest: z.boolean().optional() }).optional(),
});
export type ReceiptRow = z.infer<typeof ReceiptRowSchema>;

export const DonationDetailSchema = DonationListRowSchema.extend({
  donorMessage: strN.optional(),
  attempts: z.array(Attempt),
  transactions: z.array(TransactionSchema),
  refunds: z.array(RefundRowSchema.omit({ donation: true })),
  receipts: z.array(ReceiptBase),
  recurringDonation: z.object({ id: z.string(), reference: z.string(), status: z.string() }).nullable(),
  sourceEvent: z.object({ id: z.string(), slug: z.string(), titleEn: z.string() }).nullable(),
  utm: z.object({ source: strN, medium: strN, campaign: strN }),
});
export type DonationDetail = z.infer<typeof DonationDetailSchema>;

// ───────────── donors (donors.read) ─────────────

export const DonorRowSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: strN,
  countryCode: strN,
  donorType: z.string(),
  organizationName: strN,
  preferredLocale: z.string(),
  marketingConsent: z.boolean(),
  anonymizedAt: isoN,
  createdAt: iso,
  _count: z.object({ donations: z.number() }),
});
export type DonorRow = z.infer<typeof DonorRowSchema>;

export const DonorDonationSchema = z.object({
  id: z.string(),
  reference: z.string(),
  amount: money,
  refundedAmount: money,
  currency: cur,
  frequency: z.string(),
  status: z.string(),
  paymentStatus: z.string(),
  isTest: z.boolean(),
  confirmedAt: isoN,
  createdAt: iso,
});
export type DonorDonation = z.infer<typeof DonorDonationSchema>;

export const DonorDetailSchema = DonorRowSchema.omit({ _count: true }).extend({
  addressLine1: strN,
  addressLine2: strN,
  city: strN,
  region: strN,
  postalCode: strN,
  marketingConsentAt: isoN,
  privacyConsentAt: iso,
  privacyPolicyVersion: strN,
  updatedAt: iso,
  donations: z.array(DonorDonationSchema),
  recurringDonations: z.array(z.object({ id: z.string(), reference: z.string(), amount: money, currency: cur, status: z.string(), nextBillingDate: isoN })),
});
export type DonorDetail = z.infer<typeof DonorDetailSchema>;

// ───────────── recurring (recurring.read) ─────────────

export const RecurringRowSchema = z.object({
  id: z.string(),
  reference: z.string(),
  donorId: z.string(),
  designation: z.string(),
  campaignId: strN,
  programmeId: strN,
  amount: money,
  currency: cur,
  interval: z.string(),
  intervalCount: z.number(),
  status: z.string(),
  provider: z.string(),
  providerAgreementRef: strN,
  isTest: z.boolean(),
  startDate: isoN,
  nextBillingDate: isoN,
  lastChargedAt: isoN,
  failedAttemptCount: z.number(),
  maxRetryAttempts: z.number(),
  pausedAt: isoN,
  cancelledAt: isoN,
  cancelReason: strN,
  createdAt: iso,
});
export type RecurringRow = z.infer<typeof RecurringRowSchema>;

export const RecurringPaymentSchema = z.object({
  id: z.string(),
  reference: z.string(),
  amount: money,
  currency: cur,
  status: z.string(),
  paymentStatus: z.string(),
  confirmedAt: isoN,
  createdAt: iso,
});
export type RecurringPayment = z.infer<typeof RecurringPaymentSchema>;

export const RecurringDetailSchema = RecurringRowSchema.extend({
  campaign: z.object({ id: z.string(), slug: z.string(), titleEn: z.string() }).nullable(),
  programme: z.object({ id: z.string(), slug: z.string(), nameEn: z.string() }).nullable(),
  paymentHistory: z.array(RecurringPaymentSchema),
});
export type RecurringDetail = z.infer<typeof RecurringDetailSchema>;

// ───────────── receipts (receipts.read) ─────────────

/** Snapshot frozen at issue time (receipt-template.ts ReceiptSnapshot). Lenient: older snapshots may lack fields. */
const Snapshot = z.object({
  receiptNumber: z.string(),
  issuedAt: z.string(),
  isTest: z.boolean(),
  donation: z.object({ reference: z.string(), amount: money, currency: cur, frequency: z.string(), confirmedAt: isoN }),
  donor: z.object({ name: z.string(), organizationName: strN.optional(), countryCode: strN.optional() }),
  purpose: z.object({ designation: z.string(), titleEn: strN, titleAr: strN }),
  issuer: z.object({ nameEn: z.string(), nameAr: strN, addressEn: strN.optional(), addressAr: strN.optional(), taxIdLabel: strN.optional(), taxId: strN.optional() }),
});
export const ReceiptDetailSchema = ReceiptBase.extend({ snapshot: Snapshot, issuedById: strN, voidReason: strN });
export type ReceiptDetail = z.infer<typeof ReceiptDetailSchema>;

// ───────────── payments (payments.read) ─────────────

export const WebhookEventSchema = z.object({
  id: z.string(),
  provider: z.string(),
  providerEventId: z.string(),
  eventType: z.string(),
  signatureVerified: z.boolean(),
  status: z.string(),
  attempts: z.number(),
  lastError: strN,
  receivedAt: iso,
  processedAt: isoN,
});
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

export const ProviderSchema = z.object({
  code: z.string(),
  displayName: z.string(),
  isEnabled: z.boolean(),
  isTestProvider: z.boolean(),
  supportsRecurring: z.boolean(),
  supportsRefunds: z.boolean(),
  supportsPartialRefund: z.boolean(),
  /** server-side truth: an adapter is actually configured / used for new payments */
  configuredOnServer: z.boolean(),
  activeOnServer: z.boolean(),
});
export type Provider = z.infer<typeof ProviderSchema>;

export const CurrencySchema = z.object({ code: cur, isEnabled: z.boolean(), minorUnits: z.number() });
export type Currency = z.infer<typeof CurrencySchema>;

// ───────────── reports (reports.read) — per currency, test records excluded by default ─────────────

export const RefundReportSchema = z.array(z.object({ status: z.string(), currency: cur, count: z.number(), amount: money }));
export const RecurringReportSchema = z.array(z.object({ status: z.string(), currency: cur, count: z.number(), monthlyAmount: money }));
export type RecurringReportRow = z.infer<typeof RecurringReportSchema>[number];
export const ConfirmedSummarySchema = z.object({ confirmed: z.array(z.object({ currency: cur, count: z.number(), gross: money, refunded: money, net: money })) });

export const CampaignOptionSchema = z.object({ id: z.string(), titleEn: z.string(), status: z.string() });
export type CampaignOption = z.infer<typeof CampaignOptionSchema>;

export const AuditEntrySchema = z.object({
  id: z.string(),
  actorEmail: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  createdAt: z.string(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
