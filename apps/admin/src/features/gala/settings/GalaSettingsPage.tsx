"use client";

import { useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { ErrorState, WidgetSkeleton } from "@/components/common/States";
import { Bilingual, SaveBar, TextInput } from "@/components/content/ui";
import { ConfirmDialog, DetailGrid, Money, Notice, PageHeader, Ref } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useEventDetail, useGalaMutation, useTicketConfig, useTicketingInfo } from "@/hooks/useGalaData";
import { useForm } from "@/hooks/useForm";
import { ApiError } from "@/lib/api";
import { capacityError, ISO_WITH_OFFSET, labelError, maxPerBookingError, PRICE, salesGate } from "@/lib/gala";
import type { EventDetail, GalaEvent, TicketConfig } from "@/lib/gala-schemas";
import { fill } from "@/lib/i18n";
import * as svc from "@/services/gala";
import { GalaPage, useGalaError, GalaGateNotice } from "../shared";
import { FundraisingCard } from "./FundraisingCard";
import { LegalCopyCard } from "./LegalCopyCard";
import { VenuePhotosCard } from "./VenuePhotosCard";
import { GalaAgendaCard } from "./GalaAgendaCard";
import { GalaPublishCard } from "./GalaPublishCard";
import { GalaPageCard } from "./GalaPageCard";

export function GalaSettingsPage() {
  const { t } = useLocale();
  return (
    <GalaPage crumbs={[{ label: t.gala.settings.title }]} anyOf={["gala.bookings.read"]}>
      {(ev) => <Settings ev={ev} />}
    </GalaPage>
  );
}

function Settings({ ev }: { ev: GalaEvent }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const x = t.gala.settings;
  const cfg = useTicketConfig(ev.id, true);
  const detail = useEventDetail(ev.id, can("events.read"));
  const info = useTicketingInfo(ev.slug, true);
  return (
    <>
      <PageHeader title={x.title} subtitle={x.subtitle} />
      {!can("events.manage") && <Notice>{x.readOnly}</Notice>}
      <Card labelledBy="gs-e">
        <CardHeader id="gs-e" title={x.event} subtitle={x.eventManaged} />
        <DetailGrid items={[[x.name, <bdi key="n">{ev.titleEn}</bdi>], [x.slug, <Ref key="s">{ev.slug}</Ref>], [x.eventStatus, ev.status]]} />
      </Card>
      {/* The ONLY admin path to approve + publish the event (page sections stay hidden until the event is public) */}
      {can("events.read") && detail.data && <GalaPublishCard ev={ev} d={detail.data} />}
      {can("events.read") && (detail.isPending ? <WidgetSkeleton rows={3} /> : detail.isError ? <ErrorState error={detail.error} onRetry={() => void detail.refetch()} /> : <ScheduleCard key={detail.data.id + detail.dataUpdatedAt} ev={ev} d={detail.data} />)}
      {cfg.isPending ? <WidgetSkeleton rows={4} /> : cfg.isError ? (cfg.error instanceof ApiError && cfg.error.status === 404 ? <Notice tone="warn">{x.noConfig}</Notice> : <ErrorState error={cfg.error} onRetry={() => void cfg.refetch()} />) : (
        <>
          <SalesCard ev={ev} c={cfg.data} checkout={info.data?.checkoutAvailable ?? null} />
          <TicketingCard key={cfg.data.updatedAt} ev={ev} c={cfg.data} />
        </>
      )}
      {/* Phase 12B: the single approved Gala project (SDI agreement) */}
      {can("events.read") && <FundraisingCard ev={ev} />}
      {/* Nov 19 2026: MEKI legal drafts, gated by SDI approval */}
      {can("events.read") && <LegalCopyCard ev={ev} />}
      {/* Gala Agenda — dashboard management */}
      {can("events.read") && <GalaAgendaCard ev={ev} />}
      {/* Phase 13B (21 Nov 2026): authentic venue photos for the Gala page, via the event's EVENT_VENUE section */}
      {can("events.read") && <VenuePhotosCard ev={ev} />}
      {can("events.read") && <GalaPageCard ev={ev} />}
      <Notice tone="gold"><p className="font-bold">{x.approved}</p><p className="mt-1">{x.approvedList}</p></Notice>
      <Notice><p>{x.unsupported}</p></Notice>
    </>
  );
}

const iso = (v: string | null) => v ?? "";

function ScheduleCard({ ev, d }: { ev: GalaEvent; d: EventDetail }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const errText = useGalaError();
  const x = t.gala.settings;
  const e = t.gala.errors;
  const readOnly = !can("events.manage");
  const init = { startsAt: iso(d.startsAt), endsAt: iso(d.endsAt), timezone: d.timezone ?? "", venueNameEn: d.venueNameEn ?? "", venueNameAr: d.venueNameAr ?? "", addressEn: d.addressEn ?? "", addressAr: d.addressAr ?? "", city: d.city ?? "" };
  const form = useForm(init);
  const v = form.values;
  const [msg, setMsg] = useState<string | null>(null);
  const errors = {
    startsAt: v.startsAt && !ISO_WITH_OFFSET.test(v.startsAt.trim()) ? e.datetime : null,
    endsAt: v.endsAt && !ISO_WITH_OFFSET.test(v.endsAt.trim()) ? e.datetime : null,
    timezone: v.timezone && !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(v.timezone.trim()) ? e.timezone : null,
  };
  const save = useGalaMutation(() => {
    const b: Record<string, unknown> = {};
    for (const k of form.dirty) b[k] = k === "startsAt" || k === "endsAt" || k === "timezone" ? v[k].trim() || null : v[k].trim();
    return svc.updateEvent(ev.id, b);
  });
  return (
    <Card labelledBy="gs-sc">
      <CardHeader id="gs-sc" title={`${x.schedule} · ${x.venue}`} subtitle={x.scheduleHint} />
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextInput label={x.startsAt} value={v.startsAt} onChange={(s) => form.set("startsAt", s)} error={errors.startsAt} disabled={readOnly} dir="ltr" placeholder="2026-12-12T19:00:00-05:00" maxLength={40} />
          <TextInput label={x.endsAt} value={v.endsAt} onChange={(s) => form.set("endsAt", s)} error={errors.endsAt} disabled={readOnly} dir="ltr" placeholder="2026-12-12T23:00:00-05:00" maxLength={40} />
          <TextInput label={x.timezone} value={v.timezone} onChange={(s) => form.set("timezone", s)} error={errors.timezone} disabled={readOnly} dir="ltr" placeholder="America/New_York" maxLength={64} />
        </div>
        <Bilingual label={x.venueName} en={v.venueNameEn} ar={v.venueNameAr} onEn={(s) => form.set("venueNameEn", s)} onAr={(s) => form.set("venueNameAr", s)} disabled={readOnly} maxLength={255} />
        <Bilingual label={x.address} en={v.addressEn} ar={v.addressAr} onEn={(s) => form.set("addressEn", s)} onAr={(s) => form.set("addressAr", s)} disabled={readOnly} maxLength={2000} />
        <TextInput label={x.city} value={v.city} onChange={(s) => form.set("city", s)} disabled={readOnly} maxLength={120} />
        {!readOnly && form.dirty.length > 0 && (
          <SaveBar dirty={form.dirty.length} busy={save.isPending} onDiscard={form.discard} disabled={Object.values(errors).some(Boolean)} message={msg} error={save.isError ? errText(save.error) : null} onSave={() => { setMsg(null); save.mutate(undefined, { onSuccess: () => setMsg(x.saved) }); }} />
        )}
        {msg && !form.dirty.length && <p className="text-sm text-ok" role="status">{msg}</p>}
      </div>
    </Card>
  );
}

function SalesCard({ ev, c, checkout }: { ev: GalaEvent; c: TicketConfig; checkout: boolean | null }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const errText = useGalaError();
  const x = t.gala.settings;
  const [dialog, setDialog] = useState(false);
  const [typed, setTyped] = useState("");
  const toggle = useGalaMutation((open: boolean) => svc.updateTicketConfig(ev.id, { salesEnabled: open }));
  const g = salesGate(can("events.approve"));
  const opening = !c.salesEnabled;
  return (
    <Card labelledBy="gs-sa">
      <CardHeader id="gs-sa" title={x.sales} />
      <DetailGrid cols={2} items={[[x.sales, <span key="s" className="font-bold" data-testid="sales-enabled">{c.salesEnabled ? x.salesOpen : x.salesClosed}</span>], [x.checkout, <span key="c" className={checkout ? "text-ok" : "text-warn"}>{checkout === null ? t.gala.common.notAvailable : checkout ? x.checkoutOn : x.checkoutOff}</span>]]} />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className={opening ? "btn-admin btn-primary" : "btn-admin btn-ghost text-danger"} disabled={!g.allowed} onClick={() => setDialog(true)} data-testid="sales-toggle">
          {opening ? <LockOpen className="size-4" aria-hidden="true" /> : <Lock className="size-4" aria-hidden="true" />} {opening ? x.openSales : x.closeSales}
        </button>
      </div>
      {!g.allowed && <GalaGateNotice gate={g} title={x.openSales} />}
      {dialog && (
        <ConfirmDialog
          open
          danger={opening}
          title={opening ? x.openTitle : x.closeTitle}
          confirmLabel={opening ? x.openSales : x.closeSales}
          confirmDisabled={opening && typed !== "OPEN"}
          busy={toggle.isPending}
          error={toggle.isError ? errText(toggle.error) : null}
          onClose={() => { toggle.reset(); setTyped(""); setDialog(false); }}
          onConfirm={() => toggle.mutate(opening, { onSuccess: () => { setTyped(""); setDialog(false); } })}
        >
          <div className="space-y-3">
            <p>{opening ? x.openBody : x.closeBody}</p>
            {opening && checkout === false && <Notice tone="warn">{x.checkoutOff}</Notice>}
            {opening && <TextInput label={x.typeConfirm} value={typed} onChange={setTyped} dir="ltr" maxLength={10} />}
          </div>
        </ConfirmDialog>
      )}
    </Card>
  );
}

function TicketingCard({ ev, c }: { ev: GalaEvent; c: TicketConfig }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const errText = useGalaError();
  const x = t.gala.settings;
  const e = t.gala.errors;
  const readOnly = !can("events.manage");
  const init = { ticketPrice: c.ticketPrice, capacity: c.capacity === null ? "" : String(c.capacity), maxTicketsPerBooking: String(c.maxTicketsPerBooking), displayNameEn: c.displayNameEn, eventDateLabelEn: c.eventDateLabelEn, venueLabelEn: c.venueLabelEn, checkInNoteEn: c.checkInNoteEn ?? "" };
  const form = useForm(init);
  const v = form.values;
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmPrice, setConfirmPrice] = useState(false);
  const errors = {
    ticketPrice: PRICE.test(v.ticketPrice.trim()) ? null : e.price,
    capacity: capacityError(v.capacity.trim()) ? e.capacity : null,
    maxTicketsPerBooking: maxPerBookingError(v.maxTicketsPerBooking.trim()) ? e.maxPerBooking : null,
    displayNameEn: labelError(v.displayNameEn) ? e[labelError(v.displayNameEn)!] : null,
    eventDateLabelEn: labelError(v.eventDateLabelEn) ? e[labelError(v.eventDateLabelEn)!] : null,
    venueLabelEn: labelError(v.venueLabelEn) ? e[labelError(v.venueLabelEn)!] : null,
    checkInNoteEn: v.checkInNoteEn.trim() && labelError(v.checkInNoteEn, 1) ? e.latin : null,
  };
  const invalid = Object.values(errors).some(Boolean);
  const save = useGalaMutation(() => {
    const b: Record<string, unknown> = {};
    for (const k of form.dirty) {
      if (k === "capacity") b.capacity = v.capacity.trim() === "" ? null : Number(v.capacity);
      else if (k === "maxTicketsPerBooking") b.maxTicketsPerBooking = Number(v.maxTicketsPerBooking);
      else b[k] = v[k].trim();
    }
    return svc.updateTicketConfig(ev.id, b);
  });
  const run = () => { setMsg(null); save.mutate(undefined, { onSuccess: () => { setConfirmPrice(false); setMsg(x.saved); } }); };
  return (
    <Card labelledBy="gs-tk">
      <CardHeader id="gs-tk" title={x.ticketing} />
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-4">
          <TextInput label={x.ticketName} value={c.ticketNameEn} onChange={() => undefined} disabled />
          <TextInput label={x.price} value={v.ticketPrice} onChange={(s) => form.set("ticketPrice", s)} error={errors.ticketPrice} hint={x.priceHint} disabled={readOnly} dir="ltr" inputMode="decimal" maxLength={12} />
          <TextInput label={x.currency} value={c.currency} onChange={() => undefined} disabled dir="ltr" />
          <TextInput label={x.maxPerBooking} value={v.maxTicketsPerBooking} onChange={(s) => form.set("maxTicketsPerBooking", s.replace(/\D/g, ""))} error={errors.maxTicketsPerBooking} disabled={readOnly} dir="ltr" inputMode="numeric" />
        </div>
        <TextInput label={x.capacity} value={v.capacity} onChange={(s) => form.set("capacity", s.replace(/\D/g, ""))} error={errors.capacity} hint={x.capacityHint} disabled={readOnly} dir="ltr" inputMode="numeric" />
        <p className="text-sm font-bold text-ink">{x.labels}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label={x.displayName} value={v.displayNameEn} onChange={(s) => form.set("displayNameEn", s)} error={errors.displayNameEn} disabled={readOnly} dir="ltr" maxLength={255} />
          <TextInput label={x.dateLabel} value={v.eventDateLabelEn} onChange={(s) => form.set("eventDateLabelEn", s)} error={errors.eventDateLabelEn} disabled={readOnly} dir="ltr" maxLength={120} />
          <TextInput label={x.venueLabel} value={v.venueLabelEn} onChange={(s) => form.set("venueLabelEn", s)} error={errors.venueLabelEn} disabled={readOnly} dir="ltr" maxLength={255} />
          <TextInput label={x.checkInNote} value={v.checkInNoteEn} onChange={(s) => form.set("checkInNoteEn", s)} error={errors.checkInNoteEn} disabled={readOnly} dir="ltr" maxLength={500} />
        </div>
        <p className="text-xs text-muted">{x.price}: <Money value={c.ticketPrice} currency={c.currency} /></p>
        {!readOnly && form.dirty.length > 0 && (
          <SaveBar dirty={form.dirty.length} busy={save.isPending} onDiscard={form.discard} disabled={invalid} message={msg} error={save.isError && !confirmPrice ? errText(save.error) : null} onSave={() => (form.dirty.includes("ticketPrice") ? setConfirmPrice(true) : run())} />
        )}
        {msg && !form.dirty.length && <p className="text-sm text-ok" role="status">{msg}</p>}
      </div>
      {confirmPrice && (
        <ConfirmDialog open danger title={x.priceTitle} confirmLabel={t.content.common.save} busy={save.isPending} error={save.isError ? errText(save.error) : null} onClose={() => { save.reset(); setConfirmPrice(false); }} onConfirm={run}>
          <p>{fill(x.priceBody, { from: c.ticketPrice, to: v.ticketPrice.trim(), cur: c.currency })}</p>
        </ConfirmDialog>
      )}
    </Card>
  );
}
