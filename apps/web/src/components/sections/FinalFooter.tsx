import Image from "next/image";
import { ArrowRight, ArrowUp, Heart } from "lucide-react";
import type { Dict } from "@/content/en";
import { media } from "@/content/media";
import { Curve, Pattern, PointsOfLight } from "../Decor";
import { Logo } from "../Logo";
import { GiveButton } from "../DonateProvider";

export function FinalCta({ t }: { t: Dict }) {
  const f = t.final;
  return (
    <section aria-labelledby="final-title" className="relative isolate overflow-hidden bg-deep-green text-white">
      <Curve fill="var(--color-paper)" flip className="absolute inset-x-0 top-0 z-10" />
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div data-parallax="0.07" className="absolute inset-[-15%]">
          <Image src={media["field-sky"].src} alt="" fill sizes="100vw" className="object-cover" />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(100deg,rgb(7_42_34/0.95)_0%,rgb(11_59_48/0.82)_45%,rgb(11_59_48/0.35)_100%)] rtl:bg-[linear-gradient(-100deg,rgb(7_42_34/0.95)_0%,rgb(11_59_48/0.82)_45%,rgb(11_59_48/0.35)_100%)]" />
      </div>
      <PointsOfLight count={14} className="-z-10" />
      <div className="container-x relative py-36 lg:py-52">
        <div className="max-w-3xl">
          <h2 id="final-title" data-reveal className="display mb-8">
            {f.titleA} <span className="block italic text-glow">{f.titleB}</span>
          </h2>
          <p data-reveal className="mb-12 max-w-xl text-lg text-mint-line sm:text-xl">
            {f.text}
          </p>
          <div data-reveal className="flex flex-wrap gap-4">
            <GiveButton className="btn btn-gold min-h-14 px-8 text-base">
              <Heart className="size-5" aria-hidden="true" /> {f.ctaPrimary}
            </GiveButton>
            <a href="#programmes" className="btn btn-outline-light min-h-14 px-8 text-base">
              {f.ctaSecondary} <ArrowRight className="btn-arrow size-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Footer({ t }: { t: Dict }) {
  const f = t.footer;
  const year = 2026;
  return (
    <footer className="relative isolate overflow-hidden bg-deep-green-3 text-mint-line">
      <Pattern opacity={0.04} className="-z-10" />
      <div className="container-x pb-10 pt-24">
        <div className="grid gap-14 border-b border-white/10 pb-16 md:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Logo variant="white" className="mb-6 !w-[170px]" />
            <p className="mb-2 font-serif text-2xl font-light text-white">{f.tagline}</p>
            <p className="text-sm">{f.legacy}</p>
          </div>
          <nav aria-label={f.explore} className="lg:col-span-2">
            <h2 className="mb-5 font-sans text-xs font-bold uppercase tracking-[0.22em] text-glow">{f.explore}</h2>
            <ul className="space-y-3 text-sm">
              {t.nav.links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="transition hover:text-white">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label={f.programmes} className="lg:col-span-3">
            <h2 className="mb-5 font-sans text-xs font-bold uppercase tracking-[0.22em] text-glow">{f.programmes}</h2>
            <ul className="space-y-3 text-sm">
              {t.programmes.items.map((p) => (
                <li key={p.slug}>
                  <a href="#programmes" className="transition hover:text-white">
                    {p.name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="lg:col-span-3">
            <h2 className="mb-5 font-sans text-xs font-bold uppercase tracking-[0.22em] text-glow">{f.giving}</h2>
            <ul className="mb-10 space-y-3 text-sm">
              {f.givingLinks.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="transition hover:text-white">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
            <h2 className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.22em] text-glow">{f.contactTitle}</h2>
            <p className="text-sm">{f.contactPending}</p>
          </div>
        </div>
        <div className="flex flex-col items-start justify-between gap-4 pt-8 text-xs sm:flex-row sm:items-center">
          <p>
            © {year} {f.rights}
          </p>
          <p className="text-mint-line/70">{f.legalPending}</p>
          <a href="#top" className="inline-flex min-h-11 items-center gap-2 font-bold transition hover:text-white">
            {f.backToTop} <ArrowUp className="size-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  );
}
