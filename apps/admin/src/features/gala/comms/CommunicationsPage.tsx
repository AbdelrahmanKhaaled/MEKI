"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MailWarning, RotateCcw } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { ConfirmDialog, DataTable, DateText, FilterBar, Notice, PageHeader, Pagination, Ref, SearchFilter, SelectFilter, TestBadge, type Column } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useHref } from "@/features/finance/FinancePage";
import { useGalaMutation, useJobs } from "@/hooks/useGalaData";
import { useUrlState } from "@/hooks/useUrlState";
import { cleanQuery } from "@/lib/finance";
import { resendGate } from "@/lib/gala";
import { JOB_STATUSES, type GalaEvent, type JobRow } from "@/lib/gala-schemas";
import { fill } from "@/lib/i18n";
import * as svc from "@/services/gala";
import { GalaBadge, GalaPage, Stat, useGalaError } from "../shared";

const KEYS = ["q", "status", "type"] as const;

export function CommunicationsPage() {
  const { t } = useLocale();
  return (
    <GalaPage crumbs={[{ label: t.gala.comms.title }]} anyOf={["gala.bookings.read"]}>
      {(ev) => <Comms ev={ev} />}
    </GalaPage>
  );
}

function Comms({ ev }: { ev: GalaEvent }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const href = useHref();
  const errText = useGalaError();
  const x = t.gala.comms;
  const s = t.gala.statuses;
  const { values: f, page, set, clear, active } = useUrlState(KEYS);
  const q = useJobs(ev.id, { ...cleanQuery({ search: f.q, status: f.status, type: f.type }), page, pageSize: 25 }, true);
  const [retry, setRetry] = useState<JobRow["booking"] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const resend = useGalaMutation((bookingId: string) => svc.resendBooking(ev.id, bookingId));
  const data = q.data;
  const transport = data?.transport;

  const columns = useMemo<Column<JobRow>[]>(
    () => [
      { key: "b", header: x.cols.booking, cell: (j) => <span className="inline-flex items-center gap-1">{can("gala.bookings.read") ? <Link href={href(`/gala/bookings/${j.booking.id}`)} className="font-bold text-meki-green-dark hover:underline"><Ref>{j.booking.publicReference}</Ref></Link> : <Ref>{j.booking.publicReference}</Ref>}{j.booking.isTest && <TestBadge />}</span> },
      { key: "type", header: x.cols.type, cell: (j) => s.jobType[j.type] ?? j.type },
      { key: "tpl", header: x.cols.template, cell: (j) => (j.template ? s.template[j.template] ?? j.template : "—") },
      { key: "tk", header: x.cols.ticket, cell: (j) => (j.ticketNumber ? <Ref>{j.ticketNumber}</Ref> : "—") },
      { key: "st", header: x.cols.status, cell: (j) => <GalaBadge kind="job" status={j.status} /> },
      { key: "at", header: x.cols.attempts, numeric: true, cell: (j) => <span className="num">{j.attempts}</span> },
      { key: "err", header: x.cols.error, cell: (j) => (j.lastError ? <bdi dir="ltr" className="line-clamp-2 break-words text-xs text-danger">{j.lastError}</bdi> : "—") },
      { key: "up", header: x.cols.updated, cell: (j) => <DateText value={j.updatedAt} /> },
      {
        key: "act",
        header: t.gala.common.actions,
        cell: (j) => {
          const g = resendGate(j.booking, can("gala.bookings.manage"));
          return (j.status === "FAILED" || j.status === "SKIPPED") ? (
            <button type="button" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-bold text-meki-green-dark hover:bg-bg disabled:opacity-40" disabled={!g.allowed} title={g.allowed ? undefined : g.reasons.map((k) => t.gala.gate[k]).join(" ")} onClick={() => setRetry(j.booking)}>
              <RotateCcw className="size-4" aria-hidden="true" /> {x.retry}
            </button>
          ) : null;
        },
      },
    ],
    [x, s, t, can, href],
  );

  return (
    <>
      <PageHeader title={x.title} subtitle={x.subtitle} />
      {msg && <p className="rounded-lg bg-ok/10 p-3 text-sm text-ok" role="status">{msg}</p>}
      {transport && (
        transport.name === "none" ? (
          <Notice tone="warn" icon={MailWarning}><p data-testid="transport-none">{x.transportNone}</p><p className="mt-2 text-xs"><span className="font-bold">{x.pending}:</span> {x.requirements}</p></Notice>
        ) : transport.name === "dev-file" || transport.name === "memory" ? (
          <Notice tone="gold"><p>{fill(x.transportDev, { name: transport.name })}</p></Notice>
        ) : (
          <Notice><p>{fill(x.transportOk, { name: transport.name })}</p></Notice>
        )
      )}
      {data && (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="job-summary">
          {JOB_STATUSES.map((k) => <Stat key={k} label={s.job[k]} value={data.summary[k] ?? 0} tone={k === "FAILED" ? "danger" : k === "DONE" ? "ok" : k === "SKIPPED" ? "neutral" : "warn"} />)}
        </div>
      )}
      <Card labelledBy="cm-t">
        <CardHeader id="cm-t" title={x.summary} />
        <FilterBar active={active} onClear={clear}>
          <SearchFilter value={f.q} onChange={(v) => set({ q: v })} label={t.gala.common.reference} />
          <SelectFilter label={x.statusFilter} allLabel={t.content.common.anyStatus} value={f.status} onChange={(v) => set({ status: v })} options={JOB_STATUSES.map((v) => ({ value: v, label: s.job[v] }))} />
          <SelectFilter label={x.typeFilter} allLabel={t.content.common.anyStatus} value={f.type} onChange={(v) => set({ type: v })} options={["TICKET_PDF", "EMAIL"].map((v) => ({ value: v, label: s.jobType[v] }))} />
        </FilterBar>
        <WidgetState q={q} isEmpty={(data?.items.length ?? 0) === 0} emptyText={active ? x.emptyFiltered : x.empty} minH="min-h-48">
          <DataTable caption={x.summary} rows={data?.items ?? []} columns={columns} rowKey={(j) => j.id} dimmed={q.isPlaceholderData} minW="min-w-[80rem]" />
          <Pagination page={data?.meta.page ?? 1} totalPages={data?.meta.totalPages ?? 1} total={data?.meta.total ?? 0} onPage={(p) => set({ page: p })} />
        </WidgetState>
      </Card>
      {retry && (
        <ConfirmDialog open title={fill(x.retryTitle, { ref: retry.publicReference })} confirmLabel={x.retry} busy={resend.isPending} error={resend.isError ? errText(resend.error) : null} onClose={() => { resend.reset(); setRetry(null); }} onConfirm={() => resend.mutate(retry.id, { onSuccess: (r) => { setRetry(null); setMsg(fill(t.gala.bookings.resendDone, { n: r.requeued })); } })}>
          <p>{t.gala.bookings.resendBody}</p>
        </ConfirmDialog>
      )}
    </>
  );
}
