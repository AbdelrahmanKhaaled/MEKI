import { ArrowRight } from "lucide-react";
import { PointsOfLight } from "../Decor";

/** Closing call-to-action band shared by the secondary pages. Links only to pages that exist. */
export function PageCta({ title, text, links }: { title: string; text?: string; links: { href: string; label: string; primary?: boolean }[] }) {
  return (
    <section aria-label={title} className="relative isolate overflow-hidden bg-deep-green-3 text-white">
      <PointsOfLight count={12} className="-z-10" />
      <div className="container-x py-20 text-center lg:py-28">
        <h2 data-reveal className="mx-auto mb-4 max-w-2xl text-[clamp(2rem,4.4vw,3.5rem)] leading-tight">
          {title}
        </h2>
        {text && (
          <p data-reveal className="mx-auto mb-8 max-w-xl text-lg text-mint-line">
            {text}
          </p>
        )}
        <div data-reveal className="flex flex-wrap justify-center gap-3">
          {links.map((l) => (
            <a key={l.href} href={l.href} className={`btn min-h-14 px-8 text-base ${l.primary ? "btn-gold" : "btn-outline-light"}`}>
              {l.label} <ArrowRight className="btn-arrow size-4" aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
