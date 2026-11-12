import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getPageContent } from "@/lib/content";
import { getPages, pageHref } from "@/content/pages";
import { pageMetadata } from "@/lib/page-meta";
import { PageShell, PageHero } from "@/components/pages/PageShell";
import { PageCta } from "@/components/pages/PageCta";
import { ProgramsGrid } from "@/components/pages/ProgramsGrid";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? pageMetadata(locale, "programs") : {};
}

export default async function ProgramsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { t } = await getPageContent(locale);
  const p = getPages(locale).programs;
  return (
    <PageShell locale={locale} current="programs">
      <PageHero eyebrow={p.eyebrow} title={p.title} lead={t.programmes.intro} image="water-pier" layout="backdrop" />
      <section aria-label={p.title} className="section-y bg-paper">
        <div className="container-x">
          <ProgramsGrid t={t} detailsLabel={p.details} />
        </div>
      </section>
      <PageCta title={p.ctaLabel} text={p.ctaText} links={[{ href: pageHref(locale, "give"), label: p.cta, primary: true }]} />
    </PageShell>
  );
}
