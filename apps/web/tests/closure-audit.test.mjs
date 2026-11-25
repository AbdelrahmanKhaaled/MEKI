// Phase 08.5 — client requirements closure audit: facts the closure report relies on, checked against the CURRENT source.
// Run: pnpm --filter @meki/web test
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { galaAr, galaEn } from "../src/content/gala.ts";
import { en } from "../src/content/en.ts";
import { ar } from "../src/content/ar.ts";

const src = (p) => readFileSync(join(import.meta.dirname, "../src", p), "utf8");
const code = (s) => s.split("/*").map((x, i) => (i === 0 ? x : x.slice(x.indexOf("*/") + 2))).join("").split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith("//")).join(String.fromCharCode(10));

test("agenda = the client's four-act graphic (3:30–8:15 PM) with the 22 Nov renames; EN and AR have the same structure", () => {
  const times = galaEn.timeline.acts.map((a) => [a.label, a.title, a.time, a.items.map((i) => i.time)]);
  assert.deepEqual(times, [
    ["Act I", "The Spark", "3:30 – 5:00 PM", ["3:30 PM", "4:30 PM", "4:45 PM"]],
    ["Act II", "The Stories and the People", "5:00 – 6:15 PM", ["5:00 PM", "5:10 PM", "6:00 PM"]],
    ["Act III", "The Power of Giving", "6:15 – 7:00 PM", ["6:15 PM"]],
    ["Act IV", "A Shared Celebration", "7:00 – 8:15 PM", ["7:00 PM", "7:30 PM", "8:15 PM"]],
  ]);
  assert.equal(galaEn.timeline.title, "The evening at a glance");
  assert.equal(galaEn.timeline.acts[0].items[0].title, "Welcome reception");
  assert.equal(galaEn.timeline.acts[0].items[1].title, "Opening with our host, Raya Abirached");
  assert.ok(!JSON.stringify(galaEn.timeline).includes("America/New_York"));
  assert.deepEqual(galaAr.timeline.acts.map((a) => a.items.length), galaEn.timeline.acts.map((a) => a.items.length));
  // only names confirmed in writing are shown: the graphic's "Mr. Beshir Shousha" is NOT shown (open point in the closure report)
  assert.ok(!JSON.stringify(galaEn).includes("Shousha"));
});

test("Gala experience: five cards, newest wording wins (24 Nov 'Virgin Drinks' over 21 Nov 'Refined Refreshments' and 22 Nov 'Virgin bar'); the 21 Nov description is kept", () => {
  assert.deepEqual(galaEn.experience.items.map((i) => i.title), ["Black-tie evening", "Set-menu dinner", "Virgin Drinks", "Lamp-lighting moment", "Live auction"]);
  const bar = galaEn.experience.items.find((i) => i.code === "bar");
  assert.equal(bar.text, "A curated selection of fresh juices, premium teas, coffee, and sparkling beverages, thoughtfully served throughout the evening");
  assert.ok(!JSON.stringify(galaEn).match(/Refined Refreshments|alcohol|Craft display/i));
  assert.equal(galaAr.experience.items.length, 5);
});

test("ticket price is USD 500 on every user-facing Gala surface and no 750 remains in user-facing copy", () => {
  assert.equal(galaEn.attendance.price, "USD 500");
  assert.ok(galaAr.attendance.price.startsWith("500"));
  for (const p of ["content/gala.ts", "content/booking.ts", "content/giving.ts", "content/en.ts", "content/ar.ts", "content/pages.ts"]) assert.doesNotMatch(src(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""), /\b750\b/, p);
  const seed = readFileSync(join(import.meta.dirname, "../../api/prisma/seed/gala-night.ts"), "utf8");
  assert.match(seed, /ticketPrice: '500\.00'/);
});

test("Approved Arabic has no draft-translation notice", () => {
  assert.equal(ar.draftTranslation, "");
  assert.equal(galaAr.draftNote, "");
});

test("Gala page has no decorative light dots / particles (client item 14)", () => {
  for (const f of ["components/gala/GalaSections.tsx", "app/[locale]/events/gala-night/page.tsx"]) assert.doesNotMatch(code(src(f)), /PointsOfLight|particle|glow-dot/i, f);
});

test("remaining 'milestones' wording is outside the two places the client named (trust strip, Why support MEKI)", () => {
  assert.equal(en.trust.some((t) => /milestone/i.test(t.title + t.text)), false);
  assert.equal(en.why.items.some((t) => /milestone/i.test(t.title + t.text)), false);
});

test("venue: exterior photos only — no interior/hall claim in Gala copy or alt text", () => {
  const all = JSON.stringify([galaEn.venue, galaEn.venueLogoAlt, galaEn.purposePhotos]);
  assert.doesNotMatch(all, /\bhall\b|ballroom|interior/i);
  assert.ok(existsSync(join(import.meta.dirname, "../../../deploy/staging/nov25/gala.data.json")));
});
