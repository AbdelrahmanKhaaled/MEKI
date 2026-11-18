import { notFound } from "next/navigation";
import { PreviewNote } from "@/components/PreviewNote";
import { isLocale } from "@/lib/i18n";
import { getPageContent } from "@/lib/content";
import { DonateProvider } from "@/components/DonateProvider";
import { MotionRoot } from "@/components/MotionRoot";
import { Header } from "@/components/Header";
import { Hero } from "@/components/sections/Hero";
import { TrustStrip, About, VisionMission } from "@/components/sections/TrustAbout";
import { HowWeWork } from "@/components/sections/HowWeWork";
import { Impact } from "@/components/sections/Impact";
import { Programmes } from "@/components/sections/Programmes";
import { Enabling } from "@/components/sections/Enabling";
import { GalaBanner } from "@/components/sections/GalaBanner";
import { Campaigns } from "@/components/sections/Campaigns";
import { WhySupport, DonationProcess } from "@/components/sections/WhyProcess";
import { Gallery } from "@/components/sections/Gallery";
import { Faq } from "@/components/sections/Faq";
import { FinalCta, Footer } from "@/components/sections/FinalFooter";

/** Published CMS content is cached and revalidated in the background (ISR); see CONTENT_REVALIDATE_SECONDS. */
export const revalidate = 300;

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // Live API content overlaid on the built-in copy; falls back to the built-in copy if the API is unavailable.
  const { t, liveCampaigns, showCampaigns, hiddenSections } = await getPageContent(locale);
  // Sections an editor published as hidden in the CMS (Phase 6D); everything else renders as before.
  const show = (key: string) => !hiddenSections.includes(key);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NGO",
    name: "MEKI",
    slogan: "Lasting Change, Built Together.",
    description: t.meta.description,
  };

  return (
    <DonateProvider t={t} locale={locale} liveCampaigns={liveCampaigns}>
      <Header t={t} locale={locale} />
      <MotionRoot>
        <main id="main">
          <Hero t={t} locale={locale} />
          {show("TRUST") && <TrustStrip t={t} />}
          <GalaBanner t={t} />
          {show("ABOUT") && <About t={t} />}
          {show("VISION_MISSION") && <VisionMission t={t} />}
          {show("HOW_WE_WORK") && <HowWeWork t={t} />}
          {show("IMPACT") && <Impact t={t} />}
          {show("PROGRAMMES") && <Programmes t={t} />}
          {show("ENABLING") && <Enabling t={t} />}
          {/* Hidden until campaigns are formally approved; returns when the API publishes approved campaigns. */}
          {showCampaigns && <Campaigns t={t} />}
          {show("WHY") && <WhySupport t={t} />}
          {show("PROCESS") && <DonationProcess t={t} />}
          {show("GALLERY") && <Gallery t={t} />}
          {show("FAQ") && <Faq t={t} />}
          {show("FINAL_CTA") && <FinalCta t={t} />}
        </main>
        <Footer t={t} />
      </MotionRoot>

      {/* Persistent, honest preview notice (payments inactive; Arabic is a draft translation). */}
      <PreviewNote text={t.previewBar} extra={t.draftTranslation || undefined} closeLabel={t.dialog.close} />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </DonateProvider>
  );
}
