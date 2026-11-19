"use client";

import { useId, useState } from "react";
import { ExternalLink, Heart, Lock } from "lucide-react";
import type { Dict } from "@/content/en";
import type { PagesDict } from "@/content/pages";
import { formatMoney, formatUSD, type Locale } from "@/lib/i18n";
import { isTrustedHostedFormUrl } from "@/lib/booking";
import { useDonationContext } from "../DonateProvider";

const PREVIEW_AMOUNTS = [25, 50, 100, 250];

/**
 * Programme-designated giving (Phase 11A). The designation is FIXED to this programme and sent as its slug only; the API
 * resolves and re-validates it (published, PROGRAMME kind, not DEMO) — no client-side id can redirect a gift elsewhere.
 *
 *  - Payments not live (today): the existing informational preview dialog opens. Nothing is created or charged; no fake success.
 *  - Payments live: the existing checkout step (donor details → donation → provider-hosted checkout) with designation PROGRAMME.
 *    Monthly appears only when the live configuration lists it (approved setting + provider support).
 */
/** Phase 12: SDI-hosted programme form. Present only when the API says the programme switch is on AND designation is confirmed. */
export type ProgrammeHostedForm = { code: string; available: boolean; url: string | null };

export function ProgrammeDonate({ t, p, locale, slug, name, hosted }: { t: Dict; p: PagesDict["programDetail"]; locale: Locale; slug: string; name: string; hosted?: ProgrammeHostedForm | null }) {
  const q = t.quick;
  const id = useId();
  const { open, config } = useDonationContext();
  const live = !!config?.paymentsEnabled;
  const currency = live ? (config.currencies.find((c) => c.code === config.defaultCurrency) ?? config.currencies[0]) : undefined;
  const amounts = currency ? currency.suggestedAmounts.map(Number).filter((n) => Number.isFinite(n) && n > 0) : PREVIEW_AMOUNTS;
  const monthlyAllowed = live && config.frequencies.includes("MONTHLY");
  const money = (v: number) => (currency ? formatMoney(v, currency.code, locale, currency.symbol) : formatUSD(v, locale));

  const [choice, setChoice] = useState<number | "other">(amounts.includes(100) ? 100 : (amounts[0] ?? "other"));
  const [custom, setCustom] = useState("");
  const [frequency, setFrequency] = useState<"ONE_TIME" | "MONTHLY">("ONE_TIME");
  const value = choice === "other" ? Number(custom) || 0 : choice;
  const min = currency?.minAmount ? Number(currency.minAmount) : null;
  const max = currency?.maxAmount ? Number(currency.maxAmount) : null;
  const limitError =
    live && value > 0 && min !== null && value < min ? t.checkout.min.replace("{amount}", money(min)) : live && value > 0 && max !== null && value > max ? t.checkout.max.replace("{amount}", money(max)) : null;
  const freqLabel = frequency === "MONTHLY" ? q.monthly : q.oneOff;
  const cta = value > 0 ? (frequency === "MONTHLY" ? q.giveMonthly : q.give).replace("{amount}", money(value)) : q.chooseAmount;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value <= 0 || limitError) return;
    if (!live || !currency) {
      open({ amount: formatUSD(value, locale), frequency: freqLabel, destination: name });
      return;
    }
    open({
      checkout: {
        amount: String(value), // decimal string; the API re-validates currency, precision and limits
        currency: currency.code,
        frequency: monthlyAllowed ? frequency : "ONE_TIME",
        designation: "PROGRAMME",
        slug,
        summary: [money(value), freqLabel, name].join(" · "),
        source: "programme-page",
      },
    });
  };

  // Phase 12: when SDI's hosted programme form is approved and switched on, giving happens THERE (amount, frequency, donor details,
  // receipt). MEKI only links to the URL the API returned; nothing is charged or recorded here.
  const hostedUrl = hosted?.available && isTrustedHostedFormUrl(hosted.url) ? hosted.url : null;

  const pill = (on: boolean) =>
    `min-h-11 rounded-full border px-4 text-sm font-bold transition-[background-color,border-color,color,transform] duration-300 ${on ? "border-deep-green bg-deep-green text-white" : "border-stone-line bg-paper text-ink hover:-translate-y-0.5 hover:border-meki-green"}`;

  return (
    <form id="give" onSubmit={submit} aria-labelledby={`${id}-title`} className="relative rounded-[2rem] border border-stone-line bg-paper p-6 shadow-[0_40px_80px_-50px_rgb(11_59_48/0.55)] sm:p-9">
      <span aria-hidden="true" className="absolute inset-x-10 top-0 h-1 rounded-b-full bg-gradient-to-r from-harvest-gold via-glow to-harvest-gold" />
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-gold-text">{p.donate.eyebrow}</p>
      <h3 id={`${id}-title`} className="mb-6 text-[clamp(1.6rem,3vw,2.2rem)] leading-tight">
        {p.donate.title.replace("{program}", name)}
      </h3>

      <div className="mb-5 flex items-center gap-3 rounded-2xl bg-limestone px-4 py-3 text-sm">
        <Heart className="size-4 shrink-0 text-meki-green" aria-hidden="true" />
        <span>
          <span className="block text-xs font-bold uppercase tracking-[0.16em] text-body-grey">{p.donate.designatedTo}</span>
          <span className="font-bold text-ink">{name}</span>
          {hosted?.code && (
            <span className="block text-xs text-body-grey">
              {p.donate.code}: <span className="font-mono" dir="ltr">{hosted.code}</span>
            </span>
          )}
        </span>
      </div>

      {hostedUrl ? (
        <div>
          <a href={hostedUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="btn btn-gold min-h-14 w-full">
            <Lock className="size-4" aria-hidden="true" /> {p.donate.hostedCta} <ExternalLink className="size-4" aria-hidden="true" /> <span className="sr-only">{p.donate.newTab}</span>
          </a>
          <p className="mt-3 text-center text-xs text-body-grey">{p.donate.hostedNote}</p>
        </div>
      ) : (
      <>

      <fieldset className="mb-5">
        <legend className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-body-grey">{q.frequencyLabel}</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={frequency === "ONE_TIME"} onClick={() => setFrequency("ONE_TIME")} className={pill(frequency === "ONE_TIME")}>
            {q.oneOff}
          </button>
          {monthlyAllowed && (
            <button type="button" aria-pressed={frequency === "MONTHLY"} onClick={() => setFrequency("MONTHLY")} className={pill(frequency === "MONTHLY")}>
              {q.monthly}
            </button>
          )}
        </div>
        {!monthlyAllowed && <p className="mt-2 text-xs text-body-grey">{p.donate.monthlyUnavailable}</p>}
      </fieldset>

      <fieldset className="mb-5">
        <legend className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-body-grey">{currency ? `${q.amountLabel.replace(/\s*\(.*\)$/, "")} (${currency.code})` : q.amountLabel}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {amounts.map((a) => (
            <button key={a} type="button" aria-pressed={choice === a} onClick={() => setChoice(a)} className={pill(choice === a)}>
              <span className="num">{money(a)}</span>
            </button>
          ))}
          <button type="button" aria-pressed={choice === "other"} onClick={() => setChoice("other")} className={pill(choice === "other")}>
            {q.other}
          </button>
        </div>
        {choice === "other" && (
          <label className="mt-3 block">
            <span className="sr-only">{q.otherLabel}</span>
            <input
              inputMode="decimal"
              dir="ltr"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, "").slice(0, 10))}
              placeholder={q.otherPlaceholder}
              aria-invalid={limitError ? true : undefined}
              aria-describedby={limitError ? `${id}-limit` : undefined}
              className="min-h-12 w-full rounded-xl border border-stone-line bg-paper px-4 text-ink focus:border-meki-green focus:shadow-[0_0_0_4px_rgb(0_128_102/0.12)] focus:outline-none"
            />
          </label>
        )}
        {limitError && (
          <p id={`${id}-limit`} role="alert" className="mt-2 text-sm text-[#8a0019]">
            {limitError}
          </p>
        )}
      </fieldset>

      <div className="mb-5 rounded-2xl border border-dashed border-stone-line px-4 py-3 text-sm" aria-live="polite">
        <span className="block text-xs font-bold uppercase tracking-[0.16em] text-body-grey">{p.donate.summary}</span>
        <span className="font-bold text-ink">{value > 0 ? [money(value), freqLabel, name].join(" · ") : q.chooseAmount}</span>
      </div>

      <button type="submit" disabled={value <= 0 || !!limitError} className="btn btn-gold min-h-14 w-full disabled:cursor-not-allowed disabled:opacity-60">
        <Lock className="size-4" aria-hidden="true" /> {cta}
      </button>
      <p className="mt-3 text-center text-xs text-body-grey">{live ? t.quick.secure : q.note}</p>
      </>
      )}
    </form>
  );
}
