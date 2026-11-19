import type { Metadata } from "next";

/**
 * Public origin used for absolute metadata URLs (Open Graph / Twitter / canonical).
 * Order: NEXT_PUBLIC_SITE_URL → Vercel production domain → Vercel deployment URL → localhost (development only).
 * In a production build with none of these set, returns undefined so no localhost URL is ever emitted.
 */
export function siteOrigin(): URL | undefined {
  const v = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  try {
    if (v) return new URL(/^https?:\/\//.test(v) ? v : `https://${v}`);
  } catch {
    /* fall through */
  }
  return process.env.NODE_ENV === "production" ? undefined : new URL("http://localhost:3000");
}

/**
 * Search-engine indexing of the public pages. OFF until MEKI approves the public launch (single switch: robots meta on every
 * public page + robots.txt). Booking / status / donation-return pages stay noindex regardless.
 */
export const PUBLIC_INDEXING = false;
export const publicRobots = { index: PUBLIC_INDEXING, follow: PUBLIC_INDEXING } as const;

/** Shared social preview image: 1200×630 JPEG generated from curated MEKI photography (public/og). */
export const OG_IMAGE = { url: "/og/meki-og.jpg", width: 1200, height: 630, type: "image/jpeg" } as const;

/** Open Graph + Twitter blocks. Images are included only when an absolute origin is known. */
export function socialMeta(opts: { title: string; description: string; locale: string; path: string; alt: string; image?: { url: string; width: number; height: number } }): Pick<Metadata, "openGraph" | "twitter"> {
  const origin = siteOrigin();
  const og = opts.image ?? OG_IMAGE; // Phase 11A: pages may supply their own approved image (e.g. a programme photo)
  const images = origin ? [{ ...og, url: new URL(og.url, origin).toString(), alt: opts.alt }] : undefined;
  return {
    openGraph: {
      title: opts.title,
      description: opts.description,
      url: origin ? new URL(opts.path, origin).toString() : undefined,
      siteName: "MEKI",
      locale: opts.locale === "ar" ? "ar_EG" : "en_US",
      type: "website",
      images,
    },
    twitter: { card: images ? "summary_large_image" : "summary", title: opts.title, description: opts.description, images: images?.map((i) => i.url) },
  };
}
