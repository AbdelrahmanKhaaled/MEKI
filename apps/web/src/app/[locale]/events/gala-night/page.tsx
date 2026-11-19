import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, locales } from "@/lib/i18n";
import { getPageContent } from "@/lib/content";
import { fetchPublicContent } from "@/lib/api";
import type { PublicTicketing } from "@meki/api-client";
import { getBookingCopy } from "@/content/booking";
import { publicRobots, siteOrigin, socialMeta } from "@/lib/site";
import { getGala, PROPOSED_SPONSORSHIP } from "@/content/gala";
import { MotionRoot } from "@/components/MotionRoot";
import { Header } from "@/components/Header";
import { DonateProvider } from "@/components/DonateProvider";
import { PreviewNote } from "@/components/PreviewNote";
import { Footer } from "@/components/sections/FinalFooter";
import {
  GalaHero,
  GalaPurpose,
  GalaExperience,
  GalaTimeline,
  GalaVenue,
  GalaAttendance,
  SponsorshipSection,
  GalaCauses,
  GalaFaq,
  GalaBooking,
} from "@/components/gala/GalaSections";

export const revalidate = 300;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const g = getGala(locale);
  const path = `/${locale}/events/gala-night`;
  const alt = `${g.hero.title} — ${g.hero.eyebrow}`;
  return {
    metadataBase: siteOrigin(),
    title: g.meta.title,
    description: g.meta.description,
    alternates: { canonical: path, languages: { en: "/en/events/gala-night", ar: "/ar/events/gala-night", "x-default": "/en/events/gala-night" } },
    ...socialMeta({ title: g.meta.title, description: g.meta.description, locale, path, alt }),
    robots: publicRobots, // indexing waits for MEKI's launch approval (lib/site.ts PUBLIC_INDEXING)
  };
}

const DEFAULT_MAP = "https://www.google.com/maps/search/?api=1&query=583+Park+Avenue+New+York";

/** Minimal slice of GET /public/events/:slug (localized). Only returned once the event is approved AND published. */
type PublicEvent = { status?: string; mapUrl?: string | null };

export default async function GalaNightPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const g = getGala(locale);
  const { t, liveCampaigns } = await getPageContent(locale);

  // Draft/unapproved events return 404 from the API, so nothing unpublished can ever surface here.
  // The page shell shows client-confirmed details either way; a published record may only refine the map link.
  const event = await fetchPublicContent<PublicEvent>(`/public/events/gala-night?locale=${locale}`);
  const mapUrl = event?.mapUrl && /^https:\/\//.test(event.mapUrl) ? event.mapUrl : DEFAULT_MAP;

  // Booking opens only when the API says so (sales switch AND checkout available — or, in SDI-hosted mode, the hosted form
  // switch). Unpublished events return 404 -> closed.
  const ticketing = await fetchPublicContent<PublicTicketing>(`/public/events/gala-night/ticketing`);
  const hostedMode = ticketing?.mode === "zeffy_hosted";
  const bookingOpen = !!ticketing && ticketing.salesOpen && !ticketing.soldOut && (hostedMode ? !!ticketing.hosted?.available : ticketing.checkoutAvailable);

  // Single source of truth for the price: once the event is published, the ticketing API (the same value the booking
  // flow charges) replaces the static brief text. While the event is unpublished (API 404) the client-brief text stays.
  const apiPrice = ticketing?.ticket?.price && ticketing.ticket.currency && Number.isFinite(Number(ticketing.ticket.price))
    ? new Intl.NumberFormat(locale === "ar" ? "ar" : "en-US", { style: "currency", currency: ticketing.ticket.currency, currencyDisplay: "code", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(ticketing.ticket.price))
    : undefined;

  // Proposed (unvalidated) sponsorship tiers: development preview only, never in a production build.
  const sponsorPreview = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_GALA_PREVIEW === "1";
  const back = `/${locale}`;

  return (
    <DonateProvider t={t} locale={locale} liveCampaigns={liveCampaigns}>
      <Header t={t} locale={locale} current="gala" />
      <MotionRoot>
        <main id="main">
          <GalaHero g={g} />
          <GalaPurpose g={g} />
          <GalaExperience g={g} />
          <GalaTimeline g={g} />
          <GalaVenue g={g} mapUrl={mapUrl} />
          <GalaAttendance g={g} price={apiPrice} />
          <SponsorshipSection g={g} tiers={sponsorPreview ? PROPOSED_SPONSORSHIP : undefined} />
          {/* Six approved causes not yet supplied: renders nothing until approved, event-linked data exists. */}
          <GalaCauses g={g} causes={[]} />
          <GalaFaq g={g} />
          <GalaBooking g={g} bookHref={bookingOpen ? `/${locale}/events/gala-night/book` : undefined} bookStatus={bookingOpen ? (hostedMode ? getBookingCopy(locale).hosted.intro : getBookingCopy(locale).tickets.rule) : undefined} />
          <p className="bg-deep-green-3 pb-10 text-center">
            <a href={back} className="text-sm font-bold text-mint-line underline-offset-4 hover:text-white hover:underline">
              {g.back}
            </a>
          </p>
        </main>
        <Footer t={t} />
      </MotionRoot>
      <PreviewNote text={t.previewBar} extra={g.draftNote || t.draftTranslation || undefined} closeLabel={t.dialog.close} />
    </DonateProvider>
  );
}
