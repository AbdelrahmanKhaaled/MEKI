// TEST FIXTURE ONLY — Phase 6B endpoints for the FAKE-data stub API (see stub-api.mjs). Every value here is invented for
// browser testing, is never served by the app and never touches a database. Shapes mirror the NestJS services exactly.

const day = (n) => new Date(Date.UTC(2026, 10, 17) - n * 86_400_000).toISOString();
export const fin = {
  /** when true the stub reports a live, refund-capable (FAKE) provider so the enabled refund path can be exercised */
  liveProvider: false,
  posts: [],
};

const PROVIDERS = () => [
  { code: "stubpay", displayName: "Stub Gateway (FAKE)", isEnabled: fin.liveProvider, isTestProvider: false, supportsRecurring: true, supportsRefunds: true, supportsPartialRefund: true, configuredOnServer: fin.liveProvider, activeOnServer: fin.liveProvider },
  { code: "mock", displayName: "Mock (test)", isEnabled: true, isTestProvider: true, supportsRecurring: true, supportsRefunds: true, supportsPartialRefund: true, configuredOnServer: !fin.liveProvider, activeOnServer: !fin.liveProvider },
  { code: "zeffy", displayName: "Zeffy", isEnabled: false, isTestProvider: false, supportsRecurring: true, supportsRefunds: false, supportsPartialRefund: false, configuredOnServer: false, activeOnServer: false },
];
const CURRENCIES = [{ code: "USD", isEnabled: true, minorUnits: 2 }, { code: "EGP", isEnabled: true, minorUnits: 2 }];

export const donors = Array.from({ length: 128 }, (_, i) => ({
  id: `dn${i}`, firstName: ["Sara", "Omar", "Layla", "Yusuf"][i % 4], lastName: ["Haddad", "Nasser", "Khalil", "Saleh"][i % 4], email: `donor${i}@example.invalid`,
  phone: i % 3 === 0 ? "+20 100 000 0000" : null, countryCode: "EG", donorType: i % 10 === 0 ? "ORGANIZATION" : "INDIVIDUAL", organizationName: i % 10 === 0 ? "Fake Org Ltd" : null,
  preferredLocale: i % 2 ? "ar" : "en", marketingConsent: i % 4 === 0, anonymizedAt: null, createdAt: day(i), _count: { donations: (i % 5) + 1 },
}));
const donorDetail = (d) => {
  const { _count, ...rest } = d;
  void _count;
  return {
    ...rest, addressLine1: "1 Fake Street", addressLine2: null, city: "Cairo", region: null, postalCode: null, marketingConsentAt: d.marketingConsent ? day(40) : null, privacyConsentAt: day(40), privacyPolicyVersion: "v1-draft", updatedAt: day(1),
    donations: [
      { id: "d0", reference: "DN-STUB0000000", amount: "50.00", refundedAmount: "10.00", currency: "USD", frequency: "MONTHLY", status: "COMPLETED", paymentStatus: "PARTIALLY_REFUNDED", isTest: false, confirmedAt: day(0), createdAt: day(0) },
      { id: "d1", reference: "DN-STUB0000001", amount: "60.00", refundedAmount: "0.00", currency: "USD", frequency: "ONE_TIME", status: "COMPLETED", paymentStatus: "PAID", isTest: false, confirmedAt: day(1), createdAt: day(1) },
      { id: "d90", reference: "DN-STUBEGP0001", amount: "4000.00", refundedAmount: "0.00", currency: "EGP", frequency: "ONE_TIME", status: "COMPLETED", paymentStatus: "PAID", isTest: false, confirmedAt: day(3), createdAt: day(3) },
      { id: "d91", reference: "DN-STUBPEND001", amount: "999.00", refundedAmount: "0.00", currency: "USD", frequency: "ONE_TIME", status: "PENDING", paymentStatus: "UNPAID", isTest: false, confirmedAt: null, createdAt: day(2) },
      { id: "d92", reference: "DN-STUBTEST001", amount: "777.00", refundedAmount: "0.00", currency: "USD", frequency: "ONE_TIME", status: "COMPLETED", paymentStatus: "PAID", isTest: true, confirmedAt: day(2), createdAt: day(2) },
    ],
    recurringDonations: [{ id: "rd1", reference: "RD-STUB0001", amount: "25.00", currency: "USD", status: "ACTIVE", nextBillingDate: day(-10) }],
  };
};

const refunds = [
  { id: "rf1", reference: "RF-STUB0001", donationId: "d0", amount: "10.00", currency: "USD", reason: "Donor asked by e-mail (FAKE)", status: "SUCCEEDED", requestedById: "u-other", decidedById: "u1", decisionNote: "ok", executedById: "u1", provider: "stubpay", providerRefundRef: "re_fake_1", failureReason: null, requestedAt: day(5), decidedAt: day(5), executedAt: day(5), completedAt: day(4) },
  { id: "rf2", reference: "RF-STUB0002", donationId: "d1", amount: "20.00", currency: "USD", reason: "Duplicate gift (FAKE)", status: "REQUESTED", requestedById: "u-other", decidedById: null, decisionNote: null, executedById: null, provider: "stubpay", providerRefundRef: null, failureReason: null, requestedAt: day(1), decidedAt: null, executedAt: null, completedAt: null },
  { id: "rf3", reference: "RF-STUB0003", donationId: "d1", amount: "5.00", currency: "USD", reason: "My own request (FAKE)", status: "REQUESTED", requestedById: "u1", decidedById: null, decisionNote: null, executedById: null, provider: "stubpay", providerRefundRef: null, failureReason: null, requestedAt: day(1), decidedAt: null, executedAt: null, completedAt: null },
];
const txs = Array.from({ length: 25 }, (_, i) => ({
  id: `t${i}`, donationId: `d${i % 23}`, paymentAttemptId: `pa${i}`, refundId: null, webhookEventId: `w${i}`, provider: i % 5 === 0 ? "mock" : "stubpay", providerTransactionRef: `ch_fake_${String(i).padStart(4, "0")}_${"x".repeat(i % 3 ? 4 : 30)}`,
  type: i % 7 === 0 ? "FAILURE" : "CAPTURE", status: i % 7 === 0 ? "FAILED" : "SUCCEEDED", amount: `${50 + i * 10}.00`, currency: i % 6 === 0 ? "EGP" : "USD", settlementAmount: null, settlementCurrency: null, feeAmount: i % 2 ? "1.50" : null,
  failureCode: i % 7 === 0 ? "card_declined" : null, isTest: i % 5 === 0, occurredAt: day(i), createdAt: day(i), donation: { reference: `DN-STUB${String(i % 23).padStart(7, "0")}` },
}));
const events = Array.from({ length: 6 }, (_, i) => ({ id: `w${i}`, provider: i === 5 ? "mock" : "stubpay", providerEventId: `evt_fake_${i}`, eventType: i === 3 ? "refund.succeeded" : "payment.succeeded", signatureVerified: i !== 4, status: i === 4 ? "FAILED" : "PROCESSED", attempts: i === 4 ? 3 : 1, lastError: i === 4 ? "Signature mismatch (FAKE)" : null, receivedAt: day(i), processedAt: i === 4 ? null : day(i) }));
const recurring = [
  { id: "rd1", reference: "RD-STUB0001", donorId: "dn0", designation: "CAMPAIGN", campaignId: "c1", programmeId: null, amount: "25.00", currency: "USD", interval: "MONTHLY", intervalCount: 1, status: "ACTIVE", provider: "stubpay", providerAgreementRef: "sub_fake_1", isTest: false, startDate: day(90), nextBillingDate: day(-10), lastChargedAt: day(20), failedAttemptCount: 0, maxRetryAttempts: 3, pausedAt: null, cancelledAt: null, cancelReason: null, createdAt: day(90) },
  { id: "rd2", reference: "RD-STUB0002", donorId: "dn1", designation: "GENERAL_FUND", campaignId: null, programmeId: null, amount: "500.00", currency: "EGP", interval: "MONTHLY", intervalCount: 1, status: "PAUSED", provider: "stubpay", providerAgreementRef: "sub_fake_2", isTest: false, startDate: day(60), nextBillingDate: null, lastChargedAt: day(30), failedAttemptCount: 1, maxRetryAttempts: 3, pausedAt: day(10), cancelledAt: null, cancelReason: null, createdAt: day(60) },
  { id: "rd3", reference: "RD-STUBTEST1", donorId: "dn2", designation: "GENERAL_FUND", campaignId: null, programmeId: null, amount: "10.00", currency: "USD", interval: "MONTHLY", intervalCount: 1, status: "CANCELLED", provider: "mock", providerAgreementRef: null, isTest: true, startDate: null, nextBillingDate: null, lastChargedAt: null, failedAttemptCount: 0, maxRetryAttempts: 3, pausedAt: null, cancelledAt: day(5), cancelReason: "Test (FAKE)", createdAt: day(30) },
];
const receipts = [
  { id: "rc1", receiptNumber: "MEKI-2026-000001", donationId: "d1", version: 1, status: "ISSUED", locale: "en", issuedAt: day(1), voidedAt: null, replacesReceiptId: null, donation: { reference: "DN-STUB0000001", isTest: false } },
  { id: "rc0", receiptNumber: "MEKI-2026-000000", donationId: "d0", version: 1, status: "VOID", locale: "ar", issuedAt: day(2), voidedAt: day(1), replacesReceiptId: null, donation: { reference: "DN-STUB0000000", isTest: false } },
  { id: "rc9", receiptNumber: "TEST-MEKI-2026-000009", donationId: "d92", version: 1, status: "ISSUED", locale: "en", issuedAt: day(2), voidedAt: null, replacesReceiptId: null, donation: { reference: "DN-STUBTEST001", isTest: true } },
];

const page = (items, q, size = 20) => {
  const p = Number(q.get("page") ?? 1), ps = Number(q.get("pageSize") ?? size);
  return { data: items.slice((p - 1) * ps, p * ps), meta: { page: p, pageSize: ps, total: items.length, totalPages: Math.max(1, Math.ceil(items.length / ps)) } };
};

/** Detail view of a stub donation row (dashboard dataset) as GET /admin/donations/:id returns it. */
function donationDetail(d) {
  const isCap = ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(d.paymentStatus);
  return {
    ...d,
    donorMessage: d.id === "d1" ? "Keep up the good work (FAKE)" : null,
    attempts: [{ id: `pa-${d.id}`, reference: `PA-${d.reference.slice(3)}`, provider: d.provider, providerSessionRef: `cs_fake_${d.id}`, providerPaymentRef: isCap ? `pi_fake_${d.id}` : null, amount: d.amount, currency: d.currency, status: isCap ? "SUCCEEDED" : "CREATED", failureCode: null, failureReason: null, isTest: d.isTest, initiatedAt: d.createdAt, expiresAt: null, completedAt: d.confirmedAt }],
    transactions: isCap ? [{ id: `tx-${d.id}`, donationId: d.id, paymentAttemptId: `pa-${d.id}`, refundId: null, webhookEventId: "w0", provider: d.provider, providerTransactionRef: `ch_fake_${d.id}`, type: "CAPTURE", status: "SUCCEEDED", amount: d.amount, currency: d.currency, settlementAmount: null, settlementCurrency: null, feeAmount: "1.50", failureCode: null, isTest: d.isTest, occurredAt: d.confirmedAt }] : [],
    refunds: refunds.filter((r) => r.donationId === d.id),
    receipts: receipts.filter((r) => r.donationId === d.id).map((r) => { const { donation, ...rest } = r; void donation; return rest; }),
    recurringDonation: d.id === "d0" ? { id: "rd1", reference: "RD-STUB0001", status: "ACTIVE" } : null,
    sourceEvent: null,
    utm: { source: d.id === "d1" ? "newsletter" : null, medium: null, campaign: null },
  };
}

/**
 * Handles Phase 6B paths. Returns true when the request was answered.
 * ctx: { p, url, method, body, headers, send, err, need, userId, donations, audit, campaigns }
 */
export function financeRoute(ctx) {
  const { p, url, method, body, headers, send, err, need, donations, audit } = ctx;
  const q = url.searchParams;
  const csrfOk = headers["x-csrf-token"] === "stub-csrf";
  const post = (perm, fn) => {
    if (method !== "POST") return err(405, "METHOD"), true;
    if (!need(perm)) return err(403, "FORBIDDEN"), true;
    if (!csrfOk) return err(403, "CSRF_INVALID"), true;
    fin.posts.push({ path: p, body, csrf: headers["x-csrf-token"] });
    fn();
    return true;
  };
  let m;
  if ((m = /^\/admin\/donations\/([^/]+)\/refunds$/.exec(p))) {
    return post("refunds.request", () => {
      const r = { id: `rf-new${fin.posts.length}`, reference: `RF-NEWSTUB${fin.posts.length}`, donationId: m[1], amount: body.amount, currency: "USD", reason: body.reason, status: "REQUESTED", requestedById: ctx.userId, decidedById: null, decisionNote: null, executedById: null, provider: "stubpay", providerRefundRef: null, failureReason: null, requestedAt: new Date().toISOString(), decidedAt: null, executedAt: null, completedAt: null };
      refunds.push(r);
      send(201, { data: { ...r, donation: { reference: "DN-STUB", amount: "60.00", refundedAmount: "0.00", currency: "USD" }, requestedBy: { id: ctx.userId, name: "You" }, decidedBy: null } });
    });
  }
  if ((m = /^\/admin\/donations\/([^/]+)$/.exec(p))) {
    if (!need("donations.read")) return err(403, "FORBIDDEN"), true;
    const d = donations.find((x) => x.id === m[1]);
    if (!d) return err(404, "NOT_FOUND"), true;
    let detail = donationDetail(d);
    if (!need("donors.read")) detail = { ...detail, donor: undefined };
    return send(200, { data: detail }), true;
  }
  if (p === "/admin/donors") {
    if (!need("donors.read")) return err(403, "FORBIDDEN"), true;
    const s = (q.get("search") ?? "").toLowerCase();
    return send(200, page(donors.filter((d) => !s || d.email.includes(s) || d.lastName.toLowerCase().includes(s) || d.firstName.toLowerCase().includes(s)), q)), true;
  }
  if ((m = /^\/admin\/donors\/([^/]+)$/.exec(p))) {
    if (!need("donors.read")) return err(403, "FORBIDDEN"), true;
    const d = donors.find((x) => x.id === m[1]);
    return d ? send(200, { data: donorDetail(d) }) : err(404, "NOT_FOUND"), true;
  }
  if (p === "/admin/refunds") {
    if (!need("donations.read")) return err(403, "FORBIDDEN"), true;
    const st = q.get("status"), s = (q.get("search") ?? "").toUpperCase();
    return send(200, page(refunds.filter((r) => (!st || r.status === st) && (!s || r.reference.includes(s))).map((r) => ({ ...r, donation: { reference: `DN-STUB000000${r.donationId.slice(1)}`, isTest: false } })), q)), true;
  }
  if ((m = /^\/admin\/refunds\/([^/]+)\/(approve|reject|execute)$/.exec(p))) {
    const perm = m[2] === "execute" ? "refunds.execute" : "refunds.approve";
    return post(perm, () => {
      const r = refunds.find((x) => x.id === m[1]);
      if (!r) return err(404, "NOT_FOUND");
      if (m[2] !== "execute" && r.requestedById === ctx.userId) return err(403, "FOUR_EYES_REQUIRED");
      r.status = m[2] === "approve" ? "APPROVED" : m[2] === "reject" ? "REJECTED" : "PROCESSING";
      r.decidedAt ??= new Date().toISOString();
      send(200, { data: { ...r, donation: { reference: "DN-STUB0000001", amount: "60.00", refundedAmount: "0.00", currency: "USD" }, requestedBy: { id: r.requestedById, name: "Other Admin" }, decidedBy: { id: ctx.userId, name: "You" } } });
    });
  }
  if ((m = /^\/admin\/refunds\/([^/]+)$/.exec(p))) {
    if (!need("donations.read")) return err(403, "FORBIDDEN"), true;
    const r = refunds.find((x) => x.id === m[1]);
    if (!r) return err(404, "NOT_FOUND"), true;
    return send(200, { data: { ...r, donation: { reference: `DN-STUB000000${r.donationId.slice(1)}`, amount: "60.00", refundedAmount: r.status === "SUCCEEDED" ? r.amount : "0.00", currency: "USD" }, requestedBy: { id: r.requestedById, name: r.requestedById === ctx.userId ? "You" : "Other Admin" }, decidedBy: r.decidedById ? { id: r.decidedById, name: "You" } : null } }), true;
  }
  if (p === "/admin/payments/transactions") {
    if (!need("payments.read")) return err(403, "FORBIDDEN"), true;
    const t = q.get("type"), st = q.get("status"), c = q.get("currency"), pr = q.get("provider"), s = q.get("search") ?? "";
    return send(200, page(txs.filter((x) => (!t || x.type === t) && (!st || x.status === st) && (!c || x.currency === c) && (!pr || x.provider === pr) && (!s || x.providerTransactionRef.includes(s))), q)), true;
  }
  if ((m = /^\/admin\/payments\/transactions\/([^/]+)$/.exec(p))) {
    if (!need("payments.read")) return err(403, "FORBIDDEN"), true;
    const x = txs.find((y) => y.id === m[1]);
    return x ? send(200, { data: x }) : err(404, "NOT_FOUND"), true;
  }
  if (p === "/admin/payments/webhook-events") return need("payments.read") ? send(200, page(events.filter((e) => !q.get("status") || e.status === q.get("status")), q)) : err(403, "FORBIDDEN"), true;
  if (p === "/admin/payments/providers") return need("payments.read") ? send(200, { data: PROVIDERS() }) : err(403, "FORBIDDEN"), true;
  if (p === "/admin/payments/currencies") return need("settings.read") ? send(200, { data: CURRENCIES }) : err(403, "FORBIDDEN"), true;
  if (p === "/admin/recurring-donations") {
    if (!need("recurring.read")) return err(403, "FORBIDDEN"), true;
    const st = q.get("status"), c = q.get("currency");
    return send(200, page(recurring.filter((r) => (!st || r.status === st) && (!c || r.currency === c)), q)), true;
  }
  if ((m = /^\/admin\/recurring-donations\/([^/]+)\/(pause|resume|cancel)$/.exec(p))) {
    return post("recurring.manage", () => {
      const r = recurring.find((x) => x.id === m[1]);
      if (!r) return err(404, "NOT_FOUND");
      r.status = m[2] === "pause" ? "PAUSED" : m[2] === "resume" ? "ACTIVE" : "CANCELLED";
      send(200, { data: { ...r, campaign: null, programme: null, paymentHistory: [] } });
    });
  }
  if ((m = /^\/admin\/recurring-donations\/([^/]+)$/.exec(p))) {
    if (!need("recurring.read")) return err(403, "FORBIDDEN"), true;
    const r = recurring.find((x) => x.id === m[1]);
    if (!r) return err(404, "NOT_FOUND"), true;
    const paymentHistory = r.id === "rd1" ? [
      { id: "d0", reference: "DN-STUB0000000", amount: "25.00", currency: "USD", status: "COMPLETED", paymentStatus: "PAID", confirmedAt: day(50), createdAt: day(50) },
      { id: "d4", reference: "DN-STUB0000004", amount: "25.00", currency: "USD", status: "COMPLETED", paymentStatus: "PAID", confirmedAt: day(20), createdAt: day(20) },
      { id: "d8", reference: "DN-STUB0000008", amount: "25.00", currency: "USD", status: "FAILED", paymentStatus: "FAILED", confirmedAt: null, createdAt: day(5) },
    ] : [];
    return send(200, { data: { ...r, campaign: r.campaignId ? { id: "c1", slug: "winter-relief", titleEn: "Winter Relief" } : null, programme: null, paymentHistory } }), true;
  }
  if (p === "/admin/receipts") {
    if (!need("receipts.read")) return err(403, "FORBIDDEN"), true;
    const st = q.get("status");
    return send(200, page(receipts.filter((r) => !st || r.status === st), q)), true;
  }
  if ((m = /^\/admin\/receipts\/([^/]+)\/document$/.exec(p))) {
    if (!need("receipts.read")) return err(403, "FORBIDDEN"), true;
    ctx.raw(200, "text/html; charset=utf-8", `<!doctype html><title>FAKE receipt ${m[1]}</title><p>STUB RECEIPT DOCUMENT (FAKE)</p>`);
    return true;
  }
  if ((m = /^\/admin\/receipts\/([^/]+)$/.exec(p))) {
    if (!need("receipts.read")) return err(403, "FORBIDDEN"), true;
    const r = receipts.find((x) => x.id === m[1]);
    if (!r) return err(404, "NOT_FOUND"), true;
    const { donation, ...rest } = r;
    return send(200, { data: { ...rest, issuedById: null, voidReason: r.status === "VOID" ? "Name correction (FAKE)" : null, snapshot: { receiptNumber: r.receiptNumber, issuedAt: r.issuedAt, isTest: donation.isTest, donation: { reference: donation.reference, amount: "60.00", currency: "USD", frequency: "ONE_TIME", confirmedAt: r.issuedAt }, donor: { name: "Omar Nasser", organizationName: null, countryCode: "EG" }, purpose: { designation: "GENERAL_FUND", titleEn: null, titleAr: null }, issuer: { nameEn: "MEKI", nameAr: null, addressEn: null, addressAr: null, taxIdLabel: null, taxId: null }, footerEn: null, footerAr: null } } }), true;
  }
  if (p === "/admin/reports/refunds") return need("reports.read") ? send(200, { data: [{ status: "SUCCEEDED", currency: "USD", count: 1, amount: "10.00" }, { status: "REQUESTED", currency: "USD", count: 2, amount: "25.00" }] }) : err(403, "FORBIDDEN"), true;
  if (p === "/admin/reports/recurring") return need("reports.read") ? send(200, { data: [{ status: "ACTIVE", currency: "USD", count: 1, monthlyAmount: "25.00" }, { status: "PAUSED", currency: "EGP", count: 1, monthlyAmount: "500.00" }] }) : err(403, "FORBIDDEN"), true;
  if (p === "/admin/audit-logs" && q.get("entityType")) {
    if (!need("audit.read")) return err(403, "FORBIDDEN"), true;
    const rows = audit.slice(0, 2).map((a, i) => ({ ...a, id: `${a.id}-${q.get("entityId")}`, action: ["refund.request", "refund.approve"][i], entityType: q.get("entityType"), entityId: q.get("entityId") }));
    return send(200, page(rows, q)), true;
  }
  return false;
}

/** Extra filters for the dashboard's donation list stub (6A only sends page/search/paymentStatus, so its results are unchanged). */
export function filterDonations(items, q) {
  const st = q.get("status"), fr = q.get("frequency"), c = q.get("currency"), from = q.get("from"), to = q.get("to"), camp = q.get("campaignId");
  return items.filter((d) => (!st || d.status === st) && (!fr || d.frequency === fr) && (!c || d.currency === c) && (!from || d.createdAt >= from) && (!to || d.createdAt <= to) && (!camp || (camp === "c1" && d.allocations[0]?.campaign?.titleEn === "Winter Relief")));
}
