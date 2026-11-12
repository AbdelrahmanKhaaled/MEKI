import type { Metadata } from "next";
import { getPages, PAGE_PATH, type PageKey } from "@/content/pages";
import type { Locale } from "@/lib/i18n";
import { siteOrigin, socialMeta } from "@/lib/site";

/** Page metadata: unique title/description, canonical + hreflang, Open Graph/Twitter (absolute URLs only). */
export function pageMetadata(locale: Locale, key: Exclude<PageKey, "home" | "gala">): Metadata {
  const m = getPages(locale).meta[key];
  const path = `/${locale}${PAGE_PATH[key]}`;
  return {
    metadataBase: siteOrigin(),
    title: m.title,
    description: m.description,
    alternates: { canonical: path, languages: { en: `/en${PAGE_PATH[key]}`, ar: `/ar${PAGE_PATH[key]}`, "x-default": `/en${PAGE_PATH[key]}` } },
    ...socialMeta({ title: m.title, description: m.description, locale, path, alt: "MEKI — Lasting Change, Built Together." }),
    robots: { index: false, follow: false }, // preview build: indexing waits for MEKI's launch approval
  };
}
