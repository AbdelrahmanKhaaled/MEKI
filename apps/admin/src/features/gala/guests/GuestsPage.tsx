"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { Modal } from "@/components/common/Modal";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { DataTable, DateText, DetailGrid, FilterBar, Notice, PageHeader, Pagination, Ref, SearchFilter, SelectFilter, type Column } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useHref } from "@/features/finance/FinancePage";
import { useGuests } from "@/hooks/useGalaData";
import { useUrlState } from "@/hooks/useUrlState";
import { cleanQuery } from "@/lib/finance";
import { BOOKING_PAYMENT_STATUSES, TICKET_STATUSES, type GalaEvent, type GuestRow } from "@/lib/gala-schemas";
import { GalaBadge, GalaPage, TestToggle } from "../shared";

const KEYS = ["q", "checkIn", "ticket", "payment", "test"] as const;
const PAGE_SIZE = 25;

export function GuestsPage() {
  const { t } = useLocale();
  return (
    <GalaPage crumbs={[{ label: t.gala.guests.title }]} anyOf={["gala.guests.read"]}>
      {(ev) => <Guests ev={ev} />}
    </GalaPage>
  );
}

function Guests({ ev }: { ev: GalaEvent }) {
  const { t } = useLocale();
  const x = t.gala.guests;
  const s = t.gala.statuses;
  const { values: f, page, set, clear, active } = useUrlState(KEYS);
  const q = useGuests(ev.id, { ...cleanQuery({ search: f.q, checkInStatus: f.checkIn, ticketStatus: f.ticket, paymentStatus: f.payment, includeTest: f.test === "1" ? "true" : undefined }), page, pageSize: PAGE_SIZE }, true);
  const [open, setOpen] = useState<GuestRow | null>(null);
  const rows = q.data?.items ?? [];

  const columns = useMemo<Column<GuestRow>[]>(
    () => [
      { key: "name", header: x.cols.name, cell: (g) => <button type="button" onClick={() => setOpen(g)} className="text-start font-bold text-ink hover:text-meki-green-dark hover:underline"><bdi>{g.fullName}</bdi></button> },
      { key: "ref", header: x.cols.reference, cell: (g) => <Ref>{g.bookingReference}</Ref> },
      { key: "email", header: x.cols.email, cell: (g) => <Ref>{g.email}</Ref> },
      { key: "phone", header: x.cols.phone, cell: (g) => <bdi dir="ltr" className="whitespace-nowrap text-xs">{g.phone}</bdi> },
      { key: "diet", header: x.cols.dietary, cell: (g) => <bdi className="line-clamp-2 text-xs">{g.dietaryRequirements}</bdi> },
      { key: "ticket", header: x.cols.ticket, cell: (g) => <Ref>{g.ticketNumber}</Ref> },
      { key: "tstatus", header: x.cols.ticketStatus, cell: (g) => <GalaBadge kind="ticket" status={g.ticketStatus} /> },
      { key: "pay", header: x.cols.payment, cell: (g) => <GalaBadge kind="bookingPayment" status={g.paymentStatus} /> },
      { key: "ci", header: x.cols.checkIn, cell: (g) => <GalaBadge kind="checkInState" status={g.checkInStatus} /> },
      { key: "at", header: x.cols.checkedInAt, cell: (g) => <DateText value={g.checkedInAt} /> },
      { key: "act", header: t.gala.common.actions, cell: (g) => <button type="button" onClick={() => setOpen(g)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-bold text-meki-green-dark hover:bg-bg"><Eye className="size-4" aria-hidden="true" /> {t.gala.common.view}</button> },
    ],
    [x, t],
  );

  return (
    <>
      <PageHeader title={x.title} subtitle={x.subtitle} right={<TestToggle value={f.test === "1"} onChange={(v) => set({ test: v ? "1" : "" })} />} />
      <Card labelledBy="gs-t">
        <CardHeader id="gs-t" title={x.title} subtitle={x.dietaryNote} />
        <FilterBar active={active} onClear={clear}>
          <SearchFilter value={f.q} onChange={(v) => set({ q: v })} label={x.search} ltr={false} />
          <SelectFilter label={x.checkInFilter} allLabel={t.content.common.anyStatus} value={f.checkIn} onChange={(v) => set({ checkIn: v })} options={["CHECKED_IN", "NOT_CHECKED_IN"].map((v) => ({ value: v, label: s.checkInState[v] }))} />
          <SelectFilter label={x.ticketFilter} allLabel={t.content.common.anyStatus} value={f.ticket} onChange={(v) => set({ ticket: v })} options={TICKET_STATUSES.map((v) => ({ value: v, label: s.ticket[v] }))} />
          <SelectFilter label={x.paymentFilter} allLabel={t.content.common.anyStatus} value={f.payment} onChange={(v) => set({ payment: v })} options={BOOKING_PAYMENT_STATUSES.map((v) => ({ value: v, label: s.bookingPayment[v] }))} />
        </FilterBar>
        <WidgetState q={q} isEmpty={rows.length === 0} emptyText={active ? x.emptyFiltered : x.empty} minH="min-h-48">
          <DataTable caption={x.title} rows={rows} columns={columns} rowKey={(g) => g.ticketId} dimmed={q.isPlaceholderData} minW="min-w-[84rem]" />
          <Pagination page={q.data?.page ?? 1} totalPages={q.data?.totalPages ?? 1} total={q.data?.total ?? 0} onPage={(p) => set({ page: p })} />
        </WidgetState>
      </Card>
      {open && <GuestDetail g={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function GuestDetail({ g, onClose }: { g: GuestRow; onClose: () => void }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const href = useHref();
  const x = t.gala.guests;
  return (
    <Modal open size="xl" title={x.details} closeLabel={t.fin.common.close} onClose={onClose}
      footer={
        <>
          {can("gala.tickets.read") && <Link className="btn-admin btn-ghost" href={href(`/gala/tickets?q=${encodeURIComponent(g.ticketNumber)}&open=${g.ticketId}`)}>{x.openTicket}</Link>}
          {can("gala.bookings.read") && <Link className="btn-admin btn-primary" href={href(`/gala/bookings/${g.bookingId}`)}>{x.openBooking}</Link>}
        </>
      }>
      <div className="space-y-4" data-testid="guest-detail">
        <p className="text-lg font-bold text-ink"><bdi>{g.fullName}</bdi></p>
        <DetailGrid
          cols={2}
          items={[
            [x.cols.email, <Ref key="e">{g.email}</Ref>],
            [x.cols.phone, <bdi key="p" dir="ltr">{g.phone}</bdi>],
            [x.cols.dietary, <bdi key="d">{g.dietaryRequirements}</bdi>],
            [x.cols.reference, <Ref key="r">{g.bookingReference}</Ref>],
            [x.cols.ticket, <Ref key="t">{g.ticketNumber}</Ref>],
            [x.cols.ticketStatus, <GalaBadge key="ts" kind="ticket" status={g.ticketStatus} />],
            [x.cols.payment, <GalaBadge key="ps" kind="bookingPayment" status={g.paymentStatus} />],
            [x.cols.checkIn, <GalaBadge key="cs" kind="checkInState" status={g.checkInStatus} />],
            [x.cols.checkedInAt, <DateText key="ca" value={g.checkedInAt} />],
            [t.gala.bookings.cols.date, <DateText key="bd" value={g.bookingDate} />],
          ]}
        />
        <Notice>{x.editNote}</Notice>
      </div>
    </Modal>
  );
}
