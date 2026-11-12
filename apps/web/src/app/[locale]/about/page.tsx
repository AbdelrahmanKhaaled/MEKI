import type { Metadata } from "next";
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
      <PageHero eyebrow={t.about.eyebrow} title={p.title} lead={t.about.body} image="hero-field" layout="arch" />
      {/* Vision, mission and tagline: approved wording from the shared dictionary / published CMS. */}
      <VisionMission t={t} />
      <HowWeWork t={t} />
      <div className="bg-limestone pt-16 text-center">
        <p data-reveal className="container-x mx-auto max-w-2xl text-sm text-gold-text">
          {p.legacyNote}
        </p>
      </div>
      <Impact t={t} />
      {/* Enabling functions: names and descriptions come from the approved portfolio content. */}
      <Enabling t={t} />
      <PageCta title={p.ctaLabel} links={[{ href: pageHref(locale, "programs"), label: p.cta, primary: true }]} />
    </PageShell>
  );
}
