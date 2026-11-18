"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Eye } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { DataTable, DateText, FilterBar, PageHeader, Pagination, Ref, SearchFilter, SelectFilter, type Column } from "@/components/finance/ui";
import { useDonorList } from "@/hooks/useFinanceData";
import { useUrlState } from "@/hooks/useUrlState";
import { cleanQuery, donorName } from "@/lib/finance";
import type { DonorRow } from "@/lib/finance-schemas";
import { formatNumber } from "@/lib/format";
import { FinancePage, useDetailHref } from "../FinancePage";

const KEYS = ["q", "anonymized", "sort"] as const;
const SORTS = { newest: "createdAt:desc", oldest: "createdAt:asc", name: "lastName:asc", email: "email:asc" } as const;

export function DonorsListPage() {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.donors }, { label: t.fin.donors.title }]} anyOf={["donors.read"]}>
      <DonorsList />
    </FinancePage>
  );
}

function DonorsList() {
  const { locale, t } = useLocale();
  const href = useDetailHref();
  const d = t.fin.donors;
  const { values: f, page, set, clear, active } = useUrlState(KEYS);
  const sortKey = (f.sort in SORTS ? f.sort : "newest") as keyof typeof SORTS;
  const q = { ...cleanQuery({ search: f.q, includeAnonymized: f.anonymized === "true" ? "true" : undefined }), sort: SORTS[sortKey], page, pageSize: 20 };
  const list = useDonorList(q, true);

  const columns = useMemo<Column<DonorRow>[]>(
    () => [
      {
        key: "name",
        header: d.cols.name,
        cell: (r) => (
          <span className="inline-flex flex-wrap items-center gap-2">
            <Link href={href(`/donors/${r.id}`)} className="font-bold text-ink hover:text-meki-green-dark hover:underline"><bdi>{donorName(r) ?? "—"}</bdi></Link>
            {r.anonymizedAt && <span className="rounded-full bg-bg px-2 py-0.5 text-xs font-bold text-body">{d.anonymized}</span>}
          </span>
        ),
      },
      { key: "email", header: d.cols.email, cell: (r) => (r.anonymizedAt ? "—" : <Ref>{r.email}</Ref>) },
      { key: "phone", header: d.cols.phone, cell: (r) => (r.phone ? <bdi dir="ltr" className="num whitespace-nowrap">{r.phone}</bdi> : "—") },
      { key: "type", header: d.cols.type, cell: (r) => d.types[r.donorType] ?? r.donorType },
      { key: "count", header: d.cols.donations, numeric: true, cell: (r) => <span className="num">{formatNumber(r._count.donations, locale)}</span> },
      { key: "created", header: d.cols.created, cell: (r) => <DateText value={r.createdAt} withTime={false} /> },
      {
        key: "act",
        header: t.fin.common.actions,
        cell: (r) => (
          <Link href={href(`/donors/${r.id}`)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-meki-green-dark hover:bg-bg">
            <Eye className="size-4" aria-hidden="true" /> {t.fin.common.viewDetails}
          </Link>
        ),
      },
    ],
    [d, t, href, locale],
  );

  return (
    <>
      <PageHeader title={d.title} subtitle={d.subtitle} />
      <Card labelledBy="dl-t">
        <CardHeader id="dl-t" title={d.title} subtitle={d.countNote} />
        <FilterBar active={active} onClear={clear}>
          <SearchFilter value={f.q} onChange={(v) => set({ q: v })} label={d.filters.search} ltr={false} />
          <SelectFilter
            label={d.filters.sort}
            allLabel={d.filters.newest}
            value={sortKey === "newest" ? "" : sortKey}
            onChange={(v) => set({ sort: v })}
            options={[{ value: "oldest", label: d.filters.oldest }, { value: "name", label: d.filters.name }, { value: "email", label: d.filters.email }]}
          />
          <label className="flex min-h-10 items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="size-4 accent-[var(--color-meki-green)]" checked={f.anonymized === "true"} onChange={(e) => set({ anonymized: e.target.checked ? "true" : "" })} />
            {d.filters.anonymized}
          </label>
        </FilterBar>
        <WidgetState q={list} isEmpty={list.data?.items.length === 0} emptyText={active ? d.emptyFiltered : d.empty} minH="min-h-56">
          {list.data && (
            <>
              <DataTable caption={d.title} rows={list.data.items} columns={columns} rowKey={(r) => r.id} dimmed={list.isPlaceholderData} minW="min-w-[56rem]" />
              <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} onPage={(p) => set({ page: p })} />
            </>
          )}
        </WidgetState>
      </Card>
    </>
  );
}
