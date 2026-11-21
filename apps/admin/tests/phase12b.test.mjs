// Phase 12B — SDI agreement alignment in the admin (docs/50). Run: pnpm --filter @meki/admin test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test, { describe } from "node:test";
import { ar, en } from "../src/lib/i18n.ts";
import { canRecordApproval, clearedBy, FundraisingViewSchema } from "../src/lib/fundraising-schemas.ts";
import { reconBody, reconFieldsFor, reconFromSaved, reconProblems, suggestRecon, zoneFromHeaders } from "../src/lib/sdi.ts";
import { SdiStatusSchema } from "../src/lib/sdi-schemas.ts";

const read = (p) => readFileSync(join(import.meta.dirname, "../src", p), "utf8");
const SAMPLE_HEADERS = ["Payment Date (America/New_York)", "Payment Time (America/New_York)", "Total Amount", "DAF provider", "Payment Method", "Payment Status", "Payout Date", "Refund Amount", "Recurring Status", "Fund", "First Name", "Last Name", "Email", "Company Name", "Address", "City", "Tax Receipt #", "Tax Receipt URL", "Note", "Phone Number"];

describe("single approved Gala project", () => {
  const cfg = { id: "c", eventId: "e", projectId: "p", projectPlanReference: "Plan v1", projectPlanApprovedAt: "2026-11-20T00:00:00Z", projectPlanApprovedById: "u2", projectPlanApprovalNote: null, fundraisingAuthorizedAt: "2026-11-20T00:00:00Z", fundraisingAuthorizedById: "u2", donationsCloseAt: "2027-01-31T23:59:59-05:00", donationRefundNoticeApprovedAt: null, donationRefundNoticeApprovedById: null, ticketRefundPolicyEn: "x", ticketRefundPolicyAr: null, ticketRefundPolicyApprovedAt: "2026-11-20T00:00:00Z", ticketRefundPolicyApprovedById: "u2", updatedById: "u1", updatedAt: "2026-11-20T00:00:00Z" };
  test("edits clear the approvals that depend on them (mirrors the API)", () => {
    assert.deepEqual(clearedBy(["projectPlanReference"], cfg), ["PROJECT_PLAN", "PUBLIC_FUNDRAISING"]);
    assert.deepEqual(clearedBy(["donationsCloseAt"], cfg), ["PUBLIC_FUNDRAISING"]);
    assert.deepEqual(clearedBy(["ticketRefundPolicyAr"], cfg), ["TICKET_REFUND_POLICY"]);
    assert.deepEqual(clearedBy(["projectId"], null), []);
  });
  test("four eyes: the last editor cannot record approvals; permission required", () => {
    assert.equal(canRecordApproval(cfg, "u2", true), true);
    assert.equal(canRecordApproval(cfg, "u1", true), false);
    assert.equal(canRecordApproval(cfg, "u2", false), false);
    assert.equal(canRecordApproval(null, "u2", true), false);
  });
  test("contract: an unconfigured event parses (nothing selected)", () => {
    const v = FundraisingViewSchema.parse({ config: null, project: null, state: { planApproved: false, authorized: false, campaignOpen: false, givingAvailable: false, switchOn: false, formConfigured: false, donationRefundNoticeApproved: false, ticketRefundPolicyApproved: false }, env: { galaGivingSwitch: false, galaGivingFormConfigured: false, generalGivingAuthorized: false, programmeGivingAuthorized: false } });
    assert.equal(v.project, null);
  });
  test("UI never preselects a project and never offers DEMO projects; approvals are separate buttons", () => {
    const card = read("features/gala/settings/FundraisingCard.tsx");
    assert.match(card, /projectId: c\?\.projectId \?\? ""/);
    assert.match(card, /filter\(\(p\) => p\.provenance !== "DEMO"\)/);
    for (const step of ["PROJECT_PLAN", "PUBLIC_FUNDRAISING", "DONATION_REFUND_NOTICE", "TICKET_REFUND_POLICY"]) assert.match(card, new RegExp(`"${step}"`));
    assert.match(card, /disabled=\{!mayApprove\}/);
    assert.match(read("features/gala/settings/GalaSettingsPage.tsx"), /can\("events\.read"\) && <FundraisingCard ev=\{ev\} \/>/);
  });
});

describe("SDI sample layout support (structure only — no sample data in the repo)", () => {
  test("suggestions: separate time column, zone from header, fund, recurring; no order ID is invented", () => {
    const s = suggestRecon(SAMPLE_HEADERS);
    assert.equal(s.date, "Payment Date (America/New_York)");
    assert.equal(s.time, "Payment Time (America/New_York)");
    assert.equal(s.timeZone, "America/New_York");
    assert.equal(s.fund, "Fund");
    assert.equal(s.recurring, "Recurring Status");
    assert.equal(s.amount, "Total Amount");
    assert.equal(s.orderId, ""); // the sample has no order/payment ID — never guessed
    assert.ok(reconProblems(s).includes("missing:orderId"));
    assert.ok(reconProblems(s).includes("galaFunds")); // a fund column needs the approved Gala fund name(s)
    assert.equal(zoneFromHeaders(["Date"]), "UTC");
  });
  test("donation reports hide ticket-only columns; body carries report type, zone and fund list", () => {
    assert.deepEqual(reconFieldsFor("GALA_DONATIONS").filter((k) => ["bookingReference", "ticketType", "quantity"].includes(k)), []);
    const f = { ...suggestRecon(SAMPLE_HEADERS), reportType: "GALA_DONATIONS", orderId: "Tax Receipt #", galaFunds: " Gala Project Fund , ", dateFormat: "MDY" };
    const b = reconBody(f);
    assert.equal(b.reportType, "GALA_DONATIONS");
    assert.equal(b.timeZone, "America/New_York");
    assert.deepEqual(b.galaFunds, ["Gala Project Fund"]);
    assert.equal(b.bookingReference, undefined);
    assert.equal(b.statusMap.abandoned, "FAILED");
    const back = reconFromSaved(b, SAMPLE_HEADERS);
    assert.equal(back.reportType, "GALA_DONATIONS");
    assert.equal(back.galaFunds, "Gala Project Fund");
    assert.ok(reconProblems({ ...f, timeZone: "Not a zone!" }).includes("timeZone"));
  });
});

describe("totals and copy", () => {
  test("status totals are per category (no grand total field exists)", () => {
    const s = SdiStatusSchema.parse({ mode: "zeffy_hosted", galaHostedSalesEnabled: false, galaFormConfigured: true, generalGivingEnabled: false, programmeGivingEnabled: false, programmeDesignationConfirmed: false, applyEnabled: false, zeffyApiConfigured: false, lastAppliedReport: null, importsAwaitingAction: 0, rowsRequiringReview: 0, missingBusinessDays: [], galaTotals: { currency: "USD", ticketRevenue: { orders: 1, gross: "750.00", refunded: "0.00", net: "750.00" }, galaStandaloneDonations: { gifts: 2, amount: "150.00" }, donationRowsAwaitingReview: { rows: 0, amount: "0.00" } } });
    assert.deepEqual(Object.keys(s.galaTotals), ["currency", "ticketRevenue", "galaStandaloneDonations", "donationRowsAwaitingReview"]);
    assert.doesNotMatch(read("features/gala/GalaSdiTotals.tsx"), /\+\s*Number|reduce\(|grandTotal/);
  });
  test("EN/AR parity for the new SDI copy", () => {
    const walk = (a, b, path) => {
      for (const k of Object.keys(a)) {
        assert.ok(k in b, `${path}.${k} missing in Arabic`);
        if (typeof a[k] === "string") assert.ok(a[k].trim() && b[k].trim(), `${path}.${k} empty`);
        else walk(a[k], b[k], `${path}.${k}`);
      }
    };
    for (const k of ["fundraising", "totals", "mappingFields"]) walk(en.sdi[k], ar.sdi[k], `sdi.${k}`);
    assert.ok(en.sdi.donationsListNote && ar.sdi.donationsListNote);
    for (const code of ["PROJECT_IS_DEMO", "PROJECT_PLAN_NOT_APPROVED", "CLOSING_DATE_REQUIRED", "MAPPING_TIME_ZONE"]) assert.ok(en.sdi.errors[code] && ar.sdi.errors[code], code);
  });
});
