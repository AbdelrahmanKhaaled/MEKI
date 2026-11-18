"use client";

import Link from "next/link";
import { ClipboardList, FileDown, Mail, ScanQrCode, Settings2, Ticket, UsersRound } from "lucide-react";
import { Card, CardHeader } from "@/components/cards/Card";
import { useLocale } from "@/components/common/Providers";
import { WidgetState } from "@/components/common/States";
import { Money, Notice, PageHeader } from "@/components/finance/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useHref } from "@/features/finance/FinancePage";
import { useBookings, useFinancials, useTicketConfig, useTicketingInfo } from "@/hooks/useGalaData";
import { useUrlState } from "@/hooks/useUrlState";
import { attendance, bookingKpis, registeredGuests, ticketKpis } from "@/lib/gala";
import type { GalaEvent } from "@/lib/gala-schemas";
import { fill } from "@/lib/i18n";
import { GalaPage, Progress, Stat, TestToggle } from "./shared";

export function GalaOverviewPage() {
  const { t } = useLocale();
  return (
    <GalaPage crumbs={[{ label: t.gala.overview.title }]} anyOf={["gala.bookings.read"]}>
      {(ev) => <Overview ev={ev} />}
    </GalaPage>
  );
}

function Overview({ ev }: { ev: GalaEvent }) {
  const { locale, t } = useLocale();
  const { can } = useAuth();
  const href = useHref();
  const x = t.gala.overview;
  const { values, set } = useUrlState(["test"] as const);
  const test = values.test === "1";
  const fin = useFinancials(ev.id, test, can("gala.bookings.read"));
  const failed = useBookings(ev.id, { paymentStatus: "FAILED", pageSize: 1, includeTest: test ? "true" : undefined }, can("gala.bookings.read"));
  const cfg = useTicketConfig(ev.id, can("gala.bookings.read"));
  const info = useTicketingInfo(ev.slug, true);
  const nf = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US");
  const n = (v: number) => nf.format(v);

  const links = [
    { href: "/gala/bookings", icon: ClipboardList, label: t.nav.items.bookings, perm: "gala.bookings.read" },
    { href: "/gala/guests", icon: UsersRound, label: t.nav.items.guests, perm: "gala.guests.read" },
    { href: "/gala/tickets", icon: Ticket, label: t.nav.items.tickets, perm: "gala.tickets.read" },
    { href: "/gala/check-in", icon: ScanQrCode, label: t.nav.items.checkin, perm: "gala.checkin.validate" },
    { href: "/gala/exports", icon: FileDown, label: t.nav.items.galaExports, perm: "gala.guests.export" },
    { href: "/gala/communications", icon: Mail, label: t.nav.items.galaComms, perm: "gala.bookings.read" },
    { href: "/gala/settings", icon: Settings2, label: t.nav.items.galaSettings, perm: "gala.bookings.read" },
  ].filter((l) => can(l.perm));

  return (
    <>
      <PageHeader title={<bdi>{x.title}</bdi>} subtitle={x.subtitle} right={<TestToggle value={test} onChange={(v) => set({ test: v ? "1" : "" })} />} />
      <p className="text-sm text-muted"><bdi>{locale === "ar" && ev.titleAr ? ev.titleAr : ev.titleEn}</bdi> · <bdi dir="ltr">{ev.code}</bdi></p>
      {test && <Notice tone="warn">{t.gala.common.testNote}</Notice>}

      <WidgetState q={fin} minH="min-h-40">
        {fin.data && (() => {
          const b = bookingKpis(fin.data.bookingsByStatus);
          const tk = ticketKpis(fin.data.ticketsByStatus);
          const att = attendance(fin.data.ticketsByStatus);
          return (
            <div className="space-y-6">
              <Card labelledBy="ov-b">
                <CardHeader id="ov-b" title={x.bookings} />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="kpi-bookings">
                  <Stat label={x.totalBookings} value={n(b.total)} testId="kpi-total" />
                  <Stat label={x.confirmed} value={n(b.confirmed)} tone="ok" testId="kpi-confirmed" />
                  <Stat label={x.pending} value={n(b.pending)} tone="warn" />
                  <Stat label={x.cancelled} value={n(b.cancelled)} />
                  <Stat label={x.refunds} value={`${n(b.refundPending)} / ${n(b.refunded)}`} tone="info" />
                  <Stat label={x.failedPayments} value={failed.data ? n(failed.data.total) : "…"} tone="danger" sub={x.failedNote} />
                  <Stat label={x.guests} value={n(registeredGuests(fin.data.ticketsByStatus))} testId="kpi-guests" />
                </div>
              </Card>
              <Card labelledBy="ov-t">
                <CardHeader id="ov-t" title={x.tickets} />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Stat label={x.issued} value={n(tk.issued)} tone="info" testId="kpi-issued" />
                  <Stat label={x.pendingIssue} value={n(tk.pendingIssue)} />
                  <Stat label={x.checkedIn} value={n(tk.checkedIn)} tone="ok" />
                  <Stat label={x.notCheckedIn} value={n(tk.notCheckedIn)} />
                  <Stat label={x.voided} value={n(tk.void)} tone="danger" />
                </div>
              </Card>
              <div className="grid gap-6 xl:grid-cols-2">
                <Card labelledBy="ov-f">
                  <CardHeader id="ov-f" title={x.finance} subtitle={t.gala.common.ticketRevenue} />
                  <div className="grid gap-3 sm:grid-cols-3" data-testid="ticket-revenue" data-classification={fin.data.classification}>
                    <Stat label={x.gross} value={<Money value={fin.data.grossCaptured} currency={fin.data.currency} />} sub={fill(x.payments, { n: fin.data.capturedPayments })} tone="ok" />
                    <Stat label={x.refunded} value={<Money value={fin.data.refunded} currency={fin.data.currency} />} sub={fill(x.refundPayments, { n: fin.data.refundPayments })} tone="info" />
                    <Stat label={x.net} value={<Money value={fin.data.net} currency={fin.data.currency} />} />
                  </div>
                  <div className="mt-4 space-y-2 text-xs text-muted">
                    <p>{x.financeNote}</p>
                    <p data-testid="no-donation-figure">{x.donationsNote}</p>
                    <p>{x.taxNote}</p>
                    {fin.data.includesTestRecords && <p className="font-bold text-warn">{x.testIncluded}</p>}
                  </div>
                </Card>
                <Card labelledBy="ov-a">
                  <CardHeader id="ov-a" title={x.attendance} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Stat label={x.expected} value={n(att.expected)} />
                    <Stat label={x.checkedIn} value={n(att.checkedIn)} tone="ok" />
                    <Stat label={x.remaining} value={n(att.remaining)} />
                  </div>
                  <div className="mt-4 space-y-2">
                    {att.percent === null ? (
                      <p className="text-sm text-muted" data-testid="attendance-na">{x.noDenominator}</p>
                    ) : (
                      <>
                        <p className="flex justify-between text-sm"><span className="font-bold">{x.rate}</span><span className="num" data-testid="attendance-pct">{att.percent}%</span></p>
                        <Progress value={att.percent} label={x.rate} />
                      </>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          );
        })()}
      </WidgetState>

      <Card labelledBy="ov-s">
        <CardHeader id="ov-s" title={x.sales} />
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs font-bold text-muted">{x.sales}</dt><dd className="mt-1 font-bold" data-testid="sales-state">{cfg.data ? (cfg.data.salesEnabled ? x.salesOpen : x.salesClosed) : "—"}</dd></div>
          <div><dt className="text-xs font-bold text-muted">{x.checkout}</dt><dd className="mt-1 font-bold">{info.data ? (info.data.checkoutAvailable ? x.checkoutOn : x.checkoutOff) : "—"}</dd></div>
          <div><dt className="text-xs font-bold text-muted">{x.price}</dt><dd className="mt-1 font-bold">{cfg.data ? <Money value={cfg.data.ticketPrice} currency={cfg.data.currency} /> : "—"}</dd></div>
          <div><dt className="text-xs font-bold text-muted">{x.capacity}</dt><dd className="mt-1 font-bold">{cfg.data ? (cfg.data.capacity === null ? x.noCapacity : n(cfg.data.capacity)) : "—"}</dd></div>
        </dl>
      </Card>

      <Card labelledBy="ov-l">
        <CardHeader id="ov-l" title={x.links} />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {links.map((l) => (
            <Link key={l.href} href={href(l.href)} className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm font-bold text-ink hover:border-meki-green hover:bg-bg">
              <l.icon className="size-5 text-meki-green-dark" aria-hidden="true" /> {l.label}
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}
