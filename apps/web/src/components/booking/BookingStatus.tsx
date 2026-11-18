"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarPlus, CheckCircle2, Clock, Download, RotateCcw, ShieldQuestion, XCircle } from "lucide-react";
import type { BookingCheckoutSession, PublicBookingStatus } from "@meki/api-client";
import { ApiRequestError, PUBLIC_API_URL, clientApi, clientApiBlob } from "@/lib/api";
import { formatMoney, type Locale } from "@/lib/i18n";
import { isBookingReference, isTrustedCheckoutUrl, recallBooking, rememberBooking, statusView, type StatusView } from "@/lib/booking";
import { getBookingCopy } from "@/content/booking";

const POLL_MS = 3000;
const MAX_POLLS = 20;
const TRUST = {
  allowedHosts: process.env.NEXT_PUBLIC_CHECKOUT_ALLOWED_HOSTS ?? "",
  production: process.env.NODE_ENV === "production",
  apiOrigin: (() => {
    try {
      return PUBLIC_API_URL ? new URL(PUBLIC_API_URL).origin : "";
    } catch {
      return "";
    }
  })(),
};

const ICON: Record<StatusView, typeof Clock> = { awaiting: Clock, processing: Clock, failed: XCircle, confirmed: CheckCircle2, cancelled: XCircle, refundPending: RotateCcw, refunded: RotateCcw };
const TONE: Record<StatusView, string> = { awaiting: "text-gold-text", processing: "text-gold-text", failed: "text-red-700", confirmed: "text-meki-green", cancelled: "text-body-grey", refundPending: "text-gold-text", refunded: "text-body-grey" };

type State = { kind: "loading" } | { kind: "unknown" } | { kind: "slow"; last: PublicBookingStatus | null } | { kind: "ok"; data: PublicBookingStatus };

/**
 * Booking status strictly from GET /public/bookings/:reference/status (X-Booking-Token header). A visitor arriving from the
 * hosted checkout proves nothing: "confirmed" is shown only when the API reports confirmed=true after a VERIFIED provider event.
 * The access token comes from this tab's sessionStorage, or — once — from the secure link (?token= / #token=) and is then
 * removed from the address bar. No personal data is displayed or stored here (the API does not return any).
 */
export function BookingStatus({ locale, reference }: { locale: Locale; reference: string | null }) {
  const c = getBookingCopy(locale);
  const s = c.status;
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const token = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let polls = 0;
    const run = async () => {
      await Promise.resolve();
      if (stopped) return;
      const pay = new URLSearchParams(window.location.search).get("pay"); // set by the booking flow when payment could not start
      if (polls === 0 && (pay === "later" || pay === "untrusted")) setNote(pay);
      if (!isBookingReference(reference)) return setState({ kind: "unknown" });
      if (!token.current) {
        const url = new URL(window.location.href);
        const fromUrl = url.searchParams.get("token") ?? new URLSearchParams(url.hash.replace(/^#/, "")).get("token");
        if (fromUrl) {
          rememberBooking(reference, fromUrl);
          token.current = fromUrl;
          url.searchParams.delete("token");
          url.hash = "";
          window.history.replaceState(null, "", url.pathname + url.search); // the token never stays in the address bar
        } else token.current = recallBooking(reference);
      }
      if (!token.current) return setState({ kind: "unknown" });
      try {
        const data = await clientApi<PublicBookingStatus>(`/public/bookings/${reference}/status`, { bookingToken: token.current });
        if (stopped) return;
        setState({ kind: "ok", data });
        if (statusView(data) === "processing") {
          polls += 1;
          if (polls >= MAX_POLLS) return setState({ kind: "slow", last: data });
          timer = window.setTimeout(() => void run(), POLL_MS);
        }
      } catch (e) {
        if (stopped) return;
        setState(e instanceof ApiRequestError && e.status === 404 ? { kind: "unknown" } : { kind: "slow", last: null });
      }
    };
    void run();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [reference, tick]);

  const pay = useCallback(async () => {
    if (!isBookingReference(reference) || !token.current || busy) return;
    setBusy("pay");
    setNote(null);
    try {
      const session = await clientApi<BookingCheckoutSession>(`/public/bookings/${reference}/checkout`, { method: "POST", bookingToken: token.current });
      if (isTrustedCheckoutUrl(session.checkoutUrl, session, TRUST)) {
        window.location.assign(session.checkoutUrl!);
        return;
      }
      setNote("untrusted");
    } catch {
      setNote("later");
    }
    setBusy(null);
  }, [reference, busy]);

  const download = async (ticketNumber: string, path: string) => {
    if (!token.current || busy) return;
    setBusy(ticketNumber);
    setNote(null);
    try {
      const blob = await clientApiBlob(path.replace(/^\/api\/v1/, ""), token.current);
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${ticketNumber}.pdf`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
    } catch {
      setNote("download");
    }
    setBusy(null);
  };

  if (state.kind === "loading") return <p className="py-24 text-center text-body-grey" role="status">{s.loading}</p>;
  if (state.kind === "unknown") {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-stone-line bg-white p-8 text-center" role="status">
        <ShieldQuestion className="mx-auto mb-4 size-10 text-body-grey" aria-hidden="true" />
        <h1 className="mb-3 font-serif text-3xl text-deep-green">{s.unknown.title}</h1>
        <p className="mb-6 text-body-grey">{s.unknown.text}</p>
        <Link href={`/${locale}/events/gala-night`} className="btn btn-green">{c.backToGala}</Link>
      </div>
    );
  }
  const data = state.kind === "ok" ? state.data : state.last;
  if (!data) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-stone-line bg-white p-8 text-center" role="status">
        <p className="mb-4 text-body-grey">{s.slow}</p>
        <button type="button" onClick={() => { setState({ kind: "loading" }); setTick((n) => n + 1); }} className="btn btn-outline">{s.refresh}</button>
      </div>
    );
  }

  const view = statusView(data);
  const v = s.views[view];
  const Icon = ICON[view];
  const money = formatMoney(data.totalAmount, data.currency, locale);
  const calendarOk = data.calendar.available && (() => { try { return new URL(data.calendar.url).origin === TRUST.apiOrigin; } catch { return false; } })();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-stone-line bg-white p-6 sm:p-8" aria-live="polite">
        <Icon className={`mb-4 size-10 ${TONE[view]}`} aria-hidden="true" />
        <h1 className="mb-2 font-serif text-3xl text-deep-green">{v.title}</h1>
        <p className="mb-6 text-body-grey">{v.text}</p>
        {state.kind === "slow" && <p className="mb-4 text-sm text-body-grey">{s.slow}</p>}
        <dl className="mb-6 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-body-grey">{s.reference}</dt>
            <dd className="font-mono text-base" dir="ltr">{data.reference}</dd>
          </div>
          <div>
            <dt className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-body-grey">{s.amount}</dt>
            <dd>{`${c.tickets.type} × ${data.ticketCount} — ${money}`}</dd>
          </div>
          {data.event && (
            <div className="sm:col-span-2">
              <dt className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-body-grey">{s.event}</dt>
              <dd><bdi>{data.event.name}</bdi> · <bdi>{data.event.dateLabel}</bdi> · <bdi>{data.event.venue}</bdi></dd>
            </div>
          )}
        </dl>

        {note && <p role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{note === "download" ? s.downloadFailed : note === "untrusted" ? c.submitErrors.untrusted : s.payUnavailable}</p>}

        {(view === "awaiting" || view === "failed") && (
          <button type="button" onClick={() => void pay()} disabled={busy === "pay"} className="btn btn-gold min-h-12 disabled:opacity-60">{s.payAgain}</button>
        )}
        {view === "processing" && (
          <button type="button" onClick={() => { setState({ kind: "loading" }); setTick((n) => n + 1); }} className="btn btn-outline min-h-12">{s.refresh}</button>
        )}

        {view === "confirmed" && (
          <div className="mt-2 border-t border-stone-line pt-6">
            <h2 className="mb-3 font-serif text-2xl text-deep-green">{s.ticketsHeading}</h2>
            <ul className="space-y-3">
              {data.tickets.map((t) => (
                <li key={t.ticketNumber} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-line p-3">
                  <span className="text-sm">{s.ticketNo} <span className="font-mono" dir="ltr">{t.ticketNumber}</span></span>
                  {t.pdfReady && (t.status === "ISSUED" || t.status === "CHECKED_IN") ? (
                    <button type="button" onClick={() => void download(t.ticketNumber, t.downloadPath)} disabled={busy === t.ticketNumber} className="btn btn-green min-h-11 px-4 text-sm disabled:opacity-60">
                      <Download className="size-4" aria-hidden="true" /> {busy === t.ticketNumber ? s.downloading : s.download}
                    </button>
                  ) : (
                    <span className="text-sm text-body-grey">{s.pdfPending}</span>
                  )}
                </li>
              ))}
            </ul>
            {calendarOk && data.calendar.available ? (
              <a href={data.calendar.url} className="btn btn-outline mt-5 min-h-11 text-sm" rel="noopener noreferrer"><CalendarPlus className="size-4" aria-hidden="true" /> {s.calendar}</a>
            ) : (
              <p className="mt-5 text-sm text-body-grey">{s.calendarPending}</p>
            )}
            <p className="mt-5 text-xs text-body-grey">{s.keepLink}</p>
          </div>
        )}
      </div>
      <p className="mt-6 text-center">
        <Link href={`/${locale}/events/gala-night`} className="text-sm font-bold text-meki-green underline underline-offset-4">{c.backToGala}</Link>
      </p>
    </div>
  );
}
