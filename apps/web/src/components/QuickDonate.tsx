"use client";

import { useId, useRef, useState } from "react";
import { Heart, Lock, ChevronDown } from "lucide-react";
import gsap from "gsap";
import type { Dict } from "@/content/en";
import { formatMoney, formatUSD, type Locale } from "@/lib/i18n";
import { useDonationContext } from "./DonateProvider";

// PREVIEW amounts (used until the backend reports live payments): suggested by the development team.
const AMOUNTS = [25, 50, 100, 250];

const label = "mb-1.5 block text-[0.7rem] font-bold uppercase tracking-[0.16em] text-body-grey";

export function QuickDonate({ t, locale }: { t: Dict; locale: Locale }) {
  const q = t.quick;
  const { open, config, liveCampaigns, preselect } = useDonationContext();
  const id = useId();
  const [amountChoice, setAmount] = useState<number | "other">(100);
  const [custom, setCustom] = useState("");
  const [dest, setDest] = useState("general");
  const totalRef = useRef<HTMLSpanElement>(null);

  // Live mode = the backend reports payments enabled. Otherwise everything behaves exactly as the preview.
  const live = !!config?.paymentsEnabled;
  const currency = live ? (config.currencies.find((c) => c.code === config.defaultCurrency) ?? config.currencies[0]) : undefined;
  const amounts = currency ? currency.suggestedAmounts.map(Number).filter((n) => Number.isFinite(n) && n > 0) : AMOUNTS;
  const money = (v: number) => (currency ? formatMoney(v, currency.code, locale, currency.symbol) : formatUSD(v, locale));
  const campaigns = live ? liveCampaigns.filter((c) => c.acceptingDonations && c.currency === currency?.code) : [];
  const destinations = [
    { value: "general", label: q.whereDefault },
    ...t.programmes.items.map((p) => ({ value: `programme:${p.slug}`, label: p.name })),
    ...campaigns.map((c) => ({ value: `campaign:${c.slug}`, label: c.title })),
  ];
  const destLabel = destinations.find((d) => d.value === dest)?.label ?? q.whereDefault;

  // Selections stay valid when the backend configuration differs from the preview defaults (derived, not effects).
  const amount: number | "other" =
    typeof amountChoice === "number" && !amounts.includes(amountChoice) ? (amounts.includes(100) ? 100 : (amounts[0] ?? "other")) : amountChoice;
  // "Give" buttons on programme/campaign cards preselect their destination (adjust-state-on-prop-change pattern).
  const [seenPreselect, setSeenPreselect] = useState(preselect);
  if (preselect !== seenPreselect) {
    setSeenPreselect(preselect);
    if (preselect) setDest(preselect.value);
  }

  const value = amount === "other" ? Number(custom) || 0 : amount;
  const min = currency?.minAmount ? Number(currency.minAmount) : null;
  const max = currency?.maxAmount ? Number(currency.maxAmount) : null;
  const limitError =
    live && value > 0 && min !== null && value < min
      ? t.checkout.min.replace("{amount}", money(min))
      : live && value > 0 && max !== null && value > max
        ? t.checkout.max.replace("{amount}", money(max))
        : null;
  const cta = value > 0 ? q.give.replace("{amount}", money(value)) : q.chooseAmount;
  const badge = live ? (config.testMode ? t.checkout.testBadge : null) : q.preview;

  const pulse = () => {
    if (!totalRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(totalRef.current, { y: 8, opacity: 0.2 }, { y: 0, opacity: 1, duration: 0.45, ease: "expo.out" });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value <= 0 || limitError) return;
    const frequencyLabel = q.oneOff;
    if (!live || !currency) {
      const [k0, s0] = dest.split(":");
      // Phase 14B: carry the programme and amount into the hosted giving journey (or the truthful dialog when nothing is open)
      open({ amount: formatUSD(value, locale), frequency: frequencyLabel, destination: destLabel, programmeSlug: k0 === "programme" ? s0 : undefined, amountValue: String(value) });
      return;
    }
    const [kind, slug] = dest.split(":");
    open({
      checkout: {
        amount: String(value), // decimal string; the backend validates currency, precision and limits again
        currency: currency.code,
        frequency: "ONE_TIME",
        designation: kind === "campaign" ? "CAMPAIGN" : kind === "programme" ? "PROGRAMME" : "GENERAL_FUND",
        slug,
        summary: [money(value), frequencyLabel, destLabel].join(" · "),
      },
    });
  };

  return (
    <form
      id="give"
      onSubmit={submit}
      aria-labelledby={`${id}-title`}
      className="relative w-full overflow-hidden rounded-[1.75rem] bg-paper/95 p-5 text-ink shadow-[var(--shadow-lift)] ring-1 ring-white/40 backdrop-blur-md sm:px-6 sm:py-6"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-harvest-gold via-glow to-harvest-gold" />

      {/* Title row */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="text-[1.6rem] leading-none sm:text-[1.7rem]">
          {q.title}
        </h2>
        {badge && <span className="preview-badge">{badge}</span>}
      </div>

      {/* Monthly giving is not approved: one-off only (Phase 5A). */}

      {/* Destination */}
      <label htmlFor={`${id}-dest`} className={label}>
        {q.whereLabel}
      </label>
      <div className="group relative mb-4">
        <select
          id={`${id}-dest`}
          value={dest}
          onChange={(e) => setDest(e.target.value)}
          className="min-h-11 w-full cursor-pointer appearance-none truncate rounded-xl border border-stone-line bg-paper pe-10 ps-4 text-[0.92rem] font-bold text-ink transition-[border-color,box-shadow] duration-300 hover:border-meki-green/60 focus:border-meki-green focus:shadow-[0_0_0_4px_rgb(0_128_102/0.12)] focus:outline-none"
        >
          {destinations.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute end-3.5 top-1/2 size-4 -translate-y-1/2 text-body-grey transition-transform duration-300 group-hover:translate-y-[-40%]"
          aria-hidden="true"
        />
      </div>

      {/* Amounts: one balanced row (wraps to 2×2 below 370px) */}
      <fieldset className="mb-4">
        <legend className={label}>{currency ? q.amountLabel.replace("USD", currency.code) : q.amountLabel}</legend>
        <div className="grid grid-cols-2 gap-2 min-[370px]:grid-cols-4">
          {amounts.map((a) => {
            const on = amount === a;
            return (
              <label key={a} className="cursor-pointer">
                <input
                  type="radio"
                  name="amount"
                  className="peer sr-only"
                  checked={on}
                  onChange={() => {
                    setAmount(a);
                    pulse();
                  }}
                />
                <span
                  className={`flex min-h-11 items-center justify-center rounded-xl border text-[0.95rem] font-bold tabular-nums transition-all duration-300 ease-[var(--ease-premium)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-harvest-gold ${
                    on
                      ? "border-harvest-gold bg-harvest-gold text-deep-green-3 shadow-[0_8px_20px_-10px_rgb(214_161_70/0.9)]"
                      : "border-stone-line bg-paper text-ink hover:-translate-y-0.5 hover:border-harvest-gold hover:shadow-[0_8px_18px_-12px_rgb(19_36_31/0.35)]"
                  }`}
                >
                  {money(a)}
                </span>
              </label>
            );
          })}
        </div>

        {/* Custom amount */}
        <div className="relative mt-2">
          <span
            className={`pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-sm font-bold transition-colors ${amount === "other" ? "text-meki-green" : "text-body-grey"}`}
          >
            {currency?.symbol ?? "$"}
          </span>
          <input
            type="text"
            inputMode="numeric"
            aria-label={q.otherLabel}
            aria-invalid={limitError ? true : undefined}
            aria-describedby={limitError ? `${id}-limit` : undefined}
            placeholder={`${q.other} · ${q.otherPlaceholder}`}
            value={custom}
            onFocus={() => setAmount("other")}
            onChange={(e) => {
              setAmount("other");
              setCustom(e.target.value.replace(/[^\d]/g, "").slice(0, 7));
            }}
            className={`min-h-11 w-full rounded-xl border bg-paper pe-4 ps-9 text-[0.95rem] font-bold text-ink transition-[border-color,box-shadow] duration-300 placeholder:font-normal placeholder:text-body-grey/75 hover:border-meki-green/60 focus:border-meki-green focus:shadow-[0_0_0_4px_rgb(0_128_102/0.12)] focus:outline-none ${
              amount === "other" ? "border-meki-green" : "border-stone-line"
            }`}
          />
        </div>
        {limitError && (
          <p id={`${id}-limit`} role="alert" className="mt-1.5 text-[0.75rem] font-bold text-[#8a0019]">
            {limitError}
          </p>
        )}
      </fieldset>

      {/* Primary CTA */}
      <button
        type="submit"
        disabled={value <= 0 || !!limitError}
        className="btn btn-gold min-h-[3.25rem] w-full rounded-xl text-base focus-visible:outline-offset-4 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
      >
        <Heart className="size-5" strokeWidth={1.8} aria-hidden="true" />
        <span ref={totalRef} aria-live="polite">
          {cta}
        </span>
      </button>

      <p className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-[0.72rem] leading-snug text-body-grey">
        <Lock className="size-3.5 shrink-0 text-meki-green" aria-hidden="true" />
        <span>{q.secure}</span>
      </p>
    </form>
  );
}
