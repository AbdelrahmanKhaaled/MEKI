// November 19 2026 MEKI update on the public Gala page (docs/55). Run: pnpm --filter @meki/web test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { galaAr, galaEn } from "../src/content/gala.ts";

const src = (p) => readFileSync(join(import.meta.dirname, "../src", p), "utf8");

test("price: USD 500 everywhere on the Gala page (supersedes USD 750)", () => {
  assert.equal(galaEn.attendance.price, "USD 500");
  assert.match(galaAr.attendance.price, /^500 /);
  for (const g of [galaEn, galaAr]) assert.doesNotMatch(JSON.stringify(g), /750|٧٥٠/);
  const bookingFaqEn = galaEn.faq.items.find((i) => i.q === "Bookings");
  assert.match(bookingFaqEn.a, /USD 500 per guest/);
});

test("hours: 3:30 – 8:30 PM New York time in hero and agenda header (EN/AR)", () => {
  assert.equal(galaEn.hero.time, "3:30 – 8:30 PM (New York time)");
  assert.match(galaAr.hero.time, /3:30 – 8:30/);
  // MEKI client edits (22 Nov 2026, Gala item 20): "(America/New_York)" removed from the agenda header.
  assert.match(galaEn.timeline.hours, /3:30 – 8:30 PM, New York time$/);
  for (const g of [galaEn, galaAr]) assert.doesNotMatch(g.timeline.hours, /America\/New_York/);
});

test("agenda 'The Evening in a Glimpse': four acts, exact times, ends 8:15 PM — nothing invented after it", () => {
  const acts = galaEn.timeline.acts;
  assert.deepEqual(acts.map((a) => [a.label, a.title, a.time]), [
    ["Act I", "The Spark", "3:30 – 5:00 PM"],
    ["Act II", "The Stories and the People", "5:00 – 6:15 PM"],
    ["Act III", "The Power of Giving", "6:15 – 7:00 PM"],
    ["Act IV", "A Shared Celebration", "7:00 – 8:15 PM"],
  ]);
  assert.deepEqual(acts.flatMap((a) => a.items.map((i) => `${i.time} ${i.title}`)), [
    // MEKI client edits (22 Nov 2026, item 20): "Welcome reception" and "Opening with our host, Raya Abirached".
    "3:30 PM Welcome reception", "4:30 PM Opening with our host, Raya Abirached", "4:45 PM A Vision Beyond Borders",
    "5:00 PM Every Light Has a Story", "5:10 PM Voices That Illuminate", "6:00 PM A Legacy of Giving",
    "6:15 PM The Moment to Make It Count",
    "7:00 PM A Celebration of Shared Light", "7:30 PM A Table of Shared Purpose", "8:15 PM The Light Carries On",
  ]);
  assert.equal(acts.at(-1).items.at(-1).note, "Close of the evening");
  // Arabic mirrors the structure exactly
  assert.deepEqual(galaAr.timeline.acts.map((a) => a.items.length), acts.map((a) => a.items.length));
});

test("only names confirmed in writing are shown: the host (22 Nov 2026); other speakers stay roles only", () => {
  for (const g of [galaEn, galaAr]) {
    assert.doesNotMatch(JSON.stringify(g.timeline), /Shousha|Ahmed Amin|شوشة|أحمد أمين/);
  }
  assert.match(JSON.stringify(galaEn.timeline), /Raya Abirached/); // confirmed in writing in MEKI's 22 Nov 2026 edits
  assert.match(galaEn.timeline.note, /Speakers to be confirmed/);
  const roles = galaEn.timeline.acts.flatMap((a) => a.items.map((i) => i.note));
  assert.ok(roles.includes("Keynote Speaker") && roles.includes("Guest of Honor Panel"));
  assert.ok(!roles.includes("Master of Ceremonies") && !roles.includes("Pre-event"));
});

test("timeline renders acts as headed sections with <time> elements; disclosures only from the API", () => {
  const s = src("components/gala/GalaSections.tsx");
  assert.match(s, /t\.acts\.map\(\(act, a\) =>/);
  assert.match(s, /<time dir="ltr"/);
  assert.match(s, /\{h\.time\}/);
  assert.match(s, /\{disclosure && \(/);
  assert.match(src("app/[locale]/events/gala-night/page.tsx"), /disclosure=\{fr\?\.disclosures\?\.website \?\? null\}/);
  assert.match(src("app/[locale]/events/gala-night/book/page.tsx"), /disclosure=\{fr\?\.disclosures\?\.ticketPurchase \?\? null\}/);
  // no tax/fair-market-value wording is hard-coded in the site: it comes only from SDI-approved, published copy
  for (const f of ["content/gala.ts", "content/booking.ts", "components/gala/GalaSections.tsx", "components/booking/HostedBookingFlow.tsx"]) {
    assert.doesNotMatch(src(f), /fair market value|42-2797838|tax-deductible|deductible portion/i, f);
  }
});
