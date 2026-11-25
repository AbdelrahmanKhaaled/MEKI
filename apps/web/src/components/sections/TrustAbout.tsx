import Image from "next/image";
import { ShieldCheck, Milestone, ChartNoAxesColumn, Sprout, Eye, Compass, Quote } from "lucide-react";
import type { Dict } from "@/content/en";
import { media } from "@/content/media";
import { Curve, GoldArc, Pattern, PointsOfLight } from "../Decor";
import { NoBreak } from "../NoBreak";

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
                    {item.text && <span className="block text-sm text-body-grey">{item.text}</span>}
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
        <div className="lg:col-span-5">
          <p data-reveal className="eyebrow mb-6">
            {a.eyebrow}
          </p>
          <h2 id="about-title" data-reveal className="headline mb-8 text-ink">
            {a.title}
          </h2>
          {/* MEKI client edits (22 Nov 2026, item 6): two paragraphs (blank-line separated in the CMS body); the italic legacy line is no
              longer shown here because it already appears in the hero. */}
          {a.body.split(/\n\s*\n/).map((para, i) => (
            <p key={i} data-reveal className="mb-6 max-w-xl text-lg text-body-grey last:mb-0">
              <NoBreak text={para.trim()} />
            </p>
          ))}
        </div>

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
    </section>
  );
}

/**
 * Vision & Mission — layered composition: arched photo with a rotating gold ring on one side,
 * a dark "Vision" statement card overlapping a light "Mission" card on the other, joined by a
 * gold thread. Content is verified brand copy (Brand Guidelines p.4).
 */
export function VisionMission({ t }: { t: Dict }) {
  const a = t.about;
  return (
    <section aria-labelledby="vm-title" className="relative isolate overflow-hidden bg-limestone pb-28 pt-8 lg:pb-40 lg:pt-16">
      {/* soft branded background */}
      <div aria-hidden="true" className="absolute -end-40 top-10 -z-10 size-[38rem] rounded-full bg-[radial-gradient(circle,rgb(214_161_70/0.18),transparent_65%)]" />
      <div aria-hidden="true" className="absolute -start-40 bottom-0 -z-10 size-[30rem] rounded-full bg-[radial-gradient(circle,rgb(0_128_102/0.10),transparent_65%)]" />

      <div className="container-x grid items-center gap-16 lg:grid-cols-12 lg:gap-12">
        {/* Visual column */}
        <div className="relative mx-auto w-full max-w-md lg:col-span-5 lg:max-w-none">
          <div aria-hidden="true" className="absolute -inset-5 translate-x-3 translate-y-3 rounded-t-full rounded-b-[3rem] border border-dashed border-harvest-gold/60 rtl:-translate-x-3" />
          <div data-clip className="relative aspect-[4/5] overflow-hidden rounded-t-full rounded-b-[2.5rem] shadow-[var(--shadow-lift)]">
            <div data-parallax="0.1" className="absolute inset-[-12%]">
              <Image src={media["water-pipeline"].src} alt="" fill sizes="(min-width:1024px) 38vw, 90vw" className="object-cover" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-deep-green-3/80 via-deep-green-3/10 to-transparent" />
            <p className="absolute inset-x-0 bottom-0 p-8 text-center font-serif text-2xl font-light italic text-white">{a.vmTagline}</p>
          </div>
          <span aria-hidden="true" className="float-y absolute -end-4 top-[18%] grid size-20 place-items-center rounded-full bg-paper shadow-[var(--shadow-lift)]">
            <span className="spin-slow absolute -inset-2.5 rounded-full border border-dashed border-harvest-gold/70" />
            <Image width={40} height={40} src="/brand/MEKI_Icon_Approved_Green_128.png" alt="" className="size-10" />
          </span>
        </div>

        {/* Statement column */}
        <div className="lg:col-span-7">
          <p data-reveal className="eyebrow mb-6">
            {a.vmEyebrow}
          </p>
          <h2 id="vm-title" data-reveal className="mb-14 max-w-xl text-[clamp(2rem,3.6vw,3rem)]">
            {a.vmTitle}
          </h2>

          <div className="relative">
            {/* gold thread linking the two cards */}
            <span aria-hidden="true" className="absolute bottom-16 start-10 top-16 hidden w-px bg-gradient-to-b from-glow via-harvest-gold to-transparent sm:block" />

            <article
              data-reveal
              className="vm-card group relative overflow-hidden rounded-[2rem] bg-deep-green p-8 text-white shadow-[var(--shadow-lift)] sm:p-10 lg:me-16"
            >
              <Pattern opacity={0.06} />
              <PointsOfLight count={10} />
              <Quote aria-hidden="true" className="absolute -end-4 -top-4 size-40 rotate-180 text-white/[0.05]" strokeWidth={1} />
              <div className="relative flex items-center gap-4">
                <span className="grid size-14 shrink-0 place-items-center rounded-full bg-glow/15 text-glow ring-1 ring-glow/40 transition-transform duration-700 group-hover:rotate-[20deg] group-hover:scale-110">
                  <Eye className="size-6" strokeWidth={1.6} aria-hidden="true" />
                </span>
                <h3 className="font-sans text-xs font-bold uppercase tracking-[0.24em] text-glow">{a.visionLabel}</h3>
              </div>
              <p className="relative mt-6 font-serif text-[clamp(1.6rem,2.6vw,2.3rem)] font-light leading-tight">{a.vision}</p>
            </article>

            <article
              data-reveal
              className="vm-card group relative -mt-6 overflow-hidden rounded-[2rem] border border-stone-line bg-paper p-8 shadow-[var(--shadow-card)] sm:p-10 lg:ms-20"
            >
              <span aria-hidden="true" className="absolute inset-x-10 top-0 h-[3px] rounded-b-full bg-gradient-to-r from-harvest-gold via-glow to-harvest-gold" />
              <div className="flex items-center gap-4">
                <span className="grid size-14 shrink-0 place-items-center rounded-full bg-meki-green text-white transition-transform duration-700 group-hover:-rotate-[25deg] group-hover:scale-110">
                  <Compass className="size-6" strokeWidth={1.6} aria-hidden="true" />
                </span>
                <h3 className="font-sans text-xs font-bold uppercase tracking-[0.24em] text-gold-text">{a.missionLabel}</h3>
              </div>
              <p className="mt-6 text-lg leading-relaxed text-body-grey lg:text-xl">{a.mission}</p>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
