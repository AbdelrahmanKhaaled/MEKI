import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../globals.css";
import { arabicText, lato, sourceSerif } from "@/lib/fonts";
import { getDict, isLocale, locales } from "@/lib/i18n";
import { Providers } from "@/components/common/Providers";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "MEKI Admin",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  icons: { icon: "/brand/MEKI_Icon_Green.svg" },
};

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const fontVars = [sourceSerif.variable, lato.variable, locale === "ar" ? arabicText.variable : ""].join(" ");
  return (
    <html lang={locale} dir={getDict(locale).dir} className={fontVars}>
      <body>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
