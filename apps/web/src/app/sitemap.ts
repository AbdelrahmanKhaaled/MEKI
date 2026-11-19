import type { MetadataRoute } from "next";
import { PAGE_PATH } from "@/content/pages";
import { programmeSitemapEntries, sitemapEntries } from "@/lib/seo";
import { en } from "@/content/en";
import { siteOrigin } from "@/lib/site";

/** Public informational pages in English with Arabic alternates (hreflang). Booking and status pages are never listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [...sitemapEntries(siteOrigin(), PAGE_PATH), ...programmeSitemapEntries(siteOrigin(), en.programmes.items.map((p) => p.slug))];
}
