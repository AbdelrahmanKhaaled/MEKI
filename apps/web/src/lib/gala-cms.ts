import type { GalaDict, TimelineAct, TimelineItem } from "@/content/gala";
// Type-only imports keep this module dependency-free at runtime (unit-tested directly by tests/nov23.test.mjs).
import type { PublicEventPage, VenuePhoto } from "@/lib/venue-photos";

/**
 * MEKI client edits (22 Nov 2026, Gala items 14–23): everything on the Gala page that depends on material MEKI has not supplied yet
 * — photos, the host's photo, the sponsorship packages link, partner logos, a contact email — is read ONLY from the published
 * landing-page sections of the published Gala event (GET /public/events/gala-night/page; the API already drops DEMO content,
 * unpublished sections, hidden items and withdrawn media). Editors manage them in Admin → Gala → Settings → "Gala page".
 * Nothing here invents a fallback: with no published value the page keeps its current content.
 *
 * Section → use:
 *  EVENT_HERO        section media                 → full-width hero photo (venue at 583 Park Avenue) under a dark green overlay
 *  EVENT_ABOUT       items (title/place/media)     → "Why we gather" photos
 *  EVENT_HIGHLIGHTS  items by code                 → experience cards: photo (+ optional edited title/text)
 *  EVENT_SPEAKERS    item code "host"              → host photo (+ optional edited name/line)
 *  EVENT_VENUE       items                         → venue photos (lib/venue-photos.ts)
 *  EVENT_SPONSORSHIP ctaPrimaryHref (+label)       → "Sponsor now"; items with media = partner logos (title = name, href optional)
 *  EVENT_CONTACT     item href "mailto:…"          → inquiries email (Sponsors section)
 *  EVENT_AGENDA      section + items               → Gala Agenda Acts and Items
 */
export type GalaImage = { src: string; alt: string; w?: number | null; h?: number | null };
export type GalaTimelineCms = {
  eyebrow?: string;
  title?: string;
  hours?: string;
  note?: string;
  acts: TimelineAct[];
};
export type GalaCms = {
  heroImage: GalaImage | null;
  purposePhotos: VenuePhoto[];
  experience: Record<string, { title?: string; text?: string; image?: GalaImage }>;
  host: { name?: string; line?: string; image?: GalaImage } | null;
  venuePhotos: VenuePhoto[];
  /** `document`: the packages PDF from the Media Library (section image slot holds the PDF); otherwise an external https page. */
  sponsorship: { href: string; label?: string; document: boolean } | null;
  /** Venue logo (EVENT_VENUE section image), shown only in the venue area. */
  venueLogo: GalaImage | null;
  partners: { name: string; href?: string; image: GalaImage }[];
  contactEmail: string | null;
  timeline: GalaTimelineCms | null;
};

export const EMPTY_GALA_CMS: GalaCms = { heroImage: null, purposePhotos: [], experience: {}, host: null, venuePhotos: [], sponsorship: null, venueLogo: null, partners: [], contactEmail: null, timeline: null };

type Media = { url?: string; alt?: string | null; width?: number | null; height?: number | null } | null | undefined;
const SAFE_URL = /^(https:\/\/[^\s"'<>]+|\/(?!\/)[^\s"'<>]*)$/;
/** A Media Library PDF (storage keys always end with the extension of the detected type). */
export const isPdfUrl = (url: string | undefined | null) => typeof url === "string" && /\.pdf$/i.test(url.split(/[?#]/)[0]);
/** Same URL rule as the venue photos: absolute https or same-origin path only; a PDF is never rendered as an image. */
const image = (m: Media): GalaImage | undefined =>
  typeof m?.url === "string" && SAFE_URL.test(m.url) && !isPdfUrl(m.url) ? { src: m.url, alt: m.alt?.trim() || "", w: m.width, h: m.height } : undefined;
const text = (v: string | null | undefined) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
type Item = NonNullable<NonNullable<PublicEventPage["sections"]>[number]["items"]>[number];
/** Same rules as lib/venue-photos.ts venuePhotosFrom: title required, https/same-origin image, DEMO skipped. */
const photos = (items: Item[] | undefined): VenuePhoto[] =>
  (items ?? []).flatMap((i) => {
    const img = i.provenance === "DEMO" ? undefined : image(i.media);
    const title = text(i.title);
    return img && title ? [{ src: img.src, alt: img.alt, title, place: text(i.text), w: img.w, h: img.h }] : [];
  });
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i;

export function galaCmsFrom(page: PublicEventPage | null | undefined): GalaCms {
  if (!page?.sections) return EMPTY_GALA_CMS;
  const sec = (key: string) => page.sections?.find((s) => s.key === key);
  const live = <T extends { provenance?: string }>(xs: T[] | undefined) => (xs ?? []).filter((i) => i.provenance !== "DEMO");

  const heroSec = sec("EVENT_HERO");
  const heroImage = heroSec && heroSec.provenance !== "DEMO" ? image(heroSec.media) ?? null : null;

  const experience: GalaCms["experience"] = {};
  for (const i of live(sec("EVENT_HIGHLIGHTS")?.items)) {
    if (!i.code) continue;
    experience[i.code] = { title: text(i.title), text: text(i.text), image: image(i.media) };
  }

  const hostItem = live(sec("EVENT_SPEAKERS")?.items).find((i) => i.code === "host");
  const host = hostItem ? { name: text(hostItem.title), line: text(hostItem.text), image: image(hostItem.media) } : null;

  const partners = live(sec("EVENT_SPONSORSHIP")?.items)
    .map((i) => ({ name: text(i.title), href: typeof i.href === "string" && /^https:\/\//.test(i.href) ? i.href : undefined, image: image(i.media) }))
    .filter((p): p is { name: string; href: string | undefined; image: GalaImage } => !!p.name && !!p.image);
  const spon = sec("EVENT_SPONSORSHIP");
  // "Sponsor now" (24 Nov 2026): the packages PDF stored in the Media Library wins; an external https page is the alternative.
  const sponLive = spon && spon.provenance !== "DEMO" ? spon : undefined;
  const sponDoc = sponLive?.media?.url && SAFE_URL.test(sponLive.media.url) && isPdfUrl(sponLive.media.url) ? sponLive.media.url : null;
  const sponHref = sponDoc ?? (typeof sponLive?.ctaPrimaryHref === "string" && /^https:\/\/[^\s"'<>]+$/.test(sponLive.ctaPrimaryHref) ? sponLive.ctaPrimaryHref : null);
  const venueSec = sec("EVENT_VENUE");
  const venueLogo = venueSec && venueSec.provenance !== "DEMO" ? image(venueSec.media) ?? null : null;

  const mail = live(sec("EVENT_CONTACT")?.items)
    .map((i) => (typeof i.href === "string" && i.href.startsWith("mailto:") ? i.href.slice(7).split("?")[0] : text(i.text)))
    .find((v) => !!v && EMAIL.test(v));

  const agendaSec = sec("EVENT_AGENDA");
  let timeline: GalaTimelineCms | null = null;
  if (agendaSec && agendaSec.provenance !== "DEMO") {
    const agendaItems = live(agendaSec.items);
    if (agendaItems.length > 0) {
      const acts: TimelineAct[] = agendaItems.map((it, idx) => {
        let parsed: { label?: string; time?: string; items?: { time?: string; title?: string; note?: string; highlight?: boolean }[] } = {};
        if (it.text) {
          try {
            parsed = JSON.parse(it.text);
          } catch {
            // text was not JSON
          }
        }
        const label = parsed.label || `Act ${idx + 1}`;
        const title = text(it.title) || parsed.label || `Act ${idx + 1}`;
        const time = parsed.time || "";
        const items: TimelineItem[] = (parsed.items ?? []).map((ci) => ({
          time: ci.time ?? "",
          title: ci.title ?? "",
          ...(ci.note ? { note: ci.note } : {}),
          ...(ci.highlight ? { highlight: ci.highlight } : {}),
        }));
        return { label, title, time, items };
      });
      timeline = {
        eyebrow: text(agendaSec.eyebrow),
        title: text(agendaSec.title),
        hours: text(agendaSec.subtitle),
        note: text(agendaSec.body),
        acts,
      };
    }
  }

  return {
    heroImage,
    purposePhotos: photos(sec("EVENT_ABOUT")?.items),
    experience,
    host,
    venuePhotos: photos(sec("EVENT_VENUE")?.items),
    sponsorship: sponHref ? { href: sponHref, label: text(spon?.ctaPrimaryLabel), document: !!sponDoc } : null,
    venueLogo,
    partners,
    contactEmail: mail ?? null,
    timeline,
  };
}

/** Applies CMS wording overrides to the experience cards (by code); the card list itself — five cards — is fixed by the brief. */
export function experienceCards(g: GalaDict, cms: GalaCms) {
  return g.experience.items.map((c) => {
    const o = cms.experience[c.code];
    return { ...c, title: o?.title ?? c.title, text: o?.text ?? c.text, image: o?.image };
  });
}
