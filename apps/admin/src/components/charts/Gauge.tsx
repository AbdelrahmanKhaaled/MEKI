import { formatPercent } from "@/lib/format";

/**
 * Semi-circle gauge (SVG, dependency-free). `value` null → empty track and "—": a gauge is never drawn from a missing figure.
 * The sweep mirrors in RTL (rtl:-scale-x-100 on the arc only; the numeric label stays upright).
 */
export function Gauge({ value, label, locale, tone = "green" }: { value: number | null; label: string; locale: "en" | "ar"; tone?: "green" | "gold" | "teal" }) {
  const r = 52;
  const c = Math.PI * r; // half circumference
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  const color = tone === "gold" ? "#d6a146" : tone === "teal" ? "#008066" : "#0b3b30";
  const d = `M ${60 - r} 62 A ${r} ${r} 0 0 1 ${60 + r} 62`;
  return (
    <figure className="text-center" aria-label={`${label}: ${formatPercent(value, locale)}`}>
      <div className="relative mx-auto w-36">
        <svg viewBox="0 0 120 70" className="w-full rtl:-scale-x-100" aria-hidden="true">
          <path d={d} fill="none" stroke="#e6ede9" strokeWidth="11" strokeLinecap="round" />
          {value !== null && v > 0 && <path d={d} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} />}
        </svg>
        <p className="num absolute inset-x-0 bottom-0 font-serif text-xl text-deep-green">{formatPercent(value, locale)}</p>
      </div>
      <figcaption className="mt-2 text-sm text-body">{label}</figcaption>
    </figure>
  );
}
