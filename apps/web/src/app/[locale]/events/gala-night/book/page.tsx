import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDict, isLocale } from "@/lib/i18n";
import { getBookingCopy } from "@/content/booking";
import { DonateProvider } from "@/components/DonateProvider";
import { Header } from "@/components/Header";
import { PreviewNote } from "@/components/PreviewNote";
import { BookingFlow } from "@/components/booking/BookingFlow";

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
  const t = getDict(locale);
  const c = getBookingCopy(locale);
  return (
    <DonateProvider t={t} locale={locale}>
      <Header t={t} locale={locale} current="gala" />
      <main id="main" className="min-h-screen bg-limestone pb-24 pt-32">
        <div className="container-x">
          <p className="eyebrow mb-4">{c.eyebrow}</p>
          <h1 className="headline mb-3 text-deep-green">{c.title}</h1>
          <p className="mb-10">
            <Link href={`/${locale}/events/gala-night`} className="text-sm font-bold text-meki-green underline underline-offset-4">
              {c.backToGala}
            </Link>
          </p>
          <BookingFlow locale={locale} />
        </div>
      </main>
      <PreviewNote text={t.previewBar} extra={t.draftTranslation || undefined} closeLabel={t.dialog.close} />
    </DonateProvider>
  );
}
