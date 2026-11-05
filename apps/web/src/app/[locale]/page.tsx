import { notFound } from "next/navigation";
import { PreviewNote } from "@/components/PreviewNote";
import { getDict, isLocale } from "@/lib/i18n";
import { DonateProvider } from "@/components/DonateProvider";
import { MotionRoot } from "@/components/MotionRoot";
import { Header } from "@/components/Header";
import { Hero } from "@/components/sections/Hero";
import { TrustStrip, About, VisionMission } from "@/components/sections/TrustAbout";
import { HowWeWork } from "@/components/sections/HowWeWork";
import { Impact } from "@/components/sections/Impact";
import { Programmes } from "@/components/sections/Programmes";
import { Enabling } from "@/components/sections/Enabling";
import { Campaigns } from "@/components/sections/Campaigns";
import { WhySupport, DonationProcess } from "@/components/sections/WhyProcess";
import { Gallery } from "@/components/sections/Gallery";
import { Faq } from "@/components/sections/Faq";
import { FinalCta, Footer } from "@/components/sections/FinalFooter";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDict(locale);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NGO",
    name: "MEKI",
    slogan: "Lasting Change, Built Together.",
    description: t.meta.description,
  };

  return (
    <DonateProvider t={t}>
      <Header t={t} locale={locale} />
      <MotionRoot>
        <main id="main">
          <Hero t={t} locale={locale} />
          <TrustStrip t={t} />
          <About t={t} />
          <VisionMission t={t} />
          <HowWeWork t={t} />
          <Impact t={t} />
          <Programmes t={t} />
          <Enabling t={t} />
          <Campaigns t={t} />
          <WhySupport t={t} />
          <DonationProcess t={t} />
          <Gallery t={t} />
          <Faq t={t} />
          <FinalCta t={t} />
        </main>
        <Footer t={t} />
      </MotionRoot>

      {/* Persistent, honest preview notice (payments inactive; Arabic is a draft translation). */}
      <PreviewNote text={t.previewBar} extra={t.draftTranslation || undefined} closeLabel={t.dialog.close} />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </DonateProvider>
  );
}
