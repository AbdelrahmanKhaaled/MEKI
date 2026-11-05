"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Handshake, UsersRound, Sprout, ShieldCheck, type LucideIcon } from "lucide-react";
import type { Dict } from "@/content/en";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const icons: LucideIcon[] = [Handshake, UsersRound, Sprout, ShieldCheck];

// Wave across a 1200×220 canvas; nodes sit on its crests and troughs.
const WAVE =
  "M0 110 C60 110 90 46 150 46 C255 46 345 174 450 174 C555 174 645 46 750 46 C855 46 945 174 1050 174 C1110 174 1140 110 1200 110";
const NODES = [
  { x: 12.5, y: 46 / 2.2 },
  { x: 37.5, y: 174 / 2.2 },
  { x: 62.5, y: 46 / 2.2 },
  { x: 87.5, y: 174 / 2.2 },
];
const THRESHOLDS = [0.12, 0.37, 0.62, 0.87];

/**
 * Connect · Unite · Empower · Account as a flowing journey.
 * Scroll progress draws a darker wave over a faint dashed guide and activates each step in turn
 * (scrubbed to native scroll — no pinning or hijacking).
 */
export function HowWeWork({ t }: { t: Dict }) {
  const h = t.how;
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = root.current!;
      const steps = gsap.utils.toArray<HTMLElement>("[data-step]", el);
      const progressPaths = gsap.utils.toArray<SVGPathElement>("[data-wave-progress]", el);
      const mobileFill = el.querySelector<HTMLElement>("[data-mobile-fill]");
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: reduce)", () => {
        steps.forEach((s) => s.classList.add("is-active"));
        progressPaths.forEach((p) => gsap.set(p, { strokeDasharray: "none", strokeDashoffset: 0 }));
        if (mobileFill) gsap.set(mobileFill, { scaleY: 1 });
      });

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const lens = progressPaths.map((p) => {
          const len = p.getTotalLength();
          gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
          return len;
        });
        const st = ScrollTrigger.create({
          trigger: el.querySelector("[data-journey]"),
          start: "top 75%",
          end: "bottom 45%",
          scrub: 0.6,
          onUpdate: (self) => {
            const p = self.progress;
            progressPaths.forEach((path, k) => {
              path.style.strokeDashoffset = String(lens[k] * (1 - p));
            });
            if (mobileFill) mobileFill.style.transform = `scaleY(${p})`;
            steps.forEach((s, i) => s.classList.toggle("is-active", p >= THRESHOLDS[i % 4] - 0.02));
          },
        });
        return () => st.kill();
      });

      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} aria-labelledby="how-title" className="section-y relative overflow-hidden bg-paper">
      <div aria-hidden="true" className="absolute inset-x-0 top-1/2 -z-0 h-[28rem] -translate-y-1/2 bg-[radial-gradient(60%_50%_at_50%_50%,rgb(207_224_214/0.45),transparent)]" />
      <div className="container-x relative">
        <div className="mx-auto mb-16 max-w-3xl text-center lg:mb-20">
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

        <div data-journey className="relative">
          {/* Desktop wave */}
          <div className="relative hidden aspect-[1200/220] w-full lg:block">
            <svg viewBox="0 0 1200 220" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible rtl:-scale-x-100" aria-hidden="true">
              <defs>
                <linearGradient id="wave-grad" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0" stopColor="#D6A146" />
                  <stop offset="0.5" stopColor="#008066" />
                  <stop offset="1" stopColor="#0B3B30" />
                </linearGradient>
              </defs>
              <path d={WAVE} fill="none" stroke="#E2DACB" strokeWidth="2" strokeDasharray="2 10" strokeLinecap="round" />
              <path data-wave-progress d={WAVE} fill="none" stroke="url(#wave-grad)" strokeWidth="3.5" strokeLinecap="round" />
            </svg>
            {NODES.map((n, i) => {
              const I = icons[i];
              return (
                <div
                  key={i}
                  data-step
                  className="how-node absolute -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2"
                  style={{ insetInlineStart: `${n.x}%`, top: `${n.y}%` }}
                >
                  <span className="how-ring absolute inset-0 rounded-full" aria-hidden="true" />
                  <span className="how-dot relative grid size-20 place-items-center rounded-full border border-stone-line bg-paper text-meki-green shadow-[var(--shadow-card)]">
                    <I className="size-8" strokeWidth={1.5} aria-hidden="true" />
                    <span className="how-num absolute -end-1 -top-1 grid size-7 place-items-center rounded-full bg-harvest-gold font-serif text-sm text-deep-green-3">
                      {i + 1}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          {/* Step copy — desktop row / mobile vertical journey */}
          <div className="relative">
            <span aria-hidden="true" className="absolute bottom-6 start-[27px] top-6 w-px bg-stone-line lg:hidden">
              <span data-mobile-fill className="block h-full w-full origin-top scale-y-0 bg-gradient-to-b from-harvest-gold via-meki-green to-deep-green" />
            </span>
            <ol className="grid gap-12 lg:mt-12 lg:grid-cols-4 lg:gap-8">
              {h.items.map((item, i) => {
                const I = icons[i];
                return (
                  <li key={item.verb} data-step className="how-step relative ps-20 lg:ps-0 lg:text-center">
                    <span className="how-dot absolute start-0 top-0 grid size-14 place-items-center rounded-full border border-stone-line bg-paper text-meki-green shadow-[var(--shadow-card)] lg:hidden">
                      <I className="size-6" strokeWidth={1.5} aria-hidden="true" />
                    </span>
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-gold-text">0{i + 1}</p>
                    <h3 className="how-verb mb-3 text-[2rem] leading-none">{item.verb}</h3>
                    <p className="mx-auto max-w-[17rem] text-body-grey lg:max-w-[16rem]">{item.text}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
