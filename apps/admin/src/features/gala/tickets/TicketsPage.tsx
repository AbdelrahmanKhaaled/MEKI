"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Eye, RefreshCcw, ShieldX } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { Modal } from "@/components/common/Modal";
import { useLocale } from "@/components/common/Providers";
import { ErrorState, WidgetSkeleton, WidgetState } from "@/components/common/States";
import { DataTable, DateText, DetailGrid, FilterBar, Notice, PageHeader, Pagination, Ref, SearchFilter, SelectFilter, type Column } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useHref } from "@/features/finance/FinancePage";
import { useGalaMutation, useTicket, useTickets } from "@/hooks/useGalaData";
import { useUrlState } from "@/hooks/useUrlState";
import { cleanQuery } from "@/lib/finance";
import { pdfGate, reissueGate, revokeGate } from "@/lib/gala";
import { TICKET_STATUSES, type GalaEvent, type Ticket } from "@/lib/gala-schemas";
import { fill } from "@/lib/i18n";
import * as svc from "@/services/gala";
import { DownloadButton, GalaBadge, GalaPage, ReasonDialog, TicketStatusBadge, useGalaError, GalaGateNotice } from "../shared";

const KEYS = ["q", "status", "open"] as const;
const PAGE_SIZE = 25;

export function TicketsPage() {
  const { t } = useLocale();
  return (
    <GalaPage crumbs={[{ label: t.gala.tickets.title }]} anyOf={["gala.tickets.read"]}>
      {(ev) => <Tickets ev={ev} />}
    </GalaPage>
  );
}

function Tickets({ ev }: { ev: GalaEvent }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const x = t.gala.tickets;
  const { values: f, page, set, clear, active } = useUrlState(KEYS);
  const q = useTickets(ev.id, { ...cleanQuery({ search: f.q, status: f.status }), page, pageSize: PAGE_SIZE, sort: "createdAt:desc" }, true);
  const rows = q.data?.items ?? [];
  const columns = useMemo<Column<Ticket>[]>(
    () => [
      { key: "no", header: x.cols.number, cell: (r) => <button type="button" onClick={() => set({ open: r.id })} className="font-bold text-meki-green-dark hover:underline"><Ref>{r.ticketNumber}</Ref></button> },
      { key: "guest", header: x.cols.guest, cell: (r) => <bdi className="font-bold text-ink">{r.guest.fullName}</bdi> },
      { key: "booking", header: x.cols.booking, cell: (r) => <Ref>{r.booking.publicReference}</Ref> },
      { key: "status", header: x.cols.status, cell: (r) => <TicketStatusBadge status={r.status} /> },
      { key: "issued", header: x.cols.issued, cell: (r) => <DateText value={r.issuedAt} /> },
      { key: "ci", header: x.cols.checkedIn, cell: (r) => <DateText value={r.checkedInAt} /> },
      { key: "pdf", header: x.cols.pdf, cell: (r) => <span className={`text-xs font-bold ${r.hasPdf ? "text-ok" : "text-muted"}`}>{r.hasPdf ? t.gala.bookings.pdfReady : t.gala.bookings.pdfMissing}</span> },
      {
        key: "act",
        header: t.gala.common.actions,
        cell: (r) => (
          <span className="flex flex-wrap items-center gap-1">
            <button type="button" onClick={() => set({ open: r.id })} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-bold text-meki-green-dark hover:bg-bg"><Eye className="size-4" aria-hidden="true" /> {t.gala.common.view}</button>
            {pdfGate(r, can("gala.tickets.read")).allowed && <DownloadButton run={() => svc.downloadTicketPdf(ev.id, r.id, r.ticketNumber)} label="PDF" className="btn-admin btn-ghost !min-h-8 !px-2 !py-1 text-xs" testId={`pdf-${r.ticketNumber}`} />}
          </span>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set is stable per URL state
    [x, t, can, ev.id],
  );
  return (
    <>
      <PageHeader title={x.title} subtitle={x.subtitle} />
      <Notice>{t.gala.common.noTokens} {x.resendNote}</Notice>
      <Card labelledBy="tk-t">
        <CardHeader id="tk-t" title={x.title} />
        <FilterBar active={active} onClear={clear}>
          <SearchFilter value={f.q} onChange={(v) => set({ q: v })} label={x.search} ltr={false} />
          <SelectFilter label={x.cols.status} allLabel={t.content.common.anyStatus} value={f.status} onChange={(v) => set({ status: v })} options={TICKET_STATUSES.map((v) => ({ value: v, label: t.gala.statuses.ticket[v] }))} />
        </FilterBar>
        <WidgetState q={q} isEmpty={rows.length === 0} emptyText={active ? x.emptyFiltered : x.empty} minH="min-h-48">
          <DataTable caption={x.title} rows={rows} columns={columns} rowKey={(r) => r.id} dimmed={q.isPlaceholderData} minW="min-w-[72rem]" />
          <Pagination page={q.data?.page ?? 1} totalPages={q.data?.totalPages ?? 1} total={q.data?.total ?? 0} onPage={(p) => set({ page: p })} />
        </WidgetState>
      </Card>
      {f.open && <TicketDetail ev={ev} id={f.open} onClose={() => set({ open: "" })} />}
    </>
  );
}

function TicketDetail({ ev, id, onClose }: { ev: GalaEvent; id: string; onClose: () => void }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const href = useHref();
  const errText = useGalaError();
  const x = t.gala.tickets;
  const q = useTicket(ev.id, id, true);
  const [dialog, setDialog] = useState<null | "revoke" | "reissue">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const act = useGalaMutation((a: { kind: "revoke" | "reissue"; reason: string }) => (a.kind === "revoke" ? svc.revokeTicket(ev.id, id, a.reason) : svc.reissueTicket(ev.id, id, a.reason)));
  const tk = q.data;
  return (
    <Modal open size="xl" title={tk ? fill(x.details, { n: tk.ticketNumber }) : x.title} closeLabel={t.fin.common.close} onClose={onClose}
      footer={tk && can("gala.bookings.read") ? <Link className="btn-admin btn-ghost" href={href(`/gala/bookings/${tk.booking.id}`)}>{t.gala.guests.openBooking}</Link> : undefined}>
      {q.isPending ? <WidgetSkeleton rows={4} /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : tk && (() => {
        const pdf = pdfGate(tk, can("gala.tickets.read"));
        const rv = revokeGate(tk, can("gala.tickets.manage"));
        const ri = reissueGate(tk, can("gala.tickets.manage"));
        return (
          <div className="space-y-4" data-testid="ticket-detail">
            {msg && <p className="rounded-lg bg-ok/10 p-2 text-sm text-ok" role="status">{msg}</p>}
            <div className="flex flex-wrap items-center gap-2"><Ref className="text-lg">{tk.ticketNumber}</Ref><TicketStatusBadge status={tk.status} /><GalaBadge kind="booking" status={tk.booking.bookingStatus} /><GalaBadge kind="bookingPayment" status={tk.booking.paymentStatus} /></div>
            <DetailGrid
              cols={2}
              items={[
                [x.cols.guest, <bdi key="g" className="font-bold">{tk.guest.fullName}</bdi>],
                [t.gala.guests.cols.email, <Ref key="e">{tk.guest.email}</Ref>],
                [x.cols.booking, <Ref key="b">{tk.booking.publicReference}</Ref>],
                [x.cols.issued, <DateText key="i" value={tk.issuedAt} />],
                [x.cols.checkedIn, <DateText key="c" value={tk.checkedInAt} />],
                [x.version, <span key="v" className="num">{tk.tokenVersion}</span>],
                [x.cols.pdf, tk.hasPdf ? t.gala.bookings.pdfReady : t.gala.bookings.pdfMissing],
                ...(tk.revokeReason ? ([[x.revokedReason, <bdi key="rr">{tk.revokeReason}</bdi>]] as [string, React.ReactNode][]) : []),
              ]}
            />
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <DownloadButton run={() => svc.downloadTicketPdf(ev.id, tk.id, tk.ticketNumber)} label={x.pdfDownload} disabled={!pdf.allowed} className="btn-admin btn-primary" testId="ticket-pdf" />
              <button type="button" className="btn-admin btn-ghost" disabled={!ri.allowed} onClick={() => setDialog("reissue")}><RefreshCcw className="size-4" aria-hidden="true" /> {x.reissue}</button>
              <button type="button" className="btn-admin btn-ghost text-danger" disabled={!rv.allowed} onClick={() => setDialog("revoke")}><ShieldX className="size-4" aria-hidden="true" /> {x.revoke}</button>
            </div>
            {!pdf.allowed && <GalaGateNotice gate={pdf} title={x.pdfDownload} />}
            {!ri.allowed && tk.status === "ISSUED" && <GalaGateNotice gate={ri} title={x.reissue} />}
            {dialog && (
              <ReasonDialog
                title={fill(dialog === "revoke" ? x.revokeTitle : x.reissueTitle, { n: tk.ticketNumber })}
                body={<p>{dialog === "revoke" ? x.revokeBody : x.reissueBody}</p>}
                confirmLabel={dialog === "revoke" ? x.revoke : x.reissue}
                danger={dialog === "revoke"}
                busy={act.isPending}
                error={act.isError ? errText(act.error) : null}
                onClose={() => { act.reset(); setDialog(null); }}
                onConfirm={(reason) => act.mutate({ kind: dialog, reason }, { onSuccess: () => { setDialog(null); setMsg(x.done); } })}
              />
            )}
          </div>
        );
      })()}
    </Modal>
  );
}
