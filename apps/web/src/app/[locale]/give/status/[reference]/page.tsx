import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { DONATION_REFERENCE } from "@/lib/giving";
import { getGivingCopy } from "@/content/giving";
import { Footer } from "@/components/sections/FinalFooter";
import { getPageContent } from "@/lib/content";
import { DonateProvider } from "@/components/DonateProvider";
import { Header } from "@/components/Header";
import { PreviewNote } from "@/components/PreviewNote";
import { FlowBand } from "@/components/pages/FlowBand";
import { IntentStatus } from "@/components/giving/IntentStatus";

/** Donor status / return page. Never cached or indexed; it never confirms a payment by itself. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getGivingCopy(locale).status.metaTitle, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function GiftStatusPage({ params }: { params: Promise<{ locale: string; reference: string }> }) {
  const { locale, reference } = await params;
  if (!isLocale(locale) || !DONATION_REFERENCE.test(reference)) notFound();
  const { t } = await getPageContent(locale);
  const s = getGivingCopy(locale).status;
  return (
    <DonateProvider t={t} locale={locale}>
      <Header t={t} locale={locale} current="give" />
      <main id="main" className="min-h-screen bg-limestone pb-24">
        <FlowBand>
          <p className="eyebrow eyebrow-dark mb-4">{s.eyebrow}</p>
          <h1 className="headline mb-3 text-white">{s.title}</h1>
          <p>
            <Link href={`/${locale}/give`} className="p10-underline text-sm font-bold text-glow">{s.back}</Link>
          </p>
        </FlowBand>
        <div className="container-x pt-12">
          <IntentStatus locale={locale} reference={reference} />
        </div>
      </main>
      <Footer t={t} />
      <PreviewNote text={t.previewBar} extra={t.draftTranslation || undefined} closeLabel={t.dialog.close} />
    </DonateProvider>
  );
}
