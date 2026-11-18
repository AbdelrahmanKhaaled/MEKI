"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Eye, Plus } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { ContentStatusBadge, ProvenanceBadge, Thumb } from "@/components/content/ui";
import { DataTable, DateText, FilterBar, PageHeader, Pagination, Ref, SearchFilter, SelectFilter, type Column } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { FinancePage, useDetailHref, useHref } from "@/features/finance/FinancePage";
import { useProgrammes } from "@/hooks/useContentData";
import { useUrlState } from "@/hooks/useUrlState";
import { cleanQuery } from "@/lib/finance";
import { PROGRAMME_KINDS, PROVENANCES, PUBLICATION_STATUSES, type Programme } from "@/lib/content-schemas";
import { formatNumber } from "@/lib/format";

const KEYS = ["q", "status", "kind", "provenance"] as const;

export function ProgramsListPage() {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.programs }, { label: t.content.programs.title }]} anyOf={["programmes.read"]}>
      <ProgramsList />
    </FinancePage>
  );
}

function ProgramsList() {
  const { locale, t } = useLocale();
  const { can } = useAuth();
  const href = useHref();
  const detail = useDetailHref();
  const x = t.content.programs;
  const c = t.content.common;
  const { values: f, page, set, clear, active } = useUrlState(KEYS);
  const list = useProgrammes({ ...cleanQuery({ search: f.q, status: f.status, kind: f.kind, provenance: f.provenance }), page, pageSize: 20, sort: "sortOrder:asc" });
  const name = (p: Programme) => (locale === "ar" && p.nameAr ? p.nameAr : p.nameEn);

  const columns = useMemo<Column<Programme>[]>(
    () => [
      {
        key: "name",
        header: x.cols.name,
        cell: (p) => (
          <span className="flex items-center gap-3">
            <Thumb media={p.coverMedia} className="size-12" />
            <span className="min-w-0">
              <Link href={detail(`/programs/${p.id}`)} className="font-bold text-ink hover:text-meki-green-dark hover:underline"><bdi>{name(p)}</bdi></Link>
              <span className="block text-xs text-muted">{p.number ? `#${p.number} · ` : ""}<Ref>{p.code}</Ref></span>
            </span>
          </span>
        ),
      },
      { key: "status", header: x.cols.status, cell: (p) => <ContentStatusBadge status={p.status} /> },
      { key: "kind", header: x.cols.kind, cell: (p) => t.content.kinds[p.kind] ?? p.kind },
      { key: "prov", header: x.cols.provenance, cell: (p) => <ProvenanceBadge value={p.provenance} /> },
      { key: "causes", header: x.cols.causes, numeric: true, cell: (p) => <span className="num">{formatNumber(p.projects.length, locale)}</span> },
      { key: "camps", header: x.cols.campaigns, numeric: true, cell: (p) => <span className="num">{formatNumber(p._count.campaigns, locale)}</span> },
      { key: "upd", header: x.cols.updated, cell: (p) => <DateText value={p.updatedAt} withTime={false} /> },
      {
        key: "act",
        header: c.actions,
        cell: (p) => (
          <Link href={detail(`/programs/${p.id}`)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-bold text-meki-green-dark hover:bg-bg">
            <Eye className="size-4" aria-hidden="true" /> {can("programmes.manage") ? c.edit : t.fin.common.view}
          </Link>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- name() depends on locale only
    [x, c, t, detail, locale, can],
  );

  return (
    <>
      <PageHeader
        title={x.title}
        subtitle={x.subtitle}
        right={can("programmes.manage") ? <Link href={href("/programs/new")} className="btn-admin btn-primary"><Plus className="size-4" aria-hidden="true" /> {x.newTitle}</Link> : undefined}
      />
      <Card labelledBy="pl-t">
        <CardHeader id="pl-t" title={x.title} />
        <FilterBar active={active} onClear={clear}>
          <SearchFilter value={f.q} onChange={(v) => set({ q: v })} label={x.search} ltr={false} />
          <SelectFilter label={c.status} allLabel={c.anyStatus} value={f.status} onChange={(v) => set({ status: v })} options={PUBLICATION_STATUSES.map((s) => ({ value: s, label: t.content.statuses[s] }))} />
          <SelectFilter label={c.kind} allLabel={c.anyKind} value={f.kind} onChange={(v) => set({ kind: v })} options={PROGRAMME_KINDS.map((k) => ({ value: k, label: t.content.kinds[k] }))} />
          <SelectFilter label={c.provenance} allLabel={c.anyProvenance} value={f.provenance} onChange={(v) => set({ provenance: v })} options={PROVENANCES.map((p) => ({ value: p, label: t.content.provenance[p] }))} />
        </FilterBar>
        <WidgetState q={list} isEmpty={list.data?.items.length === 0} emptyText={active ? x.emptyFiltered : x.empty} minH="min-h-56">
          {list.data && (
            <>
              <DataTable caption={x.title} rows={list.data.items} columns={columns} rowKey={(p) => p.id} dimmed={list.isPlaceholderData} />
              <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} onPage={(p) => set({ page: p })} />
            </>
          )}
        </WidgetState>
      </Card>
    </>
  );
}
