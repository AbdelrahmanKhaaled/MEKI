/** Phase 12B — Gala fundraising project endpoints (apps/api fundraising.module.ts). No component calls the network directly. */
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { FundraisingViewSchema, type ApprovalStep } from "@/lib/fundraising-schemas";

const e = (eventId: string) => encodeURIComponent(eventId);

export const getFundraising = (eventId: string) => apiGet(`/admin/events/${e(eventId)}/fundraising`, FundraisingViewSchema);
export type FundraisingUpdate = { projectId?: string | null; projectPlanReference?: string | null; donationsCloseAt?: string | null; ticketRefundPolicyEn?: string | null; ticketRefundPolicyAr?: string | null };
export const updateFundraising = (eventId: string, body: FundraisingUpdate) => apiPut(`/admin/events/${e(eventId)}/fundraising`, FundraisingViewSchema, body);
export const approveFundraising = (eventId: string, step: ApprovalStep, note?: string) =>
  apiPost(`/admin/events/${e(eventId)}/fundraising/approve`, FundraisingViewSchema, { step, ...(note?.trim() ? { note: note.trim() } : {}) });
export const revokeFundraising = (eventId: string, step: ApprovalStep, reason: string) => apiPost(`/admin/events/${e(eventId)}/fundraising/revoke`, FundraisingViewSchema, { step, reason });
