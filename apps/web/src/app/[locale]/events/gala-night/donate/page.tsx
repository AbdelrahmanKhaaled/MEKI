import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { PublicGalaGivingOptions } from "@meki/api-client";
import { isLocale } from "@/lib/i18n";
import { fetchPublicContent } from "@/lib/api";
import { getGivingCopy } from "@/content/giving";
import { Footer } from "@/components/sections/FinalFooter";
import { getPageContent } from "@/lib/content";
import { DonateProvider } from "@/components/DonateProvider";
import { Header } from "@/components/Header";
import { PreviewNote } from "@/components/PreviewNote";
import { FlowBand } from "@/components/pages/FlowBand";
import { GivingForm } from "@/components/giving/GivingForm";
import { OfficialFormHandoff } from "@/components/booking/OfficialFormHandoff";
import { donationHandoffUrl } from "@/lib/official-forms";

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
  const { t } = await getPageContent(locale);
  const g = getGivingCopy(locale).gala;
  const options = await fetchPublicContent<PublicGalaGivingOptions>(`/public/events/gala-night/giving-options?locale=${locale}`);
  // Reference-first: when the API reports Gala giving open, the DN- reference flow is used. Otherwise, and only when the
  // official donation form's release switch is on (final release decision), visitors get a labelled hand-off to SDI's official
  // Zeffy form; this also keeps the page useful when the API is unreachable. With the switch off the Phase 14B behaviour stays:
  // a preview form or a truthful "not open" panel, with no external link.
  const handoff = options?.available ? null : donationHandoffUrl();

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
          {handoff ? (
            <OfficialFormHandoff kind="donation" url={handoff} locale={locale} />
          ) : options && (options.available || options.project) ? (
            <GivingForm locale={locale} mode="gala" gala={options} eventSlug="gala-night" />
          ) : (
            <section className="max-w-2xl rounded-2xl border border-dashed border-gold-text/50 bg-paper p-6 sm:p-8" role="status" data-testid="gala-giving-unavailable">
              <h2 className="mb-2 font-serif text-2xl text-deep-green">{g.unavailableTitle}</h2>
              <p className="text-body-grey">{g.unavailable}</p>
            </section>
          )}
        </div>
      </main>
      <Footer t={t} />
      <PreviewNote text={t.previewBar} extra={t.draftTranslation || undefined} closeLabel={t.dialog.close} />
    </DonateProvider>
  );
}
