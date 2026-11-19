"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Copy, ExternalLink, Minus, Plus } from "lucide-react";
import type { CreatedHostedBooking, PublicTicketing } from "@meki/api-client";
import { ApiRequestError, clientApi } from "@/lib/api";
import { formatMoney, type Locale } from "@/lib/i18n";
import {
  IdempotencyKeeper,
  buildHostedRequest,
  clampQuantity,
  displayTotal,
  isTrustedHostedFormUrl,
  mapSubmitError,
  newHostedForm,
  rememberBooking,
  validateHostedForm,
  type HostedForm,
  type SubmitErrorKey,
} from "@/lib/booking";
import { fill, getBookingCopy } from "@/content/booking";

const GALA_SLUG = "gala-night";
const field = "w-full rounded-xl border border-stone-line bg-white px-4 py-3 text-base text-ink outline-none transition focus:border-meki-green focus:ring-2 focus:ring-meki-green/30 aria-[invalid=true]:border-red-700";
const labelCls = "mb-1.5 block text-[0.75rem] font-bold uppercase tracking-[0.12em] text-body-grey";
const card = "rounded-2xl border border-stone-line bg-white p-5 sm:p-7";

/**
 * Phase 12 — SDI-hosted Gala booking. MEKI issues ONLY a booking reference; the buyer pays, receives tickets/QR codes and a
 * receipt on SDI's Zeffy form. The reference is never pre-filled into the form (not confirmed by SDI): the buyer copies it into
 * SDI's "MEKI Booking Reference" question. Returning from the form confirms nothing — only an approved SDI report does.
 */
export function HostedBookingFlow({ locale, ticketing }: { locale: Locale; ticketing: PublicTicketing }) {
  const c = getBookingCopy(locale);
  const h = c.hosted;
  const gate = ticketing.hosted!;
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<HostedForm>(newHostedForm);
  const [errors, setErrors] = useState<ReturnType<typeof validateHostedForm> | null>(null);
  const [consentError, setConsentError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<SubmitErrorKey | null>(null);
  const [created, setCreated] = useState<CreatedHostedBooking | null>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const keeper = useRef(new IdempotencyKeeper());
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => heading.current?.focus(), [step]);

  const max = ticketing.maxTicketsPerBooking;
  const money = (v: string) => formatMoney(v, ticketing.ticket.currency, locale);
  const estimate = displayTotal(ticketing.ticket.price, form.quantity);
  const formUrl = created?.hosted.available && isTrustedHostedFormUrl(created.hosted.formUrl) ? created.hosted.formUrl : null;

  async function submit() {
    if (lock.current) return;
    const e = validateHostedForm(form);
    setErrors(e);
    setConsentError(!form.consent);
    if (e.fullName || e.email || !form.consent) return;
    lock.current = true;
    setBusy(true);
    setSubmitError(null);
    try {
      const req = buildHostedRequest(form, locale);
      const booking = await clientApi<CreatedHostedBooking>(`/public/events/${GALA_SLUG}/hosted-bookings`, { method: "POST", body: req, idempotencyKey: keeper.current.keyFor(req) });
      rememberBooking(booking.reference, booking.accessToken); // token only, this tab only
      setCreated(booking);
      setStep(2);
    } catch (err) {
      const x = err instanceof ApiRequestError ? err : new ApiRequestError("UNKNOWN_ERROR", 500);
      setSubmitError(mapSubmitError(x.code, x.status));
      lock.current = false;
    }
    setBusy(false);
  }

  async function copyRef() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.reference);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <div>
      <ol className="mb-8 flex flex-wrap gap-x-6 gap-y-2" aria-label={fill(c.stepOf, { n: step + 1, total: 3 })}>
        {h.steps.map((s, i) => (
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
              <h2 id="step-heading" ref={heading} tabIndex={-1} className="mb-2 font-serif text-3xl text-deep-green outline-none">{c.tickets.heading}</h2>
              <p className="mb-6 text-body-grey">{h.intro}</p>
              <div className="mb-3 flex items-center justify-between gap-4 rounded-xl border border-stone-line p-4">
                <div>
                  <p className="font-bold">{c.tickets.type}</p>
                  <p className="text-sm text-body-grey">{money(ticketing.ticket.price)}</p>
                </div>
                <div role="group" aria-label={c.tickets.quantity} className="flex items-center gap-3">
                  <button type="button" aria-label={c.tickets.decrease} disabled={form.quantity <= 1} onClick={() => setForm({ ...form, quantity: clampQuantity(form.quantity - 1, max) })} className="grid size-11 place-items-center rounded-full border border-deep-green text-deep-green disabled:opacity-40">
                    <Minus className="size-4" aria-hidden="true" />
                  </button>
                  <output aria-live="polite" className="min-w-8 text-center font-serif text-2xl" dir="ltr">{form.quantity}</output>
                  <button type="button" aria-label={c.tickets.increase} disabled={form.quantity >= max} onClick={() => setForm({ ...form, quantity: clampQuantity(form.quantity + 1, max) })} className="grid size-11 place-items-center rounded-full border border-deep-green text-deep-green disabled:opacity-40">
                    <Plus className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <p className="mb-6 text-sm text-body-grey">{h.quantityHelp} {fill(c.tickets.max, { max })}</p>
              <button type="button" onClick={() => setStep(1)} className="btn btn-green min-h-12 w-full justify-center sm:w-auto">
                {h.next} <ArrowRight className="btn-arrow size-4" aria-hidden="true" />
              </button>
            </>
          )}

          {step === 1 && (
            <form noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
              <h2 id="step-heading" ref={heading} tabIndex={-1} className="mb-2 font-serif text-3xl text-deep-green outline-none">{h.detailsHeading}</h2>
              <p className="mb-6 text-sm text-body-grey">{h.detailsHelp}</p>
              <div className="mb-6 grid gap-4 sm:grid-cols-2">
                <Field id="h-name" label={c.guests.fullName} value={form.fullName} error={errors?.fullName ? c.errors[errors.fullName] : undefined} autoComplete="name" dir="auto" onChange={(v) => setForm({ ...form, fullName: v })} />
                <Field id="h-email" label={c.guests.email} type="email" value={form.email} error={errors?.email ? c.errors[errors.email] : undefined} autoComplete="email" dir="ltr" onChange={(v) => setForm({ ...form, email: v })} />
              </div>
              <div className="mb-6">
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" checked={form.consent} aria-invalid={consentError} aria-describedby={consentError ? "h-consent-err" : undefined} onChange={(e) => { setForm({ ...form, consent: e.target.checked }); setConsentError(false); }} className="mt-1 size-5 accent-meki-green" />
                  <span>
                    {h.consent}{" "}
                    <Link href={`/${locale}/privacy`} className="underline underline-offset-4" target="_blank">{c.guests.privacy}</Link>
                  </span>
                </label>
                {consentError && <p id="h-consent-err" role="alert" className="mt-2 text-sm text-red-700">{c.errors.consent}</p>}
              </div>
              {submitError && <p role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{c.submitErrors[submitError]}</p>}
              <div className="flex flex-wrap gap-3">
                <button type="button" disabled={busy} onClick={() => setStep(0)} className="btn btn-outline min-h-12 disabled:opacity-50">{c.guests.back}</button>
                <button type="submit" disabled={busy} aria-busy={busy} className="btn btn-gold min-h-12 disabled:opacity-60">{busy ? h.creating : h.getReference}</button>
              </div>
            </form>
          )}

          {step === 2 && created && (
            <div>
              <h2 id="step-heading" ref={heading} tabIndex={-1} className="mb-4 font-serif text-3xl text-deep-green outline-none">{h.referenceHeading}</h2>
              <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed border-meki-green bg-limestone/60 p-4">
                <output aria-label={h.referenceHeading} className="select-all font-mono text-2xl tracking-wider text-deep-green" dir="ltr">{created.reference}</output>
                <button type="button" onClick={() => void copyRef()} className="btn btn-outline min-h-11 px-4 text-sm">
                  {copy === "copied" ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />} {copy === "copied" ? h.copied : h.copy}
                </button>
                <span role="status" aria-live="polite" className="sr-only">{copy === "copied" ? h.copied : ""}</span>
              </div>
              {copy === "failed" && <p role="alert" className="mb-4 text-sm text-red-700">{h.copyFailed}</p>}
              <h3 className="mb-2 font-bold text-deep-green">{h.instructionsTitle}</h3>
              <ol className="mb-4 list-decimal space-y-1.5 ps-5 text-sm">
                {h.instructions.map((line) => <li key={line}>{fill(line, { question: gate.referenceQuestion })}</li>)}
              </ol>
              <p className="mb-6 text-sm text-body-grey">{h.noPrefill}</p>
              {formUrl ? (
                <a href={formUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="btn btn-gold min-h-12">
                  {h.openForm} <ExternalLink className="size-4" aria-hidden="true" /> <span className="sr-only">{h.newTab}</span>
                </a>
              ) : (
                <p role="status" className="rounded-lg border border-stone-line bg-limestone px-4 py-3 text-sm">{h.formUnavailable}</p>
              )}
              <p className="mt-6 text-sm text-body-grey">{h.delay}</p>
              <p className="mt-3">
                <Link href={`/${locale}/events/gala-night/booking/${created.reference}`} className="text-sm font-bold text-meki-green underline underline-offset-4">{h.statusLink}</Link>
              </p>
            </div>
          )}
        </section>

        <aside aria-label={c.tickets.summary} className={`${card} bg-limestone/60 lg:sticky lg:top-28`}>
          <h2 className="mb-1 font-serif text-2xl text-deep-green"><bdi>{ticketing.event.name}</bdi></h2>
          <p className="text-sm text-body-grey"><bdi>{ticketing.event.dateLabel}</bdi></p>
          <p className="mb-5 text-sm text-body-grey"><bdi>{ticketing.event.venue}</bdi></p>
          <dl className="space-y-2 border-t border-stone-line pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt>{`${c.tickets.type} × ${created?.ticketCount ?? form.quantity}`}</dt>
              <dd className="font-bold">{money(created?.totalAmount ?? estimate)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-stone-line pt-3 text-base">
              <dt className="font-bold">{h.estimate}</dt>
              <dd className="font-serif text-2xl text-deep-green">{money(created?.totalAmount ?? estimate)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-body-grey">{h.estimateNote}</p>
          <p className="mt-2 text-xs text-body-grey">{c.review.tax}</p>
        </aside>
      </div>
    </div>
  );
}

function Field({ id, label, value, onChange, error, type = "text", autoComplete, dir }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; type?: string; autoComplete?: string; dir?: "ltr" | "rtl" | "auto" }) {
  const eid = `${id}-e`;
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{label}</label>
      <input id={id} value={value} dir={dir} type={type} autoComplete={autoComplete} required aria-required aria-invalid={!!error} aria-describedby={error ? eid : undefined} maxLength={type === "email" ? 191 : 160} className={field} onChange={(e) => onChange(e.target.value)} />
      {error && <p id={eid} role="alert" className="mt-1.5 text-sm text-red-700">{error}</p>}
    </div>
  );
}
