/** Nov 19 2026 — Gala legal copy endpoints (apps/api fundraising/legal-copy.ts). No component calls the network directly. */
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { LegalCopyListSchema, LegalCopySchema, type LegalKind } from "@/lib/legal-copy-schemas";

const e = (eventId: string) => encodeURIComponent(eventId);

export const listLegalCopy = (eventId: string) => apiGet(`/admin/events/${e(eventId)}/legal-copy`, LegalCopyListSchema);
export type LegalCopyUpdate = { textEn?: string | null; textAr?: string | null; ticketPrice?: string | null; fairMarketValue?: string | null; deductibleAmount?: string | null; sourceNote?: string | null };
export const updateLegalCopy = (eventId: string, kind: LegalKind, body: LegalCopyUpdate) => apiPut(`/admin/events/${e(eventId)}/legal-copy/${kind}`, LegalCopySchema, body);
export const recordSdiApproval = (eventId: string, kind: LegalKind, note: string) => apiPost(`/admin/events/${e(eventId)}/legal-copy/${kind}/sdi-approval`, LegalCopySchema, { note });
export const publishLegalCopy = (eventId: string, kind: LegalKind) => apiPost(`/admin/events/${e(eventId)}/legal-copy/${kind}/publish`, LegalCopySchema);
export const withdrawLegalCopy = (eventId: string, kind: LegalKind, what: "SDI_APPROVAL" | "PUBLICATION", reason: string) => apiPost(`/admin/events/${e(eventId)}/legal-copy/${kind}/withdraw`, LegalCopySchema, { what, reason });
