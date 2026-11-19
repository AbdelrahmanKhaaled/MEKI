/** Phase 8A — responses of /admin/integrations/zeffy/* (apps/api zeffy.module.ts). Booleans only for configuration; never values. */
import { z } from "zod";

const iso = z.string();
const money = z.string().regex(/^-?\d+(\.\d+)?$/);

export const MATCH_STATUSES = ["UNMATCHED", "NEEDS_REVIEW", "MATCHED", "CONFIRMED", "IGNORED"] as const;

export const ZeffyStatusSchema = z.object({
  provider: z.literal("zeffy"),
  configured: z.object({
    apiKey: z.boolean(),
    webhookSecret: z.boolean(),
    galaTicketCampaign: z.boolean(),
    donationCampaigns: z.number(),
    forms: z.object({ donation: z.boolean(), galaTicket: z.boolean(), galaGiving: z.boolean() }),
  }),
  reconciliationEnabled: z.boolean(),
  autoConfirm: z.boolean(),
  hostedCheckout: z.object({ available: z.boolean(), reason: z.string() }),
  api: z.object({ state: z.enum(["ok", "error", "unchecked", "not_configured"]), checkedAt: iso.optional(), code: z.string().nullable().optional() }),
  webhook: z.object({ lastVerifiedAt: iso.nullable(), lastEventType: z.string().nullable(), failedEvents: z.number() }),
  lastReconciliation: z.object({ at: iso, result: z.record(z.string(), z.unknown()).nullable() }).nullable(),
  queue: z.record(z.string(), z.number()),
});
export type ZeffyStatus = z.infer<typeof ZeffyStatusSchema>;

export const ProviderPaymentSchema = z.object({
  id: z.string(),
  provider: z.string(),
  providerPaymentId: z.string(),
  status: z.string(),
  type: z.string(),
  amount: money,
  eligibleAmount: money,
  refundedAmount: money,
  refundStatus: z.string(),
  disputeStatus: z.string().nullable(),
  currency: z.string(),
  campaignId: z.string().nullable(),
  campaignCategory: z.string().nullable(),
  recurringInterval: z.string().nullable(),
  classification: z.string().nullable(),
  correlationRef: z.string().nullable(),
  matchStatus: z.enum(MATCH_STATUSES),
  matchReason: z.string().nullable(),
  matchedEntityType: z.string().nullable(),
  matchedEntityId: z.string().nullable(),
  providerCreatedAt: iso,
  deletedAtProvider: iso.nullable(),
  lastSyncedAt: iso,
});
export type ProviderPayment = z.infer<typeof ProviderPaymentSchema>;

export const ReconcileResultSchema = z.object({ ok: z.boolean(), days: z.number(), payments: z.number(), matched: z.number(), review: z.number(), unmatched: z.number(), ignored: z.number(), confirmed: z.number(), failed: z.number() });
export type ReconcileResult = z.infer<typeof ReconcileResultSchema>;
