"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { DataTable, DateText, FilterBar, Notice, PageHeader, Pagination, Ref, SearchFilter, type Column } from "@/components/finance/ui";
import { FinancePage } from "@/features/finance/FinancePage";
import { useUrlState } from "@/hooks/useUrlState";
import { cleanQuery } from "@/lib/finance";
import { fill } from "@/lib/i18n";
import type { Attendee } from "@/lib/sdi-schemas";
import * as svc from "@/services/sdi";
import { SyntheticBadge } from "./shared";

const KEYS = ["q"] as const;

/**
 * Phase 12 — latest APPROVED SDI attendee list. Restricted (gala.guests.read), read-only, operational only: it is not proof of
 * payment, it never creates MEKI tickets or QR codes (Zeffy issues and checks those), and nothing here can be exported.
 */
export function SdiAttendeesPage() {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.events }, { label: t.sdi.attendees }]} anyOf={["gala.guests.read"]}>
      <Attendees />
    </FinancePage>
  );
}

function Attendees() {
  const { t } = useLocale();
  const x = t.sdi;
  const c = x.attendeeCols;
  const { values: f, page, set, clear, active } = useUrlState(KEYS);
  const query = { ...cleanQuery({ search: f.q }), page, pageSize: 50 };
  const list = useQuery({ queryKey: ["sdi", "attendees", query], queryFn: () => svc.listAttendees(query), placeholderData: (prev) => prev });
  const imp = list.data?.import;
  const columns = useMemo<Column<Attendee>[]>(
    () => [
      { key: "name", header: c.name, cell: (r) => <bdi className="font-bold text-ink">{r.guestName}</bdi> },
      { key: "type", header: c.type, cell: (r) => <bdi>{r.ticketType ?? "—"}</bdi> },
      { key: "table", header: c.table, cell: (r) => <bdi>{r.tableLabel ?? "—"}</bdi> },
      { key: "ref", header: c.reference, cell: (r) => (r.bookingReference ? <Ref>{r.bookingReference}</Ref> : "—") },
      {
        key: "answers",
        header: c.answers,
        cell: (r) => (r.answers && Object.keys(r.answers).length ? (
          <dl className="space-y-0.5 text-xs">
            {Object.entries(r.answers).map(([k, v]) => <div key={k}><dt className="inline font-bold">{k}: </dt><dd className="inline"><bdi>{v || "—"}</bdi></dd></div>)}
          </dl>
        ) : "—"),
      },
    ],
    [c],
  );
  return (
    <>
      <PageHeader title={x.attendees} subtitle={x.attendeesSubtitle} badges={imp?.isSynthetic ? <SyntheticBadge /> : undefined} />
      <Notice tone="gold"><p>{x.attendeesHint}</p></Notice>
      <Card labelledBy="sa-l">
        <CardHeader id="sa-l" title={x.attendees} subtitle={imp ? fill(x.attendeesFrom, { file: imp.fileName, date: imp.appliedAt?.slice(0, 10) ?? "—" }) : undefined} />
        <FilterBar active={active} onClear={clear}>
          <SearchFilter value={f.q} onChange={(v) => set({ q: v })} label={x.attendeeSearch} ltr={false} />
        </FilterBar>
        <WidgetState q={list} isEmpty={(list.data?.items.length ?? 0) === 0} emptyText={imp ? x.noRows : x.attendeesNone} minH="min-h-40">
          <DataTable caption={x.attendees} rows={list.data?.items ?? []} columns={columns} rowKey={(r) => r.id} dimmed={list.isPlaceholderData} minW="min-w-[56rem]" />
          <Pagination page={list.data?.meta.page ?? 1} totalPages={list.data?.meta.totalPages ?? 1} total={list.data?.meta.total ?? 0} onPage={(p) => set({ page: p })} />
          {imp && <p className="mt-3 text-xs text-muted">{x.appliedAt}: <DateText value={imp.appliedAt} /></p>}
        </WidgetState>
      </Card>
    </>
  );
}
