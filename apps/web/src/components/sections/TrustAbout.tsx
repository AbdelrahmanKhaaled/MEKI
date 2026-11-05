import Image from "next/image";
import { ShieldCheck, Milestone, ChartNoAxesColumn, Sprout, Eye, Compass } from "lucide-react";
import type { Dict } from "@/content/en";
import { media } from "@/content/media";
import { Curve, GoldArc } from "../Decor";

const trustIcons = [ShieldCheck, Milestone, ChartNoAxesColumn, Sprout];

export function TrustStrip({ t }: { t: Dict }) {
  return (
    <div className="relative z-20">
      <Curve fill="var(--color-limestone)" className="-mt-[49px] sm:-mt-[79px] lg:-mt-[109px]" />
      <div className="bg-limestone">
        <div className="container-x">
          <ul
            data-stagger
            className="-mt-16 grid gap-px overflow-hidden rounded-[1.75rem] bg-stone-line shadow-[var(--shadow-card)] sm:-mt-24 sm:grid-cols-2 lg:-mt-32 lg:grid-cols-4"
          >
            {t.trust.map((item, i) => {
              const I = trustIcons[i];
              return (
                <li key={item.title} data-stagger-item className="group flex gap-4 bg-paper p-6 transition-colors duration-500 hover:bg-white lg:p-7">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-meki-green/10 text-meki-green transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110">
                    <I className="size-5" strokeWidth={1.6} aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-bold leading-snug text-ink">{item.title}</span>
                    <span className="block text-sm text-body-grey">{item.text}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function About({ t }: { t: Dict }) {
  const a = t.about;
  return (
    <section id="who-we-are" aria-labelledby="about-title" className="section-y relative overflow-hidden bg-limestone">
      <div className="container-x grid items-center gap-16 lg:grid-cols-12 lg:gap-10">
        {/* Editorial copy */}
        <div className="lg:col-span-5">
          <p data-reveal className="eyebrow mb-6">
            {a.eyebrow}
          </p>
          <h2 id="about-title" data-reveal className="headline mb-8 text-ink">
            {a.title}
          </h2>
          <p data-reveal className="mb-8 max-w-xl text-lg text-body-grey">
            {a.body}
          </p>
          <p data-reveal className="font-serif text-xl italic text-gold-text">
            {a.legacy}
          </p>
        </div>

        {/* Layered photography */}
        <div className="relative lg:col-span-7">
          <div className="relative ms-auto aspect-[4/3] w-[88%] overflow-hidden rounded-[2.5rem] rounded-ss-[9rem] shadow-[var(--shadow-lift)]" data-clip>
            <div data-parallax="0.08" className="absolute inset-[-10%]">
              <Image src={media.weaver.src} alt="" fill sizes="(min-width:1024px) 50vw, 90vw" className="object-cover" />
            </div>
            <span className="absolute bottom-4 end-4 rounded-full bg-paper/90 px-3 py-1 text-xs font-bold text-body-grey">{a.captionA}</span>
          </div>
          <div
            data-reveal="scale"
            className="absolute -bottom-12 start-0 aspect-[3/4] w-[38%] overflow-hidden rounded-[2rem] rounded-ee-[5rem] border-[6px] border-limestone shadow-[var(--shadow-lift)]"
          >
            <Image src={media["elder-field"].src} alt="" fill sizes="(min-width:1024px) 22vw, 40vw" className="object-cover" />
          </div>
          <GoldArc className="-end-16 -top-16 size-64 opacity-80" />
        </div>
      </div>

      {/* Vision & Mission — asymmetric two-column statement */}
      <div className="container-x mt-28 lg:mt-40">
        <div className="grid gap-12 border-t border-stone-line pt-14 md:grid-cols-2 lg:gap-24">
          {[
            { I: Eye, label: a.visionLabel, text: a.vision, big: true },
            { I: Compass, label: a.missionLabel, text: a.mission, big: false },
          ].map(({ I, label, text, big }) => (
            <div key={label} data-reveal className={big ? "" : "md:pt-16"}>
              <div className="mb-5 flex items-center gap-3">
                <span className="grid size-12 place-items-center rounded-full border border-harvest-gold/60 text-gold-text">
                  <I className="size-5" strokeWidth={1.6} aria-hidden="true" />
                </span>
                <h3 className="font-sans text-xs font-bold uppercase tracking-[0.22em] text-gold-text">{label}</h3>
              </div>
              <p className={`font-serif font-light text-ink ${big ? "text-3xl leading-tight lg:text-[2.6rem]" : "text-xl leading-relaxed lg:text-2xl"}`}>{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HowWeWork({ t }: { t: Dict }) {
  const h = t.how;
  return (
    <section aria-labelledby="how-title" className="section-y relative bg-paper">
      <div className="container-x">
        <div className="mx-auto mb-20 max-w-3xl text-center lg:mb-28">
          <p data-reveal className="eyebrow mb-6 justify-center">
            {h.eyebrow}
          </p>
          <h2 id="how-title" data-reveal className="headline mb-6">
            {h.title}
          </h2>
          <p data-reveal className="text-lg text-body-grey">
            {h.intro}
          </p>
        </div>

        <div className="relative">
          {/* Scroll-drawn connecting line */}
          <div aria-hidden="true" className="absolute inset-x-[12.5%] top-8 hidden h-px bg-stone-line lg:block">
            <div data-line className="h-full w-full bg-harvest-gold" />
          </div>
          <ol data-stagger className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {h.items.map((item, i) => (
              <li key={item.verb} data-stagger-item className="group relative text-center">
                <span className="relative z-10 mx-auto mb-8 grid size-16 place-items-center rounded-full border border-harvest-gold bg-paper font-serif text-2xl text-gold-text transition-all duration-500 group-hover:bg-deep-green group-hover:text-glow">
                  {i + 1}
                </span>
                <h3 className="mb-3 text-3xl text-meki-green">{item.verb}</h3>
                <p className="mx-auto max-w-[17rem] text-body-grey">{item.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
