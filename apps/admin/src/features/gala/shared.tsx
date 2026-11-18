"use client";

/**
 * Phase 6E shared Gala components: event resolution (every page works on the chosen ticketed event), status badges, KPI tiles,
 * a reason-confirmation dialog and an authenticated download button. Reuses the Phase 6A–6D design system.
 */
import { useState, type ReactNode } from "react";
import { Download, Lock } from "lucide-react";
import type { Gate } from "@/lib/content";
import { useLocale } from "@/components/common/Providers";
import { EmptyState, ErrorState, WidgetSkeleton } from "@/components/common/States";
import { TextArea } from "@/components/content/ui";
import { ConfirmDialog, Notice } from "@/components/finance/ui";
import { FinancePage, type Crumb } from "@/features/finance/FinancePage";
import { useChosenEvent, useGalaEvents } from "@/hooks/useGalaData";
import { ApiError } from "@/lib/api";
import { GALA_CODE, galaTone, pickGalaEvent, reasonError, type GalaStatusKind, type Tone } from "@/lib/gala";
import type { GalaEvent } from "@/lib/gala-schemas";
import { fill } from "@/lib/i18n";

/** Gala page: AppShell + permission gate (FinancePage) + the resolved ticketed event. */
export function GalaPage({ crumbs, anyOf, children }: { crumbs: Crumb[]; anyOf: string[]; children: (ev: GalaEvent) => ReactNode }) {
  const { t } = useLocale();
  return (
    <FinancePage crumbs={[{ label: t.nav.groups.events }, ...crumbs]} anyOf={anyOf}>
      <EventGate>{children}</EventGate>
    </FinancePage>
  );
}

function EventGate({ children }: { children: (ev: GalaEvent) => ReactNode }) {
  const { locale, t } = useLocale();
  const q = useGalaEvents();
  const [chosen, choose] = useChosenEvent();
  if (q.isPending) return <WidgetSkeleton rows={4} minH="min-h-48" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} minH="min-h-48" />;
  const ev = pickGalaEvent(q.data, chosen);
  const selector = q.data.length > 1 && (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-bold text-body">{t.gala.common.chooseEvent}</span>
      <select className="min-h-10 max-w-full rounded-xl border border-line bg-white px-3 text-sm" value={ev?.id ?? ""} onChange={(e) => choose(e.target.value)} data-testid="gala-event-select">
        {!ev && <option value="">—</option>}
        {q.data.map((e) => (
          <option key={e.id} value={e.id}>{`${locale === "ar" && e.titleAr ? e.titleAr : e.titleEn} (${e.code})`}</option>
        ))}
      </select>
    </label>
  );
  if (!ev) return <>{selector}<EmptyState text={t.gala.common.noEvent} minH="min-h-48" /></>;
  return (
    <>
      {selector}
      {ev.code !== GALA_CODE && <Notice tone="warn">{fill(t.gala.common.otherEvent, { code: ev.code })}</Notice>}
      {children(ev)}
    </>
  );
}

const TONE_CLS: Record<Tone, string> = { ok: "bg-ok/10 text-ok", warn: "bg-warn/10 text-warn", danger: "bg-danger/10 text-danger", info: "bg-info/10 text-info", neutral: "bg-bg text-body" };

export function GalaBadge({ kind, status }: { kind: GalaStatusKind | "checkInState"; status: string }) {
  const { t } = useLocale();
  const tone = kind === "checkInState" ? (status === "CHECKED_IN" ? "ok" : "neutral") : galaTone(kind, status);
  const label = (t.gala.statuses[kind as keyof typeof t.gala.statuses] as Record<string, string>)[status] ?? status;
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${TONE_CLS[tone]}`} data-status={status}>{label}</span>;
}
export const TicketStatusBadge = ({ status }: { status: string }) => <GalaBadge kind="ticket" status={status} />;

/** API error → translated text (Gala codes first, then the shared finance/content texts). */
export function useGalaError() {
  const { t } = useLocale();
  return (e: unknown) => {
    if (!(e instanceof ApiError)) return t.fin.errors.default;
    const known = t.gala.errors[e.code] ?? t.fin.errors[e.code] ?? t.content.errors[e.code];
    if (known) return known;
    if (e.status === 403) return t.fin.errors.FORBIDDEN;
    if (e.status === 0) return t.fin.errors.NETWORK_ERROR;
    return `${t.fin.errors.default} (${e.code})`;
  };
}

export function Stat({ label, value, sub, tone = "neutral", testId }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; testId?: string }) {
  const bar: Record<Tone, string> = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", info: "bg-info", neutral: "bg-line" };
  return (
    <div className="relative min-w-0 overflow-hidden rounded-xl border border-line bg-white p-4">
      <span className={`absolute inset-y-0 start-0 w-1 ${bar[tone]}`} aria-hidden="true" />
      <p className="text-xs font-bold text-muted">{label}</p>
      <p className="num mt-1 text-2xl font-bold text-ink" data-testid={testId}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Progress({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} className="h-2.5 w-full overflow-hidden rounded-full bg-bg">
      <div className="h-full rounded-full bg-meki-green transition-[width]" style={{ width: `${v}%` }} />
    </div>
  );
}

/** Confirmation with a mandatory, audited reason (cancel / revoke / re-issue / undo check-in). */
export function ReasonDialog({ title, body, confirmLabel, busy, error, onClose, onConfirm, danger = true }: { title: string; body: ReactNode; confirmLabel: string; busy: boolean; error: string | null; onClose: () => void; onConfirm: (reason: string) => void; danger?: boolean }) {
  const { t } = useLocale();
  const [reason, setReason] = useState("");
  const bad = reasonError(reason);
  return (
    <ConfirmDialog open danger={danger} title={title} confirmLabel={confirmLabel} busy={busy} error={error} confirmDisabled={!!bad} onClose={onClose} onConfirm={() => !bad && onConfirm(reason.trim())}>
      <div className="space-y-3">
        <div>{body}</div>
        <TextArea label={t.gala.common.reason} value={reason} onChange={setReason} hint={t.gala.common.reasonHint} rows={2} maxLength={500} required />
      </div>
    </ConfirmDialog>
  );
}

/** Authenticated download (PDF / CSV / XLSX); shows the server's error instead of saving it as a file. */
export function DownloadButton({ run, label, disabled, title, className = "btn-admin btn-ghost", testId }: { run: () => Promise<string>; label: string; disabled?: boolean; title?: string; className?: string; testId?: string }) {
  const { t } = useLocale();
  const errText = useGalaError();
  const [state, setState] = useState<{ busy: boolean; msg: string | null; err: string | null }>({ busy: false, msg: null, err: null });
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        className={className}
        disabled={disabled || state.busy}
        title={title}
        data-testid={testId}
        onClick={() => {
          setState({ busy: true, msg: null, err: null });
          run().then(
            (name) => setState({ busy: false, msg: fill(t.gala.common.downloaded, { name }), err: null }),
            (e) => setState({ busy: false, msg: null, err: errText(e) }),
          );
        }}
      >
        {disabled ? <Lock className="size-4" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />} {state.busy ? t.gala.common.downloading : label}
      </button>
      {state.msg && <span className="text-xs text-ok" role="status">{state.msg}</span>}
      {state.err && <span className="text-xs text-danger" role="alert">{state.err}</span>}
    </span>
  );
}

/** Why an action is unavailable — Gala gate reasons (lib/gala.ts), translated EN/AR. */
export function GalaGateNotice({ gate, title }: { gate: Gate; title?: string }) {
  const { t } = useLocale();
  if (gate.allowed) return null;
  return (
    <div className="mt-2 rounded-lg bg-bg p-3 text-xs text-body" role="note">
      <p className="flex items-center gap-1.5 font-bold text-ink"><Lock className="size-3.5" aria-hidden="true" /> {title ?? t.gala.gate.title}</p>
      <ul className="mt-1 list-disc space-y-0.5 ps-5">{gate.reasons.map((r) => <li key={r}>{t.gala.gate[r] ?? r}</li>)}</ul>
    </div>
  );
}

/** "Include test bookings" switch (default off: test-provider records never mix with real figures). */
export function TestToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { t } = useLocale();
  // optimistic: the URL (source of truth) updates asynchronously; the box must not flick back meanwhile
  const [st, setSt] = useState({ base: value, shown: value });
  if (st.base !== value) setSt({ base: value, shown: value }); // the URL caught up (or changed elsewhere)
  const shown = st.shown;
  return (
    <label className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-body" title={t.gala.common.testNote}>
      <input type="checkbox" className="size-4 accent-meki-green" checked={shown} onChange={(e) => { setSt({ base: value, shown: e.target.checked }); onChange(e.target.checked); }} data-testid="include-test" />
      {t.gala.common.includeTest}
    </label>
  );
}
