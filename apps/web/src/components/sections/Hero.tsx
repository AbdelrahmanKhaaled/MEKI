import Image from "next/image";
import { ArrowRight, ArrowDown } from "lucide-react";
import type { Dict } from "@/content/en";
import type { Locale } from "@/lib/i18n";
import { coverSizes, slotImage } from "@/content/media";
import { Pattern, PointsOfLight, GoldArc } from "../Decor";
import { QuickDonate } from "../QuickDonate";
import { NoBreak } from "../NoBreak";

export function Hero({ t, locale }: { t: Dict; locale: Locale }) {
  const h = t.hero;
  // CMS-managed images (Homepage → Hero) with the curated photos as fallback; only allowed origins reach next/image.
  const mainImage = slotImage(h.image, "hero-family");
  const secondaryImage = slotImage(h.secondaryImage, "hero-school");
  return (
    <section id="top" className="relative isolate overflow-hidden bg-deep-green text-white">
      {/* Layered background: gradient + Nile pattern + points of light */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_80%_10%,#14594a_0%,#0b3b30_45%,#072a22_100%)]" />
      <Pattern opacity={0.07} className="-z-10" />
      <PointsOfLight className="-z-10" />

      <div className="container-x relative grid min-h-[100svh] items-center gap-12 pb-40 pt-32 lg:pb-48 lg:pt-36 xl:grid-cols-12 xl:gap-8">
        {/* Copy */}
        <div className="relative z-10 xl:col-span-5">
          <p data-hero-item className="eyebrow eyebrow-dark mb-7">
            {/* one flex item: .eyebrow is inline-flex, so the no-wrap name must stay inside a single span */}
            <span>
              <NoBreak text={h.eyebrow} />
            </span>
          </p>
          <h1 className="mb-8 text-[clamp(2.75rem,7vw,5.25rem)] xl:text-[clamp(3.5rem,5.3vw,5.25rem)]">
            <span data-hero-item className="block">
              {h.titleA}
            </span>
            <span data-hero-item className="block font-serif italic text-glow">
              {h.titleB}
            </span>
          </h1>
          <div data-hero-item className="mb-8 h-px w-24 bg-harvest-gold" />
          <p data-hero-item className="mb-10 max-w-xl text-lg leading-relaxed text-mint-line sm:text-[1.2rem]">
            <NoBreak text={h.lead} />
          </p>
          <div data-hero-item className="flex flex-wrap gap-3">
            <a href={h.ctaPrimaryHref} className="btn btn-gold">
              {h.ctaPrimary} <ArrowRight className="btn-arrow size-4" aria-hidden="true" />
            </a>
            <a href="#programmes" className="btn btn-outline-light">
              {h.ctaSecondary}
            </a>
          </div>
        </div>

        {/* Layered visual: arched photo + floating Quick Donate card.
            Mobile: stacked · Tablet/laptop: photo + card side by side · Desktop (xl): layered overlap. */}
        <div className="relative md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,430px)] md:items-center md:gap-6 xl:col-span-7 xl:block xl:min-h-[640px]">
          <GoldArc className="-start-10 -top-10 hidden size-[420px] xl:block" />
          <div className="relative mx-auto w-[78%] max-w-[420px] sm:w-[62%] md:mx-0 md:w-full md:max-w-[380px] md:justify-self-center xl:absolute xl:start-0 xl:top-2 xl:w-[44%] xl:max-w-none">
            <div className="relative aspect-[3/4] overflow-hidden rounded-t-full rounded-b-[2.5rem] shadow-[0_40px_80px_-30px_rgb(0_0_0/0.6)] ring-1 ring-glow/30">
              <div data-hero-image className="absolute inset-[-8%]">
                <div data-parallax="0.06" className="absolute inset-0">
                  <Image
                    src={mainImage.src}
                    alt={h.imageAlt}
                    fill
                    priority
                    sizes={coverSizes("(min-width: 1280px) 26vw, (min-width: 768px) 45vw, 75vw", mainImage, 0.75)}
                    quality={85}
                    className="object-cover object-[44%_30%]"
                  />
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-deep-green-3/50 via-transparent to-transparent" />
            </div>
            {/* Phase 13B (MEKI, 21 Nov 2026): the "Luxor · WASH program" badge was out of place beside the general "Give today"
                preview — it suggested programme-specific giving, which is not authorized. The badge is no longer rendered here;
                the WASH programme, its page and the CMS value (hero.photoCaption) are untouched. */}
            {/* secondary layered photo */}
            <div className="absolute -bottom-8 -start-8 hidden size-32 overflow-hidden rounded-full border-4 border-deep-green shadow-xl sm:block md:-start-3 xl:-start-14 xl:size-36">
              <Image src={secondaryImage.src} alt={h.secondaryImageAlt} fill sizes="144px" className="object-cover" />
            </div>
          </div>

          <div data-hero-card className="relative z-10 mx-auto -mt-16 w-full max-w-[460px] md:mt-0 md:max-w-none xl:absolute xl:end-0 xl:top-[12%] xl:w-[420px]">
            <QuickDonate t={t} locale={locale} />
          </div>
        </div>
      </div>

      <a
        href="#who-we-are"
        className="absolute bottom-28 start-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.3em] text-mint-line/80 transition hover:text-glow xl:flex rtl:translate-x-1/2"
      >
        {h.scroll}
        <ArrowDown className="size-4 animate-bounce" aria-hidden="true" />
      </a>
    </section>
  );
}
