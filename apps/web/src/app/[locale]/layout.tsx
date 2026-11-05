import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import "../globals.css";
import { sourceSerif, lato, arabicText, arabicDisplay } from "@/lib/fonts";
import { getDict, isLocale, locales } from "@/lib/i18n";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = { themeColor: "#0B3B30", width: "device-width", initialScale: 1 };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDict(locale);
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return {
    metadataBase: new URL(base),
    title: t.meta.title,
    description: t.meta.description,
    alternates: { canonical: `/${locale}`, languages: { en: "/en", ar: "/ar", "x-default": "/en" } },
    openGraph: {
      title: t.meta.title,
      description: t.meta.description,
      locale: locale === "ar" ? "ar_EG" : "en_US",
      type: "website",
      images: [{ url: "/images/work/field-sky.webp", width: 2000, height: 1333 }],
    },
    icons: { icon: "/brand/MEKI_Icon_Green.svg", apple: "/brand/MEKI_AppIcon_Green_180.png" },
    // Preview build: keep out of search indexes until MEKI approves content and launch.
    robots: { index: false, follow: false },
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
      <body>{children}</body>
    </html>
  );
}
