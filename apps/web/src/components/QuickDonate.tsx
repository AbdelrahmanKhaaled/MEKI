"use client";

import Image from "next/image";
import { useId, useRef, useState } from "react";
import { Heart, Lock, ChevronDown } from "lucide-react";
import gsap from "gsap";
import type { Dict } from "@/content/en";
import { formatUSD, type Locale } from "@/lib/i18n";
import { useDonate } from "./DonateProvider";

// PREVIEW amounts: suggested by the development team; final amounts/currencies to be confirmed.
const AMOUNTS = [25, 50, 100, 250];

/**
 * POTENTIAL payment methods (preview only — no gateway selected or integrated).
 * Official logo files supplied in public/payments; only methods with a local asset are shown.
 * `pad` compensates for differing built-in whitespace so the marks read at a similar size.
 */
const METHODS = [
  { src: "/payments/visa.png", alt: "Visa", w: 2048, h: 1152, pad: "px-1.5 py-0.5" },
  { src: "/payments/mastercard.png", alt: "Mastercard", w: 568, h: 352, pad: "px-2.5 py-1.5" },
  { src: "/payments/apple-pay.png", alt: "Apple Pay", w: 697, h: 286, pad: "px-2.5 py-2" },
];

const label = "mb-1.5 block text-[0.7rem] font-bold uppercase tracking-[0.16em] text-body-grey";

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
  const cta = value > 0 ? (freq === "monthly" ? q.giveMonthly : q.give).replace("{amount}", formatUSD(value, locale)) : q.chooseAmount;

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
      className="relative w-full overflow-hidden rounded-[1.75rem] bg-paper/95 p-5 text-ink shadow-[var(--shadow-lift)] ring-1 ring-white/40 backdrop-blur-md sm:px-6 sm:py-6"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-harvest-gold via-glow to-harvest-gold" />

      {/* Title row */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="text-[1.6rem] leading-none sm:text-[1.7rem]">
          {q.title}
        </h2>
        <span className="preview-badge">{q.preview}</span>
      </div>

      {/* Frequency */}
      <fieldset className="mb-4">
        <legend className="sr-only">{q.frequencyLabel}</legend>
        <div className="relative grid grid-cols-2 rounded-full bg-limestone p-1">
          <span
            aria-hidden="true"
            className={`absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-full bg-deep-green shadow transition-[inset-inline-start] duration-500 ease-[var(--ease-premium)] ${
              freq === "once" ? "start-1" : "start-1/2"
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
                className={`flex min-h-11 items-center justify-center rounded-full text-sm font-bold transition-colors duration-300 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-harvest-gold ${
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
          <option>{q.whereDefault}</option>
          {t.programmes.items.map((p) => (
            <option key={p.slug}>{p.name}</option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute end-3.5 top-1/2 size-4 -translate-y-1/2 text-body-grey transition-transform duration-300 group-hover:translate-y-[-40%]"
          aria-hidden="true"
        />
      </div>

      {/* Amounts: one balanced row (wraps to 2×2 below 370px) */}
      <fieldset className="mb-4">
        <legend className={label}>{q.amountLabel}</legend>
        <div className="grid grid-cols-2 gap-2 min-[370px]:grid-cols-4">
          {AMOUNTS.map((a) => {
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
                  {formatUSD(a, locale)}
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
            $
          </span>
          <input
            type="text"
            inputMode="numeric"
            aria-label={q.otherLabel}
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
      </fieldset>

      {/* Primary CTA */}
      <button
        type="submit"
        disabled={value <= 0}
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

      {/* Potential payment methods — logos only, preview (not active) */}
      <ul aria-label={q.methodsAria} className="mt-4 flex items-center justify-center gap-2 border-t border-stone-line pt-4">
        {METHODS.map((m) => (
          <li
            key={m.src}
            className={`relative h-9 w-[3.75rem] rounded-lg border border-stone-line bg-white transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_6px_14px_-8px_rgb(19_36_31/0.35)] ${m.pad}`}
          >
            <span className="relative block size-full">
              <Image src={m.src} alt={m.alt} fill sizes="60px" className="object-contain" />
            </span>
          </li>
        ))}
      </ul>
    </form>
  );
}
