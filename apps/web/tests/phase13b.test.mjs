// Phase 13B — MEKI "Website Comments.docx" (21 Nov 2026) on the public website (docs/56). Run: pnpm --filter @meki/web test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { galaAr, galaEn } from "../src/content/gala.ts";
import { en } from "../src/content/en.ts";
import { ar } from "../src/content/ar.ts";
import { photoCaption, venuePhotosFrom } from "../src/lib/venue-photos.ts";

const src = (p) => readFileSync(join(import.meta.dirname, "../src", p), "utf8");

test("donation section: the 'Luxor · WASH program' badge is no longer rendered beside 'Give today'; the WASH programme stays", () => {
  const hero = src("components/sections/Hero.tsx");
  assert.doesNotMatch(hero, /\{h\.photoCaption\}/);
  assert.ok(en.programmes.items.some((p) => p.slug === "wash"), "WASH programme kept");
  // still preview-only: no payment taken
  assert.match(en.quick.note, /No payment is taken/);
});

test("refreshments: exact client wording replaces the alcohol-free card; other five cards unchanged", () => {
  const items = galaEn.experience.items;
  assert.equal(items.length, 6);
  assert.deepEqual(items[2], {
    title: "Refined Refreshments",
    text: "A curated selection of fresh juices, premium teas, coffee, and sparkling beverages, thoughtfully served throughout the evening",
  });
  assert.deepEqual(items.map((i) => i.title), ["Black-tie evening", "Plated halal dinner", "Refined Refreshments", "Lamp-lighting moment", "Craft display", "Live auction"]);
  assert.equal(galaAr.experience.items.length, 6);
  for (const g of [galaEn, galaAr]) assert.doesNotMatch(JSON.stringify(g.experience), /alcohol|كحول/i);
});

test("arrival and transfers removed (EN/AR); venue address and map link kept", () => {
  for (const g of [galaEn, galaAr]) {
    assert.ok(!("arrival" in g.venue) && !("arrivalPending" in g.venue));
    // ("إمكانية الوصول" = accessibility, which stays; only arrival/transport content is removed)
    assert.doesNotMatch(JSON.stringify(g), /Transfers|transportation|Arrival|التنقل|"الوصول"|معلومات الوصول/);
    assert.match(g.venue.address, /583/);
  }
  const sections = src("components/gala/GalaSections.tsx");
  assert.doesNotMatch(sections, /v\.arrival/);
  assert.match(sections, /href=\{mapUrl\}/);
});

test("dietary: the five client options are listed (EN/AR); no claim that SDI's form collects them", () => {
  const diet = galaEn.faq.items.find((i) => i.q === "Dining and dietary requirements");
  for (const o of ["gluten-free", "vegan", "vegetarian", "nut allergy", "dairy-free"]) assert.match(diet.a, new RegExp(o));
  const dietAr = galaAr.faq.items.find((i) => i.q === "الطعام والاحتياجات الغذائية");
  for (const o of ["الغلوتين", "نباتي صرف", "نباتي", "المكسرات", "الألبان"]) assert.match(dietAr.a, new RegExp(o));
  for (const g of [galaEn, galaAr]) assert.doesNotMatch(JSON.stringify(g.faq), /Zeffy/);
  assert.equal(galaEn.faq.items.length, galaAr.faq.items.length);
});

test("captions: unified 'Title – Place' on the gallery and About photos (EN/AR, same count, no '·' separators)", () => {
  for (const t of [en, ar]) {
    for (const c of [...t.gallery.items.map((i) => i.caption), t.about.captionA, t.about.captionB]) {
      assert.match(c, /^\S.* – \S.*$/, c);
      assert.doesNotMatch(c, /·/);
    }
  }
  assert.equal(en.gallery.items.length, ar.gallery.items.length);
  // places are the ones in the source folders — nothing new invented
  assert.deepEqual(en.gallery.items.map((i) => i.caption.split(" – ")[1]), ["Alexandria", "Luxor", "Beni Suef", "Egypt", "Egypt", "Luxor", "Egypt"]);
});

test("venue photos: only from the published EVENT_VENUE section; none -> nothing rendered; caption 'Title – Place'", () => {
  assert.deepEqual(venuePhotosFrom(null), []);
  assert.deepEqual(venuePhotosFrom({ sections: [{ key: "EVENT_ABOUT", items: [{ title: "x", media: { url: "https://cdn.example.org/a.webp" } }] }] }), []);
  const page = {
    sections: [
      {
        key: "EVENT_VENUE",
        items: [
          { title: "Grand hall", text: "583 Park Avenue, New York", media: { url: "https://cdn.example.org/hall.webp", alt: "The hall set for dinner", width: 2000, height: 1333 } },
          { title: "No media" },
          { title: "Insecure", media: { url: "http://x.example.org/a.webp" } },
          { title: "Protocol-relative", media: { url: "//x.example.org/a.webp" } },
          { title: "Demo", provenance: "DEMO", media: { url: "https://cdn.example.org/demo.webp" } },
          { title: "  ", media: { url: "https://cdn.example.org/untitled.webp" } },
        ],
      },
    ],
  };
  const photos = venuePhotosFrom(page);
  assert.equal(photos.length, 1);
  assert.equal(photos[0].alt, "The hall set for dinner");
  assert.equal(photoCaption(photos[0].title, photos[0].place), "Grand hall – 583 Park Avenue, New York");
  assert.equal(photoCaption("Entrance", ""), "Entrance");
  const sections = src("components/gala/GalaSections.tsx");
  assert.match(sections, /if \(shown\.length === 0\) return null;/);
  assert.match(galaEn.venue.photos, /Venue photographs/);
});

test("agenda and price remain the Nov 19 / 21 Nov values (no regression)", () => {
  assert.equal(galaEn.attendance.price, "USD 500");
  assert.equal(galaEn.timeline.acts.flatMap((a) => a.items).length, 10);
  assert.equal(galaEn.timeline.acts.at(-1).items.at(-1).time, "8:15 PM");
  for (const g of [galaEn, galaAr]) assert.doesNotMatch(JSON.stringify(g), /750|Raya|Shousha|Abirached/);
});
