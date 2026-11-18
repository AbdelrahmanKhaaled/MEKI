"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ExternalLink, Eye, Scale } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { DataTable, DateText, FilterBar, Notice, PageHeader, Pagination, Ref, SearchFilter, SelectFilter, StatusBadge, TestBadge, type Column } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useReceiptList } from "@/hooks/useFinanceData";
import { useUrlState } from "@/hooks/useUrlState";
import { cleanQuery, isTestReceiptNumber } from "@/lib/finance";
import type { ReceiptRow } from "@/lib/finance-schemas";
import { receiptDocumentUrl } from "@/services/finance";
import { FinancePage, useDetailHref, useHref } from "../FinancePage";

const KEYS = ["q", "status"] as const;

export function ReceiptsListPage() {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.donors }, { label: t.fin.receipts.title }]} anyOf={["receipts.read"]}>
      <ReceiptsList />
    </FinancePage>
  );
}

function ReceiptsList() {
  const { locale, t } = useLocale();
  const href = useHref();
  const detail = useDetailHref();
  const { can } = useAuth();
  const x = t.fin.receipts;
  const { values: f, page, set, clear, active } = useUrlState(KEYS);
  const list = useReceiptList({ ...cleanQuery({ search: f.q, status: f.status }), page, pageSize: 20, sort: "issuedAt:desc" }, true);
  const canDonations = can("donations.read");
  const columns = useMemo<Column<ReceiptRow>[]>(
    () => [
      {
        key: "no",
        header: x.cols.number,
        cell: (r) => (
          <span className="inline-flex flex-wrap items-center gap-2">
            <Link href={detail(`/receipts/${r.id}`)} className="text-meki-green-dark hover:underline"><Ref className="font-bold">{r.receiptNumber}</Ref></Link>
            <TestBadge show={r.donation?.isTest ?? isTestReceiptNumber(r.receiptNumber)} />
          </span>
        ),
      },
      {
        key: "don",
        header: x.cols.donation,
        cell: (r) =>
          canDonations ? (
            <Link href={href(`/donations/${r.donationId}`)} className="text-meki-green-dark hover:underline"><Ref>{r.donation?.reference ?? t.fin.common.openDonation}</Ref></Link>
          ) : r.donation ? <Ref>{r.donation.reference}</Ref> : "—",
      },
      { key: "ver", header: x.cols.version, numeric: true, cell: (r) => <span className="num">{r.version}</span> },
      { key: "st", header: x.cols.status, cell: (r) => <StatusBadge kind="receipt" status={r.status} /> },
      { key: "loc", header: x.cols.locale, cell: (r) => (r.locale === "ar" ? "العربية" : "English") },
      { key: "iss", header: x.cols.issued, cell: (r) => <DateText value={r.issuedAt} /> },
      { key: "void", header: x.cols.voided, cell: (r) => <DateText value={r.voidedAt} /> },
      {
        key: "act",
        header: t.fin.common.actions,
        cell: (r) => (
          <span className="inline-flex flex-wrap gap-1">
            <Link href={detail(`/receipts/${r.id}`)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-meki-green-dark hover:bg-bg"><Eye className="size-4" aria-hidden="true" /> {t.fin.common.view}</Link>
            <a href={receiptDocumentUrl(r.id, locale)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-meki-green-dark hover:bg-bg"><ExternalLink className="size-4" aria-hidden="true" /> HTML</a>
          </span>
        ),
      },
    ],
    [x, t, href, detail, locale, canDonations],
  );
  return (
    <>
      <PageHeader title={x.title} subtitle={x.subtitle} />
      <Notice tone="gold" icon={Scale}>
        <p>{x.fiscal}</p>
        <p className="text-xs text-muted">{x.issueOff}</p>
      </Notice>
      <Card labelledBy="rl-t">
        <CardHeader id="rl-t" title={x.title} />
        <FilterBar active={active} onClear={clear}>
          <SearchFilter value={f.q} onChange={(v) => set({ q: v })} label={x.filters.search} />
          <SelectFilter label={t.fin.common.status} allLabel={t.fin.common.all} value={f.status} onChange={(v) => set({ status: v })} options={Object.entries(t.fin.statuses.receipt).map(([value, label]) => ({ value, label }))} />
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
