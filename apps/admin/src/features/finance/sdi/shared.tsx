"use client";

import { FlaskConical } from "lucide-react";
import { useLocale } from "@/components/common/Providers";
import { useErrorText } from "@/components/finance/ui";
import { ApiError } from "@/lib/api";

/** SDI error codes first (stable API codes → translated text), then the shared finance messages. Raw server text is never shown. */
export function useSdiError() {
  const { t } = useLocale();
  const fallback = useErrorText();
  return (e: unknown) => (e instanceof ApiError && t.sdi.errors[e.code]) || fallback(e);
}

export const ROW_TONE: Record<string, string> = {
  MATCHED: "bg-ok/10 text-ok",
  ALREADY_APPLIED: "bg-bg text-muted",
  INFO: "bg-bg text-muted",
  STALE: "bg-bg text-body",
  UNMATCHED: "bg-warn/10 text-warn",
  REQUIRES_REVIEW: "bg-warn/10 text-warn",
  AMOUNT_MISMATCH: "bg-danger/10 text-danger",
  AMBIGUOUS: "bg-danger/10 text-danger",
  INVALID_REFERENCE: "bg-danger/10 text-danger",
  INVALID: "bg-danger/10 text-danger",
  DUPLICATE_ROW: "bg-info/10 text-info",
};
export const REPORT_TONE: Record<string, string> = { UPLOADED: "bg-bg text-body", PREVIEWED: "bg-info/10 text-info", APPLIED: "bg-ok/10 text-ok", REJECTED: "bg-danger/10 text-danger" };

export function Pill({ tone, children, data }: { tone: string; children: React.ReactNode; data?: string }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${tone}`} data-status={data}>{children}</span>;
}

export function RowBadge({ status }: { status: string }) {
  const { t } = useLocale();
  return <Pill tone={ROW_TONE[status] ?? "bg-bg text-body"} data={status}>{t.sdi.rowStatuses[status] ?? status}</Pill>;
}

export function ReportBadge({ status }: { status: string }) {
  const { t } = useLocale();
  return <Pill tone={REPORT_TONE[status] ?? "bg-bg text-body"} data={status}>{t.sdi.statuses[status] ?? status}</Pill>;
}

/** Synthetic fixtures are always labelled — they are never presented as SDI data. */
export function SyntheticBadge() {
  const { t } = useLocale();
  return (
    <span title={t.sdi.syntheticHint} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-warn/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-warn" data-testid="synthetic-badge">
      <FlaskConical className="size-3.5" aria-hidden="true" /> {t.sdi.synthetic}
    </span>
  );
}

export const fileSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);
