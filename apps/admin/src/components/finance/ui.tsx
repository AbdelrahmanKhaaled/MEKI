"use client";

/**
 * Shared Phase 6B building blocks. They reuse the Phase 6A design tokens and classes (card, card-title, btn-admin, status
 * pills, table header/row styles, Modal) so the new pages read as a continuation of the approved dashboard.
 */
import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Info, Lock, Search, SlidersHorizontal, X } from "lucide-react";
import { Modal } from "@/components/common/Modal";
import { useLocale } from "@/components/common/Providers";
import { ApiError } from "@/lib/api";
import { statusTone, type Gate, type StatusKind, type Tone } from "@/lib/finance";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { fill } from "@/lib/i18n";

// ───────────── text helpers ─────────────

/** Money stays a decimal string until display; direction-isolated so "$1,500" reads correctly inside Arabic text. */
export function Money({ value, currency, className = "" }: { value: string | null | undefined; currency: string; className?: string }) {
  const { locale } = useLocale();
  return <bdi dir="ltr" className={`num whitespace-nowrap ${className}`}>{value == null ? "—" : formatMoney(value, currency, locale)}</bdi>;
}

/** Financial identifiers (references, provider ids, e-mails): LTR, monospace, wrap anywhere so long refs never overflow. */
export function Ref({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <bdi dir="ltr" className={`font-mono text-xs break-all ${className}`}>{children}</bdi>;
}

export function DateText({ value, withTime = true }: { value: string | null | undefined; withTime?: boolean }) {
  const { locale } = useLocale();
  return value ? <time dateTime={value} className="num whitespace-nowrap">{formatDate(value, locale, withTime)}</time> : <span>—</span>;
}

// ───────────── badges ─────────────

const TONE_CLS: Record<Tone, string> = {
  ok: "bg-ok/10 text-ok",
  warn: "bg-warn/10 text-warn",
  danger: "bg-danger/10 text-danger",
  info: "bg-info/10 text-info",
  neutral: "bg-bg text-body",
};

export function StatusBadge({ kind, status }: { kind: StatusKind; status: string }) {
  const { t } = useLocale();
  const label = t.fin.statuses[kind][status] ?? status;
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${TONE_CLS[statusTone(kind, status)]}`}>{label}</span>;
}

/** Visible marker for test-provider records (never real money). */
export function TestBadge({ show = true }: { show?: boolean }) {
  const { t } = useLocale();
  if (!show) return null;
  return (
    <span title={t.fin.common.testHint} className="inline-flex whitespace-nowrap rounded-full border border-harvest-gold/60 bg-[#faf0d9] px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-gold-text">
      {t.fin.common.test}
    </span>
  );
}

// ───────────── page scaffolding ─────────────

export function PageHeader({ title, subtitle, back, right, badges }: { title: ReactNode; subtitle?: string; back?: { href: string; label?: string }; right?: ReactNode; badges?: ReactNode }) {
  const { t, rtl } = useLocale();
  return (
    <section className="flex flex-wrap items-end justify-between gap-4" aria-labelledby="page-title">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-meki-green-dark hover:underline">
            <ArrowLeft className={`size-4 ${rtl ? "rotate-180" : ""}`} aria-hidden="true" /> {back.label ?? t.fin.common.back}
          </Link>
        )}
        <h1 id="page-title" className="break-words text-3xl text-deep-green">{title}</h1>
        {badges && <div className="mt-2 flex flex-wrap items-center gap-2">{badges}</div>}
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-body">{subtitle}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </section>
  );
}

/** Informational banner (fiscal-sponsor notice, provider truth, read-only notes). */
export function Notice({ children, tone = "info", icon: Icon = Info }: { children: ReactNode; tone?: "info" | "warn" | "gold"; icon?: typeof Info }) {
  const cls = tone === "warn" ? "border-warn/30 bg-warn/5 text-ink" : tone === "gold" ? "border-harvest-gold/40 bg-[#fbf5e6] text-ink" : "border-info/25 bg-info/5 text-ink";
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${cls}`} role="note">
      <Icon className="mt-0.5 size-5 shrink-0 opacity-70" aria-hidden="true" />
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}

export function DetailGrid({ items, cols = 3 }: { items: [string, ReactNode][]; cols?: 2 | 3 | 4 }) {
  const grid = cols === 2 ? "sm:grid-cols-2" : cols === 4 ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2 xl:grid-cols-3";
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-4 ${grid}`}>
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-bold uppercase tracking-wide text-muted">{k}</dt>
          <dd className="mt-1 break-words text-sm text-ink">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

// ───────────── data table (desktop table + mobile cards, same data) ─────────────

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** numeric columns are end-aligned and LTR */
  numeric?: boolean;
  className?: string;
}

export function DataTable<T>({ rows, columns, rowKey, dimmed = false, minW = "min-w-[64rem]", caption }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; dimmed?: boolean; minW?: string; caption: string }) {
  const [first, ...rest] = columns;
  return (
    <>
      {/* ≥ md: real table, horizontally scrollable inside its card */}
      {/* focusable, named scroll region: keyboard users can scroll a wide table even when its rows hold no links (WCAG 2.1.1) */}
      <div tabIndex={0} role="region" aria-label={caption} className="-mx-5 hidden overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-meki-green sm:-mx-6 md:block">
        <table className={`w-full ${minW} text-start text-sm`}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-y border-line bg-bg/70 text-xs uppercase tracking-wide text-muted">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`px-4 py-3 font-bold first:ps-5 last:pe-5 sm:first:ps-6 sm:last:pe-6 ${c.numeric ? "text-end" : "text-start"}`}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody className={dimmed ? "opacity-60" : ""}>
            {rows.map((r) => (
              <tr key={rowKey(r)} className="border-b border-line/70 align-top hover:bg-bg/50">
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 first:ps-5 last:pe-5 sm:first:ps-6 sm:last:pe-6 ${c.numeric ? "text-end" : ""} ${c.className ?? ""}`}>{c.cell(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* < md: one card per row; every column is kept (label + value), nothing is dropped */}
      <ul className={`space-y-3 md:hidden ${dimmed ? "opacity-60" : ""}`} aria-label={caption}>
        {rows.map((r) => (
          <li key={rowKey(r)} className="rounded-xl border border-line p-4">
            <div className="mb-3 text-sm font-bold text-ink">{first.cell(r)}</div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              {rest.map((c) => (
                <div key={c.key} className="min-w-0">
                  <dt className="text-[0.7rem] font-bold uppercase tracking-wide text-muted">{c.header}</dt>
                  <dd className="mt-0.5 break-words text-sm text-ink">{c.cell(r)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (p: number) => void }) {
  const { locale, t, rtl } = useLocale();
  const c = t.fin.common;
  return (
    <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-body" aria-label={fill(c.page, { page, pages: totalPages })}>
      <span>{fill(c.total, { n: formatNumber(total, locale) })}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="btn-admin btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          {rtl ? <ChevronRight className="size-4" aria-hidden="true" /> : <ChevronLeft className="size-4" aria-hidden="true" />} {c.prev}
        </button>
        <span className="num">{fill(c.page, { page: formatNumber(page, locale), pages: formatNumber(totalPages, locale) })}</span>
        <button type="button" className="btn-admin btn-ghost" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          {c.next} {rtl ? <ChevronLeft className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </nav>
  );
}

// ───────────── filters ─────────────

const fieldBase = "min-h-10 rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-meki-green";
const field = `${fieldBase} w-full`;

/** Search box: debounced (350 ms) so typing does not fire a request per keystroke; the value is committed to the URL state. */
export function SearchFilter({ value, onChange, label, ltr = true }: { value: string; onChange: (v: string) => void; label: string; ltr?: boolean }) {
  const [input, setInput] = useState(value);
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    // the committed value changed from outside (clear filters / back navigation): show it
    setSynced(value);
    setInput(value);
  }
  useEffect(() => {
    if (input.trim() === value) return;
    const h = setTimeout(() => onChange(input.trim()), 350);
    return () => clearTimeout(h);
  }, [input, value, onChange]);
  return (
    <label className="relative block min-w-0 sm:w-64">
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input type="search" value={input} onChange={(e) => setInput(e.target.value)} placeholder={label} dir={ltr ? "ltr" : undefined} className={`${field} ps-9 ${ltr ? "rtl:text-end" : ""}`} />
    </label>
  );
}

export function SelectFilter({ value, onChange, label, options, allLabel }: { value: string; onChange: (v: string) => void; label: string; options: { value: string; label: string }[]; allLabel: string }) {
  const id = useId();
  return (
    <div className="min-w-0 sm:w-auto">
      <label htmlFor={id} className="mb-1 block text-xs font-bold text-muted">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${field} sm:min-w-40`}>
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function DateRangeFilter({ from, to, onChange, label, invalid }: { from: string; to: string; onChange: (patch: { from?: string; to?: string }) => void; label: string; invalid: boolean }) {
  const { t } = useLocale();
  const id = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 block text-xs font-bold text-muted">{label}</legend>
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <label className="sr-only" htmlFor={`${id}-f`}>{t.fin.common.from}</label>
        <input id={`${id}-f`} type="date" value={from} max={to || undefined} onChange={(e) => onChange({ from: e.target.value })} aria-invalid={invalid} className={`${fieldBase} w-full sm:w-40`} dir="ltr" />
        <span className="text-muted" aria-hidden="true">–</span>
        <label className="sr-only" htmlFor={`${id}-t`}>{t.fin.common.to}</label>
        <input id={`${id}-t`} type="date" value={to} min={from || undefined} onChange={(e) => onChange({ to: e.target.value })} aria-invalid={invalid} className={`${fieldBase} w-full sm:w-40`} dir="ltr" />
      </div>
      {invalid && <p className="mt-1 text-xs text-danger" role="alert">{t.fin.common.invalidRange}</p>}
    </fieldset>
  );
}

/**
 * Filter panel: always visible on ≥ md; on phones it collapses behind a "Filters" button (with the active-filter count) so the
 * table stays reachable. `onClear` resets every filter at once.
 */
export function FilterBar({ children, active, onClear }: { children: ReactNode; active: number; onClear: () => void }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-2 md:hidden">
        <button type="button" className="btn-admin btn-ghost" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          <SlidersHorizontal className="size-4" aria-hidden="true" /> {t.fin.common.filters}
          {active > 0 && <span className="num rounded-full bg-deep-green px-2 text-xs text-white">{active}</span>}
        </button>
        {active > 0 && <button type="button" className="text-sm font-bold text-meki-green-dark" onClick={onClear}>{t.fin.common.clear}</button>}
      </div>
      <div id={id} className={`${open ? "mt-3 flex" : "hidden"} flex-col gap-3 md:mt-0 md:flex md:flex-row md:flex-wrap md:items-end`}>
        {children}
        {active > 0 && (
          <button type="button" onClick={onClear} className="btn-admin btn-ghost hidden md:inline-flex">
            <X className="size-4" aria-hidden="true" /> {t.fin.common.clear}
          </button>
        )}
      </div>
    </div>
  );
}

// ───────────── actions ─────────────

/** Explains why an action is unavailable (permission, state, provider). Shown instead of a fake working button. */
export function GateNotice({ gate }: { gate: Gate }) {
  const { t } = useLocale();
  if (gate.allowed) return null;
  return (
    <div className="mt-2 rounded-lg bg-bg p-3 text-xs text-body" role="note">
      <p className="flex items-center gap-1.5 font-bold text-ink"><Lock className="size-3.5" aria-hidden="true" /> {t.fin.gate.title}</p>
      <ul className="mt-1 list-disc space-y-0.5 ps-5">
        {gate.reasons.map((r) => <li key={r}>{t.fin.gate[r]}</li>)}
      </ul>
    </div>
  );
}

/** Translated, user-safe message for a failed mutation (stable API error codes; never raw server text). */
export function useErrorText() {
  const { t } = useLocale();
  return (e: unknown) => {
    if (!(e instanceof ApiError)) return t.fin.errors.default;
    return t.fin.errors[e.code] ?? (e.status === 403 ? t.fin.errors.FORBIDDEN : e.status === 0 ? t.fin.errors.NETWORK_ERROR : `${t.fin.errors.default} (${e.code})`);
  };
}

/**
 * Confirmation dialog for real mutations. The confirm button is disabled while the request runs; success is reported only
 * after the API answered (the caller closes the dialog in its onSuccess). Errors are shown inline.
 */
export function ConfirmDialog({ open, title, onClose, onConfirm, confirmLabel, busy, error, children, danger = false, confirmDisabled = false }: {
  open: boolean; title: string; onClose: () => void; onConfirm: () => void; confirmLabel: string; busy: boolean; error?: string | null; children: ReactNode; danger?: boolean; confirmDisabled?: boolean;
}) {
  const { t } = useLocale();
  return (
    <Modal
      open={open}
      title={title}
      closeLabel={t.fin.common.cancel}
      onClose={() => !busy && onClose()}
      footer={
        <>
          <button type="button" className="btn-admin btn-ghost" disabled={busy} onClick={onClose}>{t.fin.common.cancel}</button>
          <button type="button" className={`btn-admin ${danger ? "bg-danger text-white hover:opacity-90" : "btn-primary"}`} disabled={busy || confirmDisabled} onClick={onConfirm}>
            {busy ? t.fin.common.submitting : confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {children}
        {error && <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

export function Tabs<K extends string>({ tabs, active, onChange, label }: { tabs: { key: K; label: string }[]; active: K; onChange: (k: K) => void; label: string }) {
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = (e.key === "ArrowRight" ? 1 : -1) * (document.documentElement.dir === "rtl" ? -1 : 1);
    const next = tabs[(i + dir + tabs.length) % tabs.length];
    onChange(next.key);
    document.getElementById(`tab-${next.key}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1">
      {tabs.map((tb, i) => (
        <button
          key={tb.key}
          id={`tab-${tb.key}`}
          role="tab"
          type="button"
          aria-selected={active === tb.key}
          aria-controls={`panel-${tb.key}`}
          tabIndex={active === tb.key ? 0 : -1}
          onKeyDown={(e) => onKey(e, i)}
          onClick={() => onChange(tb.key)}
          className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold transition-colors ${active === tb.key ? "bg-deep-green text-white" : "text-body hover:bg-bg"}`}
        >
          {tb.label}
        </button>
      ))}
    </div>
  );
}
