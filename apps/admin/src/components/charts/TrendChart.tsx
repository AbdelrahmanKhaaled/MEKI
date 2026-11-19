"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { bucketLabel, formatMoney } from "@/lib/format";
import type { TrendPoint } from "@/lib/metrics";
import { useLocale } from "@/components/common/Providers";
import { ChartTable } from "./ChartTable";

export const CHART = { green: "#0b3b30", teal: "#008066", gold: "#d6a146", mint: "#7fb8a4", grid: "#e3e9e5", axis: "#66736d" };

/** Chart container is LTR for predictable SVG text; RTL is applied by mirroring the axes and tooltip alignment. */
export function TrendChart({ data, currency, labels, caption, periodLabel }: { data: TrendPoint[]; currency: string; labels: { gross: string; net: string }; caption?: string; periodLabel?: string }) {
  const { locale, rtl } = useLocale();
  return (
    <>
    <ChartTable caption={caption ?? `${labels.gross} / ${labels.net}`} columns={[periodLabel ?? "", labels.gross, labels.net]} rows={data.map((p) => ({ label: bucketLabel(p.key, locale), values: [formatMoney(p.gross, currency, locale), formatMoney(p.net, currency, locale)] }))} />
    <div dir="ltr" className="h-64 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="gGross" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.teal} stopOpacity={0.35} />
              <stop offset="100%" stopColor={CHART.teal} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gNet" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.gold} stopOpacity={0.3} />
              <stop offset="100%" stopColor={CHART.gold} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="key" reversed={rtl} tickFormatter={(k: string) => bucketLabel(k, locale)} tick={{ fill: CHART.axis, fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis orientation={rtl ? "right" : "left"} tickFormatter={(v: number) => formatMoney(v, currency, locale, { compact: true })} tick={{ fill: CHART.axis, fontSize: 12 }} tickLine={false} axisLine={false} width={56} />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div dir={rtl ? "rtl" : "ltr"} className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-[var(--shadow-pop)]">
                  <p className="mb-1 font-bold text-ink">{bucketLabel(String(label), locale)}</p>
                  {payload.map((p) => (
                    <p key={String(p.dataKey)} className="flex items-center gap-2 text-body">
                      <span className="size-2 rounded-full" style={{ background: p.color }} />
                      {p.dataKey === "gross" ? labels.gross : labels.net}: <bdi className="num font-bold">{formatMoney(Number(p.value), currency, locale)}</bdi>
                    </p>
                  ))}
                </div>
              ) : null
            }
          />
          <Area type="monotone" dataKey="gross" stroke={CHART.teal} strokeWidth={2.5} fill="url(#gGross)" isAnimationActive={false} dot={data.length < 3} />
          <Area type="monotone" dataKey="net" stroke={CHART.gold} strokeWidth={2.5} fill="url(#gNet)" isAnimationActive={false} dot={data.length < 3} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
    </>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-body" aria-hidden="true">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
