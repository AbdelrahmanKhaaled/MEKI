"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Banknote, CalendarDays, ChevronDown, Eye, FileText, HandCoins, KeyRound, Layers, Lock, Megaphone, PanelsTopLeft, ScanQrCode, ShieldCheck, Ticket, Users } from "lucide-react";
import { Card, CardHeader, KpiCard, ProgressBar, TintTile } from "@/components/cards/Card";
import { DonutChart, StackedBars, VerticalBars } from "@/components/charts/BreakdownCharts";
import { Gauge } from "@/components/charts/Gauge";
import { Legend, TrendChart, CHART } from "@/components/charts/TrendChart";
import { Dropdown } from "@/components/common/Dropdown";
import { Modal } from "@/components/common/Modal";
import { useLocale } from "@/components/common/Providers";
import { EmptyState, WidgetState } from "@/components/common/States";
import { useActivity, useByCampaign, useByDate, useCampaigns, useDonations, useDonorCount, useGala, useProgrammeCount, useStatusMix, useSummary } from "@/hooks/useDashboardData";
import { useAuth } from "@/features/auth/AuthProvider";
import { describeAudit, formatDate, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { fill } from "@/lib/i18n";
import {
  bucketTrend, campaignProgress, currenciesOf, designationSlices, flowFor, frequencySplit, galaMetrics, greetingKey, intervalFor, pickCurrency, pct,
  programmePerformance, rangeFor, recurringShare, refundRate, relativeTime, statusCounts, topCampaigns, type RangePreset,
} from "@/lib/metrics";
import type { DonationRow } from "@/lib/schemas";

const PRESETS: RangePreset[] = ["last7", "last30", "thisMonth", "lastMonth", "ytd", "all"];

export function DashboardPage() {
  const { locale, t, rtl } = useLocale();
  const { user, can } = useAuth();
  const d = t.dashboard;
  const [preset, setPreset] = useState<RangePreset>("last30");
  const [chosen, setChosen] = useState<string | null>(null);
  const range = useMemo(() => rangeFor(preset), [preset]);

  const canReports = can("reports.read");
  const canDonations = can("donations.read");
  const canDonors = can("donors.read");
  const canProgrammes = can("programmes.read");
  const canCampaigns = can("campaigns.read");
  const canAudit = can("audit.read");
  const canGala = can("gala.bookings.read") && can("events.read");
  const canCheckIn = can("gala.checkin.validate");

  const summaryAll = useSummary(range, null, canReports); // discovers which currencies have confirmed payments
  const currency = pickCurrency(currenciesOf(summaryAll.data), chosen);
  const ready = canReports && !!currency;
  const summary = useSummary(range, currency, ready);
  const statusMix = useStatusMix(null, canReports);
  const byDate = useByDate(range, currency, ready);
  const byCampaign = useByCampaign(range, currency, ready);
  const donors = useDonorCount(canDonors);
  const programmes = useProgrammeCount(canProgrammes);
  const campaigns = useCampaigns(canCampaigns);
  const activity = useActivity(canAudit);
  const gala = useGala(canCheckIn, canGala);

  const flow = flowFor(summary.data, currency);
  const status = statusMix.data ? statusCounts(statusMix.data.donationsByStatus) : null;
  const trend = useMemo(() => (byDate.data ? bucketTrend(byDate.data, currency, intervalFor(range)) : []), [byDate.data, currency, range]);
  const slices = useMemo(() => designationSlices(byCampaign.data ?? [], currency, { general: d.distribution.general, campaigns: d.distribution.campaigns, programmes: d.distribution.programmes }), [byCampaign.data, currency, d]);
  const programmeBars = useMemo(() => programmePerformance(byCampaign.data ?? [], currency).map((p) => ({ name: p.name, value: p.value })), [byCampaign.data, currency]);
  const progress = useMemo(() => campaignProgress(campaigns.data ?? [], byCampaign.data ?? [], currency), [campaigns.data, byCampaign.data, currency]);
  const freq = useMemo(() => frequencySplit(summary.data, currency).map((f) => ({ name: f.frequency === "MONTHLY" ? d.stacked.monthly : d.stacked.oneTime, net: f.net, refunded: f.refunded })), [summary.data, currency, d]);
  const top = useMemo(() => topCampaigns(byCampaign.data ?? [], currency), [byCampaign.data, currency]);
  const galaM = gala.data ? galaMetrics(gala.data.financials, gala.data.capacity, gala.data.stats) : null;
  const money = (v: string | number, c = currency ?? "USD") => <bdi className="num">{formatMoney(v, c, locale)}</bdi>;
  const noReports = !canReports ? { text: t.states.forbidden, locked: true } : false;
  const noCurrency = canReports && summaryAll.isSuccess && !currency ? { text: t.empty.noConfirmed } : false;
  const unavailable = noReports || noCurrency;
  const hour = new Date().getHours();
  const firstName = user?.name.split(/\s+/)[0] ?? "";

  return (
    <div className="space-y-6">
      {/* A — welcome + filters */}
      <section className="flex flex-wrap items-end justify-between gap-4" aria-labelledby="page-title">
        <div>
          <h1 id="page-title" className="text-3xl text-deep-green">
            {d.welcome[greetingKey(hour)]}, <bdi>{firstName}</bdi>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-body">{d.welcome.text}</p>
          <p className="mt-1 text-xs text-muted">{formatDate(new Date().toISOString(), locale)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canReports && (
            <Dropdown
              label={d.range.label}
              trigger={
                <span className="btn-admin btn-ghost">
                  <CalendarDays className="size-4" aria-hidden="true" /> {d.range[preset]} <ChevronDown className="size-4" aria-hidden="true" />
                </span>
              }
              items={PRESETS.map((p) => ({ key: p, label: d.range[p], active: p === preset, onSelect: () => setPreset(p) }))}
            />
          )}
          {canReports && (currenciesOf(summaryAll.data).length > 1 || (currency && currenciesOf(summaryAll.data).length === 1)) && (
            <Dropdown
              label={d.currency}
              trigger={
                <span className="btn-admin btn-ghost">
                  {d.currency}: <bdi>{currency}</bdi> <ChevronDown className="size-4" aria-hidden="true" />
                </span>
              }
              items={currenciesOf(summaryAll.data).map((c) => ({ key: c, label: c, active: c === currency, onSelect: () => setChosen(c) }))}
            />
          )}
        </div>
      </section>

      {/* B — KPI cards (no trend badges: no valid comparison is computed) */}
      <section aria-label="KPI" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard tone="green" icon={<HandCoins className="size-5" />} label={d.kpi.donations} hint={flow ? `${formatNumber(flow.count, locale)} ${d.hero.donationsCount}` : d.kpi.donationsHint} value={!canReports ? <Lock className="size-6 text-muted" aria-label={d.kpi.noPermission} /> : summaryAll.isPending || (ready && summary.isPending) ? "…" : flow ? money(flow.gross) : "—"} />
        <KpiCard tone="teal" icon={<Users className="size-5" />} label={d.kpi.donors} hint={d.kpi.donorsHint} value={!canDonors ? <Lock className="size-6 text-muted" aria-label={d.kpi.noPermission} /> : donors.isPending ? "…" : donors.isError ? "—" : formatNumber(donors.data!, locale)} />
        <KpiCard tone="gold" icon={<Layers className="size-5" />} label={d.kpi.programs} hint={d.kpi.programsHint} value={!canProgrammes ? <Lock className="size-6 text-muted" aria-label={d.kpi.noPermission} /> : programmes.isPending ? "…" : programmes.isError ? "—" : formatNumber(programmes.data!, locale)} />
        <KpiCard tone="ink" icon={<Ticket className="size-5" />} label={d.kpi.gala} hint={d.kpi.galaHint} value={!canGala ? <Lock className="size-6 text-muted" aria-label={d.kpi.noPermission} /> : gala.isPending ? "…" : galaM ? formatNumber(galaM.confirmedGuests, locale) : "—"} />
      </section>

      {/* hero + donation overview */}
      <div className="grid gap-4 xl:grid-cols-12">
        <section aria-labelledby="hero-t" className="relative min-w-0 overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-deep-green via-deep-green-2 to-meki-green p-6 text-white shadow-[var(--shadow-card)] xl:col-span-4">
          <div className="pointer-events-none absolute -end-10 -top-10 size-44 rounded-full bg-white/6" aria-hidden="true" />
          <p id="hero-t" className="text-sm text-mint">{d.hero.title}</p>
          <p className="num mt-2 font-serif text-4xl">{unavailable ? "—" : flow ? money(flow.net) : summary.isPending && ready ? "…" : "—"}</p>
          <p className="text-xs text-mint/80">{d.hero.sub}</p>
          <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-white/10 p-3">
              <dt className="text-xs text-mint">{d.hero.gross}</dt>
              <dd className="mt-1 font-bold">{flow ? money(flow.gross) : "—"}</dd>
            </div>
            <div className="rounded-xl bg-white/10 p-3">
              <dt className="text-xs text-mint">{d.hero.refunded}</dt>
              <dd className="mt-1 font-bold">{flow ? money(flow.refunded) : "—"}</dd>
            </div>
          </dl>
          {canDonations && (
            <a href="#recent-donations" className="mt-6 flex items-center justify-between rounded-xl bg-white/15 px-4 py-3 text-sm font-bold hover:bg-white/25">
              {d.hero.view} <ArrowRight className={`size-4 ${rtl ? "rotate-180" : ""}`} aria-hidden="true" />
            </a>
          )}
        </section>

        <Card className="xl:col-span-8" labelledBy="ov-t">
          <CardHeader id="ov-t" title={d.overview.title} subtitle={d.overview.subtitle} />
          <WidgetState q={statusMix} unavailable={noReports} isEmpty={!!status && status.confirmed + status.pending + status.failed + status.cancelled === 0} emptyText={t.states.empty}>
            {status && (() => {
              const total = status.confirmed + status.pending + status.failed + status.cancelled;
              return (
                <div>
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-sm text-muted">{d.overview.total}</p>
                      <p className="num font-serif text-3xl text-deep-green">{formatNumber(total, locale)}</p>
                    </div>
                    <p className="text-sm text-body">{formatPercent(pct(BigInt(status.confirmed) * 1_000_000n, BigInt(total) * 1_000_000n), locale)} {d.overview.confirmed.toLowerCase()}</p>
                  </div>
                  <ProgressBar percent={pct(BigInt(status.confirmed) * 1_000_000n, BigInt(total) * 1_000_000n)} label={d.overview.confirmed} />
                  <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
                    {([
                      ["green", d.overview.confirmed, status.confirmed],
                      ["amber", d.overview.pending, status.pending],
                      ["red", d.overview.failed, status.failed],
                      ["grey", d.overview.cancelled, status.cancelled],
                      ["teal", d.overview.refunded, status.refunded],
                    ] as const).map(([tone, label, n]) => (
                      <TintTile key={label} tone={tone} label={label} value={formatNumber(n, locale)} hint={fill(d.overview.of, { total: formatNumber(total, locale) })} />
                    ))}
                  </div>
                </div>
              );
            })()}
          </WidgetState>
        </Card>
      </div>

      {/* trend + (distribution, flow) + progress + programmes */}
      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8" labelledBy="tr-t">
          <CardHeader id="tr-t" title={d.trend.title} subtitle={d.trend.note} right={<Legend items={[{ label: d.trend.gross, color: CHART.teal }, { label: d.trend.net, color: CHART.gold }]} />} />
          <WidgetState q={byDate} unavailable={unavailable} isEmpty={trend.length === 0} emptyText={t.empty.noData} minH="min-h-64">
            {currency && <TrendChart data={trend} currency={currency} labels={{ gross: d.trend.gross, net: d.trend.net }} />}
          </WidgetState>
        </Card>

        <div className="min-w-0 space-y-4 xl:col-span-4 xl:row-span-2">
          <Card labelledBy="di-t">
            <CardHeader id="di-t" title={d.distribution.title} subtitle={d.distribution.subtitle} />
            <WidgetState q={byCampaign} unavailable={unavailable} isEmpty={slices.length === 0} emptyText={t.empty.noData} minH="min-h-56">
              {currency && <DonutChart data={slices} currency={currency} centerLabel={d.distribution.subtitle} />}
            </WidgetState>
          </Card>
          <Card labelledBy="fl-t">
            <CardHeader id="fl-t" title={d.flow.title} />
            <WidgetState q={summary} unavailable={unavailable} isEmpty={!flow} emptyText={t.empty.noData} minH="min-h-28">
              {flow && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <TintTile tone="green" label={d.flow.gross} value={<span className="text-lg">{money(flow.gross)}</span>} />
                  <TintTile tone="red" label={d.flow.refunded} value={<span className="text-lg">{money(flow.refunded)}</span>} />
                  <TintTile tone="teal" label={d.flow.net} value={<span className="text-lg">{money(flow.net)}</span>} />
                </div>
              )}
            </WidgetState>
          </Card>
        </div>

        <Card className="xl:col-span-4" labelledBy="pg-t">
          <CardHeader id="pg-t" title={d.progress.title} subtitle={d.progress.subtitle} />
          <WidgetState q={campaigns} unavailable={!canCampaigns ? { text: t.states.forbidden, locked: true } : unavailable} isEmpty={progress.length === 0} emptyText={t.empty.noData} minH="min-h-56">
            <ul className="space-y-5">
              {progress.slice(0, 5).map((p) => (
                <li key={p.slug}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-bold text-ink" title={p.title}><bdi>{p.title}</bdi></span>
                    <span className="num shrink-0 text-xs text-body">{p.percent === null ? d.progress.noTarget : formatPercent(p.percent, locale)}</span>
                  </div>
                  <ProgressBar percent={p.percent} label={p.title} tone="gold" />
                  <p className="mt-1 text-xs text-muted">
                    {money(p.raised, p.currency)} {d.progress.raised}
                    {p.target && <> {d.progress.of} {money(p.target, p.currency)}</>}
                  </p>
                </li>
              ))}
            </ul>
          </WidgetState>
        </Card>

        <Card className="xl:col-span-4" labelledBy="pp-t">
          <CardHeader id="pp-t" title={d.programs.title} subtitle={d.programs.subtitle} />
          <WidgetState q={byCampaign} unavailable={unavailable} isEmpty={programmeBars.length === 0} emptyText={d.programs.note} minH="min-h-56">
            {currency && (
              <>
                <VerticalBars data={programmeBars} currency={currency} />
                <p className="mt-2 text-xs text-muted">{d.programs.note}</p>
              </>
            )}
          </WidgetState>
        </Card>
      </div>

      {/* gauges + stacked */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card labelledBy="ga-t">
          <CardHeader id="ga-t" title={d.gauges.title} />
          <WidgetState q={summary} unavailable={unavailable} isEmpty={!flow} emptyText={t.empty.noData} minH="min-h-44">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <Gauge value={refundRate(flow)} label={d.gauges.refundRate} locale={locale} tone="gold" />
              <Gauge value={recurringShare(summary.data, currency)} label={d.gauges.recurring} locale={locale} tone="teal" />
              <Gauge value={galaM?.checkInPct ?? null} label={d.gauges.checkin} locale={locale} />
            </div>
          </WidgetState>
        </Card>
        <Card labelledBy="st-t">
          <CardHeader id="st-t" title={d.stacked.title} subtitle={d.stacked.subtitle} right={<Legend items={[{ label: d.stacked.net, color: CHART.teal }, { label: d.stacked.refunded, color: CHART.gold }]} />} />
          <WidgetState q={summary} unavailable={unavailable} isEmpty={freq.length === 0} emptyText={t.empty.noData} minH="min-h-56">
            {currency && <StackedBars data={freq} currency={currency} labels={{ net: d.stacked.net, refunded: d.stacked.refunded }} />}
          </WidgetState>
        </Card>
      </div>

      {/* H — Gala (separate from donations) */}
      <Card id="gala" labelledBy="gl-t">
        <CardHeader id="gl-t" title={d.gala.title} subtitle={d.gala.subtitle} />
        <WidgetState q={gala} unavailable={!canGala ? { text: t.states.forbidden, locked: true } : false} isEmpty={gala.isSuccess && !gala.data} emptyText={d.gala.notSetUp} minH="min-h-28">
          {galaM && (
            <div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <TintTile tone="blue" label={d.gala.bookings} value={formatNumber(galaM.bookingsTotal, locale)} />
                <TintTile tone="green" label={d.gala.confirmed} value={formatNumber(galaM.confirmedGuests, locale)} />
                <TintTile tone="amber" label={d.gala.pending} value={formatNumber(galaM.bookingsPending, locale)} />
                <TintTile tone="teal" label={d.gala.checkedIn} value={canCheckIn || galaM.checkedIn > 0 ? formatNumber(galaM.checkedIn, locale) : "—"} />
                <TintTile tone="grey" label={d.gala.revenue} value={money(galaM.ticketRevenue, galaM.currency)} />
              </div>
              <div className="mt-5">
                <p className="mb-2 text-sm font-bold text-ink">{d.gala.progress}</p>
                {galaM.salesProgressPct === null ? (
                  <p className="text-sm text-muted">{d.gala.noCapacity}</p>
                ) : (
                  <>
                    <ProgressBar percent={galaM.salesProgressPct} label={d.gala.progress} tone="gold" />
                    <p className="mt-1 text-xs text-muted">{formatPercent(galaM.salesProgressPct, locale)}</p>
                  </>
                )}
              </div>
            </div>
          )}
        </WidgetState>
      </Card>

      {/* top campaigns + activity + quick actions */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card labelledBy="tp-t">
          <CardHeader id="tp-t" title={d.top.title} subtitle={d.top.subtitle} />
          <WidgetState q={byCampaign} unavailable={unavailable} isEmpty={top.length === 0} emptyText={t.empty.noData} minH="min-h-56">
            <ol className="space-y-3">
              {top.map((c, i) => (
                <li key={c.slug} className={`flex items-center justify-between gap-3 rounded-xl border border-line p-3 ${["bg-gradient-to-r from-[#e6f2ec] to-white", "bg-gradient-to-r from-[#faf0d9] to-white", "bg-gradient-to-r from-[#dff3ee] to-white"][i % 3]}`}>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-ink" title={c.title}><bdi>{c.title}</bdi></p>
                    <p className="text-xs text-muted">{money(c.net)}</p>
                  </div>
                  <span className="num shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-body">{formatNumber(c.donations, locale)} {d.top.donations}</span>
                </li>
              ))}
            </ol>
          </WidgetState>
        </Card>

        <Card labelledBy="ac-t">
          <CardHeader id="ac-t" title={d.activity.title} subtitle={d.activity.subtitle} />
          <WidgetState q={activity} unavailable={!canAudit ? { text: t.states.forbidden, locked: true } : false} isEmpty={(activity.data?.length ?? 0) === 0} emptyText={d.activity.none} minH="min-h-56">
            <ol className="relative space-y-4 before:absolute before:inset-y-2 before:start-4 before:w-px before:bg-line">
              {(activity.data ?? []).map((a) => {
                const info = describeAudit(a.action);
                const rel = relativeTime(a.createdAt);
                const Icon = info.category === "donation" || info.category === "payment" ? Banknote : info.category === "gala" ? Ticket : info.category === "access" ? KeyRound : info.category === "content" ? FileText : ShieldCheck;
                return (
                  <li key={a.id} className="relative flex gap-3">
                    <span className="z-10 grid size-8 shrink-0 place-items-center rounded-full border border-line bg-white text-meki-green-dark" aria-hidden="true"><Icon className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink" title={a.action}><bdi>{info.text}</bdi></p>
                      <p className="truncate text-xs text-muted">{d.activity.by} <bdi>{a.actorEmail ?? d.activity.system}</bdi>{a.entityId ? <> · <bdi>{a.entityType}</bdi></> : null}</p>
                    </div>
                    <time dateTime={a.createdAt} title={formatDate(a.createdAt, locale, true)} className="shrink-0 text-xs text-muted">{rel ? fill(d.activity.ago[rel.unit], { n: rel.value }) : "—"}</time>
                  </li>
                );
              })}
            </ol>
          </WidgetState>
        </Card>

        <Card labelledBy="qa-t">
          <CardHeader id="qa-t" title={d.quick.title} />
          <QuickActions can={{ donations: canDonations, gala: canGala, programmes: canProgrammes, campaigns: canCampaigns, checkin: canCheckIn, content: can("content.read") }} />
        </Card>
      </div>

      {/* I — recent donations */}
      <RecentDonations enabled={canDonations} />
    </div>
  );
}

function QuickActions({ can }: { can: Record<"donations" | "gala" | "programmes" | "campaigns" | "checkin" | "content", boolean> }) {
  const { locale, t, rtl } = useLocale();
  const q = t.dashboard.quick;
  const items = [
    { k: "donations", icon: HandCoins, label: q.viewDonations, sub: q.viewDonationsSub, href: "#recent-donations", cls: "bg-deep-green text-white" },
    { k: "gala", icon: Ticket, label: q.gala, sub: q.galaSub, href: "#gala", cls: "bg-meki-green text-white" },
    { k: "programmes", icon: Layers, label: q.programs, sub: q.programsSub, href: `/${locale}/programs`, cls: "bg-harvest-gold text-deep-green-3" },
    { k: "campaigns", icon: Megaphone, label: q.campaigns, sub: q.campaignsSub, href: `/${locale}/campaigns`, cls: "bg-deep-green-2 text-white" },
    { k: "checkin", icon: ScanQrCode, label: q.checkin, sub: q.checkinSub, cls: "bg-ink text-white" },
    { k: "content", icon: PanelsTopLeft, label: q.content, sub: q.contentSub, cls: "bg-[#2b6a58] text-white" },
  ] as const;
  const shown = items.filter((i) => can[i.k]);
  if (shown.length === 0) return <EmptyState text={t.states.empty} />;
  return (
    <ul className="space-y-2.5">
      {shown.map((i) => {
        const inner = (
          <>
            <span className="grid size-9 place-items-center rounded-lg bg-white/15" aria-hidden="true"><i.icon className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold">{i.label}</span>
              <span className="block truncate text-xs opacity-80">{i.sub}</span>
            </span>
            {"href" in i && <ArrowRight className={`size-4 ${rtl ? "rotate-180" : ""}`} aria-hidden="true" />}
          </>
        );
        return (
          <li key={i.k}>
            {"href" in i ? (
              <a href={i.href} className={`flex items-center gap-3 rounded-xl p-3 transition-transform hover:-translate-y-0.5 motion-reduce:transform-none ${i.cls}`}>{inner}</a>
            ) : (
              <span aria-disabled="true" className={`flex cursor-not-allowed items-center gap-3 rounded-xl p-3 opacity-55 ${i.cls}`}>{inner}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const STATUS_TONE: Record<string, string> = { PAID: "bg-ok/10 text-ok", PARTIALLY_REFUNDED: "bg-info/10 text-info", REFUNDED: "bg-info/10 text-info", UNPAID: "bg-warn/10 text-warn", AUTHORIZED: "bg-warn/10 text-warn", FAILED: "bg-danger/10 text-danger" };

function RecentDonations({ enabled }: { enabled: boolean }) {
  const { locale, t } = useLocale();
  const tb = t.dashboard.table;
  const [page, setPage] = useState(1);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [paymentStatus, setStatus] = useState("");
  const [detail, setDetail] = useState<DonationRow | null>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(input.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(id);
  }, [input]);
  const q = useDonations({ page, search: search || undefined, paymentStatus: paymentStatus || undefined }, enabled);
  const donorName = (r: DonationRow) => (r.isAnonymous ? tb.anonymous : r.donor ? (r.donor.organizationName || `${r.donor.firstName} ${r.donor.lastName}`).trim() : tb.hidden);
  const designation = (r: DonationRow) => {
    const a = r.allocations[0];
    return !a ? "—" : a.campaign?.titleEn ?? a.programme?.nameEn ?? tb.general;
  };
  const filtered = !!search || !!paymentStatus;
  return (
    <Card id="recent-donations" labelledBy="rd-t">
      <CardHeader
        id="rd-t"
        title={tb.title}
        right={
          enabled ? (
            <div className="flex flex-wrap gap-2">
              <input type="search" value={input} onChange={(e) => setInput(e.target.value)} placeholder={tb.search} aria-label={tb.search} dir="ltr" className="min-h-10 w-48 rounded-xl border border-line px-3 text-sm outline-none focus:border-meki-green" />
              <select value={paymentStatus} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label={tb.status} className="min-h-10 rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-meki-green">
                <option value="">{tb.all}</option>
                {Object.entries(tb.statuses).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          ) : undefined
        }
      />
      <WidgetState q={q} unavailable={!enabled ? { text: t.states.forbidden, locked: true } : false} isEmpty={q.data?.items.length === 0} emptyText={filtered ? tb.empty : tb.emptyAll} minH="min-h-56">
        {q.data && (
          <>
            <div className="-mx-5 overflow-x-auto sm:-mx-6">
              <table className="w-full min-w-[56rem] text-start text-sm">
                <thead>
                  <tr className="border-y border-line bg-bg/70 text-xs uppercase tracking-wide text-muted">
                    {[tb.donor, tb.reference, tb.designation, tb.amount, tb.currency, tb.paymentStatus, tb.date, tb.actions].map((h) => (
                      <th key={h} scope="col" className="px-4 py-3 text-start font-bold first:ps-5 last:pe-5 sm:first:ps-6 sm:last:pe-6">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={q.isPlaceholderData ? "opacity-60" : ""}>
                  {q.data.items.map((r) => (
                    <tr key={r.id} className="border-b border-line/70 hover:bg-bg/50">
                      <td className="px-4 py-3 font-bold text-ink first:ps-5 sm:first:ps-6"><bdi>{donorName(r)}</bdi></td>
                      <td className="px-4 py-3 font-mono text-xs"><bdi>{r.reference}</bdi></td>
                      <td className="max-w-48 truncate px-4 py-3" title={designation(r)}><bdi>{designation(r)}</bdi></td>
                      <td className="num px-4 py-3 font-bold"><bdi>{formatMoney(r.amount, r.currency, locale)}</bdi></td>
                      <td className="px-4 py-3"><bdi>{r.currency}</bdi></td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_TONE[r.paymentStatus] ?? "bg-bg text-body"}`}>{tb.statuses[r.paymentStatus] ?? r.paymentStatus}</span></td>
                      <td className="px-4 py-3 text-body">{formatDate(r.confirmedAt ?? r.createdAt, locale)}</td>
                      <td className="px-4 py-3 last:pe-5 sm:last:pe-6">
                        <button type="button" onClick={() => setDetail(r)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-meki-green-dark hover:bg-bg">
                          <Eye className="size-4" aria-hidden="true" /> {tb.view}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-body">
              <span>{fill(tb.total, { n: formatNumber(q.data.total, locale) })}</span>
              <div className="flex items-center gap-2">
                <button type="button" className="btn-admin btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{tb.prev}</button>
                <span className="num">{fill(tb.page, { page, pages: q.data.totalPages })}</span>
                <button type="button" className="btn-admin btn-ghost" disabled={page >= q.data.totalPages} onClick={() => setPage((p) => p + 1)}>{tb.next}</button>
              </div>
            </div>
          </>
        )}
      </WidgetState>
      <Modal open={!!detail} title={tb.detail.title} closeLabel={tb.detail.close} onClose={() => setDetail(null)} footer={<button type="button" className="btn-admin btn-primary" onClick={() => setDetail(null)}>{tb.detail.close}</button>}>
        {detail && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {([
              [tb.donor, <bdi key="a">{donorName(detail)}</bdi>],
              [tb.reference, <bdi key="b" className="font-mono">{detail.reference}</bdi>],
              [tb.designation, <bdi key="c">{designation(detail)}</bdi>],
              [tb.detail.frequency, detail.frequency === "MONTHLY" ? tb.detail.monthly : tb.detail.oneTime],
              [tb.detail.gross, <bdi key="d" className="num">{formatMoney(detail.amount, detail.currency, locale)}</bdi>],
              [tb.detail.refunded, <bdi key="e" className="num">{formatMoney(detail.refundedAmount, detail.currency, locale)}</bdi>],
              [tb.detail.net, <bdi key="f" className="num font-bold">{formatMoney(detail.netAmount, detail.currency, locale)}</bdi>],
              [tb.paymentStatus, tb.statuses[detail.paymentStatus] ?? detail.paymentStatus],
              [tb.detail.created, formatDate(detail.createdAt, locale, true)],
              [tb.detail.confirmed, detail.confirmedAt ? formatDate(detail.confirmedAt, locale, true) : tb.detail.notConfirmed],
            ] as [string, React.ReactNode][]).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs uppercase tracking-wide text-muted">{k}</dt>
                <dd className="mt-0.5 text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </Modal>
    </Card>
  );
}

