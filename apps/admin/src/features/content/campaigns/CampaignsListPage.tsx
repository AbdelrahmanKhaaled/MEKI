"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Eye, Plus } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { ContentStatusBadge, ProvenanceBadge, Thumb } from "@/components/content/ui";
import { DataTable, DateRangeFilter, DateText, FilterBar, Money, PageHeader, Pagination, Ref, SearchFilter, SelectFilter, type Column } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { FinancePage, useDetailHref, useHref } from "@/features/finance/FinancePage";
import { useCampaigns, useCauses, useProgrammeOptions, useTotalsBySlug } from "@/hooks/useContentData";
import { useUrlState } from "@/hooks/useUrlState";
import { cleanQuery, dayRange } from "@/lib/finance";
import { CAMPAIGN_STATUSES, PROVENANCES, type Campaign } from "@/lib/content-schemas";
import { fill } from "@/lib/i18n";

const KEYS = ["q", "status", "programmeId", "projectId", "provenance", "from", "to"] as const;

export function CampaignsListPage() {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.programs }, { label: t.content.campaigns.title }]} anyOf={["campaigns.read"]}>
      <CampaignsList />
    </FinancePage>
  );
}

/** Collected = net of verified, non-test donations per currency (by-campaign report). Currencies are never combined. */
function useCollected(enabled: boolean) {
  const q = useTotalsBySlug(enabled);
  return useMemo(() => {
    const by = new Map<string, { currency: string; net: string }[]>();
    for (const r of q.data ?? []) if (r.designation === "CAMPAIGN" && r.campaign) by.set(r.campaign.slug, [...(by.get(r.campaign.slug) ?? []), { currency: r.currency, net: r.net }]);
    return { by, ready: q.isSuccess };
  }, [q.data, q.isSuccess]);
}

function CampaignsList() {
  const { locale, t } = useLocale();
  const { can } = useAuth();
  const href = useHref();
  const detail = useDetailHref();
  const x = t.content.campaigns;
  const c = t.content.common;
  const { values: f, page, set, clear, active } = useUrlState(KEYS);
  const range = dayRange(f.from, f.to);
  const list = useCampaigns({ ...cleanQuery({ search: f.q, status: f.status, programmeId: f.programmeId, projectId: f.projectId, provenance: f.provenance, startsFrom: range?.from, startsTo: range?.to }), page, pageSize: 20, sort: "updatedAt:desc" }, range !== null);
  const programmes = useProgrammeOptions(can("programmes.read"));
  const causes = useCauses(cleanQuery({ programmeId: f.programmeId }), can("programmes.read"));
  const canReports = can("reports.read");
  const collected = useCollected(canReports);
  const label = (n: { nameEn: string; nameAr?: string | null }) => (locale === "ar" && n.nameAr ? n.nameAr : n.nameEn);
  const title = (cp: Campaign) => (locale === "ar" && cp.titleAr ? cp.titleAr : cp.titleEn);

  const columns = useMemo<Column<Campaign>[]>(
    () => [
      {
        key: "title",
        header: x.cols.title,
        cell: (cp) => (
          <span className="flex items-center gap-3">
            <Thumb media={cp.coverMedia} className="size-12" />
            <span className="min-w-0">
              <Link href={detail(`/campaigns/${cp.id}`)} className="font-bold text-ink hover:text-meki-green-dark hover:underline"><bdi>{title(cp)}</bdi></Link>
              <span className="block text-xs text-muted"><Ref>{cp.code}</Ref></span>
            </span>
          </span>
        ),
      },
      { key: "prog", header: x.cols.program, cell: (cp) => (cp.programme ? <bdi>{label(cp.programme)}</bdi> : "—") },
      { key: "cause", header: x.cols.cause, cell: (cp) => (cp.project ? <bdi>{label(cp.project)}</bdi> : "—") },
      { key: "target", header: x.cols.target, numeric: true, cell: (cp) => (cp.targetAmount ? <Money value={cp.targetAmount} currency={cp.currency} className="font-bold" /> : <span className="text-xs text-muted">{x.noTarget}</span>) },
      {
        key: "coll",
        header: x.cols.collected,
        numeric: true,
        cell: (cp) => {
          if (!canReports) return <span className="text-xs text-muted">{x.collectedNA}</span>;
          if (!collected.ready) return "…";
          const rows = collected.by.get(cp.slug) ?? [];
          const own = rows.find((r) => r.currency === cp.currency);
          const others = rows.filter((r) => r.currency !== cp.currency).length;
          return (
            <span className="inline-flex flex-col items-end">
              <Money value={own?.net ?? "0"} currency={cp.currency} />
              {others > 0 && <span className="text-xs text-muted">{fill(x.otherCurrencies, { n: others })}</span>}
            </span>
          );
        },
      },
      {
        key: "status",
        header: x.cols.status,
        cell: (cp) => (
          <span className="inline-flex flex-col items-start gap-1">
            <ContentStatusBadge status={cp.status} />
            {cp.donationsOpen && <span className="rounded-full bg-ok/10 px-2 py-0.5 text-xs font-bold text-ok">{x.donationsOpen}</span>}
          </span>
        ),
      },
      { key: "prov", header: x.cols.provenance, cell: (cp) => <ProvenanceBadge value={cp.provenance} /> },
      { key: "dates", header: x.cols.dates, cell: (cp) => (cp.startsAt || cp.endsAt ? <span className="text-xs"><DateText value={cp.startsAt} withTime={false} /> – <DateText value={cp.endsAt} withTime={false} /></span> : "—") },
      { key: "appr", header: x.cols.approval, cell: (cp) => <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${cp.approvedAt ? "bg-ok/10 text-ok" : "bg-bg text-body"}`}>{cp.approvedAt ? x.approved : x.notApproved}</span> },
      { key: "act", header: c.actions, cell: (cp) => <Link href={detail(`/campaigns/${cp.id}`)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-bold text-meki-green-dark hover:bg-bg"><Eye className="size-4" aria-hidden="true" /> {can("campaigns.manage") ? c.edit : t.fin.common.view}</Link> },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- label()/title() depend on locale only
    [x, c, t, detail, locale, can, canReports, collected],
  );

  return (
    <>
      <PageHeader title={x.title} subtitle={x.subtitle} right={can("campaigns.manage") ? <Link href={href("/campaigns/new")} className="btn-admin btn-primary"><Plus className="size-4" aria-hidden="true" /> {x.newTitle}</Link> : undefined} />
      <Card labelledBy="cpl-t">
        <CardHeader id="cpl-t" title={x.title} />
        <FilterBar active={active} onClear={clear}>
          <SearchFilter value={f.q} onChange={(v) => set({ q: v })} label={x.search} ltr={false} />
          <SelectFilter label={c.status} allLabel={c.anyStatus} value={f.status} onChange={(v) => set({ status: v })} options={CAMPAIGN_STATUSES.map((s) => ({ value: s, label: t.content.statuses[s] }))} />
          {can("programmes.read") && (
            <>
              <SelectFilter label={x.program} allLabel={x.allPrograms} value={f.programmeId} onChange={(v) => set({ programmeId: v, projectId: "" })} options={(programmes.data?.items ?? []).map((p) => ({ value: p.id, label: label(p) }))} />
              <SelectFilter label={x.cause} allLabel={x.allCauses} value={f.projectId} onChange={(v) => set({ projectId: v })} options={(causes.data ?? []).map((p) => ({ value: p.id, label: label(p) }))} />
            </>
          )}
          <SelectFilter label={c.provenance} allLabel={c.anyProvenance} value={f.provenance} onChange={(v) => set({ provenance: v })} options={PROVENANCES.map((p) => ({ value: p, label: t.content.provenance[p] }))} />
          <DateRangeFilter label={x.starts} from={f.from} to={f.to} invalid={range === null} onChange={(patch) => set(patch)} />
        </FilterBar>
        <WidgetState q={list} unavailable={range === null ? { text: t.fin.common.invalidRange } : false} isEmpty={list.data?.items.length === 0} emptyText={active ? x.emptyFiltered : x.empty} minH="min-h-56">
          {list.data && (
            <>
              <DataTable caption={x.title} rows={list.data.items} columns={columns} rowKey={(cp) => cp.id} dimmed={list.isPlaceholderData} minW="min-w-[78rem]" />
              <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} onPage={(p) => set({ page: p })} />
            </>
          )}
        </WidgetState>
      </Card>
    </>
  );
}
