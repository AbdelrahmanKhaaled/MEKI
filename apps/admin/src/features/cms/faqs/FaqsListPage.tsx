"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, ListOrdered, Plus } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { ContentStatusBadge, ProvenanceBadge, useContentError } from "@/components/content/ui";
import { DataTable, DateText, FilterBar, PageHeader, Pagination, SearchFilter, SelectFilter, type Column } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { FinancePage, useDetailHref, useHref } from "@/features/finance/FinancePage";
import { useCmsMutation, useFaqs } from "@/hooks/useCmsData";
import { useUrlState } from "@/hooks/useUrlState";
import { faqCategories } from "@/lib/cms";
import type { Faq } from "@/lib/cms-schemas";
import { PUBLICATION_STATUSES } from "@/lib/content-schemas";
import { clampPage, cleanQuery } from "@/lib/finance";
import * as svc from "@/services/cms";

const KEYS = ["q", "status", "category", "lang"] as const;
const PAGE_SIZE = 20;

export function FaqsListPage() {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.website }, { label: t.cms.faqs.title }]} anyOf={["faq.read"]}>
      <FaqsList />
    </FinancePage>
  );
}

const faqLang = (f: { questionAr: string | null; answerAr: string | null }) => (f.questionAr?.trim() && f.answerAr?.trim() ? "both" : "enOnly");

function FaqsList() {
  const { locale, t } = useLocale();
  const { can } = useAuth();
  const href = useHref();
  const detail = useDetailHref();
  const errText = useContentError();
  const x = t.cms.faqs;
  const c = t.cms.common;
  const { values: f, page, set, clear, active } = useUrlState(KEYS);
  // FAQs are few: the API's maximum page (100) holds them all, so the language filter and ordering work on the full list.
  const q = useFaqs({ ...cleanQuery({ search: f.q, status: f.status, category: f.category }), pageSize: 100, sort: "sortOrder:asc" });
  const all = useFaqs({ pageSize: 100 }); // category options = categories that exist
  const [order, setOrder] = useState<Faq[] | null>(null);
  const reorder = useCmsMutation((ids: string[]) => svc.reorderFaqs(ids));
  const rows = (q.data?.items ?? []).filter((x2) => !f.lang || faqLang(x2) === f.lang);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = clampPage(page, pages);
  const canOrder = can("faq.manage") && active === 0 && (q.data?.total ?? 0) <= 100;

  const columns = useMemo<Column<Faq>[]>(
    () => [
      { key: "q", header: x.cols.question, cell: (r) => <Link href={detail(`/faqs/${r.id}`)} className="font-bold text-ink hover:text-meki-green-dark hover:underline"><bdi>{locale === "ar" && r.questionAr ? r.questionAr : r.questionEn}</bdi></Link> },
      { key: "cat", header: x.cols.category, cell: (r) => <bdi dir="ltr" className="text-xs">{r.category}</bdi> },
      { key: "lang", header: x.cols.languages, cell: (r) => <span className={`text-xs font-bold ${faqLang(r) === "both" ? "text-ok" : "text-warn"}`}>{c[faqLang(r)]}</span> },
      { key: "st", header: x.cols.status, cell: (r) => <span className="inline-flex flex-wrap gap-1"><ContentStatusBadge status={r.status} /><ProvenanceBadge value={r.provenance} /></span> },
      { key: "ord", header: x.cols.order, numeric: true, cell: (r) => <span className="num">{r.sortOrder}</span> },
      { key: "upd", header: x.cols.updated, cell: (r) => <DateText value={r.updatedAt} withTime={false} /> },
      { key: "act", header: t.content.common.actions, cell: (r) => <Link href={detail(`/faqs/${r.id}`)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-bold text-meki-green-dark hover:bg-bg"><Eye className="size-4" aria-hidden="true" /> {can("faq.manage") ? t.content.common.edit : t.fin.common.view}</Link> },
    ],
    [x, c, t, locale, can, detail],
  );

  return (
    <>
      <PageHeader
        title={x.title}
        subtitle={x.subtitle}
        right={
          <>
            {canOrder && !order && <button type="button" className="btn-admin btn-ghost" onClick={() => setOrder(rows)}><ListOrdered className="size-4" aria-hidden="true" /> {x.reorder}</button>}
            {can("faq.manage") && <Link href={href("/faqs/new")} className="btn-admin btn-primary"><Plus className="size-4" aria-hidden="true" /> {x.newTitle}</Link>}
          </>
        }
      />
      {order ? (
        <Card labelledBy="fo-t">
          <CardHeader
            id="fo-t"
            title={x.order}
            right={
              <span className="flex gap-2">
                <button type="button" className="btn-admin btn-ghost" onClick={() => { reorder.reset(); setOrder(null); }}>{t.content.common.discard}</button>
                <button type="button" className="btn-admin btn-primary" disabled={reorder.isPending} onClick={() => reorder.mutate(order.map((o) => o.id), { onSuccess: () => setOrder(null) })}>{x.saveOrder}</button>
              </span>
            }
          />
          {reorder.isError && <p className="mb-2 text-sm text-danger" role="alert">{errText(reorder.error)}</p>}
          <ol className="space-y-2" data-testid="faq-order">
            {order.map((o, i) => (
              <li key={o.id} className="flex items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm">
                <span className="min-w-0 truncate"><span className="num me-2 text-xs text-muted">{i + 1}</span><bdi>{locale === "ar" && o.questionAr ? o.questionAr : o.questionEn}</bdi></span>
                <span className="flex shrink-0 gap-1">
                  <button type="button" className="rounded p-1 hover:bg-bg disabled:opacity-30" disabled={i === 0} onClick={() => setOrder((a) => { const b = [...a!]; [b[i - 1], b[i]] = [b[i], b[i - 1]]; return b; })} aria-label={c.moveUp}><ArrowUp className="size-4" aria-hidden="true" /></button>
                  <button type="button" className="rounded p-1 hover:bg-bg disabled:opacity-30" disabled={i === order.length - 1} onClick={() => setOrder((a) => { const b = [...a!]; [b[i + 1], b[i]] = [b[i], b[i + 1]]; return b; })} aria-label={c.moveDown}><ArrowDown className="size-4" aria-hidden="true" /></button>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      ) : (
        <Card labelledBy="fl-t">
          <CardHeader id="fl-t" title={x.title} />
          {reorder.isSuccess && <p className="mb-3 text-sm text-ok" role="status">{x.orderSaved}</p>}
          <FilterBar active={active} onClear={clear}>
            <SearchFilter value={f.q} onChange={(v) => set({ q: v })} label={x.search} ltr={false} />
            <SelectFilter label={x.category} allLabel={x.allCategories} value={f.category} onChange={(v) => set({ category: v })} options={faqCategories(all.data?.items ?? []).map((k) => ({ value: k, label: k }))} />
            <SelectFilter label={t.content.common.status} allLabel={t.content.common.anyStatus} value={f.status} onChange={(v) => set({ status: v })} options={PUBLICATION_STATUSES.filter((s) => s !== "IN_REVIEW").map((s) => ({ value: s, label: t.content.statuses[s] }))} />
            <SelectFilter label={t.cms.pages.language} allLabel={t.cms.pages.allLanguages} value={f.lang} onChange={(v) => set({ lang: v })} options={[{ value: "both", label: c.both }, { value: "enOnly", label: c.missingAr }]} />
          </FilterBar>
          <WidgetState q={q} isEmpty={rows.length === 0} emptyText={active ? x.emptyFiltered : x.empty} minH="min-h-48">
            <DataTable caption={x.title} rows={rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)} columns={columns} rowKey={(r) => r.id} dimmed={q.isPlaceholderData} />
            <Pagination page={current} totalPages={pages} total={rows.length} onPage={(p) => set({ page: p })} />
          </WidgetState>
        </Card>
      )}
    </>
  );
}
