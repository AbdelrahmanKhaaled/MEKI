/**
 * Pure dashboard calculations (no React, no DOM, no aliases — runs under `node --test`).
 * Rules enforced here:
 *  - money is a decimal STRING; sums use BigInt at fixed scale — never floating point;
 *  - every function works on ONE currency (callers pick it); different currencies are never added;
 *  - donations and Gala ticket revenue never meet in a calculation;
 *  - a ratio/percentage is returned ONLY when its denominator is a real, positive figure — otherwise null (shown as "—").
 */
import type { ByCampaignRow, ByDateRow, CampaignRow, CheckInStats, GalaFinancials, Summary } from "./schemas.ts";

const SCALE = 6n;
const ONE = 10n ** SCALE;

/** "1234.5" → 1234500000n (6 decimals). Throws on malformed input. */
export function toUnits(s: string): bigint {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new RangeError(`not a decimal: ${s}`);
  const frac = ((m[3] ?? "") + "000000").slice(0, 6);
  const v = BigInt(m[2]) * ONE + BigInt(frac);
  return m[1] ? -v : v;
}
export const sumUnits = (xs: string[]) => xs.reduce((a, x) => a + toUnits(x), 0n);
/** For charts only (display, not accounting): units → number with 2 decimals. */
export const unitsToNumber = (u: bigint) => Number(u / 10000n) / 100;

/** Percentage 0..100 with one decimal, or null when the denominator is not positive. */
export function pct(numerator: string | bigint, denominator: string | bigint): number | null {
  const n = typeof numerator === "bigint" ? numerator : toUnits(numerator);
  const d = typeof denominator === "bigint" ? denominator : toUnits(denominator);
  if (d <= 0n) return null;
  return Number((n * 1000n) / d) / 10;
}

// ───────────── currency ─────────────

export const currenciesOf = (s: Summary | undefined) => (s?.confirmed ?? []).map((c) => c.currency);
/** Keep the preferred currency if it exists, else the first available (stable), else null. */
export const pickCurrency = (available: string[], preferred?: string | null) => (preferred && available.includes(preferred) ? preferred : (available[0] ?? null));
export const forCurrency = <T extends { currency: string }>(rows: T[], currency: string | null) => (currency ? rows.filter((r) => r.currency === currency) : []);

// ───────────── date ranges (UTC days, matching the API's by-date grouping) ─────────────

export type RangePreset = "last7" | "last30" | "thisMonth" | "lastMonth" | "ytd" | "all";
export interface Range {
  from?: string;
  to?: string;
}
const iso = (d: Date) => d.toISOString();
const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export function rangeFor(preset: RangePreset, now = new Date()): Range {
  const today = startOfDay(now);
  const endOfToday = new Date(today.getTime() + 86_400_000 - 1);
  switch (preset) {
    case "last7":
      return { from: iso(new Date(today.getTime() - 6 * 86_400_000)), to: iso(endOfToday) };
    case "last30":
      return { from: iso(new Date(today.getTime() - 29 * 86_400_000)), to: iso(endOfToday) };
    case "thisMonth":
      return { from: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), to: iso(endOfToday) };
    case "lastMonth":
      return { from: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))), to: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 1)) };
    case "ytd":
      return { from: iso(new Date(Date.UTC(now.getUTCFullYear(), 0, 1))), to: iso(endOfToday) };
    default:
      return {};
  }
}

/** Daily buckets for ranges up to ~2 months, monthly otherwise (also for "all time"). */
export function intervalFor(range: Range): "day" | "month" {
  if (!range.from || !range.to) return "month";
  return (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000 <= 62 ? "day" : "month";
}

// ───────────── donation time series ─────────────

export interface TrendPoint {
  key: string; // YYYY-MM-DD or YYYY-MM
  gross: number;
  net: number;
  count: number;
}

export function bucketTrend(rows: ByDateRow[], currency: string | null, interval: "day" | "month"): TrendPoint[] {
  const acc = new Map<string, { gross: bigint; net: bigint; count: number }>();
  for (const r of forCurrency(rows, currency)) {
    const key = interval === "month" ? r.date.slice(0, 7) : r.date;
    const cur = acc.get(key) ?? { gross: 0n, net: 0n, count: 0 };
    cur.gross += toUnits(r.gross);
    cur.net += toUnits(r.net);
    cur.count += r.count;
    acc.set(key, cur);
  }
  return [...acc.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => ({ key, gross: unitsToNumber(v.gross), net: unitsToNumber(v.net), count: v.count }));
}

// ───────────── status / flow / gauges ─────────────

const CONFIRMED_PAYMENT = new Set(["PAID", "PARTIALLY_REFUNDED", "REFUNDED"]);
export interface StatusCounts {
  confirmed: number;
  pending: number;
  failed: number;
  cancelled: number;
  refunded: number;
}

/** From summary.donationsByStatus. `confirmed` counts payments verified by the provider (never PENDING/FAILED/CANCELLED). */
export function statusCounts(rows: Summary["donationsByStatus"]): StatusCounts {
  const c: StatusCounts = { confirmed: 0, pending: 0, failed: 0, cancelled: 0, refunded: 0 };
  for (const r of rows) {
    if (CONFIRMED_PAYMENT.has(r.paymentStatus)) {
      c.confirmed += r.count;
      if (r.paymentStatus === "REFUNDED" || r.paymentStatus === "PARTIALLY_REFUNDED") c.refunded += r.count;
    } else if (r.status === "PENDING") c.pending += r.count;
    else if (r.status === "FAILED") c.failed += r.count;
    else c.cancelled += r.count; // CANCELLED / EXPIRED
  }
  return c;
}

export interface Flow {
  gross: string;
  refunded: string;
  net: string;
  count: number;
}
export function flowFor(summary: Summary | undefined, currency: string | null): Flow | null {
  const row = summary?.confirmed.find((c) => c.currency === currency);
  return row ? { gross: row.gross, refunded: row.refunded, net: row.net, count: row.count } : null;
}

export const refundRate = (f: Flow | null) => (f ? pct(f.refunded, f.gross) : null);

/** Monthly (recurring-plan) donations' share of confirmed gross — payments only, never agreements. */
export function recurringShare(summary: Summary | undefined, currency: string | null): number | null {
  const rows = forCurrency(summary?.byFrequency ?? [], currency);
  const total = sumUnits(rows.map((r) => r.gross));
  const monthly = sumUnits(rows.filter((r) => r.frequency === "MONTHLY").map((r) => r.gross));
  return pct(monthly, total);
}

export interface FrequencySplit {
  frequency: string;
  net: number;
  refunded: number;
}
export function frequencySplit(summary: Summary | undefined, currency: string | null): FrequencySplit[] {
  return forCurrency(summary?.byFrequency ?? [], currency).map((r) => ({
    frequency: r.frequency,
    net: unitsToNumber(toUnits(r.net)),
    refunded: unitsToNumber(toUnits(r.gross) - toUnits(r.net)),
  }));
}

// ───────────── designation / programmes / campaigns ─────────────

export interface Slice {
  key: string;
  label: string;
  value: number;
}

/** General fund, campaign-designated and programme-designated donations stay distinguishable. */
export function designationSlices(rows: ByCampaignRow[], currency: string | null, labels: { general: string; campaigns: string; programmes: string }): Slice[] {
  const by = (d: string) => unitsToNumber(sumUnits(forCurrency(rows, currency).filter((r) => r.designation === d).map((r) => r.net)));
  return [
    { key: "GENERAL_FUND", label: labels.general, value: by("GENERAL_FUND") },
    { key: "CAMPAIGN", label: labels.campaigns, value: by("CAMPAIGN") },
    { key: "PROGRAMME", label: labels.programmes, value: by("PROGRAMME") },
  ].filter((s) => s.value > 0);
}

/**
 * Programme performance from DIRECT programme designations only. The by-campaign report does not attribute campaign donations to
 * a programme, and general donations belong to none — they are never spread across programmes.
 */
export function programmePerformance(rows: ByCampaignRow[], currency: string | null): { slug: string; name: string; value: number }[] {
  return forCurrency(rows, currency)
    .filter((r) => r.designation === "PROGRAMME" && r.programme)
    .map((r) => ({ slug: r.programme!.slug, name: r.programme!.nameEn, value: unitsToNumber(toUnits(r.net)) }))
    .sort((a, b) => b.value - a.value);
}

export function topCampaigns(rows: ByCampaignRow[], currency: string | null, n = 5) {
  return forCurrency(rows, currency)
    .filter((r) => r.designation === "CAMPAIGN" && r.campaign)
    .map((r) => ({ slug: r.campaign!.slug, title: r.campaign!.titleEn, net: r.net, donations: r.count, units: toUnits(r.net) }))
    .sort((a, b) => (a.units === b.units ? 0 : a.units < b.units ? 1 : -1))
    .slice(0, n);
}

export interface CampaignProgress {
  slug: string;
  title: string;
  raised: string;
  currency: string;
  /** null = no MEKI-approved target → no completion percentage is ever shown */
  target: string | null;
  percent: number | null;
}

export function campaignProgress(campaigns: CampaignRow[], rows: ByCampaignRow[], currency: string | null): CampaignProgress[] {
  if (!currency) return [];
  const raisedBy = new Map<string, bigint>();
  for (const r of forCurrency(rows, currency)) if (r.designation === "CAMPAIGN" && r.campaign) raisedBy.set(r.campaign.slug, (raisedBy.get(r.campaign.slug) ?? 0n) + toUnits(r.net));
  return campaigns
    .filter((c) => c.currency === currency && c.status === "PUBLISHED")
    .map((c) => {
      const raised = raisedBy.get(c.slug) ?? 0n;
      const target = c.targetAmount ?? null;
      return { slug: c.slug, title: c.titleEn, raised: formatUnits(raised), currency, target, percent: target ? pct(raised, target) : null };
    })
    .sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1));
}

export function formatUnits(u: bigint): string {
  const neg = u < 0n;
  const abs = neg ? -u : u;
  const whole = abs / ONE;
  const frac = (abs % ONE).toString().padStart(6, "0").slice(0, 2);
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

// ───────────── Gala (ticket revenue is its own world) ─────────────

export interface GalaMetrics {
  currency: string;
  bookingsTotal: number;
  bookingsConfirmed: number;
  bookingsPending: number;
  confirmedGuests: number;
  checkedIn: number;
  ticketRevenue: string; // net of refunds, USD — NEVER added to donations
  /** only when MEKI has configured a capacity; otherwise null (no invented target) */
  capacity: number | null;
  salesProgressPct: number | null;
  checkInPct: number | null;
}

export function galaMetrics(f: GalaFinancials, capacity: number | null, stats: CheckInStats | null): GalaMetrics {
  const b = f.bookingsByStatus;
  const t = f.ticketsByStatus;
  const bookingsTotal = Object.values(b).reduce((a, x) => a + x, 0);
  const confirmedGuests = (t.ISSUED ?? 0) + (t.CHECKED_IN ?? 0);
  const checkedIn = stats ? stats.checkedIn : (t.CHECKED_IN ?? 0);
  return {
    currency: f.currency,
    bookingsTotal,
    bookingsConfirmed: b.CONFIRMED ?? 0,
    bookingsPending: b.PENDING ?? 0,
    confirmedGuests,
    checkedIn,
    ticketRevenue: f.net,
    capacity,
    salesProgressPct: capacity && capacity > 0 ? pct(BigInt(confirmedGuests) * ONE, BigInt(capacity) * ONE) : null,
    checkInPct: confirmedGuests > 0 ? pct(BigInt(checkedIn) * ONE, BigInt(confirmedGuests) * ONE) : null,
  };
}

// ───────────── small helpers ─────────────

export function greetingKey(hour: number): "morning" | "afternoon" | "evening" {
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

export function relativeTime(iso: string, now = Date.now()): { unit: "minute" | "hour" | "day"; value: number } | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const mins = Math.max(0, Math.round((now - t) / 60_000));
  if (mins < 60) return { unit: "minute", value: mins };
  if (mins < 60 * 24) return { unit: "hour", value: Math.round(mins / 60) };
  return { unit: "day", value: Math.round(mins / 1440) };
}
