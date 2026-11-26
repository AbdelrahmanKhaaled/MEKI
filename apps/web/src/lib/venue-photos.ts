/** One authentic Gala venue photograph, published by MEKI (never a stock or unrelated image). */
export type VenuePhoto = { src: string; alt: string; title: string; place?: string; w?: number | null; h?: number | null };

/** Minimal slice of GET /public/events/:slug/page (localized; published, visible, non-DEMO sections only). */
type PublicMediaSlice = { url?: string; alt?: string | null; width?: number | null; height?: number | null } | null;
export type PublicEventPage = {
  sections?: {
    key?: string;
    eyebrow?: string | null;
    title?: string | null;
    subtitle?: string | null;
    body?: string | null;
    provenance?: string;
    media?: PublicMediaSlice;
    ctaPrimaryLabel?: string | null;
    ctaPrimaryHref?: string | null;
    items?: { code?: string | null; title?: string | null; text?: string | null; href?: string | null; provenance?: string; media?: PublicMediaSlice }[];
  }[];
};

/** Unified photo caption convention requested by MEKI (21 Nov 2026): "Title – Place" (place omitted when not known). */
export const photoCaption = (title: string, place?: string | null) => (place?.trim() ? `${title.trim()} – ${place.trim()}` : title.trim());

/**
 * Phase 13B — Gala venue photographs come ONLY from the published EVENT_VENUE section of the published Gala event. MEKI uploads the
 * authentic photos in the admin (item title = "Title", item text = "Place", media alt text = description). Only absolute https or
 * same-origin URLs are accepted, items need a title, and DEMO items are skipped (the API already excludes them).
 */
export function venuePhotosFrom(page: PublicEventPage | null | undefined): VenuePhoto[] {
  const section = page?.sections?.find((s) => s.key === "EVENT_VENUE");
  const out: VenuePhoto[] = [];
  for (const i of section?.items ?? []) {
    const url = i.media?.url;
    const title = i.title?.trim();
    if (i.provenance === "DEMO" || typeof url !== "string" || !/^(https:\/\/|\/(?!\/))/.test(url) || !title) continue;
    out.push({ src: url, alt: i.media?.alt?.trim() || "", title, place: i.text?.trim() || undefined, w: i.media?.width, h: i.media?.height });
  }
  return out;
}
