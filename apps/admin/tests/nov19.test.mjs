// November 19 2026 MEKI update in the admin (docs/55). Run: pnpm --filter @meki/admin test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test, { describe } from "node:test";
import { ar, en } from "../src/lib/i18n.ts";
import { amountsProblem, LegalCopyListSchema, publishBlocker } from "../src/lib/legal-copy-schemas.ts";

const read = (p) => readFileSync(join(import.meta.dirname, "../src", p), "utf8");

describe("confirmed Gala facts in the admin", () => {
  test("approved list shows USD 500, capacity 350, 3:30–8:30 PM America/New_York, speakers TBC (EN/AR); no 750", () => {
    for (const s of [en.gala.settings.approvedList, ar.gala.settings.approvedList]) {
      assert.match(s, /500/);
      assert.match(s, /350/);
      assert.match(s, /3:30–8:30/);
      assert.match(s, /America\/New_York/);
      assert.doesNotMatch(s, /750/);
    }
  });
});

describe("legal copy — SDI approval gate (UI mirrors the API)", () => {
  test("amounts: all or none, and FMV + deductible = price (cents-exact)", () => {
    assert.equal(amountsProblem("", "", ""), null);
    assert.equal(amountsProblem("500.00", "200.00", "300.00"), null);
    assert.equal(amountsProblem("500", "200", ""), "incomplete");
    assert.equal(amountsProblem("500.00", "200.00", "250.00"), "inconsistent");
    assert.equal(amountsProblem("0.30", "0.10", "0.20"), null); // no floating-point surprises
  });
  test("publish blockers: receipt never, approval first, price must equal the live price", () => {
    const base = { kind: "TICKET_PURCHASE_DISCLOSURE", publishable: true, sdiApprovedAt: "2026-11-20T00:00:00Z", ticketPrice: "500.00" };
    assert.equal(publishBlocker(base, "500.00"), null);
    assert.equal(publishBlocker({ ...base, kind: "TICKET_RECEIPT", publishable: false }, "500.00"), "receipt");
    assert.equal(publishBlocker({ ...base, sdiApprovedAt: null }, "500.00"), "notApproved");
    assert.equal(publishBlocker(base, "750.00"), "priceMismatch");
    assert.equal(publishBlocker({ ...base, ticketPrice: null }, "750.00"), null); // wording without a price
  });
  test("contract: an untouched event lists the three kinds, nothing approved or published", () => {
    const v = LegalCopyListSchema.parse({ liveTicketPrice: "500.00", items: ["TICKET_PURCHASE_DISCLOSURE", "TICKET_RECEIPT", "WEBSITE_DISCLOSURE"].map((kind) => ({ kind, textEn: null, textAr: null, ticketPrice: null, fairMarketValue: null, deductibleAmount: null, sdiApprovedAt: null, publishedAt: null, publishable: kind !== "TICKET_RECEIPT" })) });
    assert.equal(v.items.filter((i) => i.publishable).length, 2);
  });
  test("the card never offers a publish action for the receipt wording and enforces four eyes", () => {
    const card = read("features/gala/settings/LegalCopyCard.tsx");
    assert.match(card, /\{c\.publishable && !c\.publishedAt && <button/);
    assert.match(card, /disabled=\{!c\.textEn \|\| c\.updatedById === user\?\.id\}/);
    assert.doesNotMatch(card, /42-2797838|fair market value of|tax-deductible to the extent/i); // no legal wording hard-coded
    assert.match(read("features/gala/settings/GalaSettingsPage.tsx"), /<LegalCopyCard ev=\{ev\} \/>/);
  });
});

describe("pending SDI agreement is recorded, not applied", () => {
  test("three open items (six programmes, Dec 2027, ongoing giving), EN/AR parity; shown on the fundraising card", () => {
    assert.equal(en.sdi.pending.items.length, 3);
    assert.equal(ar.sdi.pending.items.length, 3);
    assert.match(en.sdi.pending.items[0], /six programmes/);
    assert.match(en.sdi.pending.items[1], /December 2027/);
    assert.match(en.sdi.pending.items[1], /31 January 2027/);
    assert.match(en.sdi.pending.items[2], /stay OFF/);
    assert.match(read("features/gala/settings/FundraisingCard.tsx"), /data-testid="pending-sdi-agreement"/);
  });
  test("EN/AR parity for the legal copy strings", () => {
    const walk = (a, b, path) => {
      for (const k of Object.keys(a)) {
        assert.ok(k in b, `${path}.${k} missing in Arabic`);
        if (typeof a[k] === "string") assert.ok(a[k].trim() && b[k].trim(), `${path}.${k} empty`);
        else walk(a[k], b[k], `${path}.${k}`);
      }
    };
    walk(en.sdi.legal, ar.sdi.legal, "sdi.legal");
    for (const c of ["LEGAL_PRICE_MISMATCH", "LEGAL_NOT_SDI_APPROVED", "LEGAL_NOT_PUBLISHABLE"]) assert.ok(en.sdi.errors[c] && ar.sdi.errors[c], c);
  });
});
