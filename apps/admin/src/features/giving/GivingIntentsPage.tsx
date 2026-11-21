"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { Checkbox } from "@/components/content/ui";
import { DataTable, DateText, FilterBar, Money, Notice, PageHeader, Pagination, Ref, SearchFilter, SelectFilter, TestBadge, useErrorText, type Column } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useUrlState } from "@/hooks/useUrlState";
import { ApiError } from "@/lib/api";
import { cleanQuery } from "@/lib/finance";
import { ALLOCATION_STATUSES, CLASSIFICATIONS, INTENT_TYPES, RECON_STATUSES, type IntentRow } from "@/lib/giving-schemas";
import * as svc from "@/services/giving";
import { FinancePage, useDetailHref } from "../finance/FinancePage";

const KEYS = ["q", "intentType", "classification", "reconciliationStatus", "allocationStatus", "includeTest"] as const;
const PAGE_SIZE = 20;

/** Stable codes → translated text first, then the shared finance messages. Raw server text is never shown. */
export function useGivingError() {
  const { t } = useLocale();
  const fallback = useErrorText();
  return (e: unknown) => (e instanceof ApiError && t.giving.errors[e.code]) || fallback(e);
}

export const TONE: Record<string, string> = {
  VERIFIED: "bg-ok/10 text-ok",
  AUTHORIZED: "bg-ok/10 text-ok",
  NEEDS_REVIEW: "bg-warn/10 text-warn",
  REPORTED_UNPAID: "bg-bg text-muted",
  REJECTED: "bg-danger/10 text-danger",
  AWAITING_REPORT: "bg-harvest-gold/15 text-gold-text",
  PENDING_AUTHORIZATION: "bg-harvest-gold/15 text-gold-text",
  ZAKAT: "bg-meki-green/10 text-meki-green-dark",
  SADAQAH: "bg-bg text-ink",
};
export function Pill({ value, label }: { value: string | null; label: string }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${TONE[value ?? ""] ?? "bg-bg text-muted"}`}>{label}</span>;
}

/**
 * Phase 14 — hosted donation intents (DN-…). Separates the donor's intention, the payment verification (SDI report only) and the
 * fund-allocation authorization. Donor personal data appears only with donors.read. Gala ticket revenue is never listed here.
 */
export function GivingIntentsPage() {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.donors }, { label: t.giving.title }]} anyOf={["donations.read"]}>
      <IntentsList />
    </FinancePage>
  );
}

function IntentsList() {
  const { t, locale } = useLocale();
  const x = t.giving;
  const { can } = useAuth();
  const href = useDetailHref();
  const { values: f, page, set, clear, active } = useUrlState(KEYS);
  const q = { ...cleanQuery({ search: f.q, intentType: f.intentType, classification: f.classification, reconciliationStatus: f.reconciliationStatus, allocationStatus: f.allocationStatus, includeTest: f.includeTest === "true" ? "true" : undefined }), page, pageSize: PAGE_SIZE };
  const list = useQuery({ queryKey: ["giving", "intents", q], queryFn: () => svc.listIntents(q), placeholderData: (p) => p });
  const summary = useQuery({ queryKey: ["giving", "summary"], queryFn: svc.intentSummary });
  const showDonor = can("donors.read");

  const columns = useMemo<Column<IntentRow>[]>(
    () => [
      {
        key: "ref",
        header: x.cols.reference,
        cell: (r) => (
          <span className="inline-flex flex-wrap items-center gap-2">
            <Link href={href(`/giving-intents/${r.id}`)} className="text-meki-green-dark hover:underline"><Ref className="font-bold">{r.reference}</Ref></Link>
            <TestBadge show={r.isTest} />
          </span>
        ),
      },
      { key: "type", header: x.cols.type, cell: (r) => x.types[r.intentType] ?? r.intentType },
      { key: "class", header: x.cols.classification, cell: (r) => <Pill value={r.classification} label={x.classes[r.classification ?? ""] ?? "—"} /> },
      { key: "des", header: x.cols.designation, cell: (r) => <span className="text-sm"><span className="block text-xs text-muted">{x.designation[r.designation.type ?? ""] ?? "—"}</span><bdi>{r.designation.name ?? "—"}</bdi></span> },
      { key: "interest", header: locale === 'ar' ? 'مجال الاهتمام فقط' : 'Source interest only', cell: (r) => <bdi>{r.interest?.name ?? r.interest?.kind ?? '—'}</bdi> },
      { key: "amt", header: x.cols.amount, numeric: true, cell: (r) => <Money value={r.amount} currency={r.currency} className="font-bold" /> },
      { key: "rep", header: x.cols.reported, numeric: true, cell: (r) => (r.reportedAmount ? <Money value={r.reportedAmount} currency={r.currency} /> : "—") },
      { key: "rec", header: x.cols.verification, cell: (r) => <Pill value={r.reconciliationStatus} label={x.recon[r.reconciliationStatus ?? ""] ?? "—"} /> },
      { key: "alloc", header: x.cols.allocation, cell: (r) => <Pill value={r.allocationStatus} label={x.allocation[r.allocationStatus ?? ""] ?? "—"} /> },
      ...(showDonor ? [{ key: "donor", header: x.cols.donor, cell: (r: IntentRow) => (r.donor ? <bdi className="text-sm">{r.donor.name}</bdi> : "—") }] : []),
      { key: "date", header: x.cols.created, cell: (r) => <DateText value={r.createdAt} /> },
      {
        key: "act",
        header: t.fin.common.actions,
        cell: (r) => (
          <Link href={href(`/giving-intents/${r.id}`)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-meki-green-dark hover:bg-bg">
            <Eye className="size-4" aria-hidden="true" /> {x.view}
          </Link>
        ),
      },
    ],
    [x, t, href, showDonor, locale],
  );

  return (
    <>
      <PageHeader title={x.title} subtitle={x.subtitle} />
      <Notice><p>{x.sepNote}</p></Notice>

      <Card labelledBy="gi-sum">
        <CardHeader id="gi-sum" title={x.summary.title} subtitle={summary.data?.note} />
        <WidgetState q={summary} isEmpty={summary.data?.rows.length === 0} emptyText={x.summary.none} minH="min-h-24">
          {summary.data && (
            <DataTable
              caption={x.summary.title}
              minW="min-w-[40rem]"
              rows={summary.data.rows}
              rowKey={(r) => `${r.intentType}-${r.classification}-${r.reconciliationStatus}-${r.allocationStatus}`}
              columns={[
                { key: "t", header: x.summary.type, cell: (r) => x.types[r.intentType ?? ""] ?? "—" },
                { key: "c", header: x.summary.classification, cell: (r) => x.classes[r.classification ?? ""] ?? "—" },
                { key: "s", header: x.summary.status, cell: (r) => x.recon[r.reconciliationStatus ?? ""] ?? "—" },
                { key: "n", header: x.summary.count, numeric: true, cell: (r) => r.count },
                { key: "i", header: x.summary.intended, numeric: true, cell: (r) => <Money value={r.intendedAmount} currency="USD" /> },
                { key: "v", header: x.summary.verified, numeric: true, cell: (r) => <Money value={r.verifiedAmount} currency="USD" className="font-bold" /> },
              ]}
            />
          )}
        </WidgetState>
      </Card>

      <Card labelledBy="gi-t">
        <CardHeader id="gi-t" title={x.title} subtitle={x.testNote} />
        <FilterBar active={active} onClear={clear}>
          <SearchFilter value={f.q} onChange={(v) => set({ q: v })} label={x.filters.search} />
          <SelectFilter label={x.filters.type} allLabel={x.filters.anyType} value={f.intentType} onChange={(v) => set({ intentType: v })} options={INTENT_TYPES.map((v) => ({ value: v, label: x.types[v] }))} />
          <SelectFilter label={x.filters.classification} allLabel={x.filters.anyClass} value={f.classification} onChange={(v) => set({ classification: v })} options={CLASSIFICATIONS.map((v) => ({ value: v, label: x.classes[v] }))} />
          <SelectFilter label={x.filters.recon} allLabel={x.filters.anyRecon} value={f.reconciliationStatus} onChange={(v) => set({ reconciliationStatus: v })} options={RECON_STATUSES.map((v) => ({ value: v, label: x.recon[v] }))} />
          <SelectFilter label={x.filters.allocation} allLabel={x.filters.anyAllocation} value={f.allocationStatus} onChange={(v) => set({ allocationStatus: v })} options={ALLOCATION_STATUSES.map((v) => ({ value: v, label: x.allocation[v] }))} />
          <Checkbox label={x.includeTest} checked={f.includeTest === "true"} onChange={(b) => set({ includeTest: b ? "true" : "" })} />
        </FilterBar>
        <WidgetState q={list} isEmpty={list.data?.items.length === 0} emptyText={active ? x.emptyFiltered : x.empty} minH="min-h-56">
          {list.data && (
            <>
              <DataTable caption={x.title} rows={list.data.items} columns={columns} rowKey={(r) => r.id} dimmed={list.isPlaceholderData} />
              <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} onPage={(p) => set({ page: p })} />
            </>
          )}
        </WidgetState>
      </Card>
    </>
  );
}
