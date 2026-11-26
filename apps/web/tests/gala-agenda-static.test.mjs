// The approved Gala agenda (26 Nov 2026) is frontend-owned: exact content, EN/AR parity, one gold highlight, and NO dependency on the CMS / event API.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { galaAgendaAr, galaAgendaEn } from "../src/content/gala-agenda.ts";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("English agenda matches the approved content exactly (4 acts, 11 items, order, times, notes)", () => {
  const a = galaAgendaEn;
  assert.equal(a.eyebrow.toUpperCase(), "THE GALA · AN EVENING IN FOUR ACTS · 12 DECEMBER");
  assert.equal(a.title, "The Evening in a Glimpse");
  assert.deepEqual(a.acts.map((x) => [x.label, x.name.toUpperCase(), x.time]), [
    ["Act I", "THE SPARK", "3:30 – 5:00 PM"],
    ["Act II", "THE STORIES AND THE PEOPLE", "5:00 – 5:25 PM"],
    ["Act III", "THE POWER OF GIVING", "5:25 – 6:00 PM"],
    ["Act IV", "A SHARED CELEBRATION", "6:00 – 8:15 PM"],
  ]);
  const items = a.acts.flatMap((x) => x.items.map((i) => [i.time, i.title, i.note]));
  assert.deepEqual(items, [
    ["3:30", "Where Connections Begin", "Pre-event"],
    ["4:30", "The First Spark", "Raya Abirached · Master of Ceremonies"],
    ["4:45", "A Vision Beyond Borders", "Dr. Hassan el Khateeb"],
    ["5:00", "Every Light Has a Story", "Film"],
    ["5:10", "Voices That Illuminate", "The Great Exchange · Panel"],
    ["5:25", "A Legacy of Giving", "Egypt's Timeless Tradition of Generosity · Mr. Beshir Shousha"],
    ["5:35", "The Moment to Make It Count", "Paddle Raise · Every Light Counts"],
    ["6:00", "A Table of Shared Purpose", "Dinner"],
    ["7:00", "The Art of Giving", "Live Auction · Three Exclusive Pieces"],
    ["7:30", "A Celebration of Shared Light", "Entertainment · Hamza Namira"],
    ["8:15", "The Light Carries On", "Close of the evening"],
  ]);
  assert.equal(items.length, 11);
  assert.equal(a.footnote, "All times PM, New York.");
  assert.equal(a.brandLine.toUpperCase(), "MEKI · EVERY LIGHT COUNTS");
});

test("only 'The Moment to Make It Count' is highlighted (gold), in both languages", () => {
  for (const a of [galaAgendaEn, galaAgendaAr]) {
    const hl = a.acts.flatMap((x, ai) => x.items.map((i, ii) => [ai, ii, i.highlight]).filter((r) => r[2]));
    assert.deepEqual(hl, [[2, 1, true]]);
  }
  assert.equal(galaAgendaEn.acts[2].items[1].title, "The Moment to Make It Count");
});

test("Arabic has the same structure and times, Arabic copy, and keeps the proper names/brand", () => {
  const e = galaAgendaEn, a = galaAgendaAr;
  assert.deepEqual(a.acts.map((x) => x.items.map((i) => i.time)), e.acts.map((x) => x.items.map((i) => i.time)));
  assert.equal(a.acts.length, 4);
  for (const act of a.acts) { assert.match(act.label + act.name, /[؀-ۿ]/); for (const i of act.items) assert.match(i.title, /[؀-ۿ]/); }
  assert.match(a.footnote, /بتوقيت نيويورك/);
  assert.match(JSON.stringify(a), /رايا أبي راشد/);
  assert.equal(a.brandLine, "MEKI · Every Light Counts");
});

test("independence: the component reads only the static config, and the page renders it instead of the CMS timeline", () => {
  const c = read("../src/components/gala/GalaAgenda.tsx");
  assert.doesNotMatch(c, /fetch|gala-cms|cms\.|PublicEventPage|@\/lib\/api|galaCmsFrom/);
  assert.match(c, /from "@\/content\/gala-agenda"/);
  const page = read("../src/app/[locale]/events/gala-night/page.tsx");
  assert.match(page, /<GalaAgenda locale=\{locale\} \/>/);
  assert.doesNotMatch(page, /<GalaTimeline/);
  const src = read("../src/content/gala-agenda.ts");
  assert.doesNotMatch(src, /fetch|import .* from "@\/lib/);
});
