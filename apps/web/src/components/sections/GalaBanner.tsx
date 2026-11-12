import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import type { Dict } from "@/content/en";
import { PointsOfLight } from "../Decor";

/** Homepage Gala call-to-action band. Non-transactional: it only links to the Gala page. */
export function GalaBanner({ t }: { t: Dict }) {
  const g = t.galaBanner;
  return (
    <section aria-labelledby="gala-banner-title" className="relative isolate overflow-hidden bg-deep-green text-white">
      <PointsOfLight count={16} className="-z-10" />
      <div className="container-x grid items-center gap-8 py-14 lg:grid-cols-12 lg:py-16">
        <div data-reveal className="lg:col-span-8">
          <p className="eyebrow eyebrow-dark mb-4">{g.eyebrow}</p>
          <h2 id="gala-banner-title" className="mb-4 text-[clamp(2rem,4.4vw,3.5rem)] leading-tight">
            {g.title}
          </h2>
          <p className="mb-5 max-w-2xl text-lg text-mint-line">{g.text}</p>
          <p className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold text-glow">
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="size-4" aria-hidden="true" /> {g.date}
            </span>
            <span className="inline-flex items-center gap-2">
              <MapPin className="size-4" aria-hidden="true" /> {g.venue}
            </span>
          </p>
        </div>
        <div data-reveal className="lg:col-span-4 lg:justify-self-end">
          <a href={g.href} className="btn btn-gold min-h-14 px-8 text-base">
            {g.cta} <ArrowRight className="btn-arrow size-4" aria-hidden="true" />
          </a>
        </div>
      </div>
      <div aria-hidden="true" className="h-px w-full bg-gradient-to-r from-transparent via-harvest-gold/60 to-transparent" />
    </section>
  );
}
