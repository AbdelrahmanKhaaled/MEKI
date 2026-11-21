import { z } from "zod";
import { apiGet, apiPost } from "@/lib/api";

export const EvidenceSchema = z.object({
  id: z.string(),
  reference: z.string(),
  evidenceReference: z.string().nullable(),
  targetType: z.string(),
  targetId: z.string(),
  externalPaymentId: z.string().nullable(),
  amount: z.string().nullable(),
  currency: z.string().nullable(),
  occurredAt: z.string().nullable(),
  formUrl: z.string().nullable(),
  classification: z.string().nullable(),
  emailMessageId: z.string().nullable(),
  emailFrom: z.string().nullable(),
  emailTo: z.string().nullable(),
  emailReceivedAt: z.string().nullable(),
  protectedReference: z.string().nullable(),
  originalSdiEmail: z.boolean(),
  note: z.string(),
  status: z.enum([
    "PENDING_REVIEW",
    "AWAITING_APPROVAL",
    "APPROVED",
    "REJECTED",
  ]),
  reviewReason: z.string().nullable(),
  submittedById: z.string(),
  decidedById: z.string().nullable(),
  decidedAt: z.string().nullable(),
  decisionNote: z.string().nullable(),
  reportReconciledAt: z.string().nullable(),
  reportImportId: z.string().nullable(),
  createdAt: z.string(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;
export const getEvidence = (id: string) =>
  apiGet(
    `/admin/sdi/payment-evidence/${encodeURIComponent(id)}`,
    EvidenceSchema.extend({
      history: z.array(
        z.object({
          action: z.string(),
          actorId: z.string().nullable(),
          createdAt: z.string(),
          metadata: z.unknown(),
        }),
      ),
    }),
  );
export const listEvidence = (status?: string, reference?: string) =>
  apiGet(
    "/admin/sdi/payment-evidence",
    z.object({ approvalEnabled: z.boolean(), items: z.array(EvidenceSchema) }),
    { status, reference },
  );
export const submitEvidence = (body: Record<string, unknown>) =>
  apiPost("/admin/sdi/payment-evidence", EvidenceSchema, body);
export const decideEvidence = (
  id: string,
  decision: "APPROVE" | "REJECT",
  note: string,
) =>
  apiPost(
    `/admin/sdi/payment-evidence/${encodeURIComponent(id)}/decision`,
    EvidenceSchema,
    { decision, note },
  );
