"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Eye, Plus } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { ContentStatusBadge, ProvenanceBadge } from "@/components/content/ui";
import { DataTable, DateText, FilterBar, PageHeader, Pagination, Ref, SearchFilter, SelectFilter, type Column } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { FinancePage, useDetailHref, useHref } from "@/features/finance/FinancePage";
import { usePages } from "@/hooks/useCmsData";
import { useUrlState } from "@/hooks/useUrlState";
import { PUBLICATION_STATUSES } from "@/lib/content-schemas";
import type { PageRow } from "@/lib/cms-schemas";
import { clampPage } from "@/lib/finance";

const KEYS = ["q", "status", "lang"] as const;
const PAGE_SIZE = 20;

export function PagesListPage() {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.website }, { label: t.cms.pages.title }]} anyOf={["content.read"]}>
      <PagesList />
    </FinancePage>
  );
}

/** Pages are bilingual records (one row, English + Arabic fields); "language" = which versions have a title. */
export const pageLanguages = (p: { titleAr: string | null }) => (p.titleAr?.trim() ? "both" : "enOnly");

function PagesList() {
  const { locale, t } = useLocale();
  const { can } = useAuth();
  const href = useHref();
  const detail = useDetailHref();
  const x = t.cms.pages;
  const c = t.cms.common;
  const { values: f, page, set, clear, active } = useUrlState(KEYS);
  const q = usePages();
  // GET /admin/cms/pages is not paginated: filters and pagination run here. Order: homepage, site pages, then event landing
  // pages (one per event — there can be many, and they are managed in Events).
  const rank = (p: PageRow) => (p.slug === "home" ? 0 : p.isEventPage ? 2 : 1);
  const rows = (q.data ?? [])
    .filter((p) => {
      const s = f.q.trim().toLowerCase();
      return (!s || p.slug.includes(s) || p.titleEn.toLowerCase().includes(s) || (p.titleAr ?? "").includes(s)) && (!f.status || p.status === f.status) && (!f.lang || pageLanguages(p) === f.lang);
    })
    .sort((a, b) => rank(a) - rank(b) || a.slug.localeCompare(b.slug));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = clampPage(page, pages);
  const editHref = (p: PageRow) => (p.slug === "home" ? href("/homepage") : p.isEventPage ? null : detail(`/pages/${p.slug}`));

  const columns = useMemo<Column<PageRow>[]>(
    () => [
      {
        key: "title",
        header: x.cols.title,
        cell: (p) => {
          const h = editHref(p);
          const name = locale === "ar" && p.titleAr ? p.titleAr : p.titleEn;
          return (
            <span className="min-w-0">
              {h ? <Link href={h} className="font-bold text-ink hover:text-meki-green-dark hover:underline"><bdi>{name}</bdi></Link> : <bdi className="font-bold text-ink">{name}</bdi>}
              {(p.slug === "home" || p.isEventPage) && <span className="block text-xs text-muted">{p.slug === "home" ? x.homeNote : x.eventNote}</span>}
            </span>
          );
        },
      },
      { key: "slug", header: x.cols.slug, cell: (p) => <Ref>/{p.slug === "home" ? "" : p.slug}</Ref> },
      { key: "lang", header: x.cols.languages, cell: (p) => <span className={`text-xs font-bold ${pageLanguages(p) === "both" ? "text-ok" : "text-warn"}`}>{c[pageLanguages(p)]}</span> },
      { key: "status", header: x.cols.status, cell: (p) => <ContentStatusBadge status={p.status} /> },
      { key: "prov", header: x.cols.provenance, cell: (p) => <ProvenanceBadge value={p.provenance} /> },
      { key: "blocks", header: x.cols.blocks, numeric: true, cell: (p) => <span className="num">{p._count.sections}</span> },
      { key: "upd", header: x.cols.updated, cell: (p) => <DateText value={p.updatedAt} /> },
      { key: "by", header: x.cols.by, cell: (p) => (p.updatedByName ? <bdi>{p.updatedByName}</bdi> : "—") },
      {
        key: "act",
        header: t.content.common.actions,
        cell: (p) => {
          const h = editHref(p);
          return h ? <Link href={h} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-bold text-meki-green-dark hover:bg-bg"><Eye className="size-4" aria-hidden="true" /> {can("content.manage") ? t.content.common.edit : t.fin.common.view}</Link> : <span className="text-xs text-muted">{x.event}</span>;
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editHref depends on href/detail only
    [x, c, t, locale, can, href, detail],
  );

  return (
    <>
      <PageHeader title={x.title} subtitle={x.subtitle} right={can("content.manage") ? <Link href={href("/pages/new")} className="btn-admin btn-primary"><Plus className="size-4" aria-hidden="true" /> {x.newTitle}</Link> : undefined} />
      <Card labelledBy="pg-t">
        <CardHeader id="pg-t" title={x.title} />
        <FilterBar active={active} onClear={clear}>
          <SearchFilter value={f.q} onChange={(v) => set({ q: v })} label={x.search} ltr={false} />
          <SelectFilter label={t.content.common.status} allLabel={t.content.common.anyStatus} value={f.status} onChange={(v) => set({ status: v })} options={PUBLICATION_STATUSES.map((s) => ({ value: s, label: t.content.statuses[s] }))} />
          <SelectFilter label={x.language} allLabel={x.allLanguages} value={f.lang} onChange={(v) => set({ lang: v })} options={[{ value: "both", label: c.both }, { value: "enOnly", label: c.missingAr }]} />
        </FilterBar>
        <WidgetState q={q} isEmpty={rows.length === 0} emptyText={active ? x.emptyFiltered : x.empty} minH="min-h-48">
          <DataTable caption={x.title} rows={rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)} columns={columns} rowKey={(p) => p.id} />
          <Pagination page={current} totalPages={pages} total={rows.length} onPage={(p) => set({ page: p })} />
        </WidgetState>
      </Card>
    </>
  );
}
