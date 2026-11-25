"use client";

/**
 * Phase 6C content building blocks. Same tokens and classes as Phase 6A/6B (card, btn-admin, status pills, focus rings);
 * forms are new because 6A/6B had none beyond dialogs.
 */
import { useEffect, useId, useState, type ReactNode } from "react";
import { BadgeCheck, CheckCircle2, CircleDashed, FileText, FlaskConical, ImageOff, Lock, PencilRuler, Save, Undo2 } from "lucide-react";
import { useLocale } from "@/components/common/Providers";
import { Notice } from "@/components/finance/ui";
import { ApiError } from "@/lib/api";
import { previewSrc, type Gate } from "@/lib/content";
import { fill } from "@/lib/i18n";

// ───────────── badges ─────────────

const PROV: Record<string, { cls: string; icon: typeof BadgeCheck }> = {
  VERIFIED_SOURCE: { cls: "border-ok/30 bg-ok/10 text-ok", icon: BadgeCheck },
  PROPOSED: { cls: "border-info/30 bg-info/10 text-info", icon: PencilRuler },
  DEMO: { cls: "border-danger/40 bg-danger/10 text-danger", icon: FlaskConical },
};
/** Provenance is always visible and visually distinct (verified / proposed / demo). */
export function ProvenanceBadge({ value }: { value: string }) {
  const { t } = useLocale();
  const p = PROV[value] ?? { cls: "border-line bg-bg text-body", icon: CircleDashed };
  const Icon = p.icon;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold ${p.cls}`} data-provenance={value}>
      <Icon className="size-3.5" aria-hidden="true" /> {t.content.provenance[value] ?? value}
    </span>
  );
}

const STATUS_CLS: Record<string, string> = {
  PUBLISHED: "bg-ok/10 text-ok",
  IN_REVIEW: "bg-warn/10 text-warn",
  DRAFT: "bg-bg text-body",
  PAUSED: "bg-info/10 text-info",
  COMPLETED: "bg-deep-green/10 text-deep-green",
  ARCHIVED: "bg-line text-muted",
};
export function ContentStatusBadge({ status }: { status: string }) {
  const { t } = useLocale();
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_CLS[status] ?? "bg-bg text-body"}`}>{t.content.statuses[status] ?? status}</span>;
}

/** Banner explaining what the record's provenance means (DEMO in red). */
export function ProvenanceNotice({ value }: { value: string }) {
  const { t } = useLocale();
  const c = t.content.common;
  return <Notice tone={value === "DEMO" ? "warn" : value === "PROPOSED" ? "gold" : "info"}>{value === "DEMO" ? c.demoNotice : value === "PROPOSED" ? c.proposedNotice : c.verifiedNotice}</Notice>;
}

// ───────────── forms ─────────────

export const inputCls = "min-h-10 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-meki-green disabled:bg-bg disabled:text-muted aria-[invalid=true]:border-danger";

export function Field({ label, hint, error, required, children, id }: { label: string; hint?: ReactNode; error?: string | null; required?: boolean; children: (id: string, describedBy: string | undefined) => ReactNode; id?: string }) {
  const { t } = useLocale();
  const auto = useId();
  const fid = id ?? auto;
  const desc = [hint ? `${fid}-h` : "", error ? `${fid}-e` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="min-w-0">
      <label htmlFor={fid} className="mb-1 flex items-center gap-1 text-xs font-bold text-body">
        {label} {required && <span className="text-danger" aria-label={t.content.common.required}>*</span>}
      </label>
      {children(fid, desc)}
      {hint && <p id={`${fid}-h`} className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p id={`${fid}-e`} className="mt-1 text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}

export function TextInput({ label, value, onChange, error, hint, required, dir, disabled, maxLength, placeholder, type = "text", inputMode }: {
  label: string; value: string; onChange: (v: string) => void; error?: string | null; hint?: ReactNode; required?: boolean; dir?: "ltr" | "rtl"; disabled?: boolean; maxLength?: number; placeholder?: string; type?: string; inputMode?: "decimal" | "numeric" | "text";
}) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(id, d) => <input id={id} type={type} inputMode={inputMode} value={value} onChange={(e) => onChange(e.target.value)} dir={dir} disabled={disabled} maxLength={maxLength} placeholder={placeholder} aria-invalid={!!error} aria-describedby={d} aria-required={required} className={inputCls} />}
    </Field>
  );
}

export function TextArea({ label, value, onChange, error, hint, dir, disabled, rows = 4, maxLength, required }: { label: string; value: string; onChange: (v: string) => void; error?: string | null; hint?: ReactNode; dir?: "ltr" | "rtl"; disabled?: boolean; rows?: number; maxLength?: number; required?: boolean }) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(id, d) => <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} dir={dir} disabled={disabled} rows={rows} maxLength={maxLength} aria-invalid={!!error} aria-describedby={d} aria-required={required} className={`${inputCls} resize-y leading-relaxed`} />}
    </Field>
  );
}

export function Select({ label, value, onChange, options, disabled, error, hint, required, emptyLabel }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string; disabled?: boolean }[]; disabled?: boolean; error?: string | null; hint?: ReactNode; required?: boolean; emptyLabel?: string;
}) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(id, d) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-invalid={!!error} aria-describedby={d} aria-required={required} className={inputCls}>
          {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
          {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
}

export function Checkbox({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex min-h-10 items-center gap-2 text-sm text-ink">
      <input type="checkbox" className="size-4 accent-[var(--color-meki-green)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/**
 * English + Arabic versions of one text side by side (stacked on small screens). The Arabic input is RTL with Arabic fonts;
 * the English one stays LTR whatever the interface language.
 */
export function Bilingual({ label, en, ar, onEn, onAr, multiline = false, rows, requiredEn, errorEn, disabled, maxLength }: {
  label: string; en: string; ar: string; onEn: (v: string) => void; onAr: (v: string) => void; multiline?: boolean; rows?: number; requiredEn?: boolean; errorEn?: string | null; disabled?: boolean; maxLength?: number;
}) {
  const { t } = useLocale();
  const C = multiline ? TextArea : TextInput;
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-bold text-ink">{label}</legend>
      <div className="grid gap-3 md:grid-cols-2">
        <div lang="en"><C label={t.content.common.english} value={en} onChange={onEn} dir="ltr" rows={rows} required={requiredEn} error={errorEn} disabled={disabled} maxLength={maxLength} /></div>
        <div lang="ar"><C label={t.content.common.arabic} value={ar} onChange={onAr} dir="rtl" rows={rows} disabled={disabled} maxLength={maxLength} /></div>
      </div>
    </fieldset>
  );
}

/**
 * Sticky save bar with unsaved-change tracking. Warns before the tab is closed with unsaved changes (in-app navigation keeps
 * the unsaved form state only while the page stays mounted).
 */
export function SaveBar({ dirty, busy, onSave, onDiscard, disabled, message, error }: { dirty: number; busy: boolean; onSave: () => void; onDiscard: () => void; disabled?: boolean; message?: string | null; error?: string | null }) {
  const { t } = useLocale();
  const c = t.content.common;
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-white/95 px-4 py-3 shadow-[0_-8px_24px_-16px_rgb(11_59_48/0.35)] backdrop-blur sm:-mx-6 sm:px-6" role="region" aria-label={c.save}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-sm" aria-live="polite">
          {error ? <span className="text-danger" role="alert">{error}</span> : dirty ? <span className="font-bold text-warn">{fill(c.unsaved, { n: dirty })}</span> : message ? <span className="text-ok">{message}</span> : <span className="text-muted">{c.saved.split(" — ")[0]}</span>}
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-admin btn-ghost" disabled={!dirty || busy} onClick={onDiscard}><Undo2 className="size-4" aria-hidden="true" /> {c.discard}</button>
          <button type="button" className="btn-admin btn-primary" disabled={!dirty || busy || disabled} onClick={onSave}><Save className="size-4" aria-hidden="true" /> {busy ? c.saving : c.save}</button>
        </div>
      </div>
    </div>
  );
}

// ───────────── gates / errors ─────────────

export function ContentGateNotice({ gate, title }: { gate: Gate; title?: string }) {
  const { t } = useLocale();
  if (gate.allowed) return null;
  return (
    <div className="mt-2 rounded-lg bg-bg p-3 text-xs text-body" role="note">
      <p className="flex items-center gap-1.5 font-bold text-ink"><Lock className="size-3.5" aria-hidden="true" /> {title ?? t.content.gate.title}</p>
      <ul className="mt-1 list-disc space-y-0.5 ps-5">{gate.reasons.map((r) => <li key={r}>{t.content.gate[r] ?? r}</li>)}</ul>
    </div>
  );
}

/** Translated message for an API error; unknown codes fall back to the API's (English) message, never a stack trace. */
export function useContentError() {
  const { t } = useLocale();
  return (e: unknown) => {
    if (!(e instanceof ApiError)) return t.content.errors.default;
    const known = t.content.errors[e.code] ?? t.fin.errors[e.code];
    if (known) return known;
    if (e.status === 0) return t.content.errors.NETWORK_ERROR;
    return e.apiMessage ? `${t.content.errors.default} (${e.apiMessage})` : `${t.content.errors.default} (${e.code})`;
  };
}

/** Publish blockers the API returned (CAMPAIGN_NOT_PUBLISHABLE details.reasons / MISSING_FIELDS details.missing). */
export const serverReasons = (e: unknown): string[] => {
  if (!(e instanceof ApiError) || !e.details || typeof e.details !== "object") return [];
  const d = e.details as { reasons?: unknown; missing?: unknown };
  return [...(Array.isArray(d.reasons) ? d.reasons : []), ...(Array.isArray(d.missing) ? d.missing.map((m) => `missing: ${m}`) : [])].map(String);
};

export function Checklist({ items, label }: { items: { key: string; ok: boolean }[]; label: string }) {
  const { t } = useLocale();
  return (
    <ul className="space-y-2" aria-label={label}>
      {items.map((i) => (
        <li key={i.key} className="flex items-start gap-2 text-sm" data-ok={i.ok}>
          {i.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" /> : <CircleDashed className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />}
          <span className={i.ok ? "text-body" : "font-bold text-ink"}>
            <span className="sr-only">{i.ok ? "✓ " : "✗ "}</span>
            {t.content.checklist[i.key] ?? i.key}
            {!i.ok && <span className="block text-xs font-normal text-danger">{t.content.gate[`check.${i.key}`]}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ───────────── media thumbnail ─────────────

export function Thumb({ media, alt, className = "size-14" }: { media: { storageDriver: string; storageKey: string; url: string; altEn?: string | null; altAr?: string | null } | null | undefined; alt?: string; className?: string }) {
  const { locale } = useLocale();
  const src = media ? previewSrc(media) : null;
  // a preview that cannot load (curated website images are served by the public site; a consent-restricted file) shows the
  // neutral placeholder instead of a broken image
  const [failed, setFailed] = useState<string | null>(null);
  if (media && /\.pdf$/i.test(media.storageKey)) {
    // a PDF document (24 Nov 2026): document icon instead of an image preview
    return (
      <span className={`grid shrink-0 place-items-center rounded-lg border border-line bg-bg text-meki-green ${className}`} title={media.storageKey.split("/").pop() ?? ""}>
        <FileText className="size-5" aria-hidden="true" />
        <span className="sr-only">PDF</span>
      </span>
    );
  }
  if (!media || !src || failed === src) {
    return (
      <span className={`grid shrink-0 place-items-center rounded-lg border border-dashed border-line bg-bg text-muted ${className}`} aria-hidden="true" title={media ? (media.storageKey.split("/").pop() ?? "") : undefined}>
        <ImageOff className="size-5" />
      </span>
    );
  }
  const a = alt ?? (locale === "ar" ? media.altAr || media.altEn : media.altEn || media.altAr) ?? "";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- library previews come from the API (same-origin proxy), not optimizable at build time
    <img src={src} alt={a} loading="lazy" decoding="async" onError={() => setFailed(src)} className={`shrink-0 rounded-lg border border-line bg-bg object-cover ${className}`} />
  );
}
