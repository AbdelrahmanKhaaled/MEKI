import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { PublicGalaGivingOptions } from "@meki/api-client";
import { getDict, isLocale } from "@/lib/i18n";
import { fetchPublicContent } from "@/lib/api";
import { getGivingCopy } from "@/content/giving";
import { DonateProvider } from "@/components/DonateProvider";
import { Header } from "@/components/Header";
import { PreviewNote } from "@/components/PreviewNote";
import { FlowBand } from "@/components/pages/FlowBand";
import { GivingForm } from "@/components/giving/GivingForm";

/** Gala donation (not admission). Availability is read live from the API; never cached, never indexed. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: `${getGivingCopy(locale).gala.title} · MEKI`, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function GalaDonatePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDict(locale);
  const g = getGivingCopy(locale).gala;
  const options = await fetchPublicContent<PublicGalaGivingOptions>(`/public/events/gala-night/giving-options?locale=${locale}`);
  // Phase 14B: no reference-less direct link. Until SDI confirms the "MEKI Donation Reference" question the form below is a preview
  // that explains why (REFERENCE_QUESTION_NOT_CONFIRMED): a gift can never bypass DN- reference creation from this site.

  return (
    <DonateProvider t={t} locale={locale}>
      <Header t={t} locale={locale} current="gala" />
      <main id="main" className="min-h-screen bg-limestone pb-24">
        <FlowBand>
          <p className="eyebrow eyebrow-dark mb-4">{g.eyebrow}</p>
          <h1 className="headline mb-3 text-white">{g.title}</h1>
          <p className="mb-3 max-w-2xl text-mint-line">{g.intro}</p>
          <p className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href={`/${locale}/events/gala-night`} className="p10-underline text-sm font-bold text-glow">{g.back}</Link>
            <Link href={`/${locale}/events/gala-night/book`} className="p10-underline text-sm font-bold text-glow">{g.notTicket} {g.bookLink}</Link>
          </p>
        </FlowBand>
        <div className="container-x pt-12">
          {options && (options.available || options.project) ? (
            <GivingForm locale={locale} mode="gala" gala={options} eventSlug="gala-night" />
          ) : (
            <section className="max-w-2xl rounded-2xl border border-dashed border-gold-text/50 bg-paper p-6 sm:p-8" role="status" data-testid="gala-giving-unavailable">
              <h2 className="mb-2 font-serif text-2xl text-deep-green">{g.unavailableTitle}</h2>
              <p className="text-body-grey">{g.unavailable}</p>
            </section>
          )}
        </div>
      </main>
      <PreviewNote text={t.previewBar} extra={t.draftTranslation || undefined} closeLabel={t.dialog.close} />
    </DonateProvider>
  );
}
