/** Display formatting only (never used for accounting). Western digits in both locales, like the public site. */
type L = "en" | "ar";
const tag = (l: L) => (l === "ar" ? "ar-EG-u-nu-latn" : "en-US");

/**
 * "$1,500" / "$1.2K" for USD (same look as the public site, Western digits, no "US$" in Arabic); other currencies as
 * "EGP 9,000". Always Latin digits so figures read identically in both locales. Display only.
 */
export function formatMoney(value: string | number, currency: string, locale: L, opts: { compact?: boolean } = {}): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  void locale;
  const body = new Intl.NumberFormat("en-US", {
    notation: opts.compact ? "compact" : "standard",
    minimumFractionDigits: opts.compact || Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: opts.compact ? 1 : 2,
  }).format(n);
  return currency === "USD" ? `$${body}` : `${currency} ${body}`;
}

export const formatNumber = (n: number, locale: L) => new Intl.NumberFormat(tag(locale)).format(n);
export const formatPercent = (p: number | null, locale: L) => (p === null ? "—" : `${new Intl.NumberFormat(tag(locale), { maximumFractionDigits: 1 }).format(p)}%`);

export function formatDate(iso: string | null | undefined, locale: L, withTime = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(tag(locale), { year: "numeric", month: "short", day: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: "UTC" }).format(d);
}

/** Chart axis label for a bucket key (YYYY-MM-DD or YYYY-MM). */
export function bucketLabel(key: string, locale: L): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return new Intl.DateTimeFormat(tag(locale), d ? { month: "short", day: "numeric", timeZone: "UTC" } : { month: "short", year: "2-digit", timeZone: "UTC" }).format(date);
}

export type AuditCategory = "donation" | "payment" | "gala" | "content" | "access" | "other";

/** Readable description of an audit action key, e.g. "gala.booking.confirmed" → "Gala · booking confirmed". */
export function describeAudit(action: string): { text: string; category: AuditCategory } {
  const [head, ...rest] = action.split(".");
  const category: AuditCategory = /^(donation|donor|receipt|recurring|refund)/.test(head) ? "donation" : /^(payment|webhook|seed)/.test(head) ? "payment" : head === "gala" ? "gala" : /^(auth|user|role|session|password)/.test(head) ? "access" : /^(campaign|programme|content|page|event|media|faq|statistic|settings)/.test(head) ? "content" : "other";
  const words = rest.join(" ").replace(/[_.]/g, " ");
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return { text: words ? `${cap(head.replace(/_/g, " "))} · ${words}` : cap(head.replace(/_/g, " ")), category };
}
