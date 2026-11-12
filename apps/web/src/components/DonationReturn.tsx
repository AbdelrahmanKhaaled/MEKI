"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, XCircle, Ban, ShieldQuestion, FileText, RotateCcw } from "lucide-react";
import type { PaymentSessionResponse, PublicDonationStatus } from "@meki/api-client";
import type { Dict } from "@/content/en";
import { formatMoney, type Locale } from "@/lib/i18n";
import { ApiRequestError, PUBLIC_API_URL, clientApi } from "@/lib/api";
import { isDonationReference, recallDonationToken } from "@/lib/donation-session";

const POLL_MS = 2500;
const MAX_POLLS = 24; // ~1 minute, then "still processing"

type View = "loading" | "processing" | "slow" | "success" | "failed" | "cancelled" | "unknown";

/**
 * Shows the donation outcome strictly from GET /public/donations/:ref/status. A provider redirect to this page
 * proves nothing: success is shown only when the API reports confirmed=true (set by a verified provider event).
 */
export function DonationReturn({ t, locale, reference, cancelled }: { t: Dict; locale: Locale; reference: string | null; cancelled: boolean }) {
  const s = t.donationStatus;
  const [view, setView] = useState<View>("loading");
  const [data, setData] = useState<PublicDonationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const token = useRef<string | null>(null);

  // Poll the verified status until it settles (or ~1 minute). Stops on unmount / dependency change.
  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let polls = 0;
    token.current = isDonationReference(reference) ? recallDonationToken(reference) : null;
    const tick = async () => {
      await Promise.resolve(); // state updates happen asynchronously, never in the effect body
      if (stopped) return;
      if (!isDonationReference(reference) || !token.current) return setView("unknown");
      try {
        const d = await clientApi<PublicDonationStatus>(`/public/donations/${reference}/status?locale=${locale}`, { token: token.current });
        if (stopped) return;
        setData(d);
        if (d.confirmed) return setView("success");
        if (d.status === "FAILED") return setView("failed");
        if (cancelled && d.status === "PENDING") return setView("cancelled");
        if (d.status === "PENDING") {
          polls += 1;
          if (polls >= MAX_POLLS) return setView("slow");
          setView("processing");
          timer = window.setTimeout(() => void tick(), POLL_MS);
          return;
        }
        setView("failed"); // CANCELLED / EXPIRED intents can no longer be paid
      } catch (e) {
        if (!stopped) setView(e instanceof ApiRequestError && e.status === 404 ? "unknown" : "slow");
      }
    };
    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [reference, locale, cancelled, reload]);

  /** New checkout session for the same donation (also covers expired sessions). */
  const retry = async () => {
    if (!reference || !token.current || busy) return;
    setBusy(true);
    try {
      const session = await clientApi<PaymentSessionResponse>(`/public/donations/${reference}/payment-session`, { method: "POST", token: token.current });
      const url = session.checkoutUrl ? new URL(session.checkoutUrl) : null;
      if (url && (url.protocol === "https:" || url.protocol === "http:")) return window.location.assign(url.toString());
      setBusy(false);
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiRequestError && e.code === "DONATION_ALREADY_PAID") setReload((n) => n + 1);
    }
  };

  /** Receipt is fetched with the token in a header and shown from a local blob (token never in a URL). */
  const openReceipt = async () => {
    if (!reference || !token.current || !PUBLIC_API_URL) return;
    const win = window.open("", "_blank");
    try {
      const res = await fetch(`${PUBLIC_API_URL}/public/donations/${reference}/receipt?locale=${locale}`, {
        headers: { "X-Donation-Token": token.current },
        cache: "no-store",
        credentials: "omit",
      });
      if (!res.ok) throw new Error("receipt unavailable");
      const blob = new Blob([await res.text()], { type: "text/html" });
      const href = URL.createObjectURL(blob);
      if (win) win.location.href = href;
      else window.location.assign(href);
      window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
    } catch {
      win?.close();
    }
  };

  const content: Record<Exclude<View, "loading">, { icon: React.ReactNode; title: string; text: string }> = {
    processing: { icon: <Clock className="size-7" strokeWidth={1.6} />, title: s.processingTitle, text: s.processingText },
    slow: { icon: <Clock className="size-7" strokeWidth={1.6} />, title: s.processingTitle, text: s.stillProcessingText },
    success: { icon: <CheckCircle2 className="size-7" strokeWidth={1.6} />, title: s.successTitle, text: s.successText },
    failed: { icon: <XCircle className="size-7" strokeWidth={1.6} />, title: s.failedTitle, text: s.failedText },
    cancelled: { icon: <Ban className="size-7" strokeWidth={1.6} />, title: s.cancelledTitle, text: s.cancelledText },
    unknown: { icon: <ShieldQuestion className="size-7" strokeWidth={1.6} />, title: s.unknownTitle, text: s.unknownText },
  };
  const c = view === "loading" ? content.processing : content[view];
  const tone = view === "success" ? "bg-meki-green/10 text-meki-green" : view === "failed" ? "bg-[#b00020]/10 text-[#8a0019]" : "bg-harvest-gold/15 text-gold-text";

  return (
    <div className="container-x">
      <section aria-live="polite" aria-busy={view === "loading" || view === "processing"} className="relative mx-auto max-w-xl overflow-hidden rounded-[1.75rem] bg-paper p-7 text-ink shadow-[var(--shadow-lift)] sm:p-10">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-harvest-gold via-glow to-harvest-gold" />
        {data?.isTest && (
          <p role="note" className="mb-5 rounded-xl bg-[#b00020] px-3 py-2 text-center text-xs font-bold uppercase tracking-[0.12em] text-white">
            {s.testNotice}
          </p>
        )}
        <span className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-gold-text">{s.eyebrow}</span>
        <div className={`mb-5 grid size-14 place-items-center rounded-full ${tone}`}>{c.icon}</div>
        <h1 className="mb-3 text-3xl sm:text-4xl">{c.title}</h1>
        <p className="text-body-grey">{c.text}</p>

        {data && view !== "unknown" && (
          <dl className="mt-6 grid gap-2 rounded-2xl border border-stone-line bg-limestone px-4 py-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-body-grey">{s.amount}</dt>
              <dd className="font-bold">{formatMoney(data.amount, data.currency, locale)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-body-grey">{s.purpose}</dt>
              <dd className="text-end font-bold">{data.purpose ?? s.generalFund}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-body-grey">{s.reference}</dt>
              <dd className="font-mono font-bold" dir="ltr">
                {data.reference}
              </dd>
            </div>
            {view === "success" && data.receiptNumber && (
              <div className="flex justify-between gap-4">
                <dt className="text-body-grey">{s.receiptNumber}</dt>
                <dd className="font-mono font-bold" dir="ltr">
                  {data.receiptNumber}
                </dd>
              </div>
            )}
          </dl>
        )}

        <div className="mt-7 flex flex-wrap gap-3">
          {view === "success" && data?.receiptNumber && (
            <button type="button" onClick={() => void openReceipt()} className="btn btn-green">
              <FileText className="size-4" aria-hidden="true" /> {s.receipt}
            </button>
          )}
          {(view === "failed" || view === "cancelled") && (
            <button type="button" onClick={() => void retry()} disabled={busy} className="btn btn-gold disabled:cursor-wait disabled:opacity-70">
              <RotateCcw className="size-4" aria-hidden="true" /> {s.retry}
            </button>
          )}
          <Link href={`/${locale}`} className="btn btn-outline">
            {s.home}
          </Link>
        </div>
      </section>
    </div>
  );
}
