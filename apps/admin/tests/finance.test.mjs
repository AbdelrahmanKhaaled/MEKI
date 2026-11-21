// Phase 6B unit tests — run with: pnpm --filter @meki/admin test   (Node built-in runner, native TS type stripping)
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test, { describe } from "node:test";
import {
  addMoney, clampPage, cleanQuery, cmpMoney, confirmedTotalsByCurrency, dayRange, designationOf, donorName, isConfirmedPayment, isTestProviderCode, isTestReceiptNumber, isValidAmount,
  providerState, receiptAvailability, recurringActions, recurringCollected, refundableBalance, refundDecisionGate, refundExecuteGate, refundRequestGate, statusTone, subMoney, unitsToDecimal,
} from "../src/lib/finance.ts";
import {
  DonationDetailSchema, DonationListRowSchema, DonorDetailSchema, DonorRowSchema, ProviderSchema, ReceiptDetailSchema, ReceiptRowSchema, RecurringDetailSchema, RecurringRowSchema,
  RefundDetailSchema, RefundRowSchema, TransactionSchema, WebhookEventSchema,
} from "../src/lib/finance-schemas.ts";
import { toUnits } from "../src/lib/metrics.ts";
import { NAV, can, visibleNav } from "../src/lib/navigation.ts";
import { ar, en } from "../src/lib/i18n.ts";

// ── fixtures shaped exactly like the NestJS responses (see finance-schemas.ts header for the source files) ──
const LIVE = { code: "live", displayName: "Live Gateway", isEnabled: true, isTestProvider: false, supportsRecurring: true, supportsRefunds: true, supportsPartialRefund: true, configuredOnServer: true, activeOnServer: true };
const MOCK = { ...LIVE, code: "mock", displayName: "Mock", isTestProvider: true };
const ZEFFY_SEEDED = { ...LIVE, code: "zeffy", displayName: "Zeffy", isEnabled: false, configuredOnServer: false, activeOnServer: false };
const donationRow = {
  id: "d1", reference: "DN-ABC123", amount: "100.00", refundedAmount: "25.50", netAmount: "74.50", currency: "USD", frequency: "ONE_TIME", status: "COMPLETED", paymentStatus: "PARTIALLY_REFUNDED",
  isAnonymous: false, donorMessage: null, provider: "live", isTest: false, source: "landing", confirmedAt: "2026-11-01T10:00:00.000Z", createdAt: "2026-11-01T09:59:00.000Z",
  allocations: [{ designation: "CAMPAIGN", campaign: { id: "c1", titleEn: "Winter Relief", slug: "winter" }, programme: null, amount: "100.00", currency: "USD" }],
  donorId: "dn1", donor: { id: "dn1", firstName: "Sara", lastName: "Haddad", email: "sara@example.org", organizationName: null, countryCode: "EG", anonymizedAt: null },
};
const refund = (o = {}) => ({ id: "r1", reference: "RF-1", donationId: "d1", amount: "10.00", currency: "USD", reason: "Donor request", status: "REQUESTED", requestedById: "u-req", decidedById: null, decisionNote: null, executedById: null, provider: "live", providerRefundRef: null, failureReason: null, requestedAt: "2026-11-02T00:00:00.000Z", decidedAt: null, executedAt: null, completedAt: null, ...o });

describe("decimal money arithmetic (BigInt, never floating point)", () => {
  test("0.1 + 0.2 is exactly 0.30 and 3-decimal currencies keep their precision", () => {
    assert.equal(addMoney("0.1", "0.2"), "0.30");
    assert.equal(addMoney("1.005", "2.001"), "3.006");
    assert.equal(subMoney("100.00", "25.50"), "74.50");
    assert.equal(unitsToDecimal(toUnits("-5")), "-5.00");
    assert.equal(cmpMoney("10.00", "10"), 0);
    assert.equal(cmpMoney("10.01", "10"), 1);
  });
  test("large sums do not drift", () => {
    const many = Array.from({ length: 10_000 }, () => "0.01");
    assert.equal(addMoney(...many), "100.00");
    assert.equal(addMoney("999999999999.999", "0.001"), "1000000000000.00");
  });
  test("amount validation follows the currency's minor units", () => {
    assert.equal(isValidAmount("10", 2), true);
    assert.equal(isValidAmount("10.55", 2), true);
    assert.equal(isValidAmount("10.555", 2), false);
    assert.equal(isValidAmount("10.555", 3), true);
    assert.equal(isValidAmount("0", 2), false);
    assert.equal(isValidAmount("-1", 2), false);
    assert.equal(isValidAmount("1e3", 2), false);
    assert.equal(isValidAmount("abc", 2), false);
  });
});

describe("currency separation and confirmed totals", () => {
  const rows = [
    { amount: "100.00", refundedAmount: "0", currency: "USD", paymentStatus: "PAID" },
    { amount: "50.00", refundedAmount: "50.00", currency: "USD", paymentStatus: "REFUNDED" },
    { amount: "30.00", refundedAmount: "10.00", currency: "USD", paymentStatus: "PARTIALLY_REFUNDED" },
    { amount: "999.00", refundedAmount: "0", currency: "USD", paymentStatus: "UNPAID" }, // pending — never revenue
    { amount: "999.00", refundedAmount: "0", currency: "USD", paymentStatus: "FAILED" }, // failed — never revenue
    { amount: "5000.00", refundedAmount: "0", currency: "USD", paymentStatus: "PAID", isTest: true }, // test — excluded
    { amount: "9000.00", refundedAmount: "0", currency: "EGP", paymentStatus: "PAID" },
  ];
  test("only verified, non-test payments count; refunds are subtracted; currencies stay apart", () => {
    const t = confirmedTotalsByCurrency(rows);
    assert.deepEqual(t, [
      { currency: "EGP", count: 1, gross: "9000.00", refunded: "0.00", net: "9000.00" },
      { currency: "USD", count: 3, gross: "180.00", refunded: "60.00", net: "120.00" },
    ]);
    assert.ok(!t.some((r) => r.gross === "9180.00"), "USD and EGP are never added together");
  });
  test("confirmed-payment classification", () => {
    for (const s of ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"]) assert.equal(isConfirmedPayment(s), true, s);
    for (const s of ["UNPAID", "AUTHORIZED", "FAILED", "X"]) assert.equal(isConfirmedPayment(s), false, s);
  });
});

describe("status mapping", () => {
  test("statuses map to tones; unknown values are neutral, never a success", () => {
    assert.equal(statusTone("payment", "PAID"), "ok");
    assert.equal(statusTone("payment", "FAILED"), "danger");
    assert.equal(statusTone("donation", "PENDING"), "warn");
    assert.equal(statusTone("refund", "PROCESSING"), "info");
    assert.equal(statusTone("refund", "SUCCEEDED"), "ok");
    assert.equal(statusTone("recurring", "ACTIVE"), "ok");
    assert.equal(statusTone("webhook", "FAILED"), "danger");
    assert.equal(statusTone("payment", "SOMETHING_NEW"), "neutral");
  });
  test("every backend enum value has an EN and AR label", () => {
    const enums = {
      donation: ["PENDING", "COMPLETED", "FAILED", "CANCELLED", "EXPIRED"],
      payment: ["UNPAID", "AUTHORIZED", "PAID", "PARTIALLY_REFUNDED", "REFUNDED", "FAILED"],
      attempt: ["CREATED", "REQUIRES_ACTION", "AUTHORIZED", "SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"],
      txType: ["AUTHORIZATION", "CAPTURE", "FAILURE", "CANCELLATION", "REFUND"],
      refund: ["REQUESTED", "APPROVED", "REJECTED", "PROCESSING", "SUCCEEDED", "FAILED"],
      recurring: ["PENDING_ACTIVATION", "ACTIVE", "PAUSED", "PAST_DUE", "CANCELLED", "FAILED"],
      receipt: ["ISSUED", "VOID"],
      webhook: ["RECEIVED", "PROCESSED", "IGNORED", "FAILED"],
    };
    for (const [k, vals] of Object.entries(enums)) for (const v of vals) assert.ok(en.fin.statuses[k][v] && ar.fin.statuses[k][v], `${k}.${v}`);
  });
  test("designation and donor naming", () => {
    assert.deepEqual(designationOf(donationRow.allocations), { kind: "CAMPAIGN", title: "Winter Relief" });
    assert.deepEqual(designationOf([{ designation: "GENERAL_FUND", campaign: null, programme: null }]), { kind: "GENERAL_FUND", title: null });
    assert.deepEqual(designationOf([]), { kind: "NONE", title: null });
    assert.equal(donorName({ firstName: "Sara", lastName: "Haddad" }), "Sara Haddad");
    assert.equal(donorName({ firstName: "A", lastName: "B", organizationName: "Org" }), "Org");
    assert.equal(donorName(undefined), null);
  });
});

describe("refund permissions and gating (never simulated, never on test/unknown providers)", () => {
  const dn = { ...donationRow, refunds: [] };
  test("a live, refund-capable provider + permission + confirmed balance → allowed", () => {
    assert.deepEqual(refundRequestGate({ canRequest: true, donation: dn, providers: [LIVE] }), { allowed: true, reasons: [] });
  });
  test("missing permission", () => assert.deepEqual(refundRequestGate({ canRequest: false, donation: dn, providers: [LIVE] }).reasons, ["permission"]));
  test("test record or test provider → blocked", () => {
    assert.ok(refundRequestGate({ canRequest: true, donation: { ...dn, isTest: true }, providers: [LIVE] }).reasons.includes("testRecord"));
    assert.ok(refundRequestGate({ canRequest: true, donation: { ...dn, provider: "mock" }, providers: [MOCK] }).reasons.includes("providerNotLive"));
  });
  test("provider seeded in the DB but not configured on the server (e.g. Zeffy) is NOT live", () => {
    assert.ok(refundRequestGate({ canRequest: true, donation: { ...dn, provider: "zeffy" }, providers: [ZEFFY_SEEDED] }).reasons.includes("providerNotLive"));
    assert.equal(providerState([ZEFFY_SEEDED]).live, null);
    assert.equal(providerState([ZEFFY_SEEDED]).none, true);
  });
  test("provider state cannot be verified without payments.read → blocked", () => {
    assert.ok(refundRequestGate({ canRequest: true, donation: dn, providers: null }).reasons.includes("providerUnknown"));
  });
  test("unconfirmed donation and exhausted balance (open refunds counted)", () => {
    assert.ok(refundRequestGate({ canRequest: true, donation: { ...dn, paymentStatus: "UNPAID" }, providers: [LIVE] }).reasons.includes("notConfirmed"));
    const open = { ...dn, refunds: [{ amount: "74.50", status: "REQUESTED" }] };
    assert.equal(refundableBalance(open.amount, open.refundedAmount, open.refunds), "0.00");
    assert.ok(refundRequestGate({ canRequest: true, donation: open, providers: [LIVE] }).reasons.includes("noBalance"));
    // closed refunds (rejected/failed) do not reduce the balance; succeeded ones are already in refundedAmount
    assert.equal(refundableBalance("100.00", "25.50", [{ amount: "10", status: "REJECTED" }, { amount: "5", status: "FAILED" }, { amount: "4.50", status: "PROCESSING" }]), "70.00");
  });
  test("four-eyes: own request cannot be approved or rejected; reject needs no provider", () => {
    const base = { canApprove: true, status: "REQUESTED", requestedById: "u1", userId: "u1", isTest: false, provider: "live", providers: [LIVE] };
    assert.ok(refundDecisionGate({ ...base, decision: "approve" }).reasons.includes("ownRequest"));
    assert.ok(refundDecisionGate({ ...base, decision: "reject" }).reasons.includes("ownRequest"));
    assert.equal(refundDecisionGate({ ...base, userId: "u2", decision: "approve" }).allowed, true);
    assert.equal(refundDecisionGate({ ...base, userId: "u2", decision: "reject", provider: "mock", providers: [MOCK], isTest: true }).allowed, true);
    assert.equal(refundDecisionGate({ ...base, userId: "u2", decision: "approve", provider: "mock", providers: [MOCK] }).allowed, false);
    assert.ok(refundDecisionGate({ ...base, userId: "u2", decision: "approve", status: "APPROVED" }).reasons.includes("wrongState"));
  });
  test("execute: APPROVED only, live provider only, permission required", () => {
    const base = { canExecute: true, status: "APPROVED", isTest: false, provider: "live", providers: [LIVE] };
    assert.equal(refundExecuteGate(base).allowed, true);
    assert.ok(refundExecuteGate({ ...base, status: "PROCESSING" }).reasons.includes("wrongState"));
    assert.ok(refundExecuteGate({ ...base, canExecute: false }).reasons.includes("permission"));
    assert.ok(refundExecuteGate({ ...base, providers: [{ ...LIVE, supportsRefunds: false }] }).reasons.includes("providerNoRefunds"));
    assert.ok(refundExecuteGate({ ...base, isTest: true }).reasons.includes("testRecord"));
  });
});

describe("recurring states (commitments are not revenue)", () => {
  test("allowed actions mirror the backend transitions", () => {
    assert.deepEqual(recurringActions("ACTIVE"), ["pause", "cancel"]);
    assert.deepEqual(recurringActions("PAUSED"), ["resume", "cancel"]);
    assert.deepEqual(recurringActions("PAST_DUE"), ["pause", "cancel"]);
    assert.deepEqual(recurringActions("PENDING_ACTIVATION"), ["cancel"]);
    assert.deepEqual(recurringActions("CANCELLED"), []);
    assert.deepEqual(recurringActions("FAILED"), []);
  });
  test("only verified charges in the agreement currency are collected; pending/failed charges are not", () => {
    const h = [
      { amount: "25.00", currency: "USD", paymentStatus: "PAID" },
      { amount: "25.00", currency: "USD", paymentStatus: "PARTIALLY_REFUNDED" },
      { amount: "25.00", currency: "USD", paymentStatus: "UNPAID" },
      { amount: "25.00", currency: "USD", paymentStatus: "FAILED" },
    ];
    assert.deepEqual(recurringCollected(h, "USD", false), { capturedCount: 2, collected: "50.00", notCaptured: 2 });
    assert.equal(recurringCollected(h, "USD", true).collected, null, "test agreements never show collected money");
    assert.equal(recurringCollected([], "USD", false).collected, "0.00");
  });
});

describe("receipt availability (from API data only)", () => {
  test("issued / void-only / not issued / not eligible", () => {
    assert.equal(receiptAvailability("PAID", [{ status: "VOID" }, { status: "ISSUED" }]), "issued");
    assert.equal(receiptAvailability("REFUNDED", [{ status: "VOID" }]), "voidOnly");
    assert.equal(receiptAvailability("PAID", []), "notIssued");
    assert.equal(receiptAvailability("UNPAID", []), "notEligible");
    assert.equal(isTestReceiptNumber("TEST-MEKI-2026-000001"), true);
    assert.equal(isTestReceiptNumber("MEKI-2026-000001"), false);
  });
  test("receipt document links are same-origin API URLs, HTML only (PDF is not configured)", async () => {
    const { apiUrl } = await import("../src/lib/api.ts");
    assert.equal(apiUrl("/admin/receipts/abc/document", { locale: "ar", format: "html" }), "/api/v1/admin/receipts/abc/document?locale=ar&format=html");
  });
});

describe("filters, search and pagination", () => {
  test("date inputs become an inclusive UTC range; inverted ranges are rejected", () => {
    assert.deepEqual(dayRange("2026-11-01", "2026-11-30"), { from: "2026-11-01T00:00:00.000Z", to: "2026-11-30T23:59:59.999Z" });
    assert.deepEqual(dayRange("", ""), { from: undefined, to: undefined });
    assert.equal(dayRange("2026-12-01", "2026-11-01"), null);
    assert.deepEqual(dayRange("garbage", "2026-11-01"), { from: undefined, to: "2026-11-01T23:59:59.999Z" });
  });
  test("empty filters are dropped so query keys and requests stay minimal", () => {
    assert.deepEqual(cleanQuery({ search: "", status: "PENDING", currency: undefined, campaignId: null, page: 2 }), { status: "PENDING", page: 2 });
  });
  test("page clamping", () => {
    assert.equal(clampPage(0, 5), 1);
    assert.equal(clampPage(9, 5), 5);
    assert.equal(clampPage(Number.NaN, 5), 1);
    assert.equal(clampPage(3, 0), 1);
  });
});

describe("response mapping (zod boundary, written from the NestJS services)", () => {
  test("donation list row and detail validate; donor block is optional (no donors.read)", () => {
    assert.ok(DonationListRowSchema.safeParse(donationRow).success);
    const noDonor = { ...donationRow };
    delete noDonor.donor;
    assert.ok(DonationListRowSchema.safeParse(noDonor).success);
    const detail = {
      ...donationRow,
      attempts: [{ id: "a1", reference: "PA-1", provider: "live", providerSessionRef: "s", providerPaymentRef: "p", amount: "100.00", currency: "USD", status: "SUCCEEDED", failureCode: null, failureReason: null, isTest: false, initiatedAt: "2026-11-01T09:59:00.000Z", expiresAt: null, completedAt: "2026-11-01T10:00:00.000Z" }],
      transactions: [{ id: "t1", donationId: "d1", provider: "live", providerTransactionRef: "ch_1", type: "CAPTURE", status: "SUCCEEDED", amount: "100.00", currency: "USD", settlementAmount: null, settlementCurrency: null, feeAmount: null, failureCode: null, isTest: false, occurredAt: "2026-11-01T10:00:00.000Z" }],
      refunds: [refund()],
      receipts: [{ id: "rc1", receiptNumber: "MEKI-2026-000001", donationId: "d1", version: 1, status: "ISSUED", locale: "en", issuedAt: "2026-11-01T10:00:01.000Z", voidedAt: null, replacesReceiptId: null }],
      recurringDonation: null,
      sourceEvent: null,
      utm: { source: null, medium: null, campaign: null },
    };
    assert.ok(DonationDetailSchema.safeParse(detail).success);
  });
  test("money must be a decimal string — floats and malformed currencies are rejected", () => {
    assert.equal(DonationListRowSchema.safeParse({ ...donationRow, amount: 100 }).success, false);
    assert.equal(DonationListRowSchema.safeParse({ ...donationRow, currency: "usd" }).success, false);
    assert.equal(RefundRowSchema.safeParse(refund({ amount: "1,000" })).success, false);
  });
  test("refund list rows accept the additive donation block and work without it (older API)", () => {
    assert.ok(RefundRowSchema.safeParse(refund({ donation: { reference: "DN-1", isTest: true } })).success);
    assert.ok(RefundRowSchema.safeParse(refund()).success);
    assert.ok(RefundDetailSchema.safeParse({ ...refund(), donation: { reference: "DN-1", amount: "100", refundedAmount: "0", currency: "USD" }, requestedBy: { id: "u", name: "A" }, decidedBy: null }).success);
  });
  test("donor, recurring, receipt, transaction, webhook and provider shapes", () => {
    const donor = { id: "dn1", firstName: "Sara", lastName: "Haddad", email: "s@x.org", phone: null, countryCode: "EG", donorType: "INDIVIDUAL", organizationName: null, preferredLocale: "ar", marketingConsent: false, anonymizedAt: null, createdAt: "2026-11-01T00:00:00Z" };
    assert.ok(DonorRowSchema.safeParse({ ...donor, _count: { donations: 3 } }).success);
    assert.ok(DonorDetailSchema.safeParse({ ...donor, addressLine1: null, addressLine2: null, city: null, region: null, postalCode: null, marketingConsentAt: null, privacyConsentAt: "2026-11-01T00:00:00Z", privacyPolicyVersion: null, updatedAt: "2026-11-01T00:00:00Z", donations: [], recurringDonations: [] }).success);
    const rec = { id: "r", reference: "RD-1", donorId: "dn1", designation: "GENERAL_FUND", campaignId: null, programmeId: null, amount: "25", currency: "USD", interval: "MONTHLY", intervalCount: 1, status: "ACTIVE", provider: "live", providerAgreementRef: null, isTest: false, startDate: null, nextBillingDate: null, lastChargedAt: null, failedAttemptCount: 0, maxRetryAttempts: 3, pausedAt: null, cancelledAt: null, cancelReason: null, createdAt: "2026-11-01T00:00:00Z" };
    assert.ok(RecurringRowSchema.safeParse(rec).success);
    assert.ok(RecurringDetailSchema.safeParse({ ...rec, campaign: null, programme: null, paymentHistory: [] }).success);
    assert.ok(ReceiptRowSchema.safeParse({ id: "rc", receiptNumber: "TEST-MEKI-2026-000001", donationId: "d", version: 1, status: "ISSUED", locale: "en", issuedAt: "x", voidedAt: null, replacesReceiptId: null, donation: { reference: "DN-1", isTest: true } }).success);
    const snapshot = { receiptNumber: "MEKI-1", issuedAt: "x", isTest: false, donation: { reference: "DN-1", amount: "10.00", currency: "USD", frequency: "ONE_TIME", confirmedAt: null }, donor: { name: "A B", organizationName: null, countryCode: null }, purpose: { designation: "GENERAL_FUND", titleEn: null, titleAr: null }, issuer: { nameEn: "MEKI", nameAr: null, addressEn: null, addressAr: null, taxIdLabel: null, taxId: null }, footerEn: null, footerAr: null };
    assert.ok(ReceiptDetailSchema.safeParse({ id: "rc", receiptNumber: "MEKI-1", donationId: "d", version: 1, status: "ISSUED", locale: "en", issuedAt: "x", voidedAt: null, replacesReceiptId: null, snapshot, issuedById: null, voidReason: null }).success);
    assert.ok(TransactionSchema.safeParse({ id: "t", donationId: "d", provider: "p", providerTransactionRef: "r", type: "REFUND", status: "FAILED", amount: "1.00", currency: "USD", isTest: true, occurredAt: "x", donation: { reference: "DN-1" } }).success);
    assert.ok(WebhookEventSchema.safeParse({ id: "w", provider: "mock", providerEventId: "evt", eventType: "payment.succeeded", signatureVerified: true, status: "PROCESSED", attempts: 1, lastError: null, receivedAt: "x", processedAt: null }).success);
    assert.ok(ProviderSchema.safeParse(LIVE).success);
    assert.equal(ProviderSchema.safeParse({ ...LIVE, configuredOnServer: undefined }).success, false, "server truth fields are required");
    assert.equal(isTestProviderCode("mock", [MOCK]), true);
    assert.equal(isTestProviderCode("live", [LIVE]), false);
  });
});

describe("authorization in navigation (UI only; the API stays authoritative)", () => {
  const user = (...permissions) => ({ permissions, isSuperAdmin: false });
  const items = (u) => visibleNav(u).flatMap((g) => g.items);
  test("each finance page appears only with the permission its endpoints require", () => {
    assert.deepEqual(items(user("donations.read")).map((i) => i.key), ["dashboard", "donations", "payments", "givingIntents", "zakat"]); // Phase 14: giving intents + Zakat eligibility (donations.read)
    assert.deepEqual(items(user("donors.read")).map((i) => i.key), ["dashboard", "donorList"]);
    assert.deepEqual(items(user("recurring.read")).map((i) => i.key), ["dashboard", "recurring"]);
    assert.deepEqual(items(user("receipts.read")).map((i) => i.key), ["dashboard", "receipts"]);
    assert.deepEqual(items(user("payments.read")).map((i) => i.key), ["dashboard", "payments", "sdiZeffy"]); // Phase 8A: SDI / Zeffy provider payments
    assert.deepEqual(items(user("reports.read")).map((i) => i.key).filter((k) => ["donations", "payments", "donorList"].includes(k)), []);
  });
  test("enabled entries point to real route files", () => {
    for (const i of NAV.flatMap((g) => g.items).filter((x) => x.href)) {
      const f = join(import.meta.dirname, "../src/app/[locale]/(dashboard)", i.href, "page.tsx");
      assert.ok(existsSync(f), `${i.key} → ${f}`);
    }
  });
  test("can() honours super admin", () => assert.equal(can({ permissions: [], isSuperAdmin: true }, "refunds.execute"), true));
});

describe("localization of Phase 6B", () => {
  test("gate reasons and error codes are translated in both languages", () => {
    for (const k of ["permission", "notConfirmed", "testRecord", "noBalance", "providerUnknown", "providerNotLive", "providerNoRefunds", "wrongState", "ownRequest"]) assert.ok(en.fin.gate[k] && ar.fin.gate[k], k);
    for (const k of ["REFUND_EXCEEDS_BALANCE", "FOUR_EYES_REQUIRED", "NOT_SUPPORTED_BY_PROVIDER", "PROVIDER_ERROR", "default"]) assert.ok(en.fin.errors[k] && ar.fin.errors[k], k);
  });
  test("Arabic copy is Arabic, and the fiscal-sponsor notice never claims MEKI issues tax receipts", () => {
    assert.match(ar.fin.donations.title, /[؀-ۿ]/);
    assert.match(ar.fin.receipts.fiscal, /SDI/);
    assert.match(en.fin.receipts.fiscal, /NOT confirmed as legally valid tax receipts/);
    assert.doesNotMatch(en.fin.receipts.fiscal + en.fin.receipts.subtitle, /tax-deductible receipt issued by MEKI/i);
    assert.match(en.fin.recurring.subtitle, /not collected money/);
  });
});

describe("static guards on Phase 6B source", () => {
  const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
  const root = join(import.meta.dirname, "../src");
  const files = [...walk(join(root, "features/finance")), join(root, "services/finance.ts"), join(root, "hooks/useFinanceData.ts"), join(root, "lib/finance.ts"), join(root, "components/finance/ui.tsx")];
  const read = (f) => readFileSync(f, "utf8");
  test("test/mock records are never requested and no fake data is embedded", () => {
    for (const f of files) {
      const s = read(f);
      assert.doesNotMatch(s, /includeTest\s*[:=]/, f);
      assert.doesNotMatch(s, /mockData|fakeData|lorem|Math\.random|parseFloat/i, f);
    }
  });
  test("money is never summed with floating point in the finance pages", () => {
    for (const f of files.filter((x) => x.endsWith(".tsx"))) assert.doesNotMatch(read(f), /Number\((?:r|row|d|x|a)\.(?:amount|net|gross|refundedAmount)\)/, f);
  });
  test("the network is touched only through lib/api.ts", () => {
    for (const f of files) assert.doesNotMatch(read(f), /\bfetch\(/, f);
  });
  test("Gala ticket finance is not mixed into donation pages", () => {
    for (const f of files) assert.doesNotMatch(read(f), /financials|EVENT_TICKET_PAYMENT|ticketRevenue/, f);
  });
  test("every mutation goes through a confirmation dialog", () => {
    for (const f of walk(join(root, "features/finance"))) {
      const s = read(f);
      if (/\.mutate\(/.test(s)) assert.match(s, /ConfirmDialog/, f);
    }
  });
});
