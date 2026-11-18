/**
 * Phase 6B finance services — one function per EXISTING backend endpoint (apps/api donations.controllers.ts, audit).
 * No component calls the network directly. Test/mock records are never requested (`includeTest` is never sent).
 */
import { z } from "zod";
import { ApiError, apiCount, apiGet, apiList, apiPost, apiUrl, type Query } from "@/lib/api";
import {
  AuditEntrySchema,
  CampaignOptionSchema,
  ConfirmedSummarySchema,
  CurrencySchema,
  DonationDetailSchema,
  DonationListRowSchema,
  DonorDetailSchema,
  DonorRowSchema,
  ProviderSchema,
  ReceiptDetailSchema,
  ReceiptRowSchema,
  RecurringDetailSchema,
  RecurringReportSchema,
  RecurringRowSchema,
  RefundDetailSchema,
  RefundReportSchema,
  RefundRowSchema,
  TransactionSchema,
  WebhookEventSchema,
} from "@/lib/finance-schemas";
import type { RecurringAction } from "@/lib/finance";
import { refreshCsrf } from "./dashboard";

const id = (s: string) => encodeURIComponent(s);

/** Mutations: if the in-memory CSRF token went stale (403 CSRF_INVALID), fetch a fresh one once and retry. */
async function mutate<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && e.status === 403 && e.code === "CSRF_INVALID") {
      await refreshCsrf();
      return fn();
    }
    throw e;
  }
}

// ── donations (donations.read; donor fields only with donors.read) ──
export const listDonations = (q: Query) => apiList("/admin/donations", DonationListRowSchema, q);
export const countDonations = (q: Query) => apiCount("/admin/donations", q);
export const getDonation = (donationId: string) => apiGet(`/admin/donations/${id(donationId)}`, DonationDetailSchema);
/** refunds.request — creates a REQUESTED refund that still needs approval by a different admin; nothing is paid out here. */
export const requestRefund = (donationId: string, body: { amount: string; reason: string }) => mutate(() => apiPost(`/admin/donations/${id(donationId)}/refunds`, RefundDetailSchema, body));

// ── donors (donors.read) ──
export const listDonors = (q: Query) => apiList("/admin/donors", DonorRowSchema, q);
export const getDonor = (donorId: string) => apiGet(`/admin/donors/${id(donorId)}`, DonorDetailSchema);

// ── refunds (list/detail: donations.read; decisions: refunds.approve; execute: refunds.execute) ──
export const listRefunds = (q: Query) => apiList("/admin/refunds", RefundRowSchema, q);
export const getRefund = (refundId: string) => apiGet(`/admin/refunds/${id(refundId)}`, RefundDetailSchema);
export const decideRefund = (refundId: string, decision: "approve" | "reject", note?: string) => mutate(() => apiPost(`/admin/refunds/${id(refundId)}/${decision}`, RefundDetailSchema, note ? { note } : {}));
export const executeRefund = (refundId: string) => mutate(() => apiPost(`/admin/refunds/${id(refundId)}/execute`, RefundDetailSchema));

// ── payments (payments.read) ──
export const listTransactions = (q: Query) => apiList("/admin/payments/transactions", TransactionSchema, q);
export const getTransaction = (txId: string) => apiGet(`/admin/payments/transactions/${id(txId)}`, TransactionSchema);
export const listWebhookEvents = (q: Query) => apiList("/admin/payments/webhook-events", WebhookEventSchema, q);
export const listProviders = () => apiGet("/admin/payments/providers", z.array(ProviderSchema));
export const listCurrencies = () => apiGet("/admin/payments/currencies", z.array(CurrencySchema)); // settings.read

// ── recurring (recurring.read; pause/resume/cancel: recurring.manage, provider must support it) ──
export const listRecurring = (q: Query) => apiList("/admin/recurring-donations", RecurringRowSchema, q);
export const getRecurring = (recId: string) => apiGet(`/admin/recurring-donations/${id(recId)}`, RecurringDetailSchema);
export const changeRecurring = (recId: string, action: RecurringAction, reason?: string) =>
  mutate(() => apiPost(`/admin/recurring-donations/${id(recId)}/${action}`, RecurringDetailSchema, action === "cancel" ? { reason } : {}));

// ── receipts (receipts.read) ──
export const listReceipts = (q: Query) => apiList("/admin/receipts", ReceiptRowSchema, q);
export const getReceipt = (receiptId: string) => apiGet(`/admin/receipts/${id(receiptId)}`, ReceiptDetailSchema);
/** HTML document rendered by the API (same-origin proxy, cookie-authenticated). PDF is not configured on the API (501). */
export const receiptDocumentUrl = (receiptId: string, locale: "en" | "ar") => apiUrl(`/admin/receipts/${id(receiptId)}/document`, { locale, format: "html" });

// ── reports (reports.read) — per currency, test records excluded by the API's default ──
export const refundReport = () => apiGet("/admin/reports/refunds", RefundReportSchema);
export const recurringReport = () => apiGet("/admin/reports/recurring", RecurringReportSchema);
export const confirmedSummary = (q: { from?: string; to?: string; currency: string }) => apiGet("/admin/reports/donations/summary", ConfirmedSummarySchema, q);

// ── supporting lists ──
export async function listCampaignOptions() {
  return (await apiList("/admin/campaigns", CampaignOptionSchema, { pageSize: 100, sort: "titleEn:asc" })).items; // campaigns.read
}
/** Audit history of one entity (audit.read), newest first. */
export async function entityAudit(entityType: string, entityId: string) {
  return (await apiList("/admin/audit-logs", AuditEntrySchema, { entityType, entityId, pageSize: 20 })).items;
}
