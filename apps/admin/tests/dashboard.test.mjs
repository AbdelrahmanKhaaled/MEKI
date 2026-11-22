// Run with: pnpm --filter @meki/admin test   (Node built-in runner; Node >= 22.18 strips TypeScript types natively)
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test, { describe } from "node:test";
import { bucketLabel, describeAudit, formatDate, formatMoney, formatPercent } from "../src/lib/format.ts";
import { ar, en } from "../src/lib/i18n.ts";
import {
  bucketTrend, campaignProgress, currenciesOf, designationSlices, flowFor, frequencySplit, galaMetrics, greetingKey, intervalFor, pct, pickCurrency, programmePerformance,
  rangeFor, recurringShare, refundRate, relativeTime, statusCounts, sumUnits, toUnits, topCampaigns,
} from "../src/lib/metrics.ts";
import { NAV, can, isDoorStaffOnly, visibleNav } from "../src/lib/navigation.ts";
import { AuditRowSchema, ByCampaignSchema, DonationRowSchema, GalaFinancialsSchema, SummarySchema } from "../src/lib/schemas.ts";

const summary = {
  confirmed: [
    { currency: "USD", count: 4, gross: "1000.00", refunded: "100.00", net: "900.00" },
    { currency: "EGP", count: 2, gross: "5000.00", refunded: "0.00", net: "5000.00" },
  ],
  byFrequency: [
    { frequency: "ONE_TIME", currency: "USD", count: 3, gross: "750.00", net: "650.00" },
    { frequency: "MONTHLY", currency: "USD", count: 1, gross: "250.00", net: "250.00" },
    { frequency: "ONE_TIME", currency: "EGP", count: 2, gross: "5000.00", net: "5000.00" },
  ],
  donationsByStatus: [
    { status: "COMPLETED", paymentStatus: "PAID", count: 3 },
    { status: "COMPLETED", paymentStatus: "PARTIALLY_REFUNDED", count: 1 },
    { status: "COMPLETED", paymentStatus: "REFUNDED", count: 1 },
    { status: "PENDING", paymentStatus: "UNPAID", count: 2 },
    { status: "FAILED", paymentStatus: "FAILED", count: 1 },
    { status: "CANCELLED", paymentStatus: "UNPAID", count: 1 },
    { status: "EXPIRED", paymentStatus: "UNPAID", count: 1 },
  ],
};
assert.ok(SummarySchema.safeParse(summary).success);

describe("money maths (BigInt, no floating point)", () => {
  test("decimal strings parse exactly and sum without drift", () => {
    assert.equal(toUnits("0.10") + toUnits("0.20"), toUnits("0.30"));
    assert.equal(sumUnits(["0.1", "0.2", "0.3"]), toUnits("0.6"));
    assert.equal(toUnits("1234567.891234"), 1234567891234n);
    assert.throws(() => toUnits("12,5"));
    assert.throws(() => toUnits("abc"));
  });
  test("percentages need a positive denominator, otherwise null (never invented)", () => {
    assert.equal(pct("25", "100"), 25);
    assert.equal(pct("1", "3"), 33.3);
    assert.equal(pct("5", "0"), null);
    assert.equal(pct("0", "0"), null);
  });
});

describe("currency separation", () => {
  test("currencies are discovered, never merged; flow is per currency", () => {
    assert.deepEqual(currenciesOf(summary), ["USD", "EGP"]);
    assert.equal(flowFor(summary, "USD").gross, "1000.00");
    assert.equal(flowFor(summary, "EGP").gross, "5000.00");
    assert.equal(flowFor(summary, "EUR"), null);
    assert.equal(flowFor(summary, null), null);
  });
  test("recurring share and frequency split only use the selected currency", () => {
    assert.equal(recurringShare(summary, "USD"), 25);
    assert.equal(recurringShare(summary, "EGP"), 0);
    assert.equal(recurringShare(summary, "EUR"), null);
    const f = frequencySplit(summary, "USD");
    assert.deepEqual(f.map((x) => x.frequency), ["ONE_TIME", "MONTHLY"]);
    assert.equal(f[0].refunded, 100);
  });
  test("pickCurrency keeps a valid choice and falls back deterministically", () => {
    assert.equal(pickCurrency(["USD", "EGP"], "EGP"), "EGP");
    assert.equal(pickCurrency(["USD", "EGP"], "EUR"), "USD");
    assert.equal(pickCurrency([], "USD"), null);
  });
  test("trend buckets add only the chosen currency", () => {
    const rows = [
      { date: "2026-11-01", currency: "USD", count: 1, gross: "100.00", net: "100.00" },
      { date: "2026-11-02", currency: "USD", count: 2, gross: "50.50", net: "40.50" },
      { date: "2026-11-02", currency: "EGP", count: 9, gross: "9999.00", net: "9999.00" },
      { date: "2026-12-01", currency: "USD", count: 1, gross: "10.00", net: "10.00" },
    ];
    assert.deepEqual(bucketTrend(rows, "USD", "day").map((p) => [p.key, p.gross, p.net, p.count]), [["2026-11-01", 100, 100, 1], ["2026-11-02", 50.5, 40.5, 2], ["2026-12-01", 10, 10, 1]]);
    const m = bucketTrend(rows, "USD", "month");
    assert.deepEqual(m.map((p) => [p.key, p.gross]), [["2026-11", 150.5], ["2026-12", 10]]);
    assert.deepEqual(bucketTrend(rows, null, "day"), []);
  });
});

describe("donation status and refund metrics", () => {
  test("only provider-verified payments count as confirmed; pending/failed/cancelled never do", () => {
    assert.deepEqual(statusCounts(summary.donationsByStatus), { confirmed: 5, pending: 2, failed: 1, cancelled: 2, refunded: 2 });
  });
  test("refund rate = refunded / gross, null when there is nothing confirmed", () => {
    assert.equal(refundRate(flowFor(summary, "USD")), 10);
    assert.equal(refundRate(null), null);
    assert.equal(refundRate({ gross: "0.00", refunded: "0.00", net: "0.00", count: 0 }), null);
  });
});

describe("designations, programmes and campaigns (no invented attribution or targets)", () => {
  const rows = [
    { designation: "GENERAL_FUND", campaign: null, programme: null, currency: "USD", count: 2, gross: "300.00", net: "300.00" },
    { designation: "CAMPAIGN", campaign: { slug: "winter", titleEn: "Winter relief" }, programme: null, currency: "USD", count: 3, gross: "600.00", net: "500.00" },
    { designation: "CAMPAIGN", campaign: { slug: "water", titleEn: "Clean water" }, programme: null, currency: "USD", count: 1, gross: "100.00", net: "100.00" },
    { designation: "PROGRAMME", campaign: null, programme: { slug: "health", nameEn: "Health" }, currency: "USD", count: 1, gross: "50.00", net: "50.00" },
    { designation: "CAMPAIGN", campaign: { slug: "winter", titleEn: "Winter relief" }, programme: null, currency: "EGP", count: 1, gross: "9000.00", net: "9000.00" },
  ];
  assert.ok(ByCampaignSchema.safeParse(rows).success);
  const labels = { general: "General", campaigns: "Campaigns", programmes: "Programs" };
  test("general, campaign and programme donations stay distinguishable and per currency", () => {
    assert.deepEqual(designationSlices(rows, "USD", labels).map((s) => [s.key, s.value]), [["GENERAL_FUND", 300], ["CAMPAIGN", 600], ["PROGRAMME", 50]]);
    assert.deepEqual(designationSlices(rows, "EGP", labels).map((s) => [s.key, s.value]), [["CAMPAIGN", 9000]]);
  });
  test("programme performance uses direct programme designations only", () => {
    assert.deepEqual(programmePerformance(rows, "USD"), [{ slug: "health", name: "Health", value: 50 }]);
  });
  test("top campaigns sort by exact net, USD only", () => {
    assert.deepEqual(topCampaigns(rows, "USD").map((c) => c.slug), ["winter", "water"]);
  });
  test("campaign progress: a percentage exists ONLY where MEKI approved a target", () => {
    const campaigns = [
      { id: "1", slug: "winter", titleEn: "Winter relief", status: "PUBLISHED", currency: "USD", targetAmount: "1000.00" },
      { id: "2", slug: "water", titleEn: "Clean water", status: "PUBLISHED", currency: "USD", targetAmount: null },
      { id: "3", slug: "draft", titleEn: "Old", status: "DRAFT", currency: "USD", targetAmount: "10.00" },
      { id: "4", slug: "egp", titleEn: "EGP campaign", status: "PUBLISHED", currency: "EGP", targetAmount: "100.00" },
    ];
    const p = campaignProgress(campaigns, rows, "USD");
    assert.deepEqual(p.map((x) => [x.slug, x.percent, x.target]), [["winter", 50, "1000.00"], ["water", null, null]]);
    assert.equal(p[1].raised, "100.00");
    assert.deepEqual(campaignProgress(campaigns, rows, null), []);
  });
});

describe("Gala ticketing is separate from donations", () => {
  const fin = { classification: "EVENT_TICKET_PAYMENT", currency: "USD", grossCaptured: "2250.00", refunded: "750.00", net: "1500.00", capturedPayments: 2, refundPayments: 1, bookingsByStatus: { CONFIRMED: 2, PENDING: 1, REFUNDED: 1 }, ticketsByStatus: { ISSUED: 3, CHECKED_IN: 1, PENDING: 1, REFUNDED: 1 } };
  assert.ok(GalaFinancialsSchema.safeParse(fin).success);
  test("metrics derive from the ticket ledger only; revenue is never merged into donation totals", () => {
    const g = galaMetrics(fin, null, null);
    assert.equal(g.ticketRevenue, "1500.00");
    assert.equal(g.confirmedGuests, 4);
    assert.equal(g.checkedIn, 1);
    assert.equal(g.bookingsTotal, 4);
    assert.equal(g.bookingsPending, 1);
    assert.equal(g.checkInPct, 25);
    const usd = flowFor(summary, "USD");
    assert.equal(usd.gross, "1000.00"); // unchanged by ticket revenue
    assert.notEqual(g.ticketRevenue, usd.net);
  });
  test("sales progress exists only with an approved capacity", () => {
    assert.equal(galaMetrics(fin, null, null).salesProgressPct, null);
    assert.equal(galaMetrics(fin, 8, null).salesProgressPct, 50);
    assert.equal(galaMetrics(fin, 0, null).salesProgressPct, null);
  });
  test("a schema rejects a ledger that is not classified as ticket revenue", () => {
    assert.equal(GalaFinancialsSchema.safeParse({ ...fin, classification: "CHARITABLE_DONATION" }).success, false);
  });
});

describe("periods", () => {
  const now = new Date("2026-11-17T10:00:00Z");
  test("presets resolve to UTC day ranges", () => {
    assert.equal(rangeFor("last7", now).from, "2026-11-11T00:00:00.000Z");
    assert.equal(rangeFor("last30", now).from, "2026-10-19T00:00:00.000Z");
    assert.equal(rangeFor("thisMonth", now).from, "2026-11-01T00:00:00.000Z");
    assert.equal(rangeFor("lastMonth", now).to, "2026-10-31T23:59:59.999Z");
    assert.equal(rangeFor("ytd", now).from, "2026-01-01T00:00:00.000Z");
    assert.deepEqual(rangeFor("all", now), {});
  });
  test("chart interval: daily for short ranges, monthly otherwise", () => {
    assert.equal(intervalFor(rangeFor("last30", now)), "day");
    assert.equal(intervalFor(rangeFor("ytd", now)), "month");
    assert.equal(intervalFor({}), "month");
  });
  test("greeting and relative time", () => {
    assert.equal(greetingKey(9), "morning");
    assert.equal(greetingKey(14), "afternoon");
    assert.equal(greetingKey(20), "evening");
    assert.deepEqual(relativeTime("2026-11-17T09:55:00Z", now.getTime()), { unit: "minute", value: 5 });
    assert.deepEqual(relativeTime("2026-11-17T07:00:00Z", now.getTime()), { unit: "hour", value: 3 });
    assert.deepEqual(relativeTime("2026-11-14T10:00:00Z", now.getTime()), { unit: "day", value: 3 });
    assert.equal(relativeTime("garbage"), null);
  });
});

describe("permission-based navigation", () => {
  const user = (...permissions) => ({ permissions, isSuperAdmin: false });
  const keys = (u) => visibleNav(u).flatMap((g) => g.items.map((i) => i.key));
  test("no permissions → only the dashboard; super admin sees everything", () => {
    assert.deepEqual(keys(user()), ["dashboard"]);
    const all = NAV.flatMap((g) => g.items.map((i) => i.key));
    assert.deepEqual(keys({ permissions: [], isSuperAdmin: true }), all);
  });
  test("each role sees only what its permissions allow", () => {
    const finance = keys(user("reports.read", "donations.read", "donors.read", "payments.read", "gala.bookings.read"));
    assert.ok(finance.includes("donations") && finance.includes("payments") && finance.includes("bookings"));
    assert.ok(!finance.includes("users") && !finance.includes("pages") && !finance.includes("checkin"));
    assert.deepEqual(keys(user("campaigns.read")), ["dashboard", "campaigns"]);
    assert.deepEqual(keys(user("gala.checkin.validate")), ["dashboard", "checkin"]);
  });
  test("only implemented modules have a route; everything else is flagged as upcoming (no fake pages)", () => {
    const withRoute = NAV.flatMap((g) => g.items).filter((i) => i.href);
    // Phase 6B added the donor-management pages, Phase 6C programs/causes/campaigns/media, Phase 6D the website CMS, Phase 6E Gala operations; Phase 14 the giving intents + Zakat eligibility pages; the final release Users & Roles (needed for four-eyes approvals); everything else is still upcoming.
    assert.deepEqual(withRoute.map((i) => i.key), ["dashboard", "programs", "causes", "campaigns", "donorList", "donations", "payments", "sdiZeffy", "sdiReconciliation", "sdiEvidence", "givingIntents", "zakat", "recurring", "receipts", "galaOverview", "bookings", "guests", "sdiAttendees", "tickets", "checkin", "galaExports", "galaComms", "galaSettings", "homepage", "pages", "menus", "media", "faqs", "statistics", "siteSettings", "users"]);
  });
  test("can() and door-staff detection", () => {
    assert.equal(can(user("a"), "a", "b"), true);
    assert.equal(can(user("a"), "b"), false);
    assert.equal(can(null, "a"), false);
    assert.equal(can(user(), ), true);
    assert.equal(isDoorStaffOnly(user("gala.checkin.validate")), true);
    assert.equal(isDoorStaffOnly(user("gala.checkin.validate", "reports.read")), false);
    assert.equal(isDoorStaffOnly({ permissions: [], isSuperAdmin: true }), false);
  });
});

describe("formatting", () => {
  test("money: Western digits in both locales, integer amounts without decimals, invalid → dash", () => {
    assert.equal(formatMoney("1500", "USD", "en"), "$1,500");
    assert.equal(formatMoney("1500.50", "USD", "en"), "$1,500.50");
    assert.match(formatMoney("1500", "USD", "ar"), /1,500/);
    assert.doesNotMatch(formatMoney("1500", "USD", "ar"), /[٠-٩]/);
    assert.equal(formatMoney("x", "USD", "en"), "—");
    assert.match(formatMoney(1250000, "USD", "en", { compact: true }), /^\$1\.[23]5?M/);
    assert.equal(formatMoney("9000", "EGP", "ar"), "EGP 9,000"); // other currencies keep their code, never merged into $
    assert.equal(formatMoney("17900", "USD", "ar"), "$17,900"); // no "US$" in Arabic
  });
  test("percent, dates and chart labels", () => {
    assert.equal(formatPercent(null, "en"), "—");
    assert.equal(formatPercent(33.3, "en"), "33.3%");
    assert.equal(formatDate(null, "en"), "—");
    assert.equal(formatDate("2026-12-12T00:00:00Z", "en"), "Dec 12, 2026");
    assert.match(bucketLabel("2026-11", "en"), /Nov/);
    assert.match(bucketLabel("2026-11-05", "en"), /Nov 5/);
  });
  test("audit actions get a readable description and a category", () => {
    assert.deepEqual(describeAudit("gala.booking.confirmed"), { text: "Gala · booking confirmed", category: "gala" });
    assert.equal(describeAudit("donation.receipt.issue").category, "donation");
    assert.equal(describeAudit("webhook.retry").category, "payment");
  });
});

describe("API boundary validation", () => {
  test("responses that do not match are rejected, not rendered", () => {
    assert.equal(SummarySchema.safeParse({ confirmed: [{ currency: "usd", count: 1, gross: "1", refunded: "0", net: "1" }], byFrequency: [], donationsByStatus: [] }).success, false); // bad currency code
    assert.equal(SummarySchema.safeParse({ confirmed: [{ currency: "USD", count: 1, gross: 10, refunded: "0", net: "1" }], byFrequency: [], donationsByStatus: [] }).success, false); // money must be a string, never a float
    assert.equal(AuditRowSchema.safeParse({ id: 1 }).success, false);
  });
  test("a donation row may omit donor details (no donors.read) and keeps anonymity flag", () => {
    const row = { id: "d1", reference: "DN-1", amount: "50.00", refundedAmount: "0.00", netAmount: "50.00", currency: "USD", frequency: "ONE_TIME", status: "COMPLETED", paymentStatus: "PAID", isAnonymous: true, isTest: false, confirmedAt: null, createdAt: "2026-11-01T00:00:00Z", allocations: [] };
    const p = DonationRowSchema.safeParse(row);
    assert.ok(p.success);
    assert.equal(p.data.donor, undefined);
  });
});

describe("localization", () => {
  const keys = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
  test("English and Arabic dictionaries have identical keys and no empty strings", () => {
    assert.deepEqual(keys(en).sort(), keys(ar).sort());
    const flat = (o) => Object.values(o).flatMap((v) => (typeof v === "string" ? [v] : v && typeof v === "object" ? flat(v) : []));
    for (const s of flat(ar)) assert.ok(s.trim().length > 0);
  });
  test("directions and Arabic content", () => {
    assert.equal(en.dir, "ltr");
    assert.equal(ar.dir, "rtl");
    assert.match(ar.dashboard.title, /[؀-ۿ]/);
    assert.match(ar.nav.items.dashboard, /[؀-ۿ]/);
  });
  test("every navigation item has a label in both languages", () => {
    for (const g of NAV) {
      assert.ok(en.nav.groups[g.key] && ar.nav.groups[g.key], g.key);
      for (const i of g.items) assert.ok(en.nav.items[i.key] && ar.nav.items[i.key], i.key);
    }
  });
});

describe("static guards on the admin source", () => {
  const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
  const files = walk(join(import.meta.dirname, "../src")).filter((f) => /\.(ts|tsx)$/.test(f));
  const read = (f) => readFileSync(f, "utf8");
  test("no browser storage of tokens/sessions; only the sidebar UI preference may use localStorage", () => {
    for (const f of files) {
      const s = read(f);
      assert.doesNotMatch(s, /sessionStorage|document\.cookie/, f);
      if (/localStorage/.test(s)) assert.ok(f.endsWith("AppShell.tsx"), `localStorage outside AppShell: ${f}`);
    }
    assert.doesNotMatch(read(join(import.meta.dirname, "../src/components/layout/AppShell.tsx")), /token|csrf|password/i);
  });
  test("the network is touched only in lib/api.ts (components never call fetch)", () => {
    for (const f of files) if (!f.endsWith(join("lib", "api.ts"))) assert.doesNotMatch(read(f), /\bfetch\(/, f);
  });
  test("all requests go to the same-origin /api/v1 proxy — no hard-coded hosts", () => {
    for (const f of files) assert.doesNotMatch(read(f), /https?:\/\/(?!www\.w3\.org)[a-z0-9.-]+\.[a-z]{2,}/i, f);
    assert.match(read(join(import.meta.dirname, "../src/lib/api.ts")), /\/api\/v1/);
  });
  test("no mock financial data and no ticket revenue added into donation figures", () => {
    for (const f of files) {
      const s = read(f);
      assert.doesNotMatch(s, /mockData|fakeData|lorem|Math\.random/i, f);
    }
    const dash = read(join(import.meta.dirname, "../src/features/dashboard/DashboardPage.tsx"));
    assert.doesNotMatch(dash, /ticketRevenue\s*\+|\+\s*galaM|galaM\.ticketRevenue\s*[,)]?\s*\+/);
    assert.doesNotMatch(dash, /includeTest/);
  });
  test("charts are mirrored for RTL (axes reversed / orientation swapped)", () => {
    const charts = ["TrendChart.tsx", "BreakdownCharts.tsx"].map((n) => read(join(import.meta.dirname, "../src/components/charts", n))).join("\n");
    assert.match(charts, /reversed=\{rtl\}/);
    assert.match(charts, /orientation=\{rtl \? "right" : "left"\}/);
    assert.match(read(join(import.meta.dirname, "../src/components/charts/Gauge.tsx")), /rtl:-scale-x-100/);
  });
});
