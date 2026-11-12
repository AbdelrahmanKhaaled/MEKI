export type Locale = 'en' | 'ar';
export const LOCALES: Locale[] = ['en', 'ar'];
export const DEFAULT_LOCALE: Locale = 'en';

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && v.constructor === Object;

/**
 * Flattens paired bilingual fields for a locale: { titleEn, titleAr } -> { title }.
 * Arabic falls back to English when a translation is missing (English is the default language).
 * Without a locale the bilingual shape is returned unchanged.
 */
export function localize<T>(value: T, locale?: Locale): unknown {
  if (!locale) return value;
  if (Array.isArray(value)) return value.map((v) => localize(v, locale));
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  const keys = Object.keys(value);
  for (const key of keys) {
    const m = /^(.*)(En|Ar)$/.exec(key);
    if (m && m[1] && (keys.includes(`${m[1]}En`) || keys.includes(`${m[1]}Ar`))) {
      const base = m[1];
      if (base in out) continue;
      const en = value[`${base}En`];
      const ar = value[`${base}Ar`];
      const chosen = locale === 'ar' ? (ar ?? en) : en;
      out[base] = localize(chosen, locale);
      if (locale === 'ar' && (ar === null || ar === undefined) && en !== null && en !== undefined) {
        const fallback = (out.translationFallback as string[] | undefined) ?? [];
        fallback.push(base);
        out.translationFallback = fallback;
      }
    } else {
      out[key] = localize(value[key], locale);
    }
  }
  return out;
}
