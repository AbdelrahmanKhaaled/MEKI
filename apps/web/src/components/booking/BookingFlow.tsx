"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Check, Minus, Plus } from "lucide-react";
import type { BookingCheckoutSession, CreatedBooking, PublicTicketing } from "@meki/api-client";
import { ApiRequestError, PUBLIC_API_URL, clientApi } from "@/lib/api";
import { formatMoney, type Locale } from "@/lib/i18n";
import {
  IdempotencyKeeper,
  buildRequest,
  displayTotal,
  effectiveGuests,
  hasErrors,
  isTrustedCheckoutUrl,
  mapSubmitError,
  newForm,
  rememberBooking,
  setQuantity,
  validateForm,
  type BookingForm,
  type FieldError,
  type FormErrors,
  type SubmitErrorKey,
} from "@/lib/booking";
import { fill, getBookingCopy, type BookingCopy } from "@/content/booking";
import { HostedBookingFlow } from "./HostedBookingFlow";

const GALA_SLUG = "gala-night";
const field = "w-full rounded-xl border border-stone-line bg-white px-4 py-3 text-base text-ink outline-none transition focus:border-meki-green focus:ring-2 focus:ring-meki-green/30 aria-[invalid=true]:border-red-700";
const labelCls = "mb-1.5 block text-[0.75rem] font-bold uppercase tracking-[0.12em] text-body-grey";
const card = "rounded-2xl border border-stone-line bg-white p-5 sm:p-7";

type Availability = { kind: "loading" } | { kind: "unavailable"; soldOut?: boolean } | { kind: "ready"; ticketing: PublicTicketing } | { kind: "hosted"; ticketing: PublicTicketing };

/** Browser-side trust settings for hosted-checkout redirects (public build-time values; no secrets). */
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

export function BookingFlow({ locale }: { locale: Locale }) {
  const c = getBookingCopy(locale);
  const router = useRouter();
  const [avail, setAvail] = useState<Availability>({ kind: "loading" });
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<BookingForm>(newForm);
  const [errors, setErrors] = useState<FormErrors | null>(null);
  const [consentError, setConsentError] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "creating" | "redirecting">("idle");
  const [submitError, setSubmitError] = useState<SubmitErrorKey | null>(null);
  const keeper = useRef(new IdempotencyKeeper());
  const lock = useRef(false); // synchronous double-submit guard (state updates are async)
  const heading = useRef<HTMLHeadingElement>(null);

  // Live availability: sales switch, price and limits come from the API (never cached, never hard-coded).
  useEffect(() => {
    let alive = true;
    void (async () => {
      await Promise.resolve();
      try {
        const t = await clientApi<PublicTicketing>(`/public/events/${GALA_SLUG}/ticketing`);
        if (!alive) return;
        // Phase 12: in SDI-hosted mode MEKI only issues a reference; payment happens on SDI's form (never MEKI checkout).
        if (t.mode === "zeffy_hosted") setAvail(t.salesOpen && !t.soldOut && t.hosted?.available ? { kind: "hosted", ticketing: t } : { kind: "unavailable", soldOut: t.soldOut });
        else setAvail(t.salesOpen && !t.soldOut && t.checkoutAvailable ? { kind: "ready", ticketing: t } : { kind: "unavailable", soldOut: t.soldOut });
      } catch {
        if (alive) setAvail({ kind: "unavailable" });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => heading.current?.focus(), [step]);

  if (avail.kind === "loading") return <p className="py-24 text-center text-body-grey" role="status">{c.loading}</p>;
  if (avail.kind === "unavailable") {
    return (
      <div className={`${card} mx-auto max-w-2xl text-center`} role="status">
        <h2 className="mb-3 font-serif text-3xl text-deep-green">{avail.soldOut ? c.unavailable.soldOut : c.unavailable.title}</h2>
        {!avail.soldOut && <p className="mb-6 text-body-grey">{c.unavailable.text}</p>}
        <Link href={`/${locale}/events/gala-night`} className="btn btn-green">
          {c.backToGala}
        </Link>
      </div>
    );
  }

  if (avail.kind === "hosted") return <HostedBookingFlow locale={locale} ticketing={avail.ticketing} />;

  const t = avail.ticketing;
  const max = t.maxTicketsPerBooking;
  const unit = t.ticket.price;
  const total = displayTotal(unit, form.quantity);
  const money = (v: string) => formatMoney(v, t.ticket.currency, locale);
  const errText = (e?: FieldError) => (e ? c.errors[e] : undefined);

  const goNext = () => {
    if (step === 0) return setStep(1);
    const e = validateForm(form);
    setErrors(e);
    setConsentError(!form.consent);
    if (hasErrors(e) || !form.consent) return;
    setStep(2);
  };

  async function submit() {
    if (lock.current || submitState !== "idle") return;
    lock.current = true;
    setSubmitError(null);
    setSubmitState("creating");
    try {
      const req = buildRequest(form, locale);
      const booking = await clientApi<CreatedBooking>(`/public/events/${GALA_SLUG}/bookings`, { method: "POST", body: req, idempotencyKey: keeper.current.keyFor(req) });
      rememberBooking(booking.reference, booking.accessToken); // token only, this tab only — no personal data is stored
      const base = `/${locale}/events/gala-night/booking/${booking.reference}`;
      let notice = "";
      try {
        const session = await clientApi<BookingCheckoutSession>(`/public/bookings/${booking.reference}/checkout`, { method: "POST", bookingToken: booking.accessToken });
        if (isTrustedCheckoutUrl(session.checkoutUrl, session, TRUST)) {
          setSubmitState("redirecting");
          window.location.assign(session.checkoutUrl!);
          return; // the browser leaves; the lock stays set
        }
        notice = "?pay=untrusted";
      } catch {
        notice = "?pay=later";
      }
      router.push(base + notice); // booking exists but payment could not start: continue from its status page
    } catch (e) {
      const err = e instanceof ApiRequestError ? e : new ApiRequestError("UNKNOWN_ERROR", 500);
      setSubmitError(mapSubmitError(err.code, err.status));
      setSubmitState("idle");
      lock.current = false;
    }
  }

  const summary = (
    <aside aria-label={c.tickets.summary} className={`${card} bg-limestone/60 lg:sticky lg:top-28`}>
      <h2 className="mb-1 font-serif text-2xl text-deep-green"><bdi>{t.event.name}</bdi></h2>
      <p className="text-sm text-body-grey"><bdi>{t.event.dateLabel}</bdi></p>
      <p className="mb-5 text-sm text-body-grey"><bdi>{t.event.venue}</bdi></p>
      <dl className="space-y-2 border-t border-stone-line pt-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt>{`${c.tickets.type} × ${form.quantity}`}</dt>
          <dd className="font-bold">{money(total)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-stone-line pt-3 text-base">
          <dt className="font-bold">{c.tickets.total}</dt>
          <dd className="font-serif text-2xl text-deep-green">{money(total)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-body-grey">{c.tickets.note}</p>
    </aside>
  );

  return (
    <div>
      <ol className="mb-8 flex flex-wrap gap-x-6 gap-y-2" aria-label={fill(c.stepOf, { n: step + 1, total: 3 })}>
        {c.steps.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className={`flex items-center gap-2 text-sm font-bold ${i === step ? "text-deep-green" : i < step ? "text-meki-green" : "text-body-grey"}`}>
            <span className={`grid size-7 place-items-center rounded-full border text-xs ${i === step ? "border-deep-green bg-deep-green text-white" : i < step ? "border-meki-green bg-meki-green text-white" : "border-stone-line"}`}>
              {i < step ? <Check className="size-4" aria-hidden="true" /> : i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className={card} aria-labelledby="step-heading">
          {step === 0 && (
            <>
              <h2 id="step-heading" ref={heading} tabIndex={-1} className="mb-1 font-serif text-3xl text-deep-green outline-none">{c.tickets.heading}</h2>
              <p className="mb-6 text-body-grey">{c.tickets.rule}</p>
              <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-stone-line p-4">
                <div>
                  <p className="font-bold">{c.tickets.type}</p>
                  <p className="text-sm text-body-grey">{money(unit)}</p>
                </div>
                <div role="group" aria-label={c.tickets.quantity} className="flex items-center gap-3">
                  <button type="button" aria-label={c.tickets.decrease} disabled={form.quantity <= 1} onClick={() => setForm(setQuantity(form, form.quantity - 1, max))} className="grid size-11 place-items-center rounded-full border border-deep-green text-deep-green disabled:opacity-40">
                    <Minus className="size-4" aria-hidden="true" />
                  </button>
                  <output aria-live="polite" className="min-w-8 text-center font-serif text-2xl" dir="ltr">{form.quantity}</output>
                  <button type="button" aria-label={c.tickets.increase} disabled={form.quantity >= max} onClick={() => setForm(setQuantity(form, form.quantity + 1, max))} className="grid size-11 place-items-center rounded-full border border-deep-green text-deep-green disabled:opacity-40">
                    <Plus className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <p className="mb-6 text-sm text-body-grey">{fill(c.tickets.max, { max })}</p>
              <button type="button" onClick={goNext} className="btn btn-green min-h-12 w-full justify-center sm:w-auto">
                {c.tickets.next} <ArrowRight className="btn-arrow size-4" aria-hidden="true" />
              </button>
            </>
          )}

          {step === 1 && (
            <form noValidate onSubmit={(e) => { e.preventDefault(); goNext(); }}>
              <h2 id="step-heading" ref={heading} tabIndex={-1} className="mb-6 font-serif text-3xl text-deep-green outline-none">{c.guests.heading}</h2>

              <fieldset className="mb-8 space-y-4">
                <legend className="mb-1 font-bold text-deep-green">{c.guests.purchaserTitle}</legend>
                <p className="text-sm text-body-grey">{c.guests.purchaserHelp}</p>
                <Field c={c} id="p-name" label={c.guests.fullName} value={form.purchaser.fullName} error={errText(errors?.purchaser.fullName)} autoComplete="name" dir="auto" onChange={(v) => setForm({ ...form, purchaser: { ...form.purchaser, fullName: v } })} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field c={c} id="p-email" label={c.guests.email} type="email" value={form.purchaser.email} error={errText(errors?.purchaser.email)} autoComplete="email" dir="ltr" onChange={(v) => setForm({ ...form, purchaser: { ...form.purchaser, email: v } })} />
                  <Field c={c} id="p-phone" label={c.guests.phone} type="tel" value={form.purchaser.phone} error={errText(errors?.purchaser.phone)} autoComplete="tel" dir="ltr" onChange={(v) => setForm({ ...form, purchaser: { ...form.purchaser, phone: v } })} />
                </div>
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" checked={form.purchaserAttends} onChange={(e) => setForm({ ...form, purchaserAttends: e.target.checked })} className="mt-1 size-5 accent-meki-green" />
                  {c.guests.attends}
                </label>
              </fieldset>

              {effectiveGuests(form).map((g, i) => {
                const own = i === 0 && form.purchaserAttends;
                const ge = errors?.guests[i];
                const set = (patch: Partial<typeof g>) => setForm({ ...form, guests: form.guests.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                return (
                  <fieldset key={i} className="mb-6 space-y-4 rounded-xl border border-stone-line p-4 sm:p-5">
                    <legend className="px-2 font-bold text-deep-green">{fill(c.guests.guestTitle, { n: i + 1 })}</legend>
                    <p className="text-sm text-body-grey">{c.guests.guestHelp}</p>
                    {own ? (
                      <p className="rounded-lg bg-limestone px-4 py-3 text-sm" dir="auto">{g.fullName || "—"}</p>
                    ) : (
                      <>
                        <Field c={c} id={`g${i}-name`} label={c.guests.fullName} value={g.fullName} error={errText(ge?.fullName)} autoComplete="off" dir="auto" onChange={(v) => set({ fullName: v })} />
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field c={c} id={`g${i}-email`} label={c.guests.email} type="email" value={g.email} error={errText(ge?.email)} autoComplete="off" dir="ltr" onChange={(v) => set({ email: v })} />
                          <Field c={c} id={`g${i}-phone`} label={c.guests.phone} type="tel" value={g.phone} error={errText(ge?.phone)} autoComplete="off" dir="ltr" onChange={(v) => set({ phone: v })} />
                        </div>
                      </>
                    )}
                    <Field c={c} id={`g${i}-diet`} label={c.guests.dietary} help={c.guests.dietaryHelp} value={g.dietary} placeholder={c.guests.dietaryPlaceholder} error={errText(ge?.dietary)} autoComplete="off" dir="auto" textarea onChange={(v) => set({ dietary: v })} />
                  </fieldset>
                );
              })}

              <div className="mb-6">
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" checked={form.consent} aria-invalid={consentError} aria-describedby={consentError ? "consent-err" : undefined} onChange={(e) => { setForm({ ...form, consent: e.target.checked }); setConsentError(false); }} className="mt-1 size-5 accent-meki-green" />
                  <span>
                    {c.guests.consent}{" "}
                    <Link href={`/${locale}/privacy`} className="underline underline-offset-4" target="_blank">{c.guests.privacy}</Link>
                  </span>
                </label>
                {consentError && <p id="consent-err" role="alert" className="mt-2 text-sm text-red-700">{c.errors.consent}</p>}
              </div>

              {errors && hasErrors(errors) && <p role="alert" className="mb-4 text-sm font-bold text-red-700">{c.guests.fix}</p>}
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => setStep(0)} className="btn btn-outline min-h-12">{c.guests.back}</button>
                <button type="submit" className="btn btn-green min-h-12">{c.guests.next} <ArrowRight className="btn-arrow size-4" aria-hidden="true" /></button>
              </div>
            </form>
          )}

          {step === 2 && (
            <div>
              <h2 id="step-heading" ref={heading} tabIndex={-1} className="mb-6 font-serif text-3xl text-deep-green outline-none">{c.review.heading}</h2>
              <dl className="mb-6 space-y-4 text-sm">
                <Row label={c.review.event} onEdit={() => setStep(0)} edit={c.review.edit}><bdi>{t.event.name}</bdi> · <bdi>{t.event.dateLabel}</bdi> · <bdi>{t.event.venue}</bdi></Row>
                <Row label={c.review.ticketsLabel} onEdit={() => setStep(0)} edit={c.review.edit}>{`${c.tickets.type} × ${form.quantity}`}</Row>
                <Row label={c.review.guestsLabel} onEdit={() => setStep(1)} edit={c.review.edit}>
                  <ul className="space-y-1">
                    {effectiveGuests(form).map((g, i) => (
                      <li key={i} className="flex gap-2">
                        <span aria-hidden="true" className="text-body-grey" dir="ltr">{i + 1}.</span>
                        <bdi>{g.fullName}</bdi>
                      </li>
                    ))}
                  </ul>
                </Row>
                <Row label={c.review.purchaser} onEdit={() => setStep(1)} edit={c.review.edit}>
                  <span dir="auto">{form.purchaser.fullName}</span> · <span dir="ltr">{form.purchaser.email}</span> · <span dir="ltr">{form.purchaser.phone}</span>
                </Row>
                <Row label={c.review.total}>
                  <span className="font-serif text-2xl text-deep-green">{money(total)}</span> <span className="text-body-grey">({c.review.currency})</span>
                </Row>
              </dl>
              <p className="mb-2 text-sm">{c.review.recipient}</p>
              <p className="mb-6 text-sm text-body-grey">{c.review.tax}</p>
              {submitError && (
                <p role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {c.submitErrors[submitError]}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <button type="button" disabled={submitState !== "idle"} onClick={() => setStep(1)} className="btn btn-outline min-h-12 disabled:opacity-50">{c.review.back}</button>
                <button type="button" onClick={() => void submit()} disabled={submitState !== "idle"} aria-busy={submitState !== "idle"} className="btn btn-gold min-h-12 disabled:cursor-not-allowed disabled:opacity-60">
                  {submitState === "creating" ? c.review.creating : submitState === "redirecting" ? c.review.redirecting : c.review.submit}
                </button>
              </div>
            </div>
          )}
        </section>
        {summary}
      </div>
    </div>
  );
}

function Row({ label, children, onEdit, edit }: { label: string; children: React.ReactNode; onEdit?: () => void; edit?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-stone-line pb-3">
      <div>
        <dt className="mb-1 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-body-grey">{label}</dt>
        <dd>{children}</dd>
      </div>
      {onEdit && (
        <button type="button" onClick={onEdit} className="shrink-0 text-sm font-bold text-meki-green underline underline-offset-4">
          {edit}
        </button>
      )}
    </div>
  );
}

function Field({ c, id, label, value, onChange, error, help, type = "text", autoComplete, dir, textarea, placeholder }: { c: BookingCopy; id: string; label: string; value: string; onChange: (v: string) => void; error?: string; help?: string; type?: string; autoComplete?: string; dir?: "ltr" | "rtl" | "auto"; textarea?: boolean; placeholder?: string }) {
  const uid = useId();
  const eid = `${uid}-e`;
  const hid = `${uid}-h`;
  const common = { id, value, dir, autoComplete, placeholder, required: true, "aria-required": true, "aria-invalid": !!error, "aria-describedby": [error ? eid : "", help ? hid : ""].filter(Boolean).join(" ") || undefined, className: field, onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => onChange(e.target.value) };
  void c;
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{label}</label>
      {textarea ? <textarea {...common} rows={2} maxLength={500} /> : <input {...common} type={type} inputMode={type === "tel" ? "tel" : undefined} maxLength={type === "email" ? 191 : 160} />}
      {help && <p id={hid} className="mt-1.5 text-xs text-body-grey">{help}</p>}
      {error && <p id={eid} role="alert" className="mt-1.5 text-sm text-red-700">{error}</p>}
    </div>
  );
}
