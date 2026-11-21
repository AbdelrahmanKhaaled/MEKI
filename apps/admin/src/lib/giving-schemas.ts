import { z } from "zod";

/** Phase 14 — hosted donation intents and Zakat eligibility (shapes of the admin endpoints in apps/api/src/modules/giving). */
const strN = z.string().nullable();
const isoN = z.string().nullable();

export const INTENT_TYPES = ["GALA_DONATION", "PROGRAM_DONATION", "GENERAL_DONATION"] as const;
export const CLASSIFICATIONS = ["ZAKAT", "SADAQAH"] as const;
export const RECON_STATUSES = ["AWAITING_REPORT", "VERIFIED", "NEEDS_REVIEW", "REPORTED_UNPAID"] as const;
export const ALLOCATION_STATUSES = ["PENDING_AUTHORIZATION", "AUTHORIZED", "REJECTED"] as const;

export const IntentRowSchema = z.object({
  id: z.string(),
  reference: z.string(),
  intentType: z.string(),
  classification: strN,
  amount: z.string(),
  reportedAmount: strN,
  currency: z.string(),
  designation: z.object({ type: strN, name: strN, slug: strN }),
  interest: z.object({ kind: z.string(), slug: strN, name: strN, acceptedAt: isoN, disclosureVersion: strN }).nullable().optional(),
  paymentStatus: z.string(),
  reconciliationStatus: strN,
  stage: z.string(),
  allocationStatus: strN,
  authorizedFund: strN,
  allocationDecidedAt: isoN,
  payoutStatus: strN,
  externalPaymentId: strN,
  reconciledReportId: strN,
  reconciledReportRow: z.number().nullable(),
  reconciledAt: isoN,
  isTest: z.boolean(),
  createdAt: z.string(),
  donor: z.object({ name: z.string(), email: z.string() }).nullable(),
});
export type IntentRow = z.infer<typeof IntentRowSchema>;

export const IntentDetailSchema = IntentRowSchema.extend({
  evidence: z.object({
    reportRows: z.array(
      z.object({
        importId: z.string(),
        fileName: z.string(),
        importStatus: z.string(),
        synthetic: z.boolean(),
        fileSha256: z.string(),
        rowNumber: z.number(),
        sourceOrderId: strN,
        amount: strN,
        currency: strN,
        status: strN,
        donationType: strN,
        donationTypeRaw: strN,
        designationRaw: strN,
        matchStatus: z.string(),
        matchNote: strN,
        applied: z.boolean(),
        appliedAt: isoN,
      }),
    ),
    providerPayment: z.object({ provider: z.string(), orderId: z.string(), status: z.string(), amount: z.string(), matchStatus: z.string(), matchReason: strN }).nullable(),
  }),
  history: z.array(z.object({ action: z.string(), at: z.string(), actorId: strN, metadata: z.unknown() })),
});
export type IntentDetail = z.infer<typeof IntentDetailSchema>;

export const IntentSummarySchema = z.object({
  currency: z.string(),
  note: z.string(),
  rows: z.array(z.object({ intentType: strN, classification: strN, reconciliationStatus: strN, allocationStatus: strN, count: z.number(), intendedAmount: z.string(), verifiedAmount: z.string() })),
});
export type IntentSummary = z.infer<typeof IntentSummarySchema>;

export const ZakatDecisionSchema = z.object({
  id: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  eligible: z.boolean(),
  status: z.string(),
  authorityReference: strN,
  sdiAcceptanceReference: strN,
  requestNote: strN,
  requestedById: z.string(),
  requestedAt: z.string(),
  decidedById: strN,
  decidedAt: isoN,
  decisionNote: strN,
});
export type ZakatDecision = z.infer<typeof ZakatDecisionSchema>;

export const ZakatOverviewSchema = z.object({
  defaultEligible: z.literal(false),
  targets: z.array(
    z.object({
      targetType: z.enum(["PROGRAMME", "PROJECT", "CAMPAIGN"]),
      id: z.string(),
      code: z.string(),
      slug: z.string(),
      nameEn: z.string(),
      nameAr: strN,
      kind: z.string().optional(),
      eligible: z.boolean(),
      pending: ZakatDecisionSchema.nullable(),
      history: z.array(ZakatDecisionSchema),
    }),
  ),
});
export type ZakatOverview = z.infer<typeof ZakatOverviewSchema>;
export type ZakatTarget = ZakatOverview["targets"][number];

/** Client-side mirror of the server rule: eligible=true needs BOTH references. */
export function zakatRequestProblem(eligible: boolean, authority: string, sdi: string): "references" | null {
  return eligible && (!authority.trim() || !sdi.trim()) ? "references" : null;
}
