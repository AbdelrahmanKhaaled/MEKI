"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LayoutGrid, List, Upload } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { Uploader } from "@/components/content/media";
import { ProvenanceBadge, Thumb } from "@/components/content/ui";
import { DataTable, DateText, FilterBar, PageHeader, Pagination, SearchFilter, SelectFilter, type Column } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { FinancePage, useDetailHref } from "@/features/finance/FinancePage";
import { useMediaList } from "@/hooks/useContentData";
import { useUrlState } from "@/hooks/useUrlState";
import { formatBytes } from "@/lib/content";
import { CONSENT_STATUSES, MEDIA_CATEGORIES, PROVENANCES, type Media } from "@/lib/content-schemas";
import { cleanQuery } from "@/lib/finance";

const KEYS = ["q", "category", "provenance", "consent", "view"] as const;

export function MediaLibraryPage() {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.website }, { label: t.content.media.title }]} anyOf={["media.read"]}>
      <Library />
    </FinancePage>
  );
}

function Library() {
  const { t } = useLocale();
  const { can } = useAuth();
  const detail = useDetailHref();
  const x = t.content.media;
  const c = t.content.common;
  const { values: f, page, set, active } = useUrlState(KEYS);
  const [uploading, setUploading] = useState(false);
  const view = f.view === "list" ? "list" : "grid";
  const list = useMediaList({ ...cleanQuery({ search: f.q, category: f.category, provenance: f.provenance, consentStatus: f.consent }), page, pageSize: 24, sort: "createdAt:desc" });
  const name = (m: Media) => m.originalName ?? m.code ?? m.storageKey;

  const columns = useMemo<Column<Media>[]>(
    () => [
      { key: "prev", header: x.cols.preview, cell: (m) => <Link href={detail(`/media/${m.id}`)}><Thumb media={m} className="size-14" /></Link> },
      { key: "name", header: x.cols.name, cell: (m) => <Link href={detail(`/media/${m.id}`)} className="font-bold text-ink hover:text-meki-green-dark hover:underline"><bdi className="break-all">{name(m)}</bdi></Link> },
      { key: "cat", header: x.cols.category, cell: (m) => t.content.categories[m.category] ?? m.category },
      { key: "prov", header: x.cols.provenance, cell: (m) => <ProvenanceBadge value={m.provenance} /> },
      { key: "cons", header: x.cols.consent, cell: (m) => t.content.consent[m.consentStatus] ?? m.consentStatus },
      { key: "size", header: x.cols.size, numeric: true, cell: (m) => <span className="num">{formatBytes(m.sizeBytes)}</span> },
      { key: "date", header: x.cols.created, cell: (m) => <DateText value={m.createdAt} withTime={false} /> },
    ],
    [x, t, detail],
  );

  return (
    <>
      <PageHeader
        title={x.title}
        subtitle={x.subtitle}
        right={can("media.upload") ? <button type="button" className="btn-admin btn-primary" aria-expanded={uploading} onClick={() => setUploading((u) => !u)}><Upload className="size-4" aria-hidden="true" /> {x.upload}</button> : undefined}
      />
      {uploading && can("media.upload") && (
        <Card labelledBy="up-t">
          <CardHeader id="up-t" title={x.upload} />
          <Uploader />
        </Card>
      )}
      <Card labelledBy="ml-t">
        <CardHeader
          id="ml-t"
          title={x.title}
          right={
            <div className="flex rounded-xl border border-line p-1" role="group" aria-label={`${x.grid} / ${x.list}`}>
              <button type="button" aria-pressed={view === "grid"} onClick={() => set({ view: "" })} className={`rounded-lg p-1.5 ${view === "grid" ? "bg-deep-green text-white" : "text-body hover:bg-bg"}`} title={x.grid}><LayoutGrid className="size-4" aria-label={x.grid} /></button>
              <button type="button" aria-pressed={view === "list"} onClick={() => set({ view: "list" })} className={`rounded-lg p-1.5 ${view === "list" ? "bg-deep-green text-white" : "text-body hover:bg-bg"}`} title={x.list}><List className="size-4" aria-label={x.list} /></button>
            </div>
          }
        />
        <FilterBar active={active - (f.view ? 1 : 0)} onClear={() => set({ q: "", category: "", provenance: "", consent: "" })}>
          <SearchFilter value={f.q} onChange={(v) => set({ q: v })} label={x.search} ltr={false} />
          <SelectFilter label={x.category} allLabel={c.all} value={f.category} onChange={(v) => set({ category: v })} options={MEDIA_CATEGORIES.map((k) => ({ value: k, label: t.content.categories[k] }))} />
          <SelectFilter label={c.provenance} allLabel={c.anyProvenance} value={f.provenance} onChange={(v) => set({ provenance: v })} options={PROVENANCES.map((p) => ({ value: p, label: t.content.provenance[p] }))} />
          <SelectFilter label={x.consent} allLabel={c.all} value={f.consent} onChange={(v) => set({ consent: v })} options={CONSENT_STATUSES.map((k) => ({ value: k, label: t.content.consent[k] }))} />
        </FilterBar>
        <WidgetState q={list} isEmpty={list.data?.items.length === 0} emptyText={active - (f.view ? 1 : 0) ? x.emptyFiltered : x.empty} minH="min-h-56">
          {list.data && (
            <>
              {view === "list" ? (
                <DataTable caption={x.title} rows={list.data.items} columns={columns} rowKey={(m) => m.id} dimmed={list.isPlaceholderData} minW="min-w-[56rem]" />
              ) : (
                <ul className={`grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 ${list.isPlaceholderData ? "opacity-60" : ""}`} aria-label={x.title}>
                  {list.data.items.map((m) => (
                    <li key={m.id} className="min-w-0">
                      <Link href={detail(`/media/${m.id}`)} className="group block rounded-xl border border-line p-2 transition hover:border-meki-green hover:shadow-[var(--shadow-card)]">
                        <Thumb media={m} className="aspect-[4/3] w-full" />
                        <p className="mt-2 truncate text-xs font-bold text-ink" title={name(m)}><bdi>{name(m)}</bdi></p>
                        <div className="mt-1 flex flex-wrap items-center justify-between gap-1">
                          <ProvenanceBadge value={m.provenance} />
                          <span className="num text-[0.7rem] text-muted">{formatBytes(m.sizeBytes)}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} onPage={(p) => set({ page: p })} />
            </>
          )}
        </WidgetState>
      </Card>
    </>
  );
}
