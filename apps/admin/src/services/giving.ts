/** Phase 14 — one function per EXISTING endpoint of apps/api/src/modules/giving/giving.module.ts. */
import { apiGet, apiList, apiPost, type Query } from "@/lib/api";
import { IntentDetailSchema, IntentRowSchema, IntentSummarySchema, ZakatDecisionSchema, ZakatOverviewSchema } from "@/lib/giving-schemas";
import { z } from "zod";

const id = (s: string) => encodeURIComponent(s);

// donations.read (donor data only with donors.read)
export const listIntents = (q: Query) => apiList("/admin/donation-intents", IntentRowSchema, q);
export const intentSummary = () => apiGet("/admin/donation-intents/summary", IntentSummarySchema);
export const getIntent = (iid: string) => apiGet(`/admin/donation-intents/${id(iid)}`, IntentDetailSchema);
// donations.allocate — not the administrator who approved the SDI report
export const decideAllocation = (iid: string, body: { decision: "AUTHORIZE" | "REJECT"; fund?: string; note: string }) => apiPost(`/admin/donation-intents/${id(iid)}/allocation`, IntentDetailSchema, body);

// Zakat eligibility: read donations.read · request zakat.manage · decide/revoke zakat.approve (not your own request)
export const zakatOverview = () => apiGet("/admin/zakat-eligibility", ZakatOverviewSchema);
export const requestZakat = (body: { targetType: string; targetId: string; eligible: boolean; authorityReference?: string; sdiAcceptanceReference?: string; note?: string }) =>
  apiPost("/admin/zakat-eligibility", ZakatDecisionSchema, body);
export const approveZakat = (did: string, note?: string) => apiPost(`/admin/zakat-eligibility/${id(did)}/approve`, ZakatDecisionSchema, note ? { note } : {});
export const rejectZakat = (did: string, note: string) => apiPost(`/admin/zakat-eligibility/${id(did)}/reject`, ZakatDecisionSchema, { note });
export const revokeZakat = (body: { targetType: string; targetId: string; reason: string }) =>
  apiPost("/admin/zakat-eligibility/revoke", z.object({ targetType: z.string(), targetId: z.string(), eligible: z.literal(false) }), body);
