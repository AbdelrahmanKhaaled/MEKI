"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Heart, Info } from "lucide-react";
import type { Dict } from "@/content/en";
import { resolveMedia } from "@/content/media";
import { GiveButton } from "../DonateProvider";

/**
 * PREVIEW campaigns derived from client photo folders (project-context §7). Not approved fundraisers:
 * no targets, totals, progress bars or donor counts are rendered.
 */
export function Campaigns({ t }: { t: Dict }) {
  const c = t.campaigns;
  const track = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft); // RTL scrollLeft is negative
    setEdge({ start: pos < 8, end: pos > max - 8 });
  }, []);

  useEffect(() => {
    update();
    const el = track.current;
    el?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update]);

  const go = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    const card = el.querySelector("li");
    const step = (card?.clientWidth ?? 360) + 24;
    el.scrollBy({ left: step * dir * (rtl ? -1 : 1), behavior: "smooth" });
  };

  return (
    <section id="campaigns" aria-labelledby="campaigns-title" className="section-y relative overflow-hidden bg-paper">
      <div className="container-x">
        <div className="mb-14 flex flex-col gap-8 lg:mb-20 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p data-reveal className="eyebrow mb-6">
              {c.eyebrow}
            </p>
            <h2 id="campaigns-title" data-reveal className="headline mb-6">
              {c.title}
            </h2>
            <p data-reveal className="text-lg text-body-grey">
              {c.intro}
            </p>
          </div>
          <div data-reveal className="flex gap-3">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={edge.start}
              aria-label={c.prev}
              className="grid size-14 place-items-center rounded-full border border-deep-green text-deep-green transition hover:bg-deep-green hover:text-white disabled:pointer-events-none disabled:opacity-30"
            >
              <ArrowLeft className="size-5 rtl:-scale-x-100" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={edge.end}
              aria-label={c.next}
              className="grid size-14 place-items-center rounded-full bg-deep-green text-white transition hover:bg-meki-green disabled:pointer-events-none disabled:opacity-30"
            >
              <ArrowRight className="size-5 rtl:-scale-x-100" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <ul
        ref={track}
        data-stagger
        className="campaign-track no-scrollbar flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth pb-6"
      >
        {c.items.map((item, i) => (
          <li key={item.slug} data-stagger-item className={`w-[82vw] shrink-0 snap-start sm:w-[400px] ${i % 2 ? "lg:mt-14" : ""}`}>
            <article className="group relative flex h-full flex-col overflow-hidden rounded-[2rem] bg-limestone shadow-[var(--shadow-card)] ring-1 ring-stone-line transition-all duration-700 ease-[var(--ease-premium)] hover:-translate-y-2 hover:shadow-[var(--shadow-lift)]">
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image
                  src={resolveMedia(item.image).src}
                  alt=""
                  fill
                  sizes="(min-width:640px) 400px, 82vw"
                  className="object-cover transition-transform duration-[1400ms] ease-[var(--ease-premium)] group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-deep-green-3/60 via-transparent to-transparent opacity-80 transition-opacity duration-700 group-hover:opacity-100" />
                <span className="preview-badge absolute start-4 top-4">{c.badge}</span>
                <span className="absolute bottom-4 start-4 max-w-[85%] rounded-full bg-deep-green/80 px-3 py-1 text-xs font-bold text-mint-line backdrop-blur">
                  {item.programme}
                </span>
              </div>
              <div className="flex flex-1 flex-col p-7">
                <h3 className="mb-3 text-[1.7rem] leading-tight">{item.title}</h3>
                <p className="mb-7 flex-1 text-body-grey">{item.text}</p>
                <div className="flex items-center justify-between gap-3 border-t border-stone-line pt-5">
                  <a href="#programmes" className="group/link inline-flex min-h-11 items-center gap-1 text-sm font-bold text-meki-green">
                    <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat transition-[background-size] duration-500 group-hover/link:bg-[length:100%_1px] rtl:bg-right-bottom">
                      {t.programmes.eyebrow}
                    </span>
                  </a>
                  <GiveButton selection={{ destination: item.title }} className="btn btn-green min-h-11 px-5 text-sm">
                    <Heart className="size-4" aria-hidden="true" /> {c.donate}
                  </GiveButton>
                </div>
              </div>
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-harvest-gold transition-transform duration-700 group-hover:scale-x-100 rtl:origin-right" />
            </article>
          </li>
        ))}
      </ul>

      <div className="container-x">
        <p className="mt-8 flex items-center gap-2 text-sm text-gold-text">
          <Info className="size-4 shrink-0" aria-hidden="true" /> {c.noFigures}
        </p>
      </div>
    </section>
  );
}
