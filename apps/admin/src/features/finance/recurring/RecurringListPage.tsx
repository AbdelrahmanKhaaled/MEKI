"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Eye } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { DataTable, DateText, FilterBar, Money, Notice, PageHeader, Pagination, Ref, SearchFilter, SelectFilter, StatusBadge, TestBadge, type Column } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useRecurringList, useRecurringReport } from "@/hooks/useFinanceData";
import { useUrlState } from "@/hooks/useUrlState";
import { cleanQuery } from "@/lib/finance";
import type { RecurringRow } from "@/lib/finance-schemas";
import { formatNumber } from "@/lib/format";
import { fill } from "@/lib/i18n";
import { FinancePage, useDetailHref, useHref } from "../FinancePage";
import { CurrencyFilter } from "../shared";

const KEYS = ["q", "status", "currency"] as const;

export function RecurringListPage() {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.donors }, { label: t.fin.recurring.title }]} anyOf={["recurring.read"]}>
      <RecurringList />
    </FinancePage>
  );
}

export function useFrequencyText() {
  const { t } = useLocale();
  return (r: { interval: string; intervalCount: number }) => (r.interval === "MONTHLY" ? (r.intervalCount === 1 ? t.fin.recurring.monthly : fill(t.fin.recurring.every, { n: r.intervalCount })) : r.interval);
}

function RecurringList() {
  const { locale, t } = useLocale();
  const href = useHref();
  const detail = useDetailHref();
  const { can } = useAuth();
  const x = t.fin.recurring;
  const freq = useFrequencyText();
  const { values: f, page, set, clear, active } = useUrlState(KEYS);
  const list = useRecurringList({ ...cleanQuery({ search: f.q, status: f.status, currency: f.currency }), page, pageSize: 20 }, true);
  const canReports = can("reports.read");
  const report = useRecurringReport(canReports);
  const canDonors = can("donors.read");

  const columns = useMemo<Column<RecurringRow>[]>(
    () => [
      { key: "ref", header: x.cols.reference, cell: (r) => <span className="inline-flex flex-wrap items-center gap-2"><Link href={detail(`/recurring/${r.id}`)} className="text-meki-green-dark hover:underline"><Ref className="font-bold">{r.reference}</Ref></Link><TestBadge show={r.isTest} /></span> },
      // The recurring endpoint returns only the donor id (no PII without donors.read): link to the profile when allowed.
      { key: "donor", header: x.cols.donor, cell: (r) => (canDonors ? <Link href={href(`/donors/${r.donorId}`)} className="text-sm font-bold text-meki-green-dark hover:underline">{t.fin.common.openDonor}</Link> : <span className="text-muted">{t.fin.common.restricted}</span>) },
      { key: "amt", header: x.cols.amount, numeric: true, cell: (r) => <Money value={r.amount} currency={r.currency} className="font-bold" /> },
      { key: "freq", header: x.cols.frequency, cell: (r) => freq(r) },
      { key: "prov", header: x.cols.provider, cell: (r) => <Ref>{r.provider}</Ref> },
      { key: "st", header: x.cols.status, cell: (r) => <StatusBadge kind="recurring" status={r.status} /> },
      { key: "next", header: x.cols.next, cell: (r) => <DateText value={r.nextBillingDate} withTime={false} /> },
      { key: "last", header: x.cols.last, cell: (r) => <DateText value={r.lastChargedAt} withTime={false} /> },
      { key: "act", header: t.fin.common.actions, cell: (r) => <Link href={detail(`/recurring/${r.id}`)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-meki-green-dark hover:bg-bg"><Eye className="size-4" aria-hidden="true" /> {t.fin.common.viewDetails}</Link> },
    ],
    [x, t, href, detail, freq, canDonors],
  );

  return (
    <>
      <PageHeader title={x.title} subtitle={x.subtitle} />
      {canReports && (
        <Card labelledBy="rr-t">
          <CardHeader id="rr-t" title={x.report} subtitle={x.reportNote} />
          <WidgetState q={report} isEmpty={(report.data?.length ?? 0) === 0} emptyText={x.reportEmpty} minH="min-h-20">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {(report.data ?? []).map((r) => (
                <div key={`${r.status}-${r.currency}`} className="rounded-xl border border-line bg-gradient-to-br from-[#e9eeec] to-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge kind="recurring" status={r.status} />
                    <span className="num text-xs text-muted">{formatNumber(r.count, locale)}</span>
                  </div>
                  <p className="mt-2 font-serif text-2xl text-ink"><Money value={r.monthlyAmount} currency={r.currency} /></p>
                  <p className="text-xs text-muted">{x.monthly} · <bdi dir="ltr">{r.currency}</bdi></p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">{t.fin.common.perCurrency}</p>
          </WidgetState>
        </Card>
      )}
      {!canReports && <Notice>{x.reportNote}</Notice>}
      <Card labelledBy="rl-t">
        <CardHeader id="rl-t" title={x.title} />
        <FilterBar active={active} onClear={clear}>
          <SearchFilter value={f.q} onChange={(v) => set({ q: v })} label={x.filters.search} />
          <SelectFilter label={t.fin.common.status} allLabel={t.fin.common.all} value={f.status} onChange={(v) => set({ status: v })} options={Object.entries(t.fin.statuses.recurring).map(([value, label]) => ({ value, label }))} />
          <CurrencyFilter value={f.currency} onChange={(v) => set({ currency: v })} />
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
