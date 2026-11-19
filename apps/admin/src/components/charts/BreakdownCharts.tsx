"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, formatPercent } from "@/lib/format";
import { useLocale } from "@/components/common/Providers";
import { CHART } from "./TrendChart";
import { ChartTable } from "./ChartTable";

/** Headers of the visually hidden data table that accompanies every chart. */
export interface ChartTableLabels { caption: string; category: string; amount: string; share?: string }

const PALETTE = [CHART.green, CHART.teal, CHART.gold, CHART.mint, "#145a45", "#b9d9cb"];

const tip = (rtl: boolean, fmt: (v: number) => string) =>
  function Tip({ active, payload }: { active?: boolean; payload?: readonly { name?: string | number; value?: unknown; color?: string; payload?: { label?: string; name?: string } }[] }) {
    if (!active || !payload?.length) return null;
    return (
      <div dir={rtl ? "rtl" : "ltr"} className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-[var(--shadow-pop)]">
        {payload.map((p, i) => (
          <p key={i} className="text-body">
            <span className="font-bold text-ink">{p.payload?.label ?? p.payload?.name ?? p.name}</span>: <bdi className="num font-bold">{fmt(Number(p.value))}</bdi>
          </p>
        ))}
      </div>
    );
  };

export interface SliceDatum {
  key: string;
  label: string;
  value: number;
}

/** Donut + legend rows (share %, amount). Values are net donations in ONE currency. */
export function DonutChart({ data, currency, centerLabel, table }: { data: SliceDatum[]; currency: string; centerLabel: string; table?: ChartTableLabels }) {
  const { locale, rtl } = useLocale();
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div>
      <ChartTable caption={table?.caption ?? centerLabel} columns={[table?.category ?? "", table?.amount ?? "", table?.share ?? ""]} rows={data.map((d) => ({ label: d.label, values: [formatMoney(d.value, currency, locale), formatPercent(total > 0 ? Math.round((d.value / total) * 1000) / 10 : null, locale)] }))} />
      <div dir="ltr" className="relative mx-auto h-48 w-48" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <PieChart accessibilityLayer={false}>
            <Pie rootTabIndex={-1} data={data} dataKey="value" nameKey="label" innerRadius={62} outerRadius={90} paddingAngle={2} startAngle={rtl ? 450 : 90} endAngle={rtl ? 90 : -270} stroke="none" isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={d.key} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip content={tip(rtl, (v) => formatMoney(v, currency, locale))} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="num font-serif text-xl text-deep-green">{formatMoney(total, currency, locale, { compact: true })}</p>
            <p className="text-xs text-muted">{centerLabel}</p>
          </div>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {data.map((d, i) => (
          <li key={d.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-ink">
              <span className="size-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
              {d.label}
            </span>
            <span className="num rounded-full bg-bg px-2.5 py-0.5 text-xs font-bold text-body">{formatPercent(total > 0 ? Math.round((d.value / total) * 1000) / 10 : null, locale)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const trunc = (s: string, n = 14) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Vertical gradient bars (one value per category, ONE currency). */
export function VerticalBars({ data, currency, table }: { data: { name: string; value: number }[]; currency: string; table?: ChartTableLabels }) {
  const { locale, rtl } = useLocale();
  return (
    <>
    <ChartTable caption={table?.caption ?? ""} columns={[table?.category ?? "", table?.amount ?? ""]} rows={data.map((d) => ({ label: d.name, values: [formatMoney(d.value, currency, locale)] }))} />
    <div dir="ltr" className="h-60 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="gBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.teal} />
              <stop offset="100%" stopColor={CHART.green} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" reversed={rtl} tickFormatter={(s: string) => trunc(s)} tick={{ fill: CHART.axis, fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis orientation={rtl ? "right" : "left"} tickFormatter={(v: number) => formatMoney(v, currency, locale, { compact: true })} tick={{ fill: CHART.axis, fontSize: 12 }} tickLine={false} axisLine={false} width={56} />
          <Tooltip cursor={{ fill: "rgba(0,128,102,0.06)" }} content={tip(rtl, (v) => formatMoney(v, currency, locale))} />
          <Bar dataKey="value" fill="url(#gBar)" radius={[8, 8, 0, 0]} maxBarSize={56} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
    </>
  );
}

/** Stacked bars: net + refunded per category (ONE currency). */
export function StackedBars({ data, currency, labels, table }: { data: { name: string; net: number; refunded: number }[]; currency: string; labels: { net: string; refunded: string }; table?: ChartTableLabels }) {
  const { locale, rtl } = useLocale();
  return (
    <>
    <ChartTable caption={table?.caption ?? `${labels.net} / ${labels.refunded}`} columns={[table?.category ?? "", labels.net, labels.refunded]} rows={data.map((d) => ({ label: d.name, values: [formatMoney(d.net, currency, locale), formatMoney(d.refunded, currency, locale)] }))} />
    <div dir="ltr" className="h-60 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" reversed={rtl} tick={{ fill: CHART.axis, fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis orientation={rtl ? "right" : "left"} tickFormatter={(v: number) => formatMoney(v, currency, locale, { compact: true })} tick={{ fill: CHART.axis, fontSize: 12 }} tickLine={false} axisLine={false} width={56} />
          <Tooltip cursor={{ fill: "rgba(0,128,102,0.06)" }} content={({ active, payload }) => (active && payload?.length ? (
            <div dir={rtl ? "rtl" : "ltr"} className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-[var(--shadow-pop)]">
              {payload.map((p) => (
                <p key={String(p.dataKey)} className="text-body">
                  {p.dataKey === "net" ? labels.net : labels.refunded}: <bdi className="num font-bold">{formatMoney(Number(p.value), currency, locale)}</bdi>
                </p>
              ))}
            </div>
          ) : null)} />
          <Bar dataKey="net" stackId="a" fill={CHART.teal} maxBarSize={64} isAnimationActive={false} />
          <Bar dataKey="refunded" stackId="a" fill={CHART.gold} radius={[8, 8, 0, 0]} maxBarSize={64} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
    </>
  );
}
