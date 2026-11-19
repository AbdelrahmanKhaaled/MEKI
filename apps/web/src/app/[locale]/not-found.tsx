"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Pattern, PointsOfLight } from "@/components/Decor";
import { ar } from "@/content/ar";
import { en } from "@/content/en";

/** Localized 404 (Phase 7: Arabic under /ar). Not-found pages receive no route params, so the locale comes from the path. */
export default function NotFound() {
  const isAr = (usePathname() ?? "").startsWith("/ar");
  const t = (isAr ? ar : en).notFound;
  return (
    <main className="relative isolate grid min-h-screen place-items-center overflow-hidden bg-deep-green px-6 text-center text-white" dir={isAr ? "rtl" : "ltr"} lang={isAr ? "ar" : "en"}>
      {/* ambient light: slow rings and points of light (decorative; reduced-motion safe via the global rule) */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_50%_45%,rgb(20_89_74/0.9)_0%,rgb(11_59_48/0.95)_60%,#072a22_100%)]" />
      <Pattern opacity={0.05} className="-z-10" />
      <PointsOfLight count={20} className="-z-10" />
      <div aria-hidden="true" className="spin-slow pointer-events-none absolute start-1/2 top-1/2 -z-10 size-[min(90vw,620px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-glow/15 rtl:translate-x-1/2" />
      <div aria-hidden="true" className="spin-slower-rev pointer-events-none absolute start-1/2 top-1/2 -z-10 size-[min(70vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-glow/10 rtl:translate-x-1/2" />
      <div>
        <Logo variant="white" className="mx-auto mb-10" />
        <p className="mb-4 font-serif text-7xl font-light text-glow [text-shadow:0_0_40px_rgb(230_195_111/0.45)]">404</p>
        <h1 className="mb-4 text-4xl">{t.title}</h1>
        <p className="mb-10 text-mint-line">{t.text}</p>
        <Link href={isAr ? "/ar" : "/en"} className="btn btn-gold">
          {t.back}
        </Link>
      </div>
    </main>
  );
}
