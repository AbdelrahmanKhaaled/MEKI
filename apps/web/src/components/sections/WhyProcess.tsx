import Image from "next/image";
import { Ban, Check, ShieldCheck, MousePointerClick, CreditCard, BadgeCheck, ChartNoAxesCombined } from "lucide-react";
import type { Dict } from "@/content/en";
import { media } from "@/content/media";
import { Curve, Pattern, PointsOfLight } from "../Decor";

export function WhySupport({ t }: { t: Dict }) {
  const w = t.why;
  return (
    <section aria-labelledby="why-title" className="section-y relative overflow-hidden bg-limestone">
      <div className="container-x grid items-center gap-16 lg:grid-cols-12 lg:gap-12">
        {/* Portrait with parallax depth */}
        <div className="relative order-2 lg:order-1 lg:col-span-5">
          <div data-clip className="relative aspect-[4/5] overflow-hidden rounded-t-full rounded-b-[2.5rem] shadow-[var(--shadow-lift)]">
            <div data-parallax="0.1" className="absolute inset-[-12%]">
              <Image src={media["greenhouse"].src} alt="" fill sizes="(min-width:1024px) 40vw, 90vw" className="object-cover" />
            </div>
          </div>
          <div
            data-reveal="scale"
            className="absolute -bottom-10 end-[-4%] w-[62%] rounded-[1.5rem] bg-deep-green p-6 text-white shadow-[var(--shadow-lift)]"
          >
            <ShieldCheck className="mb-3 size-7 text-glow" strokeWidth={1.6} aria-hidden="true" />
            <p className="font-serif text-xl leading-snug">{t.how.items[3].text}</p>
          </div>
        </div>

        <div className="order-1 lg:order-2 lg:col-span-6 lg:col-start-7">
          <p data-reveal className="eyebrow mb-6">
            {w.eyebrow}
          </p>
          <h2 id="why-title" data-reveal className="mb-6 font-serif text-[clamp(2.6rem,6vw,5rem)] font-light italic leading-[1.02] text-meki-green">
            {w.quote}
          </h2>
          <p data-reveal className="mb-12 max-w-lg text-lg text-body-grey">
            {w.lead}
          </p>
          <ul data-stagger className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {w.items.map((item, i) => (
              <li key={item.title} data-stagger-item className="group">
                <div className="mb-4 flex items-center gap-3">
                  <span className="font-serif text-sm text-gold-text">0{i + 1}</span>
                  <span className="hairline h-px flex-1 origin-left transition-transform duration-700 group-hover:scale-x-110" />
                </div>
                <h3 className="mb-2 text-2xl">{item.title}</h3>
                <p className="text-body-grey">{item.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

const stepIcons = [MousePointerClick, CreditCard, BadgeCheck, ChartNoAxesCombined];

export function DonationProcess({ t }: { t: Dict }) {
  const p = t.process;
  return (
    <section id="giving" aria-labelledby="giving-title" className="relative isolate overflow-hidden bg-deep-green-3 text-white">
      <Curve fill="var(--color-limestone)" flip className="absolute inset-x-0 top-0 z-10" />
      <Pattern opacity={0.05} className="-z-10" />
      <PointsOfLight count={16} className="-z-10" />
      <div className="container-x section-y relative">
        <div className="mb-20 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p data-reveal className="eyebrow eyebrow-dark mb-6">
              {p.eyebrow}
            </p>
            <h2 id="giving-title" data-reveal className="headline">
              {p.title}
            </h2>
          </div>
          <p data-reveal className="self-end text-lg text-mint-line lg:col-span-4 lg:col-start-9">
            {p.intro}
          </p>
        </div>

        <div className="grid gap-14 lg:grid-cols-12">
          <ol data-stagger className="relative grid gap-4 lg:col-span-7">
            {p.steps.map((s, i) => {
              const I = stepIcons[i];
              return (
                <li
                  key={s.title}
                  data-stagger-item
                  className="group relative flex gap-6 rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6 transition-all duration-500 hover:border-glow/40 hover:bg-white/[0.07] sm:p-8"
                >
                  <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-meki-green/20 text-glow transition-transform duration-500 group-hover:scale-110 group-hover:bg-meki-green">
                    <I className="size-6" strokeWidth={1.6} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="mb-1 text-xs font-bold uppercase tracking-[0.22em] text-glow">0{i + 1}</p>
                    <h3 className="mb-2 text-2xl">{s.title}</h3>
                    <p className="text-mint-line">{s.text}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          <aside data-reveal="right" className="lg:col-span-5">
            <div className="relative rounded-[2rem] p-[1px] [background:linear-gradient(140deg,var(--color-harvest-gold),transparent_45%,var(--color-harvest-gold))]">
              <div className="rounded-[calc(2rem-1px)] bg-deep-green p-8 sm:p-10">
                <h3 className="mb-6 text-3xl text-glow">{p.neverTitle}</h3>
                <ul className="mb-8 space-y-4">
                  {p.never.map((n) => (
                    <li key={n} className="flex items-start gap-3">
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-white/10 text-glow">
                        <Ban className="size-3.5" aria-hidden="true" />
                      </span>
                      <span className="text-white/90">{n}</span>
                    </li>
                  ))}
                </ul>
                <p className="flex items-start gap-3 border-t border-white/10 pt-6 text-sm text-mint-line">
                  <Check className="mt-0.5 size-4 shrink-0 text-glow" aria-hidden="true" />
                  {p.status}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
