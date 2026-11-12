"use client";

import Image from "next/image";
import { useState } from "react";
import { ArrowUpRight, Heart } from "lucide-react";
import type { Dict } from "@/content/en";
import { resolveMedia } from "@/content/media";
import { Icon } from "../Icon";
import { GiveButton } from "../DonateProvider";

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
          <p data-reveal className="self-end text-lg text-body-grey lg:col-span-5 lg:col-start-8">
            {p.intro}
          </p>
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
                    onMouseEnter={() => setActive(i)}
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
                    className={`grid transition-[grid-template-rows] duration-500 ease-[var(--ease-premium)] lg:hidden ${on ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                  >
                    <div className="overflow-hidden">
                      <div className="pb-8">
                        <div className="relative mb-5 aspect-[16/10] overflow-hidden rounded-3xl">
                          <Image src={resolveMedia(item.image).src} alt="" fill sizes="100vw" className="object-cover" />
                        </div>
                        <p className="mb-3 font-serif text-xl italic text-meki-green">{item.short}</p>
                        <p className="mb-4 text-body-grey">{item.mandate}</p>
                        <ul className="flex flex-wrap gap-2">
                          {item.themes.map((th) => (
                            <li key={th} className="rounded-full border border-stone-line bg-paper px-3 py-1 text-sm text-body-grey">
                              {th}
                            </li>
                          ))}
                        </ul>
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
              <div className="relative aspect-[4/5] overflow-hidden rounded-[2.5rem] rounded-se-[8rem] bg-deep-green shadow-[var(--shadow-lift)]">
                {p.items.map((item, i) => (
                  <Image
                    key={item.slug}
                    src={resolveMedia(item.image).src}
                    alt=""
                    fill
                    sizes="40vw"
                    className={`object-cover transition-[opacity,transform] duration-[1200ms] ease-[var(--ease-premium)] ${
                      i === active ? "scale-100 opacity-100" : "scale-110 opacity-0"
                    }`}
                  />
                ))}
                <div className="absolute inset-0 bg-gradient-to-t from-deep-green-3 via-deep-green-3/45 to-transparent" />
                <div key={cur.slug} className="prog-panel-in absolute inset-x-0 bottom-0 p-8 text-white xl:p-10" aria-live="polite">
                  <span className="mb-3 block font-serif text-6xl font-light text-glow/90">{cur.n}</span>
                  <h3 className="mb-3 text-3xl">{cur.name}</h3>
                  <p className="mb-5 font-serif text-lg italic text-mint-line">{cur.short}</p>
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-glow">{p.mandateLabel}</p>
                  <p className="mb-6 text-[0.95rem] text-white/85">{cur.mandate}</p>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <ul className="flex flex-wrap gap-2" aria-label={p.themesLabel}>
                      {cur.themes.map((th) => (
                        <li key={th} className="rounded-full border border-white/25 px-3 py-1 text-xs text-white/90 backdrop-blur">
                          {th}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <GiveButton selection={{ destination: cur.name }} className="btn btn-green mt-6">
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
