"use client";

import Image from "next/image";
import { useState } from "react";
import { ArrowUpRight, Check, Heart } from "lucide-react";
import type { Dict, Programme } from "@/content/en";
import { resolveMedia } from "@/content/media";
import { Icon } from "../Icon";
import { GiveButton } from "../DonateProvider";

/**
 * One program block, in the order MEKI approved (client edits, 22 Nov 2026 — "Program copy"): the italic line, two short
 * sentences, "What we do" (three tags), "The change we aim for" (four lines with check marks). The photo sits above it.
 */
export function ProgramBody({ item, p, tone }: { item: Programme; p: Dict["programmes"]; tone: "light" | "dark" }) {
  const dark = tone === "dark";
  const label = `mb-2 text-xs font-bold uppercase tracking-[0.2em] ${dark ? "text-glow" : "text-gold-text"}`;
  return (
    <>
      <p className={`mb-3 font-serif text-xl italic ${dark ? "text-mint-line" : "text-meki-green"}`}>{item.short}</p>
      <p className={`mb-5 ${dark ? "text-[0.95rem] text-white/85" : "text-body-grey"}`}>{item.summary}</p>
      <p className={label}>{p.themesLabel}</p>
      <ul className="mb-5 flex flex-wrap gap-2" aria-label={p.themesLabel}>
        {item.themes.map((th) => (
          <li key={th} className={dark ? "rounded-full border border-white/25 px-3 py-1 text-xs text-white/90 backdrop-blur" : "rounded-full border border-stone-line bg-paper px-3 py-1 text-sm text-body-grey"}>
            {th}
          </li>
        ))}
      </ul>
      {item.outcomes.length > 0 && (
        <>
          <p className={label}>{p.outcomesLabel}</p>
          <ul className="grid gap-1.5 sm:grid-cols-2" aria-label={p.outcomesLabel}>
            {item.outcomes.map((o) => (
              <li key={o} className={`flex items-start gap-2 text-sm ${dark ? "text-white/90" : "text-ink"}`}>
                <Check aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${dark ? "text-glow" : "text-meki-green"}`} strokeWidth={2.2} />
                {o}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/**
 * Split-screen programme explorer: an index of the nine programmes beside a sticky visual panel.
 * Hover, focus or tap swaps the panel (no card grid repetition). On mobile the panel collapses into
 * an expanding row per programme.
 */
export function Programmes({ t }: { t: Dict }) {
  const p = t.programmes;
  const [active, setActive] = useState(0);
  const cur = p.items[active];

  return (
    <section id="programmes" aria-labelledby="programmes-title" className="section-y relative bg-limestone">
      <div className="container-x">
        <div className="mb-16 grid gap-8 lg:mb-24 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <p data-reveal className="eyebrow mb-6">
              {p.eyebrow}
            </p>
            <h2 id="programmes-title" data-reveal className="headline">
              {p.title}
            </h2>
          </div>
          <div data-reveal className="space-y-4 self-end text-lg text-body-grey lg:col-span-5 lg:col-start-8">
            {p.intro.split(/\n\s*\n/).map((para) => (
              <p key={para.slice(0, 40)}>{para}</p>
            ))}
          </div>
        </div>

        {/* MEKI client edits (22 Nov 2026, item 7): "How it works" — five numbered steps in one row (wraps to 2–3 columns on smaller screens). */}
        <div className="mb-16 lg:mb-24">
          <h3 data-reveal className="mb-6 font-sans text-xs font-bold uppercase tracking-[0.22em] text-gold-text">
            {p.howTitle}
          </h3>
          <ol data-stagger className="grid gap-px overflow-hidden rounded-[1.75rem] bg-stone-line sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {p.how.map((step, i) => (
              <li key={step.title} data-stagger-item className="flex gap-4 bg-paper p-6 lg:flex-col lg:gap-3">
                <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-meki-green font-serif text-lg text-white tabular-nums">
                  {i + 1}
                </span>
                <span>
                  <span className="block font-bold text-ink">{step.title}</span>
                  <span className="block text-sm text-body-grey">{step.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          {/* Index */}
          <ol data-stagger className="lg:col-span-6" role="list">
            {p.items.map((item, i) => {
              const on = i === active;
              return (
                <li key={item.slug} data-stagger-item className="border-b border-stone-line first:border-t">
                  <button
                    type="button"
                    onMouseEnter={() => {
                      // The mobile accordion changes on an explicit tap/focus. Scrolling a row
                      // under a desktop pointer must not collapse the panel the visitor is using.
                      if (window.matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine)").matches) setActive(i);
                    }}
                    onFocus={() => setActive(i)}
                    onClick={() => setActive(i)}
                    aria-expanded={on}
                    aria-controls={`prog-panel-${item.slug}`}
                    className="group flex w-full items-center gap-5 py-5 text-start sm:gap-7 sm:py-6"
                  >
                    <span className={`font-serif text-lg tabular-nums transition-colors duration-500 ${on ? "text-harvest-gold" : "text-body-grey/60"}`}>{item.n}</span>
                    <span
                      className={`grid size-11 shrink-0 place-items-center rounded-full transition-all duration-500 ${
                        on ? "bg-meki-green text-white" : "bg-paper text-meki-green group-hover:bg-meki-green/10"
                      }`}
                    >
                      <Icon name={item.icon} className="size-5" />
                    </span>
                    <span
                      className={`flex-1 font-serif text-xl leading-snug transition-all duration-500 sm:text-2xl ${
                        on ? "text-ink ltr:translate-x-1 rtl:-translate-x-1" : "text-ink/70 group-hover:text-ink"
                      }`}
                    >
                      {item.name}
                    </span>
                    <ArrowUpRight
                      aria-hidden="true"
                      className={`size-5 shrink-0 transition-all duration-500 rtl:-scale-x-100 ${on ? "text-harvest-gold opacity-100" : "opacity-0 group-hover:opacity-60"}`}
                    />
                  </button>

                  {/* Mobile inline panel */}
                  <div
                    id={`prog-panel-${item.slug}`}
                    aria-hidden={!on}
                    inert={!on}
                    className={`grid transition-[grid-template-rows] duration-500 ease-[var(--ease-premium)] lg:hidden ${on ? "visible grid-rows-[1fr]" : "invisible pointer-events-none grid-rows-[0fr]"}`}
                  >
                    <div className="overflow-hidden">
                      <div className="pb-8">
                        <div className="relative mb-5 aspect-[16/10] overflow-hidden rounded-3xl">
                          <Image src={resolveMedia(item.image).src} alt="" fill sizes="(min-width:640px) 90vw, 100vw" quality={85} className="object-cover" />
                        </div>
                        <ProgramBody item={item} p={p} tone="light" />
                        {/* Phase 14B: the same Give entry point as the desktop panel (mobile had none), carrying the programme interest */}
                        <GiveButton selection={{ destination: item.name, programmeSlug: item.slug }} className="btn btn-green mt-5 w-full justify-center sm:w-auto">
                          <Heart className="size-4" aria-hidden="true" /> {p.give}
                        </GiveButton>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* Sticky visual panel (desktop) */}
          <div className="hidden lg:col-span-6 lg:block">
            <div className="sticky top-28">
              {/* min-height (not a fixed ratio) so the longer approved copy always fits above the photo's lower edge */}
              <div className="relative flex min-h-[720px] flex-col justify-end overflow-hidden rounded-[2.5rem] rounded-se-[8rem] bg-deep-green shadow-[var(--shadow-lift)]">
                {p.items.map((item, i) => (
                  <Image
                    key={item.slug}
                    src={resolveMedia(item.image).src}
                    alt=""
                    fill
                    sizes="(min-width:1536px) 720px, 45vw"
                    quality={85}
                    className={`object-cover transition-[opacity,transform] duration-[1200ms] ease-[var(--ease-premium)] ${
                      i === active ? "scale-100 opacity-100" : "scale-110 opacity-0"
                    }`}
                  />
                ))}
                <div className="absolute inset-0 bg-gradient-to-t from-deep-green-3 from-45% via-deep-green-3/70 to-deep-green-3/5" />
                <div key={cur.slug} className="prog-panel-in relative p-8 pt-40 text-white xl:p-10 xl:pt-48" aria-live="polite">
                  <span className="mb-2 block font-serif text-5xl font-light text-glow/90">{cur.n}</span>
                  <h3 className="mb-3 text-3xl">{cur.name}</h3>
                  <ProgramBody item={cur} p={p} tone="dark" />
                  <GiveButton selection={{ destination: cur.name, programmeSlug: cur.slug }} className="btn btn-green mt-6">
                    <Heart className="size-4" aria-hidden="true" /> {p.give}
                  </GiveButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
