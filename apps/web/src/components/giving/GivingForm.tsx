"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Copy, ExternalLink, Info, Lock } from "lucide-react";
import type { CharitableClassification, CreatedDonationIntent, GivingGateReason, HostedLimits, PublicGalaGivingOptions, PublicGivingOptions, ZakatAvailability } from "@meki/api-client";
import { ApiRequestError, clientApi } from "@/lib/api";
import { isTrustedHostedFormUrl } from "@/lib/booking";
import { formatMoney, type Locale } from "@/lib/i18n";
import { buildIntentRequest, IntentKeeper, mapIntentError, newGivingForm, normaliseAmount, preselect, reasonKey, rememberGift, resolveRoute, type Route, validateDetails, validateGift, type GiftErrors, type GivingFormState, type IntentErrorKey } from "@/lib/giving";
import { fillGiving, getGivingCopy } from "@/content/giving";
import { GiftStages } from "./GiftStages";

const field = "w-full rounded-xl border border-stone-line bg-white px-4 py-3 text-base text-ink outline-none transition focus:border-meki-green focus:ring-2 focus:ring-meki-green/30 aria-[invalid=true]:border-red-700";
const labelCls = "mb-1.5 block text-[0.75rem] font-bold uppercase tracking-[0.12em] text-body-grey";
const card = "rounded-2xl border border-stone-line bg-white p-5 sm:p-7";
const DEFAULT_AMOUNTS = ["25", "50", "100", "250"];

type Props =
  | { locale: Locale; mode: "general"; options: PublicGivingOptions; initialDestination?: string; eventSlug?: never; gala?: never }
  | { locale: Locale; mode: "gala"; gala: PublicGalaGivingOptions; eventSlug: string; options?: never; initialDestination?: never };

/**
 * Phase 14 — hosted giving (general / programme / Gala donation). MEKI records the donor's INTENTION and issues a DN- reference;
 * the donor pays on SDI's Zeffy form and types the reference into SDI's question. Nothing is charged here and a return from Zeffy
 * confirms nothing: only an approved SDI report verifies a gift. When a channel is closed the form is a PREVIEW (no reference, no
 * contact details collected, no payment path).
 */
export function GivingForm(props: Props) {
  const { locale, mode } = props;
  const c = getGivingCopy(locale);
  const f0 = c.form;
  const [step, setStep] = useState(0);
  // Program Single Page → "Give": `?programme=<slug>` preselects that programme as the donor's INTENTION (only a slug the server listed).
  const search = useSearchParams();
  const [form, setForm] = useState<GivingFormState>(() =>
    newGivingForm(
      props.mode === "general" ? (props.initialDestination || preselect(search?.get("programme") ?? undefined, props.options.programmes.map((p) => p.slug))) : "",
      // Phase 14B: the amount chosen on the home quick-donate card travels along (re-validated here and on the server)
      normaliseAmount(search?.get("amount") ?? "") ?? "",
    ),
  );
  const [errors, setErrors] = useState<GiftErrors>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<IntentErrorKey | null>(null);
  const [created, setCreated] = useState<CreatedDonationIntent | null>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const keeper = useRef(new IntentKeeper());
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) heading.current?.focus();
    mounted.current = true;
  }, [step]);


  // What the server says about the CURRENT destination (never decided in the browser).
  const limits: HostedLimits = props.mode === "general" ? props.options.limits : props.gala.limits;
  let available: boolean;
  let reason: GivingGateReason | null;
  let zakat: ZakatAvailability;
  let destinationName: string;
  /** Phase 14B: Gala-only offer for a program / general option (payable only after the donor's explicit acceptance) */
  let offer: Extract<Route, { kind: "galaOffer" }> | null = null;
  if (props.mode === "gala") {
    available = props.gala.available;
    reason = props.gala.reason;
    zakat = props.gala.zakat;
    destinationName = props.gala.project?.name ?? "";
  } else {
    const route = resolveRoute(props.options, form.destination, form.acceptGala, c.designationGeneral);
    available = route.available;
    reason = route.kind === "closed" ? route.reason : route.kind === "galaOffer" ? route.ownReason : null;
    zakat = route.zakat;
    destinationName = route.destinationName;
    if (route.kind === "galaOffer") offer = route;
  }
  const interestName = offer ? offer.interestName || f0.galaOffer.generalInterest : "";
  const preview = !available;
  const steps = preview ? [f0.steps[0], f0.steps[2]] : f0.steps;
  const visible = preview ? (step === 0 ? 0 : 1) : step;
  const amounts = limits.suggested.length ? limits.suggested : DEFAULT_AMOUNTS;
  const money = (v: string) => formatMoney(v, "USD", locale);
  const amount = normaliseAmount(form.amount);

  function set(patch: Partial<GivingFormState>) {
    setForm((f) => ({ ...f, ...patch }));
    setSubmitError(null);
  }

  function nextFromGift() {
    const e = validateGift(form, limits, zakat.allowed);
    setErrors(e);
    if (offer && !form.acceptGala) {
      // Never a silent redirect: without the donor's acceptance the gift stays a preview of the (closed) chosen option.
      setStep(2);
      return;
    }
    if (Object.keys(e).length) return;
    setStep(preview ? 2 : 1);
  }
  function nextFromDetails() {
    const e = validateDetails(form);
    setErrors(e);
    if (Object.keys(e).length) return;
    setStep(2);
  }

  async function submit() {
    if (preview || lock.current) return;
    if (!form.acceptTerms) {
      setErrors({ acceptTerms: "required" });
      return;
    }
    lock.current = true;
    setBusy(true);
    setSubmitError(null);
    try {
      const req = buildIntentRequest(mode, form, locale, props.mode === "gala" ? props.eventSlug : (offer?.eventSlug ?? undefined), !!offer && form.acceptGala);
      const r = await clientApi<CreatedDonationIntent>("/public/donation-intents", { method: "POST", body: req, idempotencyKey: keeper.current.keyFor(req) });
      rememberGift(r.reference, r.accessToken); // this tab only; never in a URL
      setCreated(r);
      setStep(3);
    } catch (err) {
      const x = err instanceof ApiRequestError ? err : new ApiRequestError("UNKNOWN_ERROR", 500);
      setSubmitError(mapIntentError(x.code, x.status));
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

  const err = (k: keyof GiftErrors) => (errors[k] ? c.errors[errors[k]!] : undefined);
  const formUrl = created && isTrustedHostedFormUrl(created.handoff.formUrl) ? created.handoff.formUrl : null;
  const classLabel = (k: CharitableClassification | "") => (k ? c.classification[k] : "—");

  return (
    <div id="give-form" data-testid="giving-form" data-mode={mode} data-preview={preview ? "true" : "false"}>
      <ol className="mb-8 flex flex-wrap gap-x-6 gap-y-2" aria-label={fillGiving(f0.stepOf, { n: visible + 1, total: steps.length })}>
        {steps.map((s, i) => (
          <li key={s} aria-current={i === visible ? "step" : undefined} className={`flex items-center gap-2 text-sm font-bold ${i === visible ? "text-deep-green" : i < visible ? "text-meki-green" : "text-body-grey"}`}>
            <span className={`grid size-7 place-items-center rounded-full border text-xs ${i === visible ? "border-deep-green bg-deep-green text-white" : i < visible ? "border-meki-green bg-meki-green text-white" : "border-stone-line"}`}>
              {i < visible ? <Check className="size-4" aria-hidden="true" /> : i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className={card} aria-labelledby="gift-step-heading">
          {preview && step < 3 && (
            <p className="mb-5 flex items-start gap-2 rounded-xl border border-dashed border-gold-text/50 bg-limestone px-4 py-3 text-sm text-ink" data-testid="giving-preview-note">
              <Info className="mt-0.5 size-4 shrink-0 text-gold-text" aria-hidden="true" />
              <span>
                <span className="preview-badge me-2 inline-block">{f0.previewBadge}</span>
                {f0.closed[reasonKey(reason)] ?? f0.closed.generic} {f0.previewNote}
              </span>
            </p>
          )}

          {step === 0 && (
            <form noValidate onSubmit={(e) => { e.preventDefault(); nextFromGift(); }}>
              <h2 id="gift-step-heading" ref={heading} tabIndex={-1} className="mb-6 font-serif text-3xl text-deep-green outline-none">{f0.title}</h2>

              {props.mode === "general" ? (
                <div className="mb-6">
                  <label htmlFor="g-dest" className={labelCls}>{f0.destinationLabel}</label>
                  <select id="g-dest" className={field} value={form.destination} onChange={(e) => set({ destination: e.target.value, classification: form.classification === "ZAKAT" ? "" : form.classification, acceptGala: false })}>
                    <option value="">{f0.generalOption}{props.options.channels.general.available ? "" : ` (${f0.notPayable})`}</option>
                    <optgroup label={f0.programmeGroup}>
                      {props.options.programmes.map((p) => (
                        <option key={p.slug} value={p.slug}>{p.name}{p.payable ? "" : ` (${f0.notPayable})`}</option>
                      ))}
                    </optgroup>
                  </select>
                  {!form.destination && <p className="mt-1.5 text-sm text-body-grey">{f0.generalHelp}</p>}
                </div>
              ) : (
                props.gala.project && (
                  <p className="mb-6 rounded-xl bg-limestone px-4 py-3 text-sm">
                    <span className="block text-xs font-bold uppercase tracking-[0.16em] text-body-grey">{c.gala.projectLabel}</span>
                    <span className="font-bold text-ink">{props.gala.project.name}</span>
                  </p>
                )
              )}

              {offer && (
                <div className="mb-6 rounded-xl border-2 border-harvest-gold/60 bg-limestone p-4" data-testid="gala-only-offer" role="group" aria-labelledby="g-offer-title">
                  <p id="g-offer-title" className="mb-1 font-bold text-ink">{f0.galaOffer.title}</p>
                  <p className="mb-3 text-sm text-body-grey">{fillGiving(f0.galaOffer.text, { interest: interestName, project: offer.destinationName })}</p>
                  <label className="flex items-start gap-3 text-sm font-bold text-ink">
                    <input type="checkbox" className="mt-1 size-4 accent-[var(--color-meki-green)]" checked={form.acceptGala} onChange={(e) => set({ acceptGala: e.target.checked, classification: "" })} data-testid="gala-only-accept" />
                    <span>{fillGiving(f0.galaOffer.accept, { project: offer.destinationName })}</span>
                  </label>
                </div>
              )}

              <fieldset className="mb-6" aria-describedby="g-type-help">
                <legend className={labelCls}>{f0.typeLabel}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["SADAQAH", "ZAKAT"] as const).map((k) => {
                    const disabled = k === "ZAKAT" && !zakat.allowed;
                    const on = form.classification === k;
                    const text = k === "ZAKAT" ? f0.zakat : f0.sadaqah;
                    return (
                      <label key={k} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${on ? "border-deep-green bg-deep-green/5" : "border-stone-line"} ${disabled ? "cursor-not-allowed opacity-60" : "hover:border-meki-green"}`}>
                        <input type="radio" name="g-type" value={k} checked={on} disabled={disabled} onChange={() => set({ classification: k })} className="mt-1 size-4 accent-[var(--color-meki-green)]" aria-describedby={`g-type-${k}`} />
                        <span>
                          <span className="block font-bold text-ink">{text.title}</span>
                          <span id={`g-type-${k}`} className="block text-sm text-body-grey">{disabled ? (f0.zakatUnavailable[reasonKey(zakat.reason)] ?? f0.zakatUnavailable.generic) : text.text}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p id="g-type-help" className="mt-2 text-sm text-body-grey">{f0.typeHelp}</p>
                {err("classification") && <p className="mt-2 text-sm font-bold text-red-700" role="alert">{err("classification")}</p>}
              </fieldset>

              <fieldset className="mb-6">
                <legend className={labelCls}>{f0.amountLabel}</legend>
                <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {amounts.map((a) => (
                    <button key={a} type="button" aria-pressed={amount === normaliseAmount(a)} onClick={() => set({ amount: a })} className={`min-h-12 rounded-xl border text-base font-bold transition ${amount === normaliseAmount(a) ? "border-harvest-gold bg-harvest-gold text-deep-green-3" : "border-stone-line bg-paper text-ink hover:border-meki-green"}`}>
                      <span dir="ltr">{money(a)}</span>
                    </button>
                  ))}
                </div>
                <label htmlFor="g-amount" className="sr-only">{f0.otherAmount}</label>
                <div className="relative">
                  <span aria-hidden="true" className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-body-grey" dir="ltr">$</span>
                  <input id="g-amount" inputMode="decimal" autoComplete="off" dir="ltr" placeholder={f0.otherAmount} className={`${field} ps-9`} value={form.amount} aria-invalid={!!errors.amount} aria-describedby="g-amount-help" onChange={(e) => set({ amount: e.target.value.slice(0, 14) })} />
                </div>
                <p id="g-amount-help" className="mt-1.5 text-sm text-body-grey">
                  {f0.amountHelp} {limits.min && limits.max ? fillGiving(f0.limits, { min: money(limits.min), max: money(limits.max) }) : ""}
                </p>
                {err("amount") && <p className="mt-1 text-sm font-bold text-red-700" role="alert">{err("amount")}</p>}
              </fieldset>

              <button type="submit" className="btn btn-green min-h-12 w-full justify-center sm:w-auto">
                {f0.next} <ArrowRight className="btn-arrow size-4" aria-hidden="true" />
              </button>
            </form>
          )}

          {step === 1 && !preview && (
            <form noValidate onSubmit={(e) => { e.preventDefault(); nextFromDetails(); }}>
              <h2 id="gift-step-heading" ref={heading} tabIndex={-1} className="mb-2 font-serif text-3xl text-deep-green outline-none">{f0.detailsTitle}</h2>
              <p className="mb-6 text-sm text-body-grey">{f0.detailsHelp}</p>
              <div className="mb-6 grid gap-4 sm:grid-cols-2">
                <TextField id="g-name" label={f0.fullName} value={form.fullName} error={err("fullName")} autoComplete="name" dir="auto" onChange={(v) => set({ fullName: v })} />
                <TextField id="g-email" label={f0.email} type="email" value={form.email} error={err("email")} autoComplete="email" dir="ltr" onChange={(v) => set({ email: v })} />
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => setStep(0)} className="btn btn-outline min-h-12">{f0.back}</button>
                <button type="submit" className="btn btn-green min-h-12">{f0.next} <ArrowRight className="btn-arrow size-4" aria-hidden="true" /></button>
              </div>
            </form>
          )}

          {step === 2 && (
            <div>
              <h2 id="gift-step-heading" ref={heading} tabIndex={-1} className="mb-2 font-serif text-3xl text-deep-green outline-none">{f0.reviewTitle}</h2>
              <p className="mb-6 text-body-grey">{f0.reviewIntro}</p>
              <dl className="mb-6 divide-y divide-stone-line rounded-xl border border-stone-line" data-testid="giving-review">
                {[
                  ...(offer && form.acceptGala ? [[f0.reviewInterest, interestName], [f0.reviewRedirected, destinationName]] : [[f0.review.destination, offer ? interestName : destinationName || "—"]]),
                  [f0.review.type, classLabel(form.classification)],
                  [f0.review.amount, amount ? money(amount) : "—"],
                  [f0.review.form, "Spring of Dignity International (SDI) · Zeffy"],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-wrap justify-between gap-2 px-4 py-3">
                    <dt className="text-sm text-body-grey">{k}</dt>
                    <dd className="font-bold text-ink" dir="auto">{v}</dd>
                  </div>
                ))}
              </dl>
              <ul className="mb-6 space-y-2 text-sm text-body-grey">
                {f0.terms.map((t) => (
                  <li key={t} className="flex items-start gap-2"><Lock className="mt-0.5 size-4 shrink-0 text-meki-green" aria-hidden="true" />{t}</li>
                ))}
              </ul>
              {preview ? (
                <div className="rounded-xl border border-dashed border-gold-text/50 bg-limestone p-4" role="status" data-testid="giving-closed">
                  <p className="mb-1 font-bold text-ink">{f0.closedTitle}</p>
                  <p className="text-sm text-body-grey">{f0.closed[reasonKey(reason)] ?? f0.closed.generic}</p>
                  <button type="button" onClick={() => setStep(0)} className="btn btn-outline mt-4 min-h-11">{f0.edit}</button>
                </div>
              ) : (
                <>
                  <label className="mb-2 flex items-start gap-3 text-sm">
                    <input type="checkbox" className="mt-1 size-4 accent-[var(--color-meki-green)]" checked={form.acceptTerms} onChange={(e) => set({ acceptTerms: e.target.checked })} aria-invalid={!!errors.acceptTerms} />
                    <span>{f0.accept}</span>
                  </label>
                  {errors.acceptTerms && <p className="mb-2 text-sm font-bold text-red-700" role="alert">{c.errors.required}</p>}
                  {submitError && <p className="mb-3 text-sm font-bold text-red-700" role="alert">{c.errors[submitError]}</p>}
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" onClick={() => setStep(1)} className="btn btn-outline min-h-12">{f0.back}</button>
                    <button type="button" disabled={busy} onClick={() => void submit()} className="btn btn-gold min-h-12">
                      {busy ? f0.submitting : f0.submit}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 3 && created && (
            <div data-testid="giving-reference">
              <h2 id="gift-step-heading" ref={heading} tabIndex={-1} className="mb-2 font-serif text-3xl text-deep-green outline-none">{c.reference.heading}</h2>
              <p className="mb-5 text-body-grey">{c.reference.intro}</p>
              <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl bg-deep-green px-5 py-4 text-white">
                <output className="font-mono text-2xl tracking-wider" dir="ltr" data-testid="donation-reference">{created.reference}</output>
                <button type="button" onClick={() => void copyRef()} className="ms-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-white/40 px-4 text-sm font-bold hover:bg-white/10">
                  {copy === "copied" ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />} {copy === "copied" ? c.reference.copied : c.reference.copy}
                </button>
              </div>
              {copy === "failed" && <p className="mb-4 text-sm font-bold text-red-700" role="alert">{c.reference.copyFailed}</p>}
              <h3 className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.2em] text-gold-text">{c.reference.instructionsTitle}</h3>
              <ol className="mb-5 list-decimal space-y-2 ps-5 text-ink">
                {c.reference.instructions.map((s) => <li key={s}>{fillGiving(s, { question: created.handoff.referenceQuestion })}</li>)}
                {created.handoff.donationTypeQuestion && <li>{fillGiving(c.reference.typeInstruction, { question: created.handoff.donationTypeQuestion, answer: created.handoff.donationTypeAnswer })}</li>}
                {created.designation.type === "PROGRAMME" && created.handoff.designationAnswer && <li>{fillGiving(c.reference.designationInstruction, { designation: created.handoff.designationAnswer })}</li>}
              </ol>
              <p className="mb-5 text-sm text-body-grey">{c.reference.noPrefill}</p>
              {formUrl ? (
                <a href={formUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="btn btn-gold mb-4 min-h-14 w-full justify-center sm:w-auto">
                  <Lock className="size-4" aria-hidden="true" /> {c.reference.openForm} <ExternalLink className="size-4" aria-hidden="true" /> <span className="sr-only">{c.reference.newTab}</span>
                </a>
              ) : (
                <p className="mb-4 text-sm font-bold text-gold-text" role="status">{c.reference.formUnavailable}</p>
              )}
              <p className="mb-4 text-sm text-body-grey">{c.reference.receipts}</p>
              <Link href={`/${locale}/give/status/${created.reference}`} className="inline-flex items-center gap-2 text-sm font-bold text-meki-green underline underline-offset-4">
                {c.reference.statusLink} <ArrowRight className="btn-arrow size-4" aria-hidden="true" />
              </Link>
            </div>
          )}
        </section>

        <aside aria-label={c.stages.title} className="self-start">
          <GiftStages locale={locale} stage={created ? "PENDING_EXTERNAL" : null} />
        </aside>
      </div>
    </div>
  );
}

function TextField({ id, label, value, onChange, error, type = "text", autoComplete, dir }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; type?: string; autoComplete?: string; dir?: "ltr" | "auto" }) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{label}</label>
      <input id={id} type={type} value={value} autoComplete={autoComplete} dir={dir} className={field} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} onChange={(e) => onChange(e.target.value)} maxLength={type === "email" ? 191 : 120} />
      {error && <p id={`${id}-err`} className="mt-1 text-sm font-bold text-red-700" role="alert">{error}</p>}
    </div>
  );
}
