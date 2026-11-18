"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Eye, Plus } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { ContentStatusBadge, ProvenanceBadge } from "@/components/content/ui";
import { DataTable, FilterBar, Notice, PageHeader, Pagination, Ref, SearchFilter, SelectFilter, type Column } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { FinancePage, useDetailHref, useHref } from "@/features/finance/FinancePage";
import { useCauses, useProgrammeOptions } from "@/hooks/useContentData";
import { useUrlState } from "@/hooks/useUrlState";
import { cleanQuery, clampPage } from "@/lib/finance";
import { PROVENANCES, type Project } from "@/lib/content-schemas";
import { formatNumber } from "@/lib/format";

const KEYS = ["q", "programmeId", "provenance"] as const;
const PAGE_SIZE = 20;

/** "Causes" = the API's projects (Programme → Cause → Campaign). */
export function CausesListPage() {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.programs }, { label: t.content.causes.title }]} anyOf={["programmes.read"]}>
      <CausesList />
    </FinancePage>
  );
}

function CausesList() {
  const { locale, t } = useLocale();
  const { can } = useAuth();
  const href = useHref();
  const detail = useDetailHref();
  const x = t.content.causes;
  const c = t.content.common;
  const { values: f, page, set, clear, active } = useUrlState(KEYS);
  // GET /admin/projects is not paginated by the API: filters run on the server, pagination happens here.
  const list = useCauses(cleanQuery({ search: f.q, programmeId: f.programmeId, provenance: f.provenance }));
  const programmes = useProgrammeOptions();
  const items = list.data ?? [];
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = clampPage(page, pages);
  const rows = items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const label = (n: { nameEn: string; nameAr?: string | null }) => (locale === "ar" && n.nameAr ? n.nameAr : n.nameEn);

  const columns = useMemo<Column<Project>[]>(
    () => [
      {
        key: "name",
        header: x.cols.name,
        cell: (p) => (
          <span className="min-w-0">
            <Link href={detail(`/causes/${p.id}`)} className="font-bold text-ink hover:text-meki-green-dark hover:underline"><bdi>{label(p)}</bdi></Link>
            <span className="block text-xs text-muted"><Ref>{p.code}</Ref></span>
          </span>
        ),
      },
      {
        key: "prog",
        header: x.cols.program,
        cell: (p) =>
          p.programme ? (
            <span className="inline-flex flex-col items-start gap-1">
              <Link href={href(`/programs/${p.programme.id}`)} className="hover:underline"><bdi>{label(p.programme)}</bdi></Link>
              {p.programme.status && p.programme.status !== "PUBLISHED" && <ContentStatusBadge status={p.programme.status} />}
            </span>
          ) : (
            "—"
          ),
      },
      { key: "camps", header: x.cols.campaigns, numeric: true, cell: (p) => <span className="num">{formatNumber(p._count?.campaigns ?? 0, locale)}</span> },
      { key: "loc", header: x.cols.location, cell: (p) => <bdi>{(locale === "ar" && p.locationAr) || p.locationEn || "—"}</bdi> },
      { key: "prov", header: x.cols.provenance, cell: (p) => <ProvenanceBadge value={p.provenance} /> },
      { key: "st", header: x.cols.status, cell: (p) => <ContentStatusBadge status={p.status} /> },
      { key: "act", header: c.actions, cell: (p) => <Link href={detail(`/causes/${p.id}`)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-bold text-meki-green-dark hover:bg-bg"><Eye className="size-4" aria-hidden="true" /> {can("programmes.manage") ? c.edit : t.fin.common.view}</Link> },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- label() depends on locale only
    [x, c, t, detail, href, locale, can],
  );

  return (
    <>
      <PageHeader
        title={x.title}
        subtitle={x.subtitle}
        right={can("programmes.manage") ? <Link href={href(`/causes/new${f.programmeId ? `?programmeId=${f.programmeId}` : ""}`)} className="btn-admin btn-primary"><Plus className="size-4" aria-hidden="true" /> {x.newTitle}</Link> : undefined}
      />
      <Notice>{x.statusNote}</Notice>
      <Card labelledBy="cl-t">
        <CardHeader id="cl-t" title={x.title} />
        <FilterBar active={active} onClear={clear}>
          <SearchFilter value={f.q} onChange={(v) => set({ q: v })} label={x.search} ltr={false} />
          <SelectFilter label={x.program} allLabel={x.allPrograms} value={f.programmeId} onChange={(v) => set({ programmeId: v })} options={(programmes.data?.items ?? []).map((p) => ({ value: p.id, label: label(p) }))} />
          <SelectFilter label={c.provenance} allLabel={c.anyProvenance} value={f.provenance} onChange={(v) => set({ provenance: v })} options={PROVENANCES.map((p) => ({ value: p, label: t.content.provenance[p] }))} />
        </FilterBar>
        <WidgetState q={list} isEmpty={items.length === 0} emptyText={active ? x.emptyFiltered : x.empty} minH="min-h-56">
          <DataTable caption={x.title} rows={rows} columns={columns} rowKey={(p) => p.id} dimmed={list.isPlaceholderData} />
          <Pagination page={current} totalPages={pages} total={items.length} onPage={(p) => set({ page: p })} />
        </WidgetState>
      </Card>
    </>
  );
}
