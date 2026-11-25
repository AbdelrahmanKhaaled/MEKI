import { PublicTracking } from "@/components/PublicTracking";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import "../globals.css";
import { sourceSerif, lato, arabicText, arabicDisplay } from "@/lib/fonts";
import { getDict, isLocale, locales } from "@/lib/i18n";
import { getPageContent } from "@/lib/content";
import { publicRobots, siteOrigin, socialMeta } from "@/lib/site";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = { themeColor: "#0B3B30", width: "device-width", initialScale: 1 };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const { t } = await getPageContent(locale);
  return {
    metadataBase: siteOrigin(),
    title: t.meta.title,
    description: t.meta.description,
    alternates: { canonical: `/${locale}`, languages: { en: "/en", ar: "/ar", "x-default": "/en" } },
    ...socialMeta({ title: t.meta.title, description: t.meta.description, locale, path: `/${locale}`, alt: "MEKI — Lasting Change, Built Together." }),
    // Approved logo files (client edits, 23 Nov 2026): browser icon = the symbol only, cropped from the approved green artwork.
    icons: { icon: [{ url: "/brand/MEKI_Icon_Approved_32.png", sizes: "32x32", type: "image/png" }, { url: "/brand/MEKI_Icon_Approved_192.png", sizes: "192x192", type: "image/png" }], apple: "/brand/MEKI_Icon_Approved_Apple_180.png" },
    // Preview build: keep out of search indexes until MEKI approves content and launch.
    robots: publicRobots, // indexing waits for MEKI's launch approval (lib/site.ts PUBLIC_INDEXING)
  };
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDict(locale);
  const fontVars = [sourceSerif.variable, lato.variable, locale === "ar" ? `${arabicText.variable} ${arabicDisplay.variable}` : ""].join(" ");
  return (
    <html lang={locale} dir={t.dir} className={fontVars}>
      <head>
        {/* Hide reveal targets only when JS + motion are available; auto-unhide if GSAP fails to start. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var d=document.documentElement;if(!matchMedia('(prefers-reduced-motion: reduce)').matches){d.classList.add('js-motion');setTimeout(function(){if(!window.__mekiMotion)d.classList.remove('js-motion')},4000)}})();",
          }}
        />
      </head>
      <body>{children}<PublicTracking /></body>
    </html>
  );
}
