"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CircleAlert, Clock, Eye, HandCoins, RotateCcw } from "lucide-react";
import { Card, CardHeader, KpiCard } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { DataTable, DateRangeFilter, DateText, FilterBar, Money, PageHeader, Pagination, Ref, SearchFilter, SelectFilter, StatusBadge, TestBadge, type Column } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useCampaignOptions, useConfirmedSummary, useDonationCount, useDonationList } from "@/hooks/useFinanceData";
import { useUrlState } from "@/hooks/useUrlState";
import { cleanQuery, dayRange } from "@/lib/finance";
import type { DonationListRow } from "@/lib/finance-schemas";
import { formatNumber } from "@/lib/format";
import { fill } from "@/lib/i18n";
import { FinancePage, useDetailHref } from "../FinancePage";
import { CurrencyFilter, DesignationCell, DonorCell, frequencyLabel } from "../shared";

const KEYS = ["q", "status", "paymentStatus", "frequency", "currency", "campaignId", "from", "to"] as const;
const PAGE_SIZE = 20;

export function DonationsListPage() {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.donors }, { label: t.fin.donations.title }]} anyOf={["donations.read"]}>
      <DonationsList />
    </FinancePage>
  );
}

function DonationsList() {
  const { locale, t } = useLocale();
  const { can } = useAuth();
  const href = useDetailHref();
  const d = t.fin.donations;
  const s = t.fin.statuses;
  const { values: f, page, set, clear, active } = useUrlState(KEYS);
  const canDonors = can("donors.read");
  const canCampaigns = can("campaigns.read");
  const canReports = can("reports.read");

  const range = dayRange(f.from, f.to);
  // Filters shared by the list and the KPI counts (status filters excluded from the counts so the four cards stay meaningful).
  const base = cleanQuery({ search: f.q, currency: f.currency, campaignId: f.campaignId, frequency: f.frequency, from: range?.from, to: range?.to });
  const listQ = { ...base, ...cleanQuery({ status: f.status, paymentStatus: f.paymentStatus }), page, pageSize: PAGE_SIZE, sort: "createdAt:desc" };
  const valid = range !== null;

  const list = useDonationList(listQ, valid);
  const confirmed = useDonationCount({ ...base, status: "COMPLETED" }, valid);
  const pending = useDonationCount({ ...base, status: "PENDING" }, valid);
  const failed = useDonationCount({ ...base, status: "FAILED" }, valid);
  const refundedFull = useDonationCount({ ...base, paymentStatus: "REFUNDED" }, valid);
  const refundedPart = useDonationCount({ ...base, paymentStatus: "PARTIALLY_REFUNDED" }, valid);
  // Collected amount: only for ONE chosen currency, from the finance report (confirmation-date basis), never across currencies.
  const amountQ = canReports && f.currency && !f.campaignId && valid ? { currency: f.currency, ...cleanQuery({ from: range?.from, to: range?.to }) } : null;
  const amount = useConfirmedSummary(amountQ, !!amountQ);
  const campaigns = useCampaignOptions(canCampaigns);

  const n = (q: { isPending: boolean; isError: boolean; data?: number }) => (q.isPending ? "…" : q.isError || q.data === undefined ? "—" : formatNumber(q.data, locale));
  const refundedN = refundedFull.data !== undefined && refundedPart.data !== undefined ? refundedFull.data + refundedPart.data : undefined;
  // No confirmed row for that currency in the period = nothing collected (0), which is a real answer, not missing data.
  const collected = amount.isSuccess ? (amount.data.confirmed.find((c) => c.currency === f.currency)?.net ?? "0") : null;
  const amountHint = !canReports ? d.kpi.amountUnavailable : f.campaignId ? d.kpi.amountCampaign : !f.currency ? d.kpi.pickCurrency : amount.isPending ? "…" : amount.isError ? "—" : undefined;

  const columns = useMemo<Column<DonationListRow>[]>(
    () => [
      {
        key: "ref",
        header: d.cols.reference,
        cell: (r) => (
          <span className="inline-flex flex-wrap items-center gap-2">
            <Link href={href(`/donations/${r.id}`)} className="text-meki-green-dark hover:underline"><Ref className="font-bold">{r.reference}</Ref></Link>
            <TestBadge show={r.isTest} />
          </span>
        ),
      },
      { key: "donor", header: d.cols.donor, cell: (r) => <DonorCell row={r} /> },
      { key: "amount", header: d.cols.amount, numeric: true, cell: (r) => <Money value={r.amount} currency={r.currency} className="font-bold" /> },
      { key: "cur", header: d.cols.currency, cell: (r) => <bdi dir="ltr">{r.currency}</bdi> },
      { key: "type", header: d.cols.type, cell: (r) => frequencyLabel(r.frequency, t) },
      { key: "des", header: d.cols.designation, cell: (r) => <DesignationCell allocations={r.allocations} /> },
      {
        key: "ps",
        header: d.cols.paymentStatus,
        cell: (r) => (
          <span className="inline-flex flex-col items-start gap-1">
            <StatusBadge kind="payment" status={r.paymentStatus} />
            {r.status !== "COMPLETED" && <StatusBadge kind="donation" status={r.status} />}
          </span>
        ),
      },
      { key: "date", header: d.cols.date, cell: (r) => <DateText value={r.confirmedAt ?? r.createdAt} /> },
      {
        key: "act",
        header: t.fin.common.actions,
        cell: (r) => (
          <Link href={href(`/donations/${r.id}`)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-meki-green-dark hover:bg-bg">
            <Eye className="size-4" aria-hidden="true" /> {t.fin.common.viewDetails}
          </Link>
        ),
      },
    ],
    [d, t, href],
  );

  return (
    <>
      <PageHeader title={d.title} subtitle={d.subtitle} />

      <section aria-label={d.title} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          tone="green"
          icon={<HandCoins className="size-5" />}
          label={d.kpi.confirmed}
          value={n(confirmed)}
          hint={amountHint}
        />
        <KpiCard tone="gold" icon={<Clock className="size-5" />} label={d.kpi.pending} value={n(pending)} hint={d.kpi.countHint} />
        <KpiCard tone="ink" icon={<CircleAlert className="size-5" />} label={d.kpi.failed} value={n(failed)} hint={d.kpi.countHint} />
        <KpiCard tone="teal" icon={<RotateCcw className="size-5" />} label={d.kpi.refunded} value={refundedFull.isPending || refundedPart.isPending ? "…" : refundedN === undefined ? "—" : formatNumber(refundedN, locale)} hint={d.kpi.refundedHint} />
      </section>
      {collected !== null && f.currency && (
        <p className="-mt-3 text-sm text-body" data-testid="confirmed-amount">
          {fill(d.kpi.amount, { currency: f.currency })} <Money value={collected} currency={f.currency} className="font-bold text-deep-green" /> <span className="text-xs text-muted">({d.kpi.amountBasis})</span>
        </p>
      )}

      <Card labelledBy="don-t">
        <CardHeader id="don-t" title={d.title} />
        <FilterBar active={active} onClear={clear}>
          <SearchFilter value={f.q} onChange={(v) => set({ q: v })} label={canDonors ? d.filters.search : d.filters.searchRef} />
          <SelectFilter label={d.filters.status} allLabel={d.filters.anyStatus} value={f.status} onChange={(v) => set({ status: v })} options={Object.entries(s.donation).map(([value, label]) => ({ value, label }))} />
          <SelectFilter label={d.filters.paymentStatus} allLabel={d.filters.anyStatus} value={f.paymentStatus} onChange={(v) => set({ paymentStatus: v })} options={Object.entries(s.payment).map(([value, label]) => ({ value, label }))} />
          <SelectFilter label={d.filters.frequency} allLabel={d.filters.anyType} value={f.frequency} onChange={(v) => set({ frequency: v })} options={[{ value: "ONE_TIME", label: t.fin.common.oneTime }, { value: "MONTHLY", label: t.fin.common.monthly }]} />
          <CurrencyFilter value={f.currency} onChange={(v) => set({ currency: v })} />
          {canCampaigns && (
            <SelectFilter label={d.filters.campaign} allLabel={d.filters.allCampaigns} value={f.campaignId} onChange={(v) => set({ campaignId: v })} options={(campaigns.data ?? []).map((c) => ({ value: c.id, label: c.titleEn }))} />
          )}
          <DateRangeFilter label={d.filters.created} from={f.from} to={f.to} invalid={!valid} onChange={(patch) => set(patch)} />
        </FilterBar>

        <WidgetState q={list} unavailable={!valid ? { text: t.fin.common.invalidRange } : false} isEmpty={list.data?.items.length === 0} emptyText={active ? d.emptyFiltered : d.empty} minH="min-h-56">
          {list.data && (
            <>
              <DataTable caption={d.title} rows={list.data.items} columns={columns} rowKey={(r) => r.id} dimmed={list.isPlaceholderData} />
              <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} onPage={(p) => set({ page: p })} />
            </>
          )}
        </WidgetState>
      </Card>
    </>
  );
}
