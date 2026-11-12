import { en, type Dict } from "@/content/en";
import { ar } from "@/content/ar";

export const locales = ["en", "ar"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export function isLocale(v: string): v is Locale {
  return (locales as readonly string[]).includes(v);
}

export function getDict(locale: Locale): Dict {
  return locale === "ar" ? ar : en;
}

/** Locale-aware currency formatting (USD shown in preview; final currencies TBC). */
export function formatUSD(amount: number, locale: Locale) {
  // Western digits in both locales (numeral style for Arabic is an open decision).
  const n = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-US", { maximumFractionDigits: 0 }).format(amount);
  // Left-to-right isolate keeps "$100" intact inside RTL text.
  return `⁦$${n}⁩`;
}

/**
 * Currency-aware variant for backend-configured currencies. USD whole amounts render exactly like formatUSD;
 * other currencies use their symbol (or ISO code) and keep any decimals the backend allows.
 */
export function formatMoney(amount: number | string, currency: string, locale: Locale, symbol?: string | null) {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (currency === "USD" && Number.isInteger(value)) return formatUSD(value, locale);
  const n = new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-US", { maximumFractionDigits: 3 }).format(value);
  return `⁦${symbol ?? `${currency} `}${n}⁩`;
}
