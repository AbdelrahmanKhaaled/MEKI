import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { getBookingCopy } from "@/content/booking";
import { Footer } from "@/components/sections/FinalFooter";
import { getPageContent } from "@/lib/content";
import { DonateProvider } from "@/components/DonateProvider";
import { Header } from "@/components/Header";
import { BookingStatus } from "@/components/booking/BookingStatus";
import { FlowBand } from "@/components/pages/FlowBand";

/**
 * Return/e-mail landing page: the backend's EVENT_BOOKING_RETURN_URL is `.../events/gala-night/booking?reference=EB-...`.
 * Arriving here proves nothing; the status component asks the API (and strips any ?token= from the address bar).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: `${getBookingCopy(locale).status.title} · MEKI`, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function BookingReturnPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ reference?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { reference } = await searchParams;
  const { t } = await getPageContent(locale);
  return (
    <DonateProvider t={t} locale={locale}>
      <Header t={t} locale={locale} current="gala" />
      <main id="main" className="min-h-screen bg-limestone pb-24">
        <FlowBand />
        <div className="container-x pt-12">
          <BookingStatus locale={locale} reference={reference ?? null} />
        </div>
      </main>
      <Footer t={t} />
    </DonateProvider>
  );
}
