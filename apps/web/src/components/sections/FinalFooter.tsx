import Image from "next/image";
/* eslint-disable @next/next/no-img-element */
import { getPages, pageHref, NAV_ORDER, resolveMenu } from "@/content/pages";
import { ArrowRight, ArrowUp, Heart, ShieldCheck } from "lucide-react";
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
      <div className="container-x relative grid items-center gap-20 py-36 lg:grid-cols-12 lg:gap-10 lg:py-44">
        <div className="lg:col-span-6">
          <h2 id="final-title" data-reveal className="mb-8 text-[clamp(2.75rem,5.6vw,5.25rem)]">
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

        <FinalVisual t={t} />
      </div>
    </section>
  );
}

/**
 * Ambient composition beside the final CTA: orbiting gold rings, a photo disc, and floating chips
 * carrying verified brand statements only. Infinite motion is CSS-only, slow, and disabled under
 * prefers-reduced-motion.
 */
function FinalVisual({ t }: { t: Dict }) {
  const f = t.final;
  const years = t.impact.stats[0];
  return (
    <div data-reveal="scale" aria-hidden="true" className="relative mx-auto aspect-square w-full max-w-[30rem] lg:col-span-6 lg:me-0">
      {/* orbit rings */}
      <div className="spin-slow absolute inset-0 rounded-full border border-dashed border-glow/40" />
      <div className="spin-slower-rev absolute inset-[9%] rounded-full border border-white/15">
        <span className="absolute -top-1.5 start-1/2 size-3 rounded-full bg-glow shadow-[0_0_18px_4px_rgb(230_195_111/0.7)]" />
        <span className="absolute -bottom-1 start-[20%] size-2 rounded-full bg-white/80" />
      </div>
      <div className="pulse-soft absolute inset-[18%] rounded-full bg-[radial-gradient(circle,rgb(230_195_111/0.25),transparent_70%)]" />

      {/* main photo disc */}
      <div className="absolute inset-[20%] overflow-hidden rounded-full border-4 border-white/10 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.7)]">
        <Image src={media["greenhouse-harvest"].src} alt="" fill sizes="(min-width:1024px) 300px, 60vw" className="kenburns object-cover" />
      </div>

      {/* secondary disc */}
      <div className="float-y absolute bottom-[6%] start-[2%] size-[26%] overflow-hidden rounded-full border-4 border-deep-green shadow-xl [animation-delay:-2s]">
        <Image src={media.weaver.src} alt="" fill sizes="130px" className="object-cover" />
      </div>

      {/* floating chips */}
      <div className="float-y absolute end-[-2%] top-[8%] rounded-2xl bg-paper/95 px-4 py-3 text-ink shadow-[var(--shadow-lift)] backdrop-blur [animation-delay:-1s]">
        <p className="font-serif text-3xl leading-none text-meki-green">
          <bdi dir="ltr">{years.value}</bdi>
        </p>
        <p className="mt-1 max-w-[9rem] text-[0.7rem] font-bold uppercase leading-snug tracking-[0.12em] text-body-grey">{years.label}</p>
        <p className="mt-1 text-[0.65rem] text-gold-text">{t.impact.attribution}</p>
      </div>
      <div className="float-y absolute start-[-4%] top-[30%] flex items-center gap-2 rounded-full bg-deep-green-3/85 py-2 pe-4 ps-2 text-sm font-bold text-white shadow-xl ring-1 ring-glow/30 backdrop-blur [animation-delay:-3.5s]">
        <span className="grid size-8 place-items-center rounded-full bg-glow text-deep-green-3">
          <ShieldCheck className="size-4" strokeWidth={1.8} />
        </span>
        {f.chipAccount}
      </div>
      <div className="float-y absolute bottom-[14%] end-[0%] flex items-center gap-2 rounded-full bg-paper/95 py-2 pe-4 ps-2 text-sm font-bold text-ink shadow-xl [animation-delay:-5s]">
        <span className="grid size-8 place-items-center rounded-full bg-meki-green">
          <img src="/brand/MEKI_Icon_White.svg" alt="" className="size-5" />
        </span>
        {f.chipProgrammes}
      </div>
    </div>
  );
}

export function Footer({ t }: { t: Dict }) {
  const f = t.footer;
  const loc = t.locale === "ar" ? "ar" : "en";
  const pages = getPages(loc);
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
              {(resolveMenu(t.nav.links, loc) ?? NAV_ORDER.map((k) => ({ key: k, href: pageHref(loc, k), label: pages.nav[k], external: false }))).map((l) => (
                <li key={l.key}>
                  <a href={l.href} {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="transition hover:text-white">
                    {l.label}
                  </a>
                </li>
              ))}
              <li>
                <a href={t.nav.gala.href} className="transition hover:text-white">
                  {t.nav.gala.label}
                </a>
              </li>
            </ul>
          </nav>
          <nav aria-label={f.programmes} className="lg:col-span-3">
            <h2 className="mb-5 font-sans text-xs font-bold uppercase tracking-[0.22em] text-glow">{f.programmes}</h2>
            <ul className="space-y-3 text-sm">
              {t.programmes.items.map((p) => (
                <li key={p.slug}>
                  <a href={pageHref(loc, "programs")} className="transition hover:text-white">
                    {p.name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="lg:col-span-3">
            <h2 className="mb-5 font-sans text-xs font-bold uppercase tracking-[0.22em] text-glow">{f.giving}</h2>
            <ul className="mb-10 space-y-3 text-sm">
              {(resolveMenu(t.footer.givingLinks, loc) ?? (["give", "faq"] as const).map((k) => ({ key: k, href: pageHref(loc, k), label: pages.nav[k], external: false }))).map((l) => (
                <li key={l.key}>
                  <a href={l.href} {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="transition hover:text-white">
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
