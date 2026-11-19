"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";

export type AccordionItem = { q: string; a: string; pending?: boolean };

/** Accessible accordion: buttons with aria-expanded/aria-controls (Enter/Space native), smooth height via grid rows. */
export function FaqAccordion({ items, pendingLabel }: { items: AccordionItem[]; pendingLabel: string }) {
  const uid = useId();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <ul>
      {items.map((item, i) => {
        const on = open === i;
        return (
          <li key={item.q} className="relative border-b border-stone-line first:border-t">
            <span aria-hidden="true" className={`absolute -start-4 inset-y-4 w-0.5 origin-top rounded-full bg-harvest-gold transition-transform duration-500 ease-[var(--ease-premium)] sm:-start-6 ${on ? "scale-y-100" : "scale-y-0"}`} />
            <h3 className="font-sans text-base">
              <button
                type="button"
                id={`${uid}-q-${i}`}
                aria-expanded={on}
                aria-controls={`${uid}-a-${i}`}
                onClick={() => setOpen(on ? null : i)}
                className="group flex min-h-14 w-full items-center justify-between gap-6 py-5 text-start"
              >
                <span className={`font-serif text-xl leading-snug transition-colors sm:text-2xl ${on ? "text-meki-green" : "text-ink group-hover:text-meki-green"}`}>{item.q}</span>
                <span className={`grid size-11 shrink-0 place-items-center rounded-full border transition-all duration-500 ${on ? "rotate-45 border-meki-green bg-meki-green text-white" : "border-stone-line text-ink group-hover:border-meki-green"}`}>
                  <Plus className="size-5" aria-hidden="true" />
                </span>
              </button>
            </h3>
            <div
              id={`${uid}-a-${i}`}
              role="region"
              aria-labelledby={`${uid}-q-${i}`}
              className={`grid transition-[grid-template-rows] duration-500 ease-[var(--ease-premium)] motion-reduce:transition-none ${on ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
            >
              <div className="overflow-hidden">
                <p className="max-w-2xl pb-3 pe-12 text-body-grey">{item.a}</p>
                {item.pending ? <p className="pb-6 text-xs font-bold uppercase tracking-[0.16em] text-gold-text">{pendingLabel}</p> : <div className="pb-4" />}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
