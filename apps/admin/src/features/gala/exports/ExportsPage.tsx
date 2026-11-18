"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { FilterBar, Notice, PageHeader, SearchFilter, SelectFilter } from "@/components/finance/ui";
import { useGuests } from "@/hooks/useGalaData";
import { useUrlState } from "@/hooks/useUrlState";
import { cleanQuery } from "@/lib/finance";
import { BOOKING_PAYMENT_STATUSES, TICKET_STATUSES, type GalaEvent } from "@/lib/gala-schemas";
import { fill } from "@/lib/i18n";
import * as svc from "@/services/gala";
import { DownloadButton, GalaPage, TestToggle } from "../shared";

const KEYS = ["q", "checkIn", "ticket", "payment", "test"] as const;

export function ExportsPage() {
  const { t } = useLocale();
  return (
    <GalaPage crumbs={[{ label: t.gala.exports.title }]} anyOf={["gala.guests.export"]}>
      {(ev) => <Exports ev={ev} />}
    </GalaPage>
  );
}

function Exports({ ev }: { ev: GalaEvent }) {
  const { t } = useLocale();
  const x = t.gala.exports;
  const s = t.gala.statuses;
  const { values: f, set, clear, active } = useUrlState(KEYS);
  const [format, setFormat] = useState<"csv" | "xlsx">("xlsx");
  // the export endpoint takes exactly the guest-list filters, so the count shown is what the file will contain
  const filters = cleanQuery({ search: f.q, checkInStatus: f.checkIn, ticketStatus: f.ticket, paymentStatus: f.payment, includeTest: f.test === "1" ? "true" : undefined });
  const count = useGuests(ev.id, { ...filters, pageSize: 1 }, true);
  return (
    <>
      <PageHeader title={x.title} subtitle={x.subtitle} />
      <Card labelledBy="ex-f">
        <CardHeader id="ex-f" title={x.filters} right={<TestToggle value={f.test === "1"} onChange={(v) => set({ test: v ? "1" : "" })} />} />
        <FilterBar active={active} onClear={clear}>
          <SearchFilter value={f.q} onChange={(v) => set({ q: v })} label={t.gala.guests.search} ltr={false} />
          <SelectFilter label={t.gala.guests.checkInFilter} allLabel={t.content.common.anyStatus} value={f.checkIn} onChange={(v) => set({ checkIn: v })} options={["CHECKED_IN", "NOT_CHECKED_IN"].map((v) => ({ value: v, label: s.checkInState[v] }))} />
          <SelectFilter label={t.gala.guests.ticketFilter} allLabel={t.content.common.anyStatus} value={f.ticket} onChange={(v) => set({ ticket: v })} options={TICKET_STATUSES.map((v) => ({ value: v, label: s.ticket[v] }))} />
          <SelectFilter label={t.gala.guests.paymentFilter} allLabel={t.content.common.anyStatus} value={f.payment} onChange={(v) => set({ payment: v })} options={BOOKING_PAYMENT_STATUSES.map((v) => ({ value: v, label: s.bookingPayment[v] }))} />
        </FilterBar>
        <p className="mt-3 text-sm font-bold text-ink" data-testid="export-count">{count.data ? fill(x.count, { n: count.data.total }) : "…"}</p>
      </Card>
      <Card labelledBy="ex-d">
        <CardHeader id="ex-d" title={x.format} />
        <fieldset className="space-y-2">
          <legend className="sr-only">{x.format}</legend>
          {(["xlsx", "csv"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="fmt" className="size-4 accent-meki-green" checked={format === k} onChange={() => setFormat(k)} /> {x[k]}</label>
          ))}
        </fieldset>
        <p className="mt-4 text-xs font-bold text-body">{x.columns}</p>
        <p className="mt-1 text-xs text-muted">{x.columnList}</p>
        <div className="mt-5">
          <DownloadButton run={() => svc.exportGuests(ev.id, { ...filters, format })} label={x.download} className="btn-admin btn-primary" testId="export-download" />
        </div>
      </Card>
      <Notice><p>{x.audit}</p><p className="mt-1">{x.safety}</p><p className="mt-1">{x.limit}</p><p className="mt-1">{x.staff}</p></Notice>
    </>
  );
}
