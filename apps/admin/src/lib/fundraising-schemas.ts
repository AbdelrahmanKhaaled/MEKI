/** Phase 12B — /admin/events/:eventId/fundraising (apps/api fundraising.module.ts): the single approved Gala project. */
import { z } from "zod";

const isoN = z.string().nullable();
const strN = z.string().nullable();

export const APPROVAL_STEPS = ["PROJECT_PLAN", "PUBLIC_FUNDRAISING", "DONATION_REFUND_NOTICE", "TICKET_REFUND_POLICY"] as const;
export type ApprovalStep = (typeof APPROVAL_STEPS)[number];

export const FundraisingConfigSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  projectId: strN,
  projectPlanReference: strN,
  projectPlanApprovedAt: isoN,
  projectPlanApprovedById: strN,
  projectPlanApprovalNote: strN,
  fundraisingAuthorizedAt: isoN,
  fundraisingAuthorizedById: strN,
  donationsCloseAt: isoN,
  donationRefundNoticeApprovedAt: isoN,
  donationRefundNoticeApprovedById: strN,
  ticketRefundPolicyEn: strN,
  ticketRefundPolicyAr: strN,
  ticketRefundPolicyApprovedAt: isoN,
  ticketRefundPolicyApprovedById: strN,
  updatedById: strN,
  updatedAt: z.string(),
});
export type FundraisingConfig = z.infer<typeof FundraisingConfigSchema>;

export const FundraisingViewSchema = z.object({
  config: FundraisingConfigSchema.nullable(),
  project: z
    .object({ id: z.string(), code: z.string(), nameEn: z.string(), nameAr: strN, locationEn: strN, status: z.string(), provenance: z.string(), deletedAt: isoN, programme: z.object({ slug: z.string(), nameEn: z.string() }).nullable() })
    .nullable(),
  state: z.object({
    planApproved: z.boolean(),
    authorized: z.boolean(),
    campaignOpen: z.boolean(),
    givingAvailable: z.boolean(),
    switchOn: z.boolean(),
    formConfigured: z.boolean(),
    donationRefundNoticeApproved: z.boolean(),
    ticketRefundPolicyApproved: z.boolean(),
  }),
  env: z.object({ galaGivingSwitch: z.boolean(), galaGivingFormConfigured: z.boolean(), generalGivingAuthorized: z.boolean(), programmeGivingAuthorized: z.boolean() }),
});
export type FundraisingView = z.infer<typeof FundraisingViewSchema>;

/** Which approvals an edit would clear (mirrors the API rule; the server is authoritative). */
export function clearedBy(changed: string[], c: FundraisingConfig | null): ApprovalStep[] {
  if (!c) return [];
  const out: ApprovalStep[] = [];
  if ((changed.includes("projectId") || changed.includes("projectPlanReference")) && c.projectPlanApprovedAt) out.push("PROJECT_PLAN");
  if ((changed.includes("projectId") || changed.includes("projectPlanReference") || changed.includes("donationsCloseAt")) && c.fundraisingAuthorizedAt) out.push("PUBLIC_FUNDRAISING");
  if (changed.some((k) => k.startsWith("ticketRefundPolicy")) && c.ticketRefundPolicyApprovedAt) out.push("TICKET_REFUND_POLICY");
  return out;
}

/** Four-eyes in the UI mirrors the server: whoever last edited the configuration cannot approve it. */
export const canRecordApproval = (c: FundraisingConfig | null, userId: string | undefined, hasPermission: boolean) => hasPermission && !!c && !!userId && c.updatedById !== userId;
