import Image from "next/image";
import type { Dict } from "@/content/en";
import { media } from "@/content/media";
import { PointsOfLight } from "../Decor";

/** Organic wave edge (top or bottom) that blends into the neighbouring section colour. */
function WaveEdge({ fill, position }: { fill: string; position: "top" | "bottom" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 90"
      preserveAspectRatio="none"
      className={`absolute inset-x-0 z-10 block h-[40px] w-full sm:h-[60px] lg:h-[80px] ${position === "top" ? "top-[-1px]" : "bottom-[-1px] rotate-180"}`}
    >
      <path d="M0 0h1440v34c-120 30-260 46-420 30S700 10 540 22 240 74 0 52z" fill={fill} />
    </svg>
  );
}

/**
 * Verified proof points (Brand Guidelines p.25). Must always carry the attribution
 * "Figures: Misr El-Kheir, Egypt." and never be presented as MEKI's own results.
 * Compact band: photographic background, wavy edges, figures as glass tiles.
 */
export function Impact({ t }: { t: Dict }) {
  const im = t.impact;
  return (
    <section id="impact" aria-labelledby="impact-title" className="relative isolate overflow-hidden bg-deep-green text-white">
      <WaveEdge fill="var(--color-paper)" position="top" />
      <WaveEdge fill="var(--color-limestone)" position="bottom" />

      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div data-parallax="0.08" className="absolute inset-[-14%]">
          <Image src={media["water-pump"].src} alt="" fill sizes="100vw" className="object-cover" />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(100deg,rgb(7_42_34/0.94)_0%,rgb(11_59_48/0.86)_45%,rgb(11_59_48/0.62)_100%)] rtl:bg-[linear-gradient(-100deg,rgb(7_42_34/0.94)_0%,rgb(11_59_48/0.86)_45%,rgb(11_59_48/0.62)_100%)]" />
      </div>
      <PointsOfLight count={18} className="-z-10" />

      <div className="container-x relative py-24 sm:py-28 lg:py-32">
        <div className="grid items-end gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-4">
            <p data-reveal className="eyebrow eyebrow-dark mb-5">
              {im.eyebrow}
            </p>
            <h2 id="impact-title" data-reveal className="mb-5 text-[clamp(2rem,3.4vw,2.9rem)]">
              {im.title}
            </h2>
            <p data-reveal className="text-mint-line">
              {im.intro}
            </p>
          </div>

          <dl data-stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:col-span-8">
            {im.stats.map((s) => (
              <div
                key={s.label}
                data-stagger-item
                className="stat-tile group relative flex flex-col overflow-hidden rounded-[1.5rem] border border-white/12 bg-white/[0.06] p-5 backdrop-blur-md transition-all duration-700 ease-[var(--ease-premium)] hover:-translate-y-1 hover:border-glow/50 hover:bg-white/[0.1] sm:p-7"
              >
                <span aria-hidden="true" className="absolute inset-x-6 top-0 h-px origin-left scale-x-50 bg-gradient-to-r from-glow to-transparent transition-transform duration-700 group-hover:scale-x-100 rtl:origin-right" />
                <dt className="order-2 mt-3 text-[0.7rem] font-bold uppercase leading-relaxed tracking-[0.18em] text-mint-line sm:text-xs">{s.label}</dt>
                <dd className="order-1 whitespace-nowrap font-serif text-[clamp(2.6rem,5.2vw,4.6rem)] font-light leading-none">
                  <bdi dir="ltr">
                    <span className="text-glow">{s.prefix}</span>
                    <span data-count={s.value}>{s.value}</span>
                    <span className="text-glow">{s.suffix}</span>
                  </bdi>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <p data-reveal className="mt-10 flex items-center gap-3 text-sm text-mint-line/90 lg:justify-end">
          <span className="h-px w-10 bg-harvest-gold" aria-hidden="true" />
          {im.attribution}
        </p>
      </div>
    </section>
  );
}
