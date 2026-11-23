"use client";

/**
 * CMS live publishing — one honest, app-wide status line after any content mutation (CMS, programmes, campaigns, FAQs,
 * statistics, settings, Gala content, media metadata):
 *  - revalidated → "the live website has been refreshed" (only after the website confirmed it)
 *  - pending     → the change is committed; the website refresh retries automatically; "Retry now" for publishers
 *  - disabled    → instant refresh not configured; the website shows the change within its 5-minute window
 * On load it also asks the API whether a refresh is still pending (e.g. after a reload during an outage).
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Info, RefreshCw, TriangleAlert, X } from "lucide-react";
import { useLocale } from "@/components/common/Providers";
import { useAuth } from "@/features/auth/AuthProvider";
import { onRevalidation, type RevalidationOutcome } from "@/lib/api";
import { liveAr, liveEn } from "@/lib/i18n-live";
import { getRevalidationStatus, retryRevalidation } from "@/services/cms";

const AUTO_HIDE_MS: Partial<Record<RevalidationOutcome, number>> = { revalidated: 8000, disabled: 15000 };

export function LiveSiteNotice() {
  const { locale } = useLocale();
  const { can } = useAuth();
  const qc = useQueryClient();
  const x = (locale === "ar" ? liveAr : liveEn).notice;
  const [outcome, setOutcome] = useState<RevalidationOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const canRead = can("content.read");

  useEffect(() => onRevalidation((o) => { setRetryFailed(false); setOutcome(o); }), []);

  // a refresh still pending on the server (e.g. the page was reloaded during a website outage)
  useEffect(() => {
    if (!canRead) return;
    let alive = true;
    getRevalidationStatus().then((s) => alive && s.state === "pending" && setOutcome("pending"), () => undefined);
    return () => { alive = false; };
  }, [canRead]);

  useEffect(() => {
    const ms = outcome ? AUTO_HIDE_MS[outcome] : undefined;
    if (!ms) return;
    const t = setTimeout(() => setOutcome(null), ms);
    return () => clearTimeout(t);
  }, [outcome]);

  if (!outcome) return null;
  const retry = async () => {
    setBusy(true);
    try {
      const s = await retryRevalidation();
      if (s.state === "ok") setOutcome("revalidated");
      else setRetryFailed(true);
      void qc.invalidateQueries({ queryKey: ["cms", "revalidation"] });
    } catch {
      setRetryFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const tone = outcome === "revalidated" ? "border-ok/30 bg-[#eaf6ef] text-ok" : outcome === "pending" ? "border-warn/40 bg-[#fdf6e7] text-warn" : "border-info/30 bg-[#eef4fb] text-info";
  const Icon = outcome === "revalidated" ? CheckCircle2 : outcome === "pending" ? TriangleAlert : Info;
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex justify-end sm:inset-x-6" role="region" aria-label={x.region}>
      <div className={`pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded-xl border p-3 text-sm shadow-lg ${tone}`} role={outcome === "pending" ? "alert" : "status"} data-testid="live-site-notice" data-outcome={outcome}>
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-ink">{retryFailed ? x.retryFailed : x[outcome]}</p>
        {outcome === "pending" && can("content.publish") && (
          <button type="button" className="btn-admin btn-ghost !min-h-8 shrink-0" disabled={busy} onClick={() => void retry()} data-testid="live-site-retry">
            <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" /> {busy ? x.retrying : x.retry}
          </button>
        )}
        <button type="button" className="shrink-0 rounded p-1 text-muted hover:bg-white/60" onClick={() => setOutcome(null)} aria-label={x.dismiss}>
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
