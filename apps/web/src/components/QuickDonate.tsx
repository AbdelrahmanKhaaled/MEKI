"use client";

import { useId, useRef, useState } from "react";
import { Heart, Lock, ChevronDown } from "lucide-react";
import gsap from "gsap";
import type { Dict } from "@/content/en";
import { formatUSD, type Locale } from "@/lib/i18n";
import { useDonate } from "./DonateProvider";

// PREVIEW amounts: suggested by the development team; final amounts/currencies to be confirmed.
const AMOUNTS = [25, 50, 100, 250];

export function QuickDonate({ t, locale }: { t: Dict; locale: Locale }) {
  const q = t.quick;
  const open = useDonate();
  const id = useId();
  const [freq, setFreq] = useState<"once" | "monthly">("once");
  const [amount, setAmount] = useState<number | "other">(100);
  const [custom, setCustom] = useState("");
  const [dest, setDest] = useState(q.whereDefault);
  const totalRef = useRef<HTMLSpanElement>(null);

  const value = amount === "other" ? Number(custom) || 0 : amount;
  const label = value > 0 ? (freq === "monthly" ? q.giveMonthly : q.give).replace("{amount}", formatUSD(value, locale)) : q.chooseAmount;

  const pulse = () => {
    if (!totalRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(totalRef.current, { y: 8, opacity: 0.2 }, { y: 0, opacity: 1, duration: 0.45, ease: "expo.out" });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value <= 0) return;
    open({ amount: formatUSD(value, locale), frequency: freq === "monthly" ? q.monthly : q.oneOff, destination: dest });
  };

  return (
    <form
      id="give"
      onSubmit={submit}
      aria-labelledby={`${id}-title`}
      className="relative w-full overflow-hidden rounded-[2rem] bg-paper/95 p-6 text-ink shadow-[var(--shadow-lift)] ring-1 ring-white/40 backdrop-blur-md sm:p-8"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-harvest-gold via-glow to-harvest-gold" />
      <div className="mb-6 flex items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="text-[1.9rem] leading-none">
          {q.title}
        </h2>
        <span className="preview-badge">{q.preview}</span>
      </div>

      {/* Frequency */}
      <fieldset className="mb-5">
        <legend className="sr-only">{q.frequencyLabel}</legend>
        <div className="relative grid grid-cols-2 rounded-full bg-limestone p-1">
          <span
            aria-hidden="true"
            className={`absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-full bg-deep-green shadow transition-[inset-inline-start] duration-500 ease-[var(--ease-premium)] ${
              freq === "once" ? "start-1" : "start-[calc(50%+0rem)]"
            }`}
          />
          {(["once", "monthly"] as const).map((f) => (
            <label key={f} className="relative z-10 cursor-pointer">
              <input
                type="radio"
                name="frequency"
                value={f}
                checked={freq === f}
                onChange={() => {
                  setFreq(f);
                  pulse();
                }}
                className="peer sr-only"
              />
              <span
                className={`flex min-h-11 items-center justify-center rounded-full text-sm font-bold transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-harvest-gold ${
                  freq === f ? "text-white" : "text-body-grey hover:text-ink"
                }`}
              >
                {f === "once" ? q.oneOff : q.monthly}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Destination */}
      <label htmlFor={`${id}-dest`} className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-body-grey">
        {q.whereLabel}
      </label>
      <div className="relative mb-5">
        <select
          id={`${id}-dest`}
          value={dest}
          onChange={(e) => setDest(e.target.value)}
          className="min-h-12 w-full appearance-none rounded-2xl border border-stone-line bg-paper pe-10 ps-4 text-[0.95rem] font-bold text-ink transition hover:border-meki-green focus:border-meki-green"
        >
          <option>{q.whereDefault}</option>
          {t.programmes.items.map((p) => (
            <option key={p.slug}>{p.name}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute end-4 top-1/2 size-4 -translate-y-1/2 text-body-grey" aria-hidden="true" />
      </div>

      {/* Amounts */}
      <fieldset className="mb-5">
        <legend className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-body-grey">{q.amountLabel}</legend>
        <div className="grid grid-cols-4 gap-2">
          {AMOUNTS.map((a) => (
            <label key={a} className="cursor-pointer">
              <input
                type="radio"
                name="amount"
                className="peer sr-only"
                checked={amount === a}
                onChange={() => {
                  setAmount(a);
                  pulse();
                }}
              />
              <span
                className={`flex min-h-12 items-center justify-center rounded-2xl border text-[0.95rem] font-bold transition-all duration-300 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-harvest-gold ${
                  amount === a
                    ? "scale-[1.04] border-harvest-gold bg-harvest-gold text-deep-green-3 shadow-[0_10px_24px_-10px_rgb(214_161_70/0.9)]"
                    : "border-stone-line bg-paper text-ink hover:-translate-y-0.5 hover:border-harvest-gold"
                }`}
              >
                {formatUSD(a, locale)}
              </span>
            </label>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-2">
          <label className="cursor-pointer">
            <input type="radio" name="amount" className="peer sr-only" checked={amount === "other"} onChange={() => setAmount("other")} />
            <span
              className={`flex min-h-12 items-center rounded-2xl border px-4 text-sm font-bold transition peer-focus-visible:outline-2 peer-focus-visible:outline-harvest-gold ${
                amount === "other" ? "border-deep-green bg-deep-green text-white" : "border-stone-line text-body-grey hover:border-harvest-gold"
              }`}
            >
              {q.other}
            </span>
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 font-bold text-body-grey">$</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              aria-label={q.otherLabel}
              placeholder={q.otherPlaceholder}
              value={custom}
              onFocus={() => setAmount("other")}
              onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, "").slice(0, 7))}
              className="min-h-12 w-full rounded-2xl border border-stone-line bg-paper pe-4 ps-9 font-bold text-ink placeholder:font-normal placeholder:text-body-grey/70 focus:border-meki-green"
            />
          </div>
        </div>
      </fieldset>

      <button type="submit" disabled={value <= 0} className="btn btn-gold min-h-14 w-full text-base disabled:cursor-not-allowed disabled:opacity-60">
        <Heart className="size-5" strokeWidth={1.8} aria-hidden="true" />
        <span ref={totalRef} aria-live="polite">
          {label}
        </span>
      </button>

      <p className="mt-4 flex items-start gap-2 text-[0.8rem] leading-snug text-body-grey">
        <Lock className="mt-0.5 size-3.5 shrink-0 text-meki-green" aria-hidden="true" />
        <span>{q.secure}</span>
      </p>
      <p className="mt-2 border-t border-dashed border-stone-line pt-3 text-[0.78rem] leading-snug text-gold-text">{q.note}</p>
    </form>
  );
}
