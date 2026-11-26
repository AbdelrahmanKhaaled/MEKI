import { Flame } from "lucide-react";
import { galaAgendaAr, galaAgendaEn, type AgendaAct } from "@/content/gala-agenda";
import type { Locale } from "@/lib/i18n";

/**
 * The approved Gala agenda (client delivery, 26 Nov 2026). Frontend-owned and static: it never reads the CMS / event API, so it renders
 * even while /public/events/gala-night/page answers 404. Warm ivory, deep-green type, gold eyebrow; two columns from tablet width up
 * (Acts I–II | III–IV), one chronological column on mobile. Logical properties only (start/end), so Arabic mirrors correctly.
 */
const ACT_ID = (i: number) => `agenda-act-${i + 1}`;

function Act({ act, index }: { act: AgendaAct; index: number }) {
  return (
    <section aria-labelledby={ACT_ID(index)} data-testid="gala-agenda-act" className="min-w-0">
      <header className="mb-6 sm:mb-8">
        <h3 id={ACT_ID(index)} className="text-[0.8rem] font-bold uppercase tracking-[0.22em] text-deep-green rtl:tracking-normal rtl:text-base sm:text-sm">
          {act.label} — {act.name}
        </h3>
        <p className="mt-1.5 text-xs font-bold uppercase tracking-[0.2em] text-gold-text rtl:tracking-normal rtl:text-sm">
          <span dir="ltr" className="inline-block">{act.time}</span>
        </p>
      </header>
      <ol className="m-0 list-none p-0">
        {act.items.map((item, i) => {
          const last = i === act.items.length - 1;
          return (
            <li key={`${i}-${item.time}`} data-testid="gala-agenda-item" data-highlight={item.highlight ? "true" : undefined} className={`relative grid grid-cols-[2.75rem_1.25rem_minmax(0,1fr)] items-start gap-x-2.5 sm:grid-cols-[3.25rem_1.25rem_minmax(0,1fr)] sm:gap-x-3 ${last ? "" : "pb-7 sm:pb-8"}`}>
              {/* time, aligned in the same left (start) column for every item */}
              <time dir="ltr" className={`pt-[0.15rem] text-end font-serif text-lg leading-none tabular-nums sm:text-xl ${item.highlight ? "text-gold-text" : "text-deep-green"}`}>
                {item.time}
              </time>
              {/* timeline marker + the vertical line that runs to the next marker */}
              <span aria-hidden="true" className="relative flex justify-center self-stretch">
                {!last && <span className="absolute top-4 -bottom-7 w-px bg-deep-green/25 sm:-bottom-8" />}
                <span className={`relative z-[1] mt-[0.2rem] grid size-3.5 place-items-center rounded-full border ${item.highlight ? "border-harvest-gold bg-harvest-gold shadow-[0_0_0_4px_rgba(214,161,70,0.22)]" : "border-deep-green bg-limestone"}`}>
                  <span className={`size-1 rounded-full ${item.highlight ? "bg-deep-green-3" : "bg-deep-green"}`} />
                </span>
              </span>
              <div className={`min-w-0 ${item.highlight ? "rounded-lg border-s-2 border-harvest-gold bg-harvest-gold/10 py-2 ps-3 pe-2 -my-1" : ""}`}>
                <h4 className={`font-serif text-xl leading-snug sm:text-[1.55rem] ${item.highlight ? "text-gold-text" : "text-deep-green"}`}>
                  {item.highlight && <Flame className="me-1.5 inline size-5 -translate-y-0.5 text-harvest-gold" aria-hidden="true" />}
                  {item.title}
                </h4>
                <p className="mt-1 text-sm leading-snug text-body-grey sm:text-base">{item.note}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function GalaAgenda({ locale }: { locale: Locale }) {
  const a = locale === "ar" ? galaAgendaAr : galaAgendaEn;
  return (
    <section id="program" aria-label={a.ariaLabel} data-testid="gala-agenda" className="section-y relative isolate overflow-hidden bg-limestone text-deep-green">
      <div className="container-x">
        <header className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
          <p data-reveal className="mb-5 text-[0.7rem] font-bold uppercase leading-relaxed tracking-[0.28em] text-gold-text rtl:text-sm rtl:tracking-normal sm:text-xs">
            {a.eyebrow}
          </p>
          <h2 data-reveal className="headline font-serif text-deep-green">
            {a.title}
          </h2>
        </header>
        <div className="mx-auto grid max-w-5xl gap-x-10 gap-y-12 md:grid-cols-2 md:gap-x-12 lg:gap-x-20">
          <div data-reveal className="space-y-12 sm:space-y-14">
            <Act act={a.acts[0]} index={0} />
            <Act act={a.acts[1]} index={1} />
          </div>
          <div data-reveal className="space-y-12 sm:space-y-14">
            <Act act={a.acts[2]} index={2} />
            <Act act={a.acts[3]} index={3} />
          </div>
        </div>
        <footer className="mx-auto mt-14 max-w-5xl border-t border-deep-green/15 pt-6 text-center sm:mt-16">
          <p className="text-sm italic text-body-grey">{a.footnote}</p>
          <p dir="ltr" className="mt-3 text-[0.7rem] font-bold uppercase tracking-[0.28em] text-gold-text">{a.brandLine}</p>
        </footer>
      </div>
    </section>
  );
}
