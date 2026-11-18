import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, isLocale } from "@/lib/i18n";
import { getBookingCopy } from "@/content/booking";
import { DonateProvider } from "@/components/DonateProvider";
import { Header } from "@/components/Header";
import { BookingStatus } from "@/components/booking/BookingStatus";

/** Booking status: private to the booking holder, never cached or indexed; the reference alone grants no access. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: `${getBookingCopy(locale).status.title} · MEKI`, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function BookingStatusPage({ params }: { params: Promise<{ locale: string; reference: string }> }) {
  const { locale, reference } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDict(locale);
  return (
    <DonateProvider t={t} locale={locale}>
      <Header t={t} locale={locale} current="gala" />
      <main id="main" className="min-h-screen bg-limestone pb-24 pt-32">
        <div className="container-x">
          <BookingStatus locale={locale} reference={reference} />
        </div>
      </main>
    </DonateProvider>
  );
}
