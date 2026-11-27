import type { GalaCms } from "@/lib/gala-cms";
import type { Locale } from "@/lib/i18n";
import { OFFICIAL_GALA_FORMS } from "@/lib/official-forms";

export function approvedGalaAssets(cms: GalaCms, locale: Locale): GalaCms {
  const ar = locale === "ar";
  const place = ar ? "نيويورك" : "New York";
  const night = { src: "/gala/venue-exterior-night.jpeg", alt: ar ? "واجهة مبنى 583 بارك أفينيو مضاءة ليلاً" : "The illuminated façade of 583 Park Avenue", title: ar ? "583 بارك أفينيو ليلاً" : "583 Park Avenue at night", place, w: 1809, h: 1298 };
  const day = { src: "/gala/venue-exterior-day.jpeg", alt: ar ? "واجهة مبنى 583 بارك أفينيو" : "The façade of 583 Park Avenue", title: ar ? "واجهة المبنى" : "Building exterior", place, w: 547, h: 365 };
  const arrival = cms.experience["black-tie"];
  const packagesHref = cms.sponsorship?.document ? cms.sponsorship.href : (cms.sponsorship?.packagesHref ?? "/gala/sponsorship-packages.pdf");
  const sponsorHref = cms.sponsorship && !cms.sponsorship.document ? cms.sponsorship.href : (cms.sponsorship?.sponsorHref ?? OFFICIAL_GALA_FORMS.sponsor);
  return {
    ...cms,
    heroImage: cms.heroImage ?? night,
    venuePhotos: cms.venuePhotos.length ? cms.venuePhotos : [night, day],
    venueLogo: cms.venueLogo ?? { src: "/gala/venue-logo-white.png", alt: ar ? "583 بارك أفينيو" : "583 Park Avenue" },
    host: { ...cms.host, image: cms.host?.image ?? { src: "/gala/host-raya-abirached.png", alt: ar ? "رايا أبي راشد" : "Raya Abirached" } },
    experience: { ...cms.experience, "black-tie": { ...arrival, image: arrival?.image ?? day } },
    sponsorship: {
      document: true,
      href: packagesHref,
      sponsorHref,
      ...(cms.sponsorship?.label ? { label: cms.sponsorship.label } : {}),
    },
  };
}
