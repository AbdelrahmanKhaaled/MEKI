"use client";

import { useMemo } from "react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { DataTable, DateText, FilterBar, PageHeader, Pagination, Ref, SelectFilter, type Column } from "@/components/finance/ui";
import { useBackHref } from "@/features/finance/FinancePage";
import { useCheckInHistory } from "@/hooks/useGalaData";
import { useUrlState } from "@/hooks/useUrlState";
import { galaTone } from "@/lib/gala";
import type { GalaEvent, HistoryRow } from "@/lib/gala-schemas";
import { GalaPage } from "../shared";

const KEYS = ["kind"] as const;
const TONE: Record<string, string> = { ok: "text-ok", warn: "text-warn", danger: "text-danger", info: "text-info", neutral: "text-body" };

export function CheckInHistoryPage() {
  const { t } = useLocale();
  return (
    <GalaPage crumbs={[{ label: t.gala.checkin.title }, { label: t.gala.history.title }]} anyOf={["gala.checkin.validate"]}>
      {(ev) => <History ev={ev} />}
    </GalaPage>
  );
}

function History({ ev }: { ev: GalaEvent }) {
  const { t } = useLocale();
  const back = useBackHref("/gala/check-in");
  const x = t.gala.history;
  const { values: f, page, set, clear, active } = useUrlState(KEYS);
  const q = useCheckInHistory(ev.id, { kind: f.kind || undefined, page, pageSize: 50 }, true);
  const rows = q.data?.items ?? [];
  const columns = useMemo<Column<HistoryRow>[]>(
    () => [
      { key: "at", header: x.cols.at, cell: (r) => <DateText value={r.at} /> },
      { key: "kind", header: x.cols.kind, cell: (r) => x.kinds[r.kind] ?? r.kind },
      { key: "result", header: x.cols.result, cell: (r) => <span className={`font-bold ${r.result === "UNDONE" ? "text-body" : TONE[galaTone("checkin", r.result)]}`} data-result={r.result}>{r.result === "UNDONE" ? x.undone : t.gala.statuses.checkin[r.result] ?? r.result}</span> },
      { key: "ticket", header: x.cols.ticket, cell: (r) => (r.ticketNumber ? <Ref>{r.ticketNumber}</Ref> : "—") },
      { key: "by", header: x.cols.by, cell: (r) => <bdi>{r.actorName ?? "—"}</bdi> },
    ],
    [x, t],
  );
  return (
    <>
      <PageHeader back={{ href: back, label: t.gala.checkin.title }} title={x.title} subtitle={x.subtitle} />
      <Card labelledBy="hi-t">
        <CardHeader id="hi-t" title={x.title} />
        <FilterBar active={active} onClear={clear}>
          <SelectFilter label={x.kindFilter} allLabel={t.content.common.anyStatus} value={f.kind} onChange={(v) => set({ kind: v })} options={Object.entries(x.kinds).map(([value, label]) => ({ value, label }))} />
        </FilterBar>
        <WidgetState q={q} isEmpty={rows.length === 0} emptyText={x.empty} minH="min-h-48">
          <DataTable caption={x.title} rows={rows} columns={columns} rowKey={(r) => r.id} dimmed={q.isPlaceholderData} minW="min-w-[48rem]" />
          <Pagination page={q.data?.page ?? 1} totalPages={q.data?.totalPages ?? 1} total={q.data?.total ?? 0} onPage={(p) => set({ page: p })} />
        </WidgetState>
      </Card>
    </>
  );
}
