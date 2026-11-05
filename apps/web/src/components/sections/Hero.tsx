import Image from "next/image";
import { ArrowRight, ArrowDown, MapPin } from "lucide-react";
import type { Dict } from "@/content/en";
import type { Locale } from "@/lib/i18n";
import { media } from "@/content/media";
import { Pattern, PointsOfLight, GoldArc } from "../Decor";
import { QuickDonate } from "../QuickDonate";

export function Hero({ t, locale }: { t: Dict; locale: Locale }) {
  const h = t.hero;
  return (
    <section id="top" className="relative isolate overflow-hidden bg-deep-green text-white">
      {/* Layered background: gradient + Nile pattern + points of light */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_80%_10%,#14594a_0%,#0b3b30_45%,#072a22_100%)]" />
      <Pattern opacity={0.07} className="-z-10" />
      <PointsOfLight className="-z-10" />

      <div className="container-x relative grid min-h-[100svh] items-center gap-12 pb-40 pt-32 lg:grid-cols-12 lg:gap-8 lg:pb-48 lg:pt-36">
        {/* Copy */}
        <div className="relative z-10 lg:col-span-6 xl:col-span-6">
          <p data-hero-item className="eyebrow eyebrow-dark mb-7">
            {h.eyebrow}
          </p>
          <h1 className="display mb-8">
            <span data-hero-item className="block">
              {h.titleA}
            </span>
            <span data-hero-item className="block font-serif italic text-glow">
              {h.titleB}
            </span>
          </h1>
          <div data-hero-item className="mb-8 h-px w-24 bg-harvest-gold" />
          <p data-hero-item className="mb-10 max-w-xl text-lg leading-relaxed text-mint-line sm:text-[1.2rem]">
            {h.lead}
          </p>
          <div data-hero-item className="flex flex-wrap gap-3">
            <a href="#programmes" className="btn btn-green">
              {h.ctaPrimary} <ArrowRight className="btn-arrow size-4" aria-hidden="true" />
            </a>
            <a href="#giving" className="btn btn-outline-light">
              {h.ctaSecondary}
            </a>
          </div>
        </div>

        {/* Layered visual: arched photo + floating Quick Donate card */}
        <div className="relative lg:col-span-6 lg:min-h-[720px]">
          <GoldArc className="-start-10 -top-10 hidden size-[420px] lg:block" />
          <div className="relative mx-auto w-[78%] max-w-[420px] sm:w-[62%] lg:absolute lg:start-0 lg:top-4 lg:mx-0 lg:w-[58%]">
            <div className="relative aspect-[3/4] overflow-hidden rounded-t-full rounded-b-[2.5rem] shadow-[0_40px_80px_-30px_rgb(0_0_0/0.6)] ring-1 ring-glow/30">
              <div data-hero-image className="absolute inset-[-8%]">
                <div data-parallax="0.06" className="absolute inset-0">
                  <Image
                    src={media["hero-field"].src}
                    alt=""
                    fill
                    priority
                    sizes="(min-width: 1024px) 30vw, 70vw"
                    className="object-cover object-[50%_30%]"
                  />
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-deep-green-3/50 via-transparent to-transparent" />
            </div>
            <p className="absolute end-4 top-[18%] inline-flex items-center gap-1.5 rounded-full bg-deep-green-3/70 px-3 py-1.5 text-xs font-bold text-mint-line backdrop-blur">
              <MapPin className="size-3.5 text-glow" aria-hidden="true" />
              {h.photoCaption}
            </p>
            {/* secondary layered photo */}
            <div className="absolute -bottom-8 -start-8 hidden size-32 overflow-hidden rounded-full border-4 border-deep-green shadow-xl sm:block lg:-start-14 lg:size-36">
              <Image src={media["water-pier"].src} alt="" fill sizes="144px" className="object-cover" />
            </div>
          </div>

          <div data-hero-card className="relative z-10 mx-auto -mt-20 max-w-[440px] lg:absolute lg:end-0 lg:top-[22%] lg:mt-0 lg:w-[58%] xl:w-[52%]">
            <QuickDonate t={t} locale={locale} />
          </div>
        </div>
      </div>

      <a
        href="#who-we-are"
        className="absolute bottom-28 start-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.3em] text-mint-line/80 transition hover:text-glow lg:flex rtl:translate-x-1/2"
      >
        {h.scroll}
        <ArrowDown className="size-4 animate-bounce" aria-hidden="true" />
      </a>
    </section>
  );
}
