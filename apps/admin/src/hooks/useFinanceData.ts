"use client";

import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Query } from "@/lib/api";
import type { RecurringAction } from "@/lib/finance";
import * as svc from "@/services/finance";

/**
 * Stable query keys: ["fin", <resource>, <params>]. Every parameter that changes the response is part of the key.
 * `enabled` mirrors the user's permission (UI only — the API decides and a 403 is rendered as "no access").
 */
export const finKeys = {
  all: ["fin"] as const,
  donations: (q: Query) => ["fin", "donations", q] as const,
  donationCount: (q: Query) => ["fin", "donation-count", q] as const,
  donation: (id: string) => ["fin", "donation", id] as const,
  donors: (q: Query) => ["fin", "donors", q] as const,
  donor: (id: string) => ["fin", "donor", id] as const,
  refunds: (q: Query) => ["fin", "refunds", q] as const,
  refund: (id: string) => ["fin", "refund", id] as const,
  transactions: (q: Query) => ["fin", "transactions", q] as const,
  transaction: (id: string) => ["fin", "transaction", id] as const,
  webhooks: (q: Query) => ["fin", "webhooks", q] as const,
  providers: ["fin", "providers"] as const,
  currencies: ["fin", "currencies"] as const,
  recurringList: (q: Query) => ["fin", "recurring", q] as const,
  recurring: (id: string) => ["fin", "recurring-one", id] as const,
  receipts: (q: Query) => ["fin", "receipts", q] as const,
  receipt: (id: string) => ["fin", "receipt", id] as const,
  refundReport: ["fin", "report-refunds"] as const,
  recurringReport: ["fin", "report-recurring"] as const,
  confirmed: (q: { from?: string; to?: string; currency: string }) => ["fin", "confirmed", q] as const,
  campaignOptions: ["fin", "campaign-options"] as const,
  audit: (type: string, id: string) => ["fin", "audit", type, id] as const,
};

const list = { placeholderData: keepPreviousData };

export const useDonationList = (q: Query, enabled: boolean) => useQuery({ queryKey: finKeys.donations(q), queryFn: () => svc.listDonations(q), enabled, ...list });
export const useDonationCount = (q: Query, enabled: boolean) => useQuery({ queryKey: finKeys.donationCount(q), queryFn: () => svc.countDonations(q), enabled });
export const useDonation = (id: string, enabled = true) => useQuery({ queryKey: finKeys.donation(id), queryFn: () => svc.getDonation(id), enabled });
export const useDonorList = (q: Query, enabled: boolean) => useQuery({ queryKey: finKeys.donors(q), queryFn: () => svc.listDonors(q), enabled, ...list });
export const useDonor = (id: string, enabled = true) => useQuery({ queryKey: finKeys.donor(id), queryFn: () => svc.getDonor(id), enabled });
export const useRefundList = (q: Query, enabled: boolean) => useQuery({ queryKey: finKeys.refunds(q), queryFn: () => svc.listRefunds(q), enabled, ...list });
export const useRefund = (id: string, enabled = true) => useQuery({ queryKey: finKeys.refund(id), queryFn: () => svc.getRefund(id), enabled });
export const useTransactionList = (q: Query, enabled: boolean) => useQuery({ queryKey: finKeys.transactions(q), queryFn: () => svc.listTransactions(q), enabled, ...list });
export const useTransaction = (id: string | null, enabled: boolean) => useQuery({ queryKey: finKeys.transaction(id ?? ""), queryFn: () => svc.getTransaction(id!), enabled: enabled && !!id });
export const useWebhookList = (q: Query, enabled: boolean) => useQuery({ queryKey: finKeys.webhooks(q), queryFn: () => svc.listWebhookEvents(q), enabled, ...list });
export const useProviders = (enabled: boolean) => useQuery({ queryKey: finKeys.providers, queryFn: svc.listProviders, enabled });
export const useCurrencies = (enabled: boolean) => useQuery({ queryKey: finKeys.currencies, queryFn: svc.listCurrencies, enabled, staleTime: 10 * 60_000 });
export const useRecurringList = (q: Query, enabled: boolean) => useQuery({ queryKey: finKeys.recurringList(q), queryFn: () => svc.listRecurring(q), enabled, ...list });
export const useRecurring = (id: string, enabled = true) => useQuery({ queryKey: finKeys.recurring(id), queryFn: () => svc.getRecurring(id), enabled });
export const useReceiptList = (q: Query, enabled: boolean) => useQuery({ queryKey: finKeys.receipts(q), queryFn: () => svc.listReceipts(q), enabled, ...list });
export const useReceipt = (id: string, enabled = true) => useQuery({ queryKey: finKeys.receipt(id), queryFn: () => svc.getReceipt(id), enabled });
export const useRefundReport = (enabled: boolean) => useQuery({ queryKey: finKeys.refundReport, queryFn: svc.refundReport, enabled });
export const useRecurringReport = (enabled: boolean) => useQuery({ queryKey: finKeys.recurringReport, queryFn: svc.recurringReport, enabled });
export const useConfirmedSummary = (q: { from?: string; to?: string; currency: string } | null, enabled: boolean) =>
  useQuery({ queryKey: finKeys.confirmed(q ?? { currency: "" }), queryFn: () => svc.confirmedSummary(q!), enabled: enabled && !!q });
export const useCampaignOptions = (enabled: boolean) => useQuery({ queryKey: finKeys.campaignOptions, queryFn: svc.listCampaignOptions, enabled, staleTime: 5 * 60_000 });
export const useEntityAudit = (type: string, id: string, enabled: boolean) => useQuery({ queryKey: finKeys.audit(type, id), queryFn: () => svc.entityAudit(type, id), enabled });

/** Audit history for several related entities (refunds, receipts, agreement) — one request per entity, merged newest first. */
export function useRelatedAudit(entities: { type: string; id: string }[], enabled: boolean) {
  const qs = useQueries({ queries: entities.map((e) => ({ queryKey: finKeys.audit(e.type, e.id), queryFn: () => svc.entityAudit(e.type, e.id), enabled })) });
  const isPending = enabled && qs.some((q) => q.isPending);
  const error = qs.find((q) => q.isError)?.error ?? null;
  const data = qs.flatMap((q) => q.data ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { isPending, isError: !!error, error, data, refetch: () => Promise.all(qs.map((q) => q.refetch())) };
}

// ── mutations: the UI changes only after the API answered; every related cache is invalidated afterwards ──

function useInvalidateFinance() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: finKeys.all }),
      // dashboard caches that show the same records
      qc.invalidateQueries({ queryKey: ["donations"] }),
      qc.invalidateQueries({ queryKey: ["summary"] }),
      qc.invalidateQueries({ queryKey: ["status-mix"] }),
    ]);
}

export function useRequestRefund(donationId: string) {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: (b: { amount: string; reason: string }) => svc.requestRefund(donationId, b), onSuccess: invalidate });
}
export function useDecideRefund(refundId: string) {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: (v: { decision: "approve" | "reject"; note?: string }) => svc.decideRefund(refundId, v.decision, v.note), onSuccess: invalidate });
}
export function useExecuteRefund(refundId: string) {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: () => svc.executeRefund(refundId), onSuccess: invalidate });
}
export function useChangeRecurring(recId: string) {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: (v: { action: RecurringAction; reason?: string }) => svc.changeRecurring(recId, v.action, v.reason), onSuccess: invalidate });
}
