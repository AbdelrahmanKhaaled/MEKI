/** Phase 8A — SDI / Zeffy integration endpoints (apps/api zeffy.module.ts). No component calls the network directly. */
import { apiGet, apiList, apiPost, type Query } from "@/lib/api";
import { ProviderPaymentSchema, ReconcileResultSchema, ZeffyStatusSchema } from "@/lib/zeffy-schemas";

export const getZeffyStatus = () => apiGet("/admin/integrations/zeffy/status", ZeffyStatusSchema);
export const listProviderPayments = (q: Query) => apiList("/admin/integrations/zeffy/payments", ProviderPaymentSchema, q);
export const reconcileZeffy = (days: number) => apiPost("/admin/integrations/zeffy/reconcile", ReconcileResultSchema, { days });
export const recheckProviderPayment = (id: string) => apiPost(`/admin/integrations/zeffy/payments/${encodeURIComponent(id)}/recheck`, ProviderPaymentSchema);
