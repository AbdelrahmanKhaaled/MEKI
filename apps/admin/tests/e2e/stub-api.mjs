// TEST FIXTURE ONLY — a stub of the MEKI admin API with clearly FAKE data, used to exercise charts/states in a browser.
// It is never started by the app and its numbers are never real. Same envelope/contract as apps/api (see lib/schemas.ts).
import { createServer } from "node:http";
import { filterDonations, financeRoute } from "./stub-finance.mjs";

export const state = { fail: new Set(), expired: false, requests: [], delayMs: 0 };

const ROLES = {
  "admin@stub.test": { name: "Amira Stub", roles: ["ADMINISTRATOR"], permissions: ["reports.read", "donations.read", "donors.read", "programmes.read", "campaigns.read", "audit.read", "events.read", "gala.bookings.read", "gala.checkin.validate", "gala.guests.read", "content.read", "settings.read", "users.read"] },
  "finance@stub.test": { name: "Farid Finance", roles: ["FINANCE_MANAGER"], permissions: ["reports.read", "donations.read", "programmes.read", "campaigns.read", "events.read"] },
  "door@stub.test": { name: "Dina Door", roles: ["EVENT_CHECKIN_STAFF"], permissions: ["gala.checkin.validate"] },
  "viewer@stub.test": { name: "Vera Viewer", roles: ["NONE"], permissions: [] },
  // Phase 6B: full finance administrator and a donations-only operator (FAKE accounts of the stub only)
  "fin6b@stub.test": { name: "Fatma Finance", roles: ["SUPER_FINANCE"], permissions: ["reports.read", "donations.read", "donors.read", "payments.read", "refunds.request", "refunds.approve", "refunds.execute", "recurring.read", "recurring.manage", "receipts.read", "audit.read", "campaigns.read", "settings.read"] },
  "ops@stub.test": { name: "Olfat Ops", roles: ["DONATIONS_VIEWER"], permissions: ["donations.read"] },
};

// ── fake data ──
const day = (n) => new Date(Date.UTC(2026, 10, 17) - n * 86_400_000).toISOString().slice(0, 10);
const byDate = [];
for (let i = 29; i >= 0; i--) {
  const gross = 200 + ((i * 137) % 900);
  byDate.push({ date: day(i), currency: "USD", count: 1 + (i % 5), gross: `${gross}.00`, net: `${gross - (i % 7 === 0 ? 50 : 0)}.00` });
}
byDate.push({ date: day(3), currency: "EGP", count: 2, gross: "4000.00", net: "4000.00" });
const summary = (cur) => {
  const all = [
    { currency: "USD", count: 41, gross: "18250.00", refunded: "350.00", net: "17900.00" },
    { currency: "EGP", count: 3, gross: "9000.00", refunded: "0.00", net: "9000.00" },
  ];
  const freq = [
    { frequency: "ONE_TIME", currency: "USD", count: 33, gross: "14250.00", net: "13900.00" },
    { frequency: "MONTHLY", currency: "USD", count: 8, gross: "4000.00", net: "4000.00" },
    { frequency: "ONE_TIME", currency: "EGP", count: 3, gross: "9000.00", net: "9000.00" },
  ];
  return {
    confirmed: all.filter((c) => !cur || c.currency === cur),
    byFrequency: freq.filter((c) => !cur || c.currency === cur),
    donationsByStatus: [
      { status: "COMPLETED", paymentStatus: "PAID", count: 40 },
      { status: "COMPLETED", paymentStatus: "PARTIALLY_REFUNDED", count: 3 },
      { status: "COMPLETED", paymentStatus: "REFUNDED", count: 1 },
      { status: "PENDING", paymentStatus: "UNPAID", count: 6 },
      { status: "FAILED", paymentStatus: "FAILED", count: 4 },
      { status: "CANCELLED", paymentStatus: "UNPAID", count: 2 },
    ],
  };
};
const byCampaign = (cur) =>
  [
    { designation: "GENERAL_FUND", campaign: null, programme: null, currency: "USD", count: 12, gross: "5000.00", net: "4900.00" },
    { designation: "CAMPAIGN", campaign: { slug: "winter-relief", titleEn: "Winter Relief" }, programme: null, currency: "USD", count: 14, gross: "7000.00", net: "6800.00" },
    { designation: "CAMPAIGN", campaign: { slug: "clean-water", titleEn: "Clean Water for Villages" }, programme: null, currency: "USD", count: 9, gross: "3250.00", net: "3250.00" },
    { designation: "PROGRAMME", campaign: null, programme: { slug: "health", nameEn: "Health & Nutrition" }, currency: "USD", count: 4, gross: "1500.00", net: "1500.00" },
    { designation: "PROGRAMME", campaign: null, programme: { slug: "education", nameEn: "Education" }, currency: "USD", count: 2, gross: "1000.00", net: "1000.00" },
    { designation: "GENERAL_FUND", campaign: null, programme: null, currency: "EGP", count: 3, gross: "9000.00", net: "9000.00" },
  ].filter((r) => !cur || r.currency === cur);
const donations = Array.from({ length: 23 }, (_, i) => ({
  id: `d${i}`, reference: `DN-STUB${String(i).padStart(7, "0")}`, amount: `${50 + i * 10}.00`, refundedAmount: i % 9 === 0 ? "10.00" : "0.00", netAmount: `${50 + i * 10 - (i % 9 === 0 ? 10 : 0)}.00`,
  currency: "USD", donorId: `dn${i % 4}`, provider: "stubpay", frequency: i % 4 === 0 ? "MONTHLY" : "ONE_TIME", status: "COMPLETED", paymentStatus: i % 9 === 0 ? "PARTIALLY_REFUNDED" : i % 5 === 0 ? "UNPAID" : "PAID",
  isAnonymous: i % 6 === 0, isTest: false, confirmedAt: day(i) + "T10:00:00.000Z", createdAt: day(i) + "T09:00:00.000Z",
  allocations: [i % 3 === 0 ? { designation: "CAMPAIGN", campaign: { titleEn: "Winter Relief" }, programme: null } : i % 3 === 1 ? { designation: "PROGRAMME", campaign: null, programme: { nameEn: "Education" } } : { designation: "GENERAL_FUND", campaign: null, programme: null }],
  donor: { firstName: ["Sara", "Omar", "Layla", "Yusuf"][i % 4], lastName: ["Haddad", "Nasser", "Khalil", "Saleh"][i % 4], organizationName: null },
}));
const audit = [
  ["donation.receipt.issue", "finance@stub.test", "DonationReceipt", 5], ["gala.booking.confirmed", null, "EventBooking", 12], ["campaign.publish", "admin@stub.test", "Campaign", 55], ["gala.checkin.checked_in", "door@stub.test", "EventTicket", 130],
  ["webhook.retry", "finance@stub.test", "PaymentWebhookEvent", 400], ["auth.login", "admin@stub.test", "AdminUser", 1500],
].map(([action, actorEmail, entityType, mins], i) => ({ id: `a${i}`, actorEmail, action, entityType, entityId: `id${i}`, createdAt: new Date(Date.now() - mins * 60_000).toISOString() }));

const campaigns = [
  { id: "c1", slug: "winter-relief", titleEn: "Winter Relief", status: "PUBLISHED", currency: "USD", targetAmount: "10000.00" },
  { id: "c2", slug: "clean-water", titleEn: "Clean Water for Villages", status: "PUBLISHED", currency: "USD", targetAmount: null },
];

const page = (items, q, size) => {
  const p = Number(q.get("page") ?? 1), ps = Number(q.get("pageSize") ?? size);
  return { data: items.slice((p - 1) * ps, p * ps), meta: { page: p, pageSize: ps, total: items.length, totalPages: Math.max(1, Math.ceil(items.length / ps)) } };
};

export function startStub(port = 4000) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const p = url.pathname.replace(/^\/api\/v1/, "");
    state.requests.push(`${req.method} ${p}`);
    const send = (code, body, headers = {}) => { res.writeHead(code, { "Content-Type": "application/json", ...headers }); res.end(JSON.stringify(body)); };
    const err = (code, c) => send(code, { error: { statusCode: code, code: c } });
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => setTimeout(() => {
      if (req.method === "POST" && p === "/admin/auth/login") {
        const b = JSON.parse(raw || "{}");
        const u = ROLES[b.email];
        if (!u || b.password !== "stub-password") return err(401, "INVALID_CREDENTIALS");
        state.expired = false;
        return send(200, { data: { user: { id: "u1", email: b.email, name: u.name, roles: u.roles, permissions: u.permissions, isSuperAdmin: false, mustChangePassword: false }, csrfToken: "stub-csrf", expiresAt: new Date(Date.now() + 3600_000).toISOString() } }, { "Set-Cookie": `meki_admin_sid=${encodeURIComponent(b.email)}; Path=/; HttpOnly; SameSite=Strict` });
      }
      const email = decodeURIComponent((req.headers.cookie ?? "").match(/meki_admin_sid=([^;]+)/)?.[1] ?? "");
      const u = ROLES[email];
      if (!u || state.expired) return err(401, "UNAUTHORIZED");
      const need = (perm) => u.permissions.includes(perm);
      const fail = [...state.fail].find((f) => p.includes(f));
      if (fail) return err(500, "INTERNAL");
      const cur = url.searchParams.get("currency");
      if (p === "/admin/auth/me") return send(200, { data: { id: "u1", email, name: u.name, roles: u.roles, permissions: u.permissions, isSuperAdmin: false, mustChangePassword: false } });
      if (p === "/admin/auth/csrf") return send(200, { data: { csrfToken: "stub-csrf" } });
      if (p === "/admin/auth/logout") return req.headers["x-csrf-token"] === "stub-csrf" ? send(200, { data: { loggedOut: true } }, { "Set-Cookie": "meki_admin_sid=; Path=/; Max-Age=0" }) : err(403, "CSRF_INVALID");
      const raw2 = (code, type, body) => { res.writeHead(code, { "Content-Type": type }); res.end(body); };
      let body = {};
      try { body = JSON.parse(raw || "{}"); } catch { /* ignore */ }
      if (financeRoute({ p, url, method: req.method, body, headers: req.headers, send, err, raw: raw2, need, userId: "u1", donations, audit })) return;
      if (p.startsWith("/admin/reports")) {
        if (!need("reports.read")) return err(403, "FORBIDDEN");
        if (p.endsWith("/summary")) return send(200, { data: summary(cur) });
        if (p.endsWith("/by-date")) return send(200, { data: byDate.filter((r) => !cur || r.currency === cur) });
        if (p.endsWith("/by-campaign")) return send(200, { data: byCampaign(cur) });
      }
      if (p === "/admin/donations") {
        if (!need("donations.read")) return err(403, "FORBIDDEN");
        const s = (url.searchParams.get("search") ?? "").toUpperCase(), st = url.searchParams.get("paymentStatus");
        let items = filterDonations(donations, url.searchParams).filter((d) => (!s || d.reference.includes(s)) && (!st || d.paymentStatus === st));
        if (!need("donors.read")) items = items.map(({ donor: _d, ...rest }) => rest);
        return send(200, page(items, url.searchParams, 8));
      }
      if (p === "/admin/donors") return need("donors.read") ? send(200, page(Array.from({ length: 128 }, (_, i) => ({ id: i })), url.searchParams, 20)) : err(403, "FORBIDDEN");
      if (p === "/admin/programmes") return need("programmes.read") ? send(200, page(Array.from({ length: 6 }, (_, i) => ({ id: i })), url.searchParams, 20)) : err(403, "FORBIDDEN");
      if (p === "/admin/campaigns") return need("campaigns.read") ? send(200, page(campaigns, url.searchParams, 20)) : err(403, "FORBIDDEN");
      if (p === "/admin/audit-logs") return need("audit.read") ? send(200, page(audit, url.searchParams, 6)) : err(403, "FORBIDDEN");
      if (p === "/admin/events") return need("events.read") ? send(200, page([{ id: "ev1", code: "EVT-GALA-NIGHT", slug: "gala-night", titleEn: "MEKI Gala Night" }], url.searchParams, 5)) : err(403, "FORBIDDEN");
      if (p === "/admin/events/ev1/financials") return need("gala.bookings.read") ? send(200, { data: { classification: "EVENT_TICKET_PAYMENT", currency: "USD", grossCaptured: "11250.00", refunded: "750.00", net: "10500.00", capturedPayments: 9, refundPayments: 1, bookingsByStatus: { CONFIRMED: 8, PENDING: 3, REFUNDED: 1 }, ticketsByStatus: { ISSUED: 10, CHECKED_IN: 4, PENDING: 3, REFUNDED: 1 } } }) : err(403, "FORBIDDEN");
      if (p === "/admin/events/ev1/ticketing") return send(200, { data: { capacity: null, currency: "USD" } });
      if (p === "/admin/events/ev1/check-in/statistics") return need("gala.checkin.validate") ? send(200, { data: { validTickets: 14, checkedIn: 4, remaining: 10, percentCheckedIn: 28.6 } }) : err(403, "FORBIDDEN");
      err(404, "NOT_FOUND");
    }, state.delayMs));
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}

if (process.env.STUB_RUN) {
  await startStub(Number(process.env.STUB_PORT ?? 4000));
  console.log("stub admin API listening");
  await new Promise(() => {});
}
