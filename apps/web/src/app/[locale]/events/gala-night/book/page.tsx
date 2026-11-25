import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getBookingCopy } from "@/content/booking";
import type { PublicEventFundraising } from "@meki/api-client";
import { fetchPublicContent } from "@/lib/api";
import { Footer } from "@/components/sections/FinalFooter";
import { getPageContent } from "@/lib/content";
import { DonateProvider } from "@/components/DonateProvider";
import { Header } from "@/components/Header";
import { PreviewNote } from "@/components/PreviewNote";
import { BookingFlow } from "@/components/booking/BookingFlow";
import { FlowBand } from "@/components/pages/FlowBand";
import { ticketHandoffUrl } from "@/lib/official-forms";

/** Booking is visitor-specific and its availability is read live in the browser: never cached, never indexed. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getBookingCopy(locale).metaTitle, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function GalaBookPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { t } = await getPageContent(locale);
  const c = getBookingCopy(locale);
  // Nov 19 2026: the SDI-approved ticket purchase disclosure (exact wording), shown before the buyer opens SDI's form.
  const fr = await fetchPublicContent<PublicEventFundraising>(`/public/events/gala-night/fundraising?locale=${locale}`);
  return (
    <DonateProvider t={t} locale={locale}>
      <Header t={t} locale={locale} current="gala" />
      <main id="main" className="min-h-screen bg-limestone pb-24">
        <FlowBand>
          <p className="eyebrow eyebrow-dark mb-4">{c.eyebrow}</p>
          <h1 className="headline mb-3 text-white">{c.title}</h1>
          <p>
            <Link href={`/${locale}/events/gala-night`} className="p10-underline text-sm font-bold text-glow">
              {c.backToGala}
            </Link>
          </p>
        </FlowBand>
        <div className="container-x pt-12">
          <BookingFlow locale={locale} disclosure={fr?.disclosures?.ticketPurchase ?? null} officialFormUrl={ticketHandoffUrl()} />
        </div>
      </main>
      <Footer t={t} />
      <PreviewNote text={t.previewBar} extra={t.draftTranslation || undefined} closeLabel={t.dialog.close} />
    </DonateProvider>
  );
}
