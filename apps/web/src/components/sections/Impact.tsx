import Image from "next/image";
import type { Dict } from "@/content/en";
import { media } from "@/content/media";
import { Curve, Pattern, PointsOfLight } from "../Decor";

/**
 * Verified proof points (Brand Guidelines p.25). Must always carry the attribution
 * "Figures: Misr El-Kheir, Egypt." and never be presented as MEKI's own results.
 */
export function Impact({ t }: { t: Dict }) {
  const im = t.impact;
  return (
    <section id="impact" aria-labelledby="impact-title" className="relative isolate overflow-hidden bg-deep-green text-white">
      <Curve fill="var(--color-paper)" flip className="absolute inset-x-0 top-0 z-10" />
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div data-parallax="0.07" className="absolute inset-[-15%] opacity-[0.18] mix-blend-luminosity">
          <Image src={media["field-sky"].src} alt="" fill sizes="100vw" className="object-cover" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-deep-green via-deep-green/90 to-deep-green-3" />
      </div>
      <Pattern opacity={0.05} className="-z-10" />
      <PointsOfLight count={22} className="-z-10" />

      <div className="container-x section-y relative">
        <div className="mb-20 grid gap-8 lg:mb-28 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p data-reveal className="eyebrow eyebrow-dark mb-6">
              {im.eyebrow}
            </p>
            <h2 id="impact-title" data-reveal className="headline">
              {im.title}
            </h2>
          </div>
          <p data-reveal className="self-end text-lg text-mint-line lg:col-span-5">
            {im.intro}
          </p>
        </div>

        <dl data-stagger className="grid grid-cols-1 gap-y-14 sm:grid-cols-2 lg:grid-cols-4">
          {im.stats.map((s, i) => (
            <div
              key={s.label}
              data-stagger-item
              className={`group relative flex flex-col ps-6 sm:ps-8 ${i > 0 ? "lg:border-s lg:border-white/10" : ""}`}
            >
              <span aria-hidden="true" className="absolute start-0 top-3 h-12 w-px bg-harvest-gold transition-all duration-700 group-hover:h-24 sm:start-0 lg:hidden" />
              <dt className="order-2 mt-4 max-w-[14rem] text-xs font-bold uppercase leading-relaxed tracking-[0.2em] text-mint-line">{s.label}</dt>
              <dd className="order-1 whitespace-nowrap font-serif text-[clamp(3.5rem,7vw,6rem)] font-light leading-none text-white">
                <bdi dir="ltr">
                  <span className="text-glow">{s.prefix}</span>
                  <span data-count={s.value}>{s.value}</span>
                  <span className="text-glow">{s.suffix}</span>
                </bdi>
              </dd>
            </div>
          ))}
        </dl>

        <p data-reveal className="mt-16 flex items-center gap-3 text-sm text-mint-line/90">
          <span className="h-px w-10 bg-harvest-gold" aria-hidden="true" />
          {im.attribution}
        </p>
      </div>
    </section>
  );
}
