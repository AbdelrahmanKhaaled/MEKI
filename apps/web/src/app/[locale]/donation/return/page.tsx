import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, isLocale } from "@/lib/i18n";
import { DonateProvider } from "@/components/DonateProvider";
import { Header } from "@/components/Header";
import { DonationReturn } from "@/components/DonationReturn";
import { FlowBand } from "@/components/pages/FlowBand";

/** Payment return page: donor-specific, never cached, never indexed. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: `${getDict(locale).donationStatus.metaTitle} · MEKI`, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function DonationReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reference?: string; cancelled?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { reference, cancelled } = await searchParams;
  const t = getDict(locale);
  return (
    <DonateProvider t={t} locale={locale}>
      <Header t={t} locale={locale} />
      <main id="main" className="min-h-screen bg-limestone pb-24">
        <FlowBand />
        <div className="pt-12" />
        <DonationReturn t={t} locale={locale} reference={reference ?? null} cancelled={cancelled === "1"} />
      </main>
    </DonateProvider>
  );
}
