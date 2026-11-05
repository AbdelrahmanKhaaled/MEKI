"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { Dict } from "@/content/en";

export function Faq({ t }: { t: Dict }) {
  const f = t.faq;
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" aria-labelledby="faq-title" className="section-y bg-paper">
      <div className="container-x grid gap-14 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-32">
            <p data-reveal className="eyebrow mb-6">
              {f.eyebrow}
            </p>
            <h2 id="faq-title" data-reveal className="headline mb-6">
              {f.title}
            </h2>
            <p data-reveal className="text-lg text-body-grey">
              {f.intro}
            </p>
          </div>
        </div>
        <ul data-stagger className="lg:col-span-7 lg:col-start-6">
          {f.items.map((item, i) => {
            const on = open === i;
            return (
              <li key={item.q} data-stagger-item className="border-b border-stone-line first:border-t">
                <h3 className="font-sans text-base">
                  <button
                    type="button"
                    id={`faq-q-${i}`}
                    aria-expanded={on}
                    aria-controls={`faq-a-${i}`}
                    onClick={() => setOpen(on ? null : i)}
                    className="group flex w-full items-center justify-between gap-6 py-6 text-start"
                  >
                    <span className={`font-serif text-xl leading-snug transition-colors sm:text-2xl ${on ? "text-meki-green" : "text-ink group-hover:text-meki-green"}`}>{item.q}</span>
                    <span
                      className={`grid size-11 shrink-0 place-items-center rounded-full border transition-all duration-500 ${
                        on ? "rotate-45 border-meki-green bg-meki-green text-white" : "border-stone-line text-ink group-hover:border-meki-green"
                      }`}
                    >
                      <Plus className="size-5" aria-hidden="true" />
                    </span>
                  </button>
                </h3>
                <div
                  id={`faq-a-${i}`}
                  role="region"
                  aria-labelledby={`faq-q-${i}`}
                  className={`grid transition-[grid-template-rows] duration-500 ease-[var(--ease-premium)] ${on ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                >
                  <div className="overflow-hidden">
                    <p className="max-w-2xl pb-7 pe-16 text-body-grey">{item.a}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
