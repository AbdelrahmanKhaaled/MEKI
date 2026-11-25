import type { Metadata } from "next";
import Image from "next/image";
import { media } from "@/content/media";
import { PointsOfLight } from "@/components/Decor";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getPageContent } from "@/lib/content";
import { getPages, pageHref } from "@/content/pages";
import { pageMetadata } from "@/lib/page-meta";
import { PageShell, PageHero } from "@/components/pages/PageShell";
import { PageCta } from "@/components/pages/PageCta";
import { VisionMission } from "@/components/sections/TrustAbout";
import { HowWeWork } from "@/components/sections/HowWeWork";
import { Impact } from "@/components/sections/Impact";
import { Enabling } from "@/components/sections/Enabling";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? pageMetadata(locale, "about") : {};
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { t } = await getPageContent(locale);
  const p = getPages(locale).about;
  return (
    <PageShell locale={locale} current="about">
      <PageHero eyebrow={t.about.eyebrow} title={p.title} lead={t.about.body} image="hero-family" images={["weaver"]} layout="arch" />
      {/* Vision, mission and tagline: approved wording from the shared dictionary / published CMS. */}
      <VisionMission t={t} />
      {/* MEKI Legacy (Programs Word document, 25 Nov 2026): CMS ABOUT labels legacyTitle / legacyTagline + items legacy-1…3. */}
      <section aria-labelledby="legacy-title" className="section-y bg-paper">
        <div className="container-x grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 id="legacy-title" data-reveal className="headline mb-5">
              {t.about.legacyTitle}
            </h2>
            <p data-reveal className="font-serif text-[clamp(1.25rem,2.2vw,1.7rem)] italic leading-snug text-meki-green">
              {t.about.legacyTagline}
            </p>
          </div>
          <div data-reveal className="space-y-5 text-lg leading-relaxed text-body-grey lg:col-span-6 lg:col-start-7">
            {t.about.legacyParas.map((para) => (
              <p key={para.slice(0, 40)}>{para}</p>
            ))}
          </div>
        </div>
      </section>
      <HowWeWork t={t} />
      {/* Full-bleed photo band (hand-weaving workshop, economic empowerment program) carrying the approved legacy note. */}
      <section aria-label={p.title} className="relative isolate flex min-h-[46svh] items-end overflow-hidden bg-deep-green text-white">
        <div aria-hidden="true" className="absolute inset-0 -z-20">
          <div data-parallax="0.14" className="absolute -inset-[14%]">
            <Image src={media["weavers-loom"].src} alt="" fill sizes="100vw" className="object-cover" />
          </div>
        </div>
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-deep-green-3 via-deep-green/70 to-deep-green/10" />
        <PointsOfLight count={10} className="-z-10" />
        <div className="container-x pb-14 pt-32">
          <span data-line aria-hidden="true" className="mb-6 block h-px w-24 origin-left bg-harvest-gold rtl:origin-right" />
          <p data-reveal className="max-w-2xl font-serif text-[clamp(1.35rem,2.6vw,2rem)] leading-snug text-white">
            {p.legacyNote}
          </p>
        </div>
      </section>
      <Impact t={t} />
      {/* Enabling functions: names and descriptions come from the approved portfolio content. */}
      <Enabling t={t} />
      <PageCta title={p.ctaLabel} links={[{ href: pageHref(locale, "programs"), label: p.cta, primary: true }]} />
    </PageShell>
  );
}
