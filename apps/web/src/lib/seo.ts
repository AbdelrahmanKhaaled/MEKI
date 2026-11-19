/**
 * robots.txt + sitemap.xml content (pure, no imports, unit-tested). Public informational pages only — never booking, status or
 * donation-return pages.
 */
export const SITEMAP_PAGES = ["home", "about", "programs", "gala", "give", "faq", "contact", "privacy", "terms", "cookies"] as const;
/** Private / transactional paths: never crawled, even after launch. */
export const PRIVATE_PATHS = ["/*/events/gala-night/book", "/*/events/gala-night/booking", "/*/donation/return", "/api/"];

export function robotsRules(indexing: boolean, origin: URL | undefined) {
  return {
    rules: indexing ? { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS } : { userAgent: "*", disallow: "/" },
    ...(indexing && origin ? { sitemap: new URL("/sitemap.xml", origin).toString() } : {}),
  };
}

/** Phase 11A: one entry per programme page (English URL with Arabic alternate). */
export function programmeSitemapEntries(origin: URL | undefined, slugs: string[]) {
  if (!origin) return [];
  const abs = (locale: string, slug: string) => new URL(`/${locale}/programs/${slug}`, origin).toString();
  return slugs.map((slug) => ({ url: abs("en", slug), alternates: { languages: { en: abs("en", slug), ar: abs("ar", slug) } } }));
}

export function sitemapEntries(origin: URL | undefined, pagePath: Record<(typeof SITEMAP_PAGES)[number], string>) {
  if (!origin) return []; // no absolute origin known (production build without NEXT_PUBLIC_SITE_URL) → never localhost URLs
  const abs = (locale: string, key: (typeof SITEMAP_PAGES)[number]) => new URL(`/${locale}${pagePath[key]}`, origin).toString();
  return SITEMAP_PAGES.map((key) => ({ url: abs("en", key), alternates: { languages: { en: abs("en", key), ar: abs("ar", key) } } }));
}
