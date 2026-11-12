import Image from "next/image";
import type { Dict } from "@/content/en";
import { resolveMedia } from "@/content/media";
import { Icon } from "../Icon";

/**
 * All nine programs from the shared dictionary (built-in source content overlaid with published CMS programs).
 * Cards deliberately do not link anywhere yet: program detail pages do not exist. Mandate and focus areas
 * open inline from approved content.
 */
export function ProgramsGrid({ t, detailsLabel }: { t: Dict; detailsLabel: string }) {
  const p = t.programmes;
  return (
    <ul data-stagger className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
      {p.items.map((item, i) => {
        const img = resolveMedia(item.image);
        return (
          <li key={item.slug} data-stagger-item className={`group ${i % 3 === 1 ? "lg:mt-12" : i % 3 === 2 ? "lg:mt-24" : ""}`}>
            <article>
              <div className="relative mb-6 aspect-[4/5] overflow-hidden rounded-t-[999px] rounded-b-2xl bg-limestone-2">
                <Image src={img.src} alt="" fill sizes="(min-width:1024px) 30vw, (min-width:640px) 45vw, 92vw" className="object-cover transition-transform duration-[1400ms] ease-[var(--ease-premium)] group-hover:scale-105 motion-reduce:transition-none" />
                <span className="absolute start-4 top-6 grid size-11 place-items-center rounded-full bg-deep-green/85 text-glow backdrop-blur">
                  <Icon name={item.icon} className="size-5" />
                </span>
              </div>
              <p className="mb-2 font-serif text-lg text-harvest-gold-dark" aria-hidden="true">
                {item.n}
              </p>
              <h2 className="mb-3 text-[1.65rem] leading-tight">{item.name}</h2>
              <p className="mb-4 text-body-grey">{item.short}</p>
              <details className="group/d border-t border-stone-line">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-sm font-bold text-meki-green [&::-webkit-details-marker]:hidden">
                  {detailsLabel}
                  <span aria-hidden="true" className="transition-transform duration-300 group-open/d:rotate-45">
                    +
                  </span>
                </summary>
                <div className="pb-2 text-sm text-body-grey">
                  <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-gold-text">{p.mandateLabel}</p>
                  <p className="mb-3">{item.mandate}</p>
                  <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-gold-text">{p.themesLabel}</p>
                  <ul className="list-disc ps-5">
                    {item.themes.map((th) => (
                      <li key={th}>{th}</li>
                    ))}
                  </ul>
                </div>
              </details>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
