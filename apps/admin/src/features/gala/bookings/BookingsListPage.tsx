"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Eye } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { DataTable, DateRangeFilter, DateText, FilterBar, Money, PageHeader, Pagination, Ref, SearchFilter, SelectFilter, TestBadge, type Column } from "@/components/finance/ui";
import { useDetailHref } from "@/features/finance/FinancePage";
import { useBookings } from "@/hooks/useGalaData";
import { useUrlState } from "@/hooks/useUrlState";
import { cleanQuery, dayRange } from "@/lib/finance";
import { ticketIssuance } from "@/lib/gala";
import { BOOKING_PAYMENT_STATUSES, BOOKING_STATUSES, type BookingRow, type GalaEvent } from "@/lib/gala-schemas";
import { GalaBadge, GalaPage, TestToggle } from "../shared";

const KEYS = ["q", "status", "payment", "from", "to", "test", "sort"] as const;
const PAGE_SIZE = 20;

export function BookingsListPage() {
  const { t } = useLocale();
  return (
    <GalaPage crumbs={[{ label: t.gala.bookings.title }]} anyOf={["gala.bookings.read"]}>
      {(ev) => <Bookings ev={ev} />}
    </GalaPage>
  );
}

function Bookings({ ev }: { ev: GalaEvent }) {
  const { t } = useLocale();
  const detail = useDetailHref();
  const x = t.gala.bookings;
  const s = t.gala.statuses;
  const { values: f, page, set, clear, active } = useUrlState(KEYS);
  const range = dayRange(f.from, f.to);
  const q = useBookings(
    ev.id,
    { ...cleanQuery({ search: f.q, bookingStatus: f.status, paymentStatus: f.payment, from: range?.from, to: range?.to, includeTest: f.test === "1" ? "true" : undefined, sort: f.sort || "createdAt:desc" }), page, pageSize: PAGE_SIZE },
    range !== null,
  );
  const rows = q.data?.items ?? [];

  const columns = useMemo<Column<BookingRow>[]>(
    () => [
      { key: "ref", header: x.cols.reference, cell: (b) => <span className="inline-flex flex-wrap items-center gap-1"><Link href={detail(`/gala/bookings/${b.id}`)} className="font-bold text-meki-green-dark hover:underline"><Ref>{b.publicReference}</Ref></Link>{b.isTest && <TestBadge />}</span> },
      { key: "name", header: x.cols.purchaser, cell: (b) => <bdi className="font-bold text-ink">{b.purchaserName}</bdi> },
      { key: "email", header: x.cols.email, cell: (b) => <Ref>{b.purchaserEmail}</Ref> },
      { key: "phone", header: x.cols.phone, cell: (b) => <bdi dir="ltr" className="whitespace-nowrap text-xs">{b.purchaserPhone}</bdi> },
      { key: "guests", header: x.cols.guests, numeric: true, cell: (b) => <span className="num">{b.guestCount}</span> },
      { key: "amount", header: x.cols.amount, numeric: true, cell: (b) => <Money value={b.totalAmount} currency={b.currency} /> },
      { key: "status", header: x.cols.status, cell: (b) => <GalaBadge kind="booking" status={b.bookingStatus} /> },
      { key: "pay", header: x.cols.payment, cell: (b) => <GalaBadge kind="bookingPayment" status={b.paymentStatus} /> },
      { key: "tickets", header: x.cols.tickets, cell: (b) => <span className="text-xs">{s.issuance[ticketIssuance(b)]}</span> },
      { key: "date", header: x.cols.date, cell: (b) => <DateText value={b.createdAt} /> },
      { key: "act", header: t.gala.common.actions, cell: (b) => <Link href={detail(`/gala/bookings/${b.id}`)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-bold text-meki-green-dark hover:bg-bg"><Eye className="size-4" aria-hidden="true" /> {t.gala.common.view}</Link> },
    ],
    [x, s, t, detail],
  );

  return (
    <>
      <PageHeader title={x.title} subtitle={x.subtitle} right={<TestToggle value={f.test === "1"} onChange={(v) => set({ test: v ? "1" : "" })} />} />
      <Card labelledBy="bk-t">
        <CardHeader id="bk-t" title={x.title} />
        <FilterBar active={active} onClear={clear}>
          <SearchFilter value={f.q} onChange={(v) => set({ q: v })} label={x.search} ltr={false} />
          <SelectFilter label={x.cols.status} allLabel={t.content.common.anyStatus} value={f.status} onChange={(v) => set({ status: v })} options={BOOKING_STATUSES.map((v) => ({ value: v, label: s.booking[v] }))} />
          <SelectFilter label={x.cols.payment} allLabel={t.content.common.anyStatus} value={f.payment} onChange={(v) => set({ payment: v })} options={BOOKING_PAYMENT_STATUSES.map((v) => ({ value: v, label: s.bookingPayment[v] }))} />
          <DateRangeFilter label={x.dateRange} from={f.from} to={f.to} invalid={range === null} onChange={(patch) => set(patch)} />
          <SelectFilter
            label={t.gala.common.sort}
            allLabel={`${x.cols.date} ↓`}
            value={f.sort}
            onChange={(v) => set({ sort: v })}
            options={[{ value: "createdAt:asc", label: `${x.cols.date} ↑` }, { value: "totalAmount:desc", label: `${x.cols.amount} ↓` }, { value: "bookingStatus:asc", label: x.cols.status }, { value: "paymentStatus:asc", label: x.cols.payment }]}
          />
        </FilterBar>
        <WidgetState q={q} isEmpty={rows.length === 0} emptyText={active ? x.emptyFiltered : x.empty} minH="min-h-48">
          <DataTable caption={x.title} rows={rows} columns={columns} rowKey={(b) => b.id} dimmed={q.isPlaceholderData} minW="min-w-[78rem]" />
          <Pagination page={q.data?.page ?? 1} totalPages={q.data?.totalPages ?? 1} total={q.data?.total ?? 0} onPage={(p) => set({ page: p })} />
        </WidgetState>
      </Card>
    </>
  );
}
