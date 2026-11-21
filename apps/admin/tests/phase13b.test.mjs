// Phase 13B — SDI legal wording from MEKI's "Website Comments.docx" (21 Nov 2026) in the admin (docs/56, docs/57).
// Run: pnpm --filter @meki/admin test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test, { describe } from "node:test";
import { ar, en } from "../src/lib/i18n.ts";
import { amountsProblem } from "../src/lib/legal-copy-schemas.ts";
import { SDI_WORDING_NOV21, SDI_WORDING_SOURCE } from "../src/lib/legal-copy-source.ts";

const read = (p) => readFileSync(join(import.meta.dirname, "../src", p), "utf8");

describe("21 Nov SDI wording (verbatim source for the approval-gated drafts)", () => {
  test("all three kinds present, exact amounts 500 = 200 + 300, EIN 42-2797838", () => {
    assert.deepEqual(Object.keys(SDI_WORDING_NOV21).sort(), ["TICKET_PURCHASE_DISCLOSURE", "TICKET_RECEIPT", "WEBSITE_DISCLOSURE"]);
    for (const w of Object.values(SDI_WORDING_NOV21)) {
      assert.equal(amountsProblem(w.ticketPrice, w.fairMarketValue, w.deductibleAmount), null);
      assert.deepEqual([w.ticketPrice, w.fairMarketValue, w.deductibleAmount], ["500.00", "200.00", "300.00"]);
      assert.match(w.textEn, /EIN 42-2797838/);
      assert.match(w.textEn, /USD 500/);
      assert.match(w.textEn, /USD 200/);
      assert.match(w.textEn, /USD 300/);
      assert.doesNotMatch(w.textEn, /750/);
    }
  });

  test("wording is verbatim (spot checks of client punctuation kept as received)", () => {
    const t = SDI_WORDING_NOV21;
    assert.ok(t.TICKET_PURCHASE_DISCLOSURE.textEn.startsWith("Spring of Dignity International is a tax-exempt organization under Section 501(c)(3)"));
    assert.ok(t.TICKET_PURCHASE_DISCLOSURE.textEn.endsWith("Additional donations are tax-deductible to the extent permitted by law."));
    assert.ok(t.TICKET_RECEIPT.textEn.startsWith("Thank you for your support of the Egypt Gala. You paid USD 500 per ticket."));
    assert.ok(t.WEBSITE_DISCLOSURE.textEn.startsWith("The Egypt Gala is cohosted by Misr El Kheir Foundation and Spring of Dignity International."));
    assert.match(t.WEBSITE_DISCLOSURE.textEn, /Misr El Kheir Foundation’s programs in Egypt/);
    // received without a final period and with "tax deductible" unhyphenated: kept exactly, flagged in docs/57
    assert.ok(t.WEBSITE_DISCLOSURE.textEn.endsWith("are tax deductible to the extent permitted by law"));
    assert.match(SDI_WORDING_SOURCE, /Website Comments\.docx/);
  });

  test("loading the source never saves, approves or publishes: it only fills the editor", () => {
    const card = read("features/gala/settings/LegalCopyCard.tsx");
    const loader = card.slice(card.indexOf("legal-load-"), card.indexOf("{x.loadSource}"));
    assert.match(loader, /setF\(/);
    assert.doesNotMatch(loader, /mutate|recordSdiApproval|publishLegalCopy|updateLegalCopy/);
    // the four-eyes approval button and the publish blockers are unchanged
    assert.match(card, /c\.updatedById === user\?\.id/);
    assert.match(card, /disabled=\{!!blocker\}/);
  });

  test("EN/AR labels present", () => {
    for (const d of [en, ar]) {
      assert.ok(d.sdi.legal.loadSource.length > 5);
      assert.ok(d.sdi.legal.sourceMatches.length > 5);
    }
  });

  test("approved details list the client's dietary options and the Zeffy dependency (EN/AR)", () => {
    assert.match(en.gala.settings.approvedList, /gluten-free, vegan, vegetarian, nut allergy, dairy-free/);
    assert.match(en.gala.settings.approvedList, /only if SDI adds the question/);
    assert.match(ar.gala.settings.approvedList, /الغلوتين/);
  });
});

describe("Gala venue photos (EVENT_VENUE section of the event page)", () => {
  test("uses only the existing Events API endpoints; never the generic CMS routes for an event page", () => {
    const s = read("services/venue-photos.ts");
    for (const p of ["/admin/events/${id(eventId)}/page", "/admin/events/${id(eventId)}/sections`", "/sections/${id(sectionId)}/items", "/admin/events/${id(eventId)}/items/${id(itemId)}"]) assert.ok(s.includes(p), p);
    assert.doesNotMatch(s, /\/admin\/cms\//);
    assert.match(s, /key: VENUE_KEY, provenance: "PROPOSED"/);
  });

  test("permissions: edit needs events.manage, publish needs events.publish; publishing asks for confirmation", () => {
    const c = read("features/gala/settings/VenuePhotosCard.tsx");
    assert.match(c, /can\("events\.manage"\)/);
    assert.match(c, /can\("events\.publish"\) && \(!published/);
    assert.match(c, /ConfirmDialog open title=\{x\.publish\}/);
    assert.match(read("features/gala/settings/GalaSettingsPage.tsx"), /<VenuePhotosCard ev=\{ev\} \/>/);
  });

  test("caption preview follows 'Title – Place' like the website", async () => {
    const src = read("features/gala/settings/VenuePhotosCard.tsx");
    assert.match(src, /`\$\{title\.trim\(\)\} – \$\{place\.trim\(\)\}`/);
  });

  test("EN/AR strings complete and identical in shape", () => {
    const a = en.gala.settings.venuePhotos;
    const b = ar.gala.settings.venuePhotos;
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
    for (const v of [...Object.values(a), ...Object.values(b)]) assert.ok(typeof v === "string" && v.length > 2);
    assert.match(a.subtitle, /never stock images or another location/);
  });
});
