"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Declarative, selective motion driven by data attributes. No scroll hijacking: everything is either
 * a one-shot reveal or a lightweight scrub tied to native scrolling.
 *
 *  data-reveal                 fade/rise in when entering the viewport (optional value: "left"|"right"|"scale")
 *  data-stagger + data-stagger-item   staggered children entrance
 *  data-parallax="0.15"        vertical parallax (fraction of element height)
 *  data-count="35"             animated number (verified figures only)
 *  data-line                   horizontal line drawn with scroll
 *  data-draw                   SVG path drawn on enter
 *  data-clip                   image curtain reveal
 *  data-hero-item / data-hero-image   hero intro timeline
 *
 * prefers-reduced-motion: all content is shown immediately, no transforms.
 */
export function MotionRoot({ children }: { children: React.ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      (window as unknown as { __mekiMotion?: boolean }).__mekiMotion = true;
      const root = document.documentElement;
      const rtl = root.dir === "rtl";
      const mm = gsap.matchMedia();

      mm.add(
        { motion: "(prefers-reduced-motion: no-preference)", reduce: "(prefers-reduced-motion: reduce)" },
        (ctx) => {
          const { reduce } = ctx.conditions as { motion: boolean; reduce: boolean };
          const q = gsap.utils.selector(scope);

          if (reduce) {
            gsap.set(q("[data-reveal], [data-stagger-item], [data-hero-item]"), { opacity: 1, clearProps: "transform" });
            q("[data-count]").forEach((el) => {
              el.textContent = (el as HTMLElement).dataset.count ?? "";
            });
            return;
          }

          // --- Hero intro timeline ---
          const heroItems = q("[data-hero-item]");
          if (heroItems.length) {
            const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
            tl.fromTo(q("[data-hero-image]"), { scale: 1.18, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.8 }, 0)
              .fromTo(heroItems, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1.2, stagger: 0.09 }, 0.15)
              .fromTo(
                q("[data-hero-card]"),
                { y: 60, opacity: 0, rotate: rtl ? -2 : 2 },
                { y: 0, opacity: 1, rotate: 0, duration: 1.3, clearProps: "transform" },
                0.45,
              );
          }

          // --- Generic reveals ---
          q("[data-reveal]").forEach((el) => {
            const kind = (el as HTMLElement).dataset.reveal;
            const dir = rtl ? -1 : 1;
            const from: gsap.TweenVars =
              kind === "left" ? { x: -60 * dir } : kind === "right" ? { x: 60 * dir } : kind === "scale" ? { scale: 0.92 } : { y: 48 };
            gsap.fromTo(
              el,
              { opacity: 0, ...from },
              {
                opacity: 1, x: 0, y: 0, scale: 1, duration: 1.15, ease: "expo.out",
                scrollTrigger: { trigger: el, start: "top 88%", once: true },
              },
            );
          });

          // --- Staggered groups ---
          q("[data-stagger]").forEach((group) => {
            const items = (group as HTMLElement).querySelectorAll("[data-stagger-item]");
            gsap.fromTo(
              items,
              { opacity: 0, y: 40 },
              {
                opacity: 1, y: 0, duration: 1, ease: "expo.out", stagger: 0.09,
                scrollTrigger: { trigger: group, start: "top 85%", once: true },
              },
            );
          });

          // --- Parallax ---
          q("[data-parallax]").forEach((el) => {
            const amt = parseFloat((el as HTMLElement).dataset.parallax || "0.12");
            gsap.fromTo(
              el,
              { yPercent: -amt * 100 },
              {
                yPercent: amt * 100, ease: "none",
                scrollTrigger: { trigger: (el as HTMLElement).parentElement ?? el, start: "top bottom", end: "bottom top", scrub: 0.6 },
              },
            );
          });

          // --- Image curtain reveals ---
          q("[data-clip]").forEach((el) => {
            gsap.fromTo(
              el,
              { clipPath: "inset(18% 12% 18% 12% round 2rem)" },
              {
                clipPath: "inset(0% 0% 0% 0% round 2rem)", duration: 1.6, ease: "expo.out",
                scrollTrigger: { trigger: el, start: "top 85%", once: true },
              },
            );
          });

          // --- Lines drawn with scroll ---
          q("[data-line]").forEach((el) => {
            gsap.fromTo(
              el,
              { scaleX: 0 },
              {
                scaleX: 1, ease: "none", transformOrigin: rtl ? "right center" : "left center",
                scrollTrigger: { trigger: el, start: "top 80%", end: "top 35%", scrub: 0.8 },
              },
            );
          });

          // --- SVG path drawing ---
          q("[data-draw]").forEach((el) => {
            const path = el as unknown as SVGPathElement;
            const len = path.getTotalLength?.() ?? 800;
            gsap.fromTo(
              path,
              { strokeDasharray: len, strokeDashoffset: len },
              { strokeDashoffset: 0, duration: 2.2, ease: "power2.inOut", scrollTrigger: { trigger: path, start: "top 90%", once: true } },
            );
          });

          // --- Counters (verified values only; value comes from data-count) ---
          q("[data-count]").forEach((el) => {
            const target = parseFloat((el as HTMLElement).dataset.count || "0");
            const obj = { v: 0 };
            gsap.to(obj, {
              v: target, duration: 2.2, ease: "power3.out",
              onUpdate: () => {
                el.textContent = Math.round(obj.v).toString();
              },
              scrollTrigger: { trigger: el, start: "top 85%", once: true },
            });
          });
        },
      );

      // Refresh positions once web fonts/images settle.
      const refresh = () => ScrollTrigger.refresh();
      window.addEventListener("load", refresh);
      document.fonts?.ready.then(refresh).catch(() => {});
      return () => {
        window.removeEventListener("load", refresh);
        mm.revert();
      };
    },
    { scope },
  );

  return <div ref={scope}>{children}</div>;
}
