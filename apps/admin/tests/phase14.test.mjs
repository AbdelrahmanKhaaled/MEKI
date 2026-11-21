// Phase 14 — giving intents, Zakat eligibility and donation-report mapping in the admin (docs/59–62). Run: pnpm --filter @meki/admin test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test, { describe } from "node:test";
import { ar, en } from "../src/lib/i18n.ts";
import { IntentDetailSchema, IntentRowSchema, ZakatOverviewSchema, zakatRequestProblem } from "../src/lib/giving-schemas.ts";
import { parseDesignationMap, parseTypeMap, reconBody, reconFieldsFor, reconFromSaved, reconProblems, suggestRecon } from "../src/lib/sdi.ts";

const read = (p) => readFileSync(join(import.meta.dirname, "../src", p), "utf8");
const HEADERS = ["Order ID", "Total Amount", "Payment Status", "Payment Date", "MEKI Donation Reference", "Donation Type", "Program"];

describe("donation-report mapping (SDI importer)", () => {
  test("ticket reports never show donation columns; donation reports never show ticket columns", () => {
    assert.ok(!reconFieldsFor("GALA_TICKETS").includes("donationReference"));
    for (const t of ["GALA_DONATIONS", "GENERAL_DONATIONS", "PROGRAMME_DONATIONS"]) {
      const f = reconFieldsFor(t);
      assert.ok(f.includes("donationReference") && f.includes("donationType") && f.includes("designation"), t);
      assert.ok(!f.includes("bookingReference") && !f.includes("ticketType"), t);
    }
  });

  test("suggestions find SDI's custom-question columns (suggestions only)", () => {
    const s = suggestRecon(HEADERS);
    assert.equal(s.donationReference, "MEKI Donation Reference");
    assert.equal(s.donationType, "Donation Type");
    assert.equal(s.designation, "Program");
  });

  test("general / programme reports require the reference (and, for programmes, the designation) column", () => {
    const base = { ...suggestRecon(HEADERS), reportType: "PROGRAMME_DONATIONS" };
    assert.deepEqual(reconProblems({ ...base, donationReference: "", designation: "" }).filter((p) => p.startsWith("missing:")), ["missing:donationReference", "missing:designation"]);
    assert.deepEqual(reconProblems(base), []);
    assert.deepEqual(reconProblems({ ...base, reportType: "GALA_DONATIONS", donationReference: "", designation: "" }).filter((p) => p.startsWith("missing:")), []); // Gala keeps the Phase 12B standalone mode
  });

  test("answer maps: only ZAKAT/SADAQAH and GENERAL / GALA_PROJECT / programme:<slug>; bad lines are reported", () => {
    assert.deepEqual(parseTypeMap("Zakat = ZAKAT\nصدقة = SADAQAH\nCharity = CHARITY"), { map: { zakat: "ZAKAT", "صدقة": "SADAQAH" }, badLines: [3] });
    assert.deepEqual(parseDesignationMap("Health program = programme:health\nGala = GALA_PROJECT\nOther = programme:Bad Slug"), { map: { "health program": "programme:health", gala: "GALA_PROJECT" }, badLines: [3] });
    const f = { ...suggestRecon(HEADERS), reportType: "PROGRAMME_DONATIONS", donationTypeMap: "Zakat = ZAKAT", designationMap: "Health = programme:health" };
    assert.deepEqual(reconProblems({ ...f, donationTypeMap: "x = y" }).includes("donationTypeMap"), true);
    const body = reconBody(f);
    assert.deepEqual(body.donationTypeMap, { zakat: "ZAKAT" });
    assert.deepEqual(body.designationMap, { health: "programme:health" });
    assert.equal(body.donationReference, "MEKI Donation Reference");
    assert.ok(!("donationTypeMap" in reconBody({ ...f, reportType: "GALA_TICKETS" })));
    assert.ok(!("donationTypeMap" in reconBody({ ...f, donationTypeMap: "" }))); // empty → the server's reviewed defaults
    const back = reconFromSaved(body, HEADERS);
    assert.equal(back.reportType, "PROGRAMME_DONATIONS");
    assert.equal(back.designation, "Program");
    assert.match(back.designationMap, /health = programme:health/);
  });
});

describe("giving intents and Zakat eligibility screens", () => {
  test("Zakat requests need both references; nothing is eligible by default", () => {
    assert.equal(zakatRequestProblem(true, "MEKI board", ""), "references");
    assert.equal(zakatRequestProblem(true, "MEKI board", "SDI e-mail"), null);
    assert.equal(zakatRequestProblem(false, "", ""), null);
    assert.throws(() => ZakatOverviewSchema.parse({ defaultEligible: true, targets: [] }));
  });

  test("schemas accept the API shapes", () => {
    const row = { id: "x", reference: "DN-ABCDEFGHJKMN", intentType: "PROGRAM_DONATION", classification: "ZAKAT", amount: "100.00", reportedAmount: null, currency: "USD", designation: { type: "PROGRAMME", name: "Health", slug: "health" }, paymentStatus: "UNPAID", reconciliationStatus: "AWAITING_REPORT", stage: "PENDING_EXTERNAL", allocationStatus: "PENDING_AUTHORIZATION", authorizedFund: null, allocationDecidedAt: null, payoutStatus: "NOT_REPORTED", externalPaymentId: null, reconciledReportId: null, reconciledReportRow: null, reconciledAt: null, isTest: true, createdAt: "2026-11-21T00:00:00Z", donor: null };
    IntentRowSchema.parse(row);
    IntentDetailSchema.parse({ ...row, evidence: { reportRows: [], providerPayment: null }, history: [{ action: "giving.intent.create", at: "2026-11-21T00:00:00Z", actorId: null, metadata: {} }] });
  });

  test("allocation: only for a verified payment, only with donations.allocate, confirmed before it is recorded", () => {
    const d = read("features/giving/GivingIntentDetailPage.tsx");
    assert.match(d, /const verified = d\.reconciliationStatus === "VERIFIED" && d\.paymentStatus === "PAID";/);
    assert.match(d, /can\("donations\.allocate"\)/);
    assert.match(d, /<ConfirmDialog/);
    assert.match(d, /x\.detail\.payoutNote/); // settlement is never assumed
  });

  test("Zakat screen: request needs zakat.manage; decisions need zakat.approve and are hidden on your own request", () => {
    const z = read("features/giving/ZakatEligibilityPage.tsx");
    assert.match(z, /can\("zakat\.manage"\) && !r\.pending/);
    assert.match(z, /can\("zakat\.approve"\) && r\.pending && r\.pending\.requestedById !== user\?\.id/);
    assert.match(z, /can\("zakat\.approve"\) && r\.eligible/);
  });

  test("donor personal data is shown only with donors.read", () => {
    assert.match(read("features/giving/GivingIntentsPage.tsx"), /const showDonor = can\("donors\.read"\);/);
  });

  test("EN/AR parity of the giving dictionary; errors translated", () => {
    const walk = (a, b, path) => {
      for (const k of Object.keys(a)) {
        assert.ok(k in b, `${path}.${k} missing in Arabic`);
        if (typeof a[k] === "string") assert.ok(a[k].trim() && b[k].trim(), `${path}.${k} empty`);
        else walk(a[k], b[k], `${path}.${k}`);
      }
    };
    walk(en.giving, ar.giving, "giving");
    for (const k of ["FOUR_EYES_REQUIRED", "ALLOCATION_NOT_VERIFIED", "ZAKAT_REFERENCES_REQUIRED"]) assert.ok(en.giving.errors[k] && ar.giving.errors[k], k);
    for (const k of ["GENERAL_DONATIONS", "PROGRAMME_DONATIONS"]) assert.ok(en.sdi.mappingFields.reportTypes[k] && ar.sdi.mappingFields.reportTypes[k], k);
    assert.match(en.giving.zakat.warning, /does not make a religious ruling/);
  });
});
