import type { ReactNode } from "react";

export function Card({ children, className = "", id, labelledBy }: { children: ReactNode; className?: string; id?: string; labelledBy?: string }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={`card min-w-0 p-5 sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

/** Title + optional subtitle on the start side, an action (menu / link / select) on the end side — mirrors in RTL. */
export function CardHeader({ id, title, subtitle, right }: { id?: string; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id={id} className="card-title">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

type Tone = "green" | "teal" | "gold" | "ink";
const TONES: Record<Tone, { bg: string; chip: string }> = {
  green: { bg: "bg-gradient-to-br from-[#e6f2ec] to-white", chip: "bg-deep-green text-white" },
  teal: { bg: "bg-gradient-to-br from-[#dff3ee] to-white", chip: "bg-meki-green text-white" },
  gold: { bg: "bg-gradient-to-br from-[#faf0d9] to-white", chip: "bg-harvest-gold text-deep-green-3" },
  ink: { bg: "bg-gradient-to-br from-[#e9eeec] to-white", chip: "bg-deep-green-2 text-white" },
};

/** Statistic card: icon, metric, hint. `trend` is rendered ONLY when the caller has a valid comparison (never invented). */
export function KpiCard({ tone, icon, label, value, hint, trend }: { tone: Tone; icon: ReactNode; label: string; value: ReactNode; hint?: string; trend?: { text: string; positive: boolean } | null }) {
  return (
    <div className={`card ${TONES[tone].bg} p-5 transition-shadow hover:shadow-[var(--shadow-pop)]`}>
      <div className="flex items-start justify-between gap-3">
        <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${TONES[tone].chip}`} aria-hidden="true">
          {icon}
        </span>
        {trend && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${trend.positive ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`}>{trend.text}</span>}
      </div>
      <p className="mt-4 text-sm font-bold text-body">{label}</p>
      <p className="num mt-1 font-serif text-3xl text-deep-green">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const TILE: Record<string, string> = {
  green: "from-[#d9efe4] to-white text-ok",
  amber: "from-[#fbeccb] to-white text-warn",
  red: "from-[#f7dcd9] to-white text-danger",
  grey: "from-[#e8ecea] to-white text-body",
  teal: "from-[#d8f0ea] to-white text-meki-green-dark",
  blue: "from-[#dce9f6] to-white text-info",
};
export function TintTile({ tone, label, value, hint, icon }: { tone: keyof typeof TILE; label: string; value: ReactNode; hint?: string; icon?: ReactNode }) {
  return (
    <div className={`rounded-xl border border-line bg-gradient-to-br ${TILE[tone]} p-4`}>
      <div className="flex items-center gap-2 text-sm font-bold">
        {icon}
        <span className="text-body">{label}</span>
      </div>
      <p className="num mt-2 font-serif text-2xl text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Thin progress bar. `percent` null → no bar (no invented completion). */
export function ProgressBar({ percent, label, tone = "green" }: { percent: number | null; label: string; tone?: "green" | "gold" }) {
  if (percent === null) return null;
  const v = Math.max(0, Math.min(100, percent));
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label={label} className="h-2.5 w-full overflow-hidden rounded-full bg-[#e6ede9]">
      <div className={`h-full rounded-full ${tone === "gold" ? "bg-gradient-to-r from-harvest-gold to-glow" : "bg-gradient-to-r from-deep-green to-meki-green"} transition-[width] duration-700 motion-reduce:transition-none`} style={{ width: `${v}%` }} />
    </div>
  );
}
