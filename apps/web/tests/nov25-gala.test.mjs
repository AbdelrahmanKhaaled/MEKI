// MEKI final Gala content, 25 Nov 2026 (docs/MEKI_CLIENT_EDIT_STATUS.md "Gala (25 Nov)"). Run: pnpm --filter @meki/web test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { galaEn } from "../src/content/gala.ts";
import { experienceCards, galaCmsFrom } from "../src/lib/gala-cms.ts";

const root = join(import.meta.dirname, "../../..");
const read = (p) => readFileSync(join(root, p), "utf8");
const API = "https://api.meki-us.org";
const logo = (n) => ({ url: `${API}/media/uploads/2026/11/${n}.png`, alt: "Generic media alt", width: 400, height: 200 });

test("Partners: shown only when an item is published AND has a logo; name is the alt; unsafe link dropped; DEMO and PDFs never render", () => {
  // the API snapshot already omits hidden (isVisible=false) items; entries without a logo can still arrive (visible, logo-less)
  const page = {
    sections: [
      {
        key: "EVENT_SPONSORSHIP",
        items: [
          { code: "partner-bokra", title: "Bokra", media: logo("bokra"), href: "https://bokra.example/" },
          { code: "partner-waterway", title: "The Waterway", media: null },
          { code: "x", title: "Demo partner", media: logo("demo"), provenance: "DEMO" },
          { code: "y", title: "Bad link", media: logo("bad"), href: "javascript:alert(1)" },
          { code: "z", title: "PDF as logo", media: { url: `${API}/media/a.pdf` } },
        ],
      },
    ],
  };
  const c = galaCmsFrom(page);
  assert.deepEqual(c.partners.map((p) => [p.name, p.href]), [["Bokra", "https://bokra.example/"], ["Bad link", undefined]]);
  // nothing published → nothing rendered (the section needs partners.length > 0)
  assert.deepEqual(galaCmsFrom({ sections: [{ key: "EVENT_SPONSORSHIP", items: [{ code: "partner-bokra", title: "Bokra" }] }] }).partners, []);
  assert.deepEqual(galaCmsFrom(null).partners, []);
  const gala = read("apps/web/src/components/gala/GalaSections.tsx");
  assert.match(gala, /\{partners\.length > 0 && \(/);
  assert.match(gala, /alt=\{p\.name\}/); // alt text = partner name
  assert.doesNotMatch(gala, /placeholder-logo|logo-placeholder/i);
});

test("Partners are modelled as hidden, logo-less items of EVENT_SPONSORSHIP — in the seed, the sync data and the Admin", () => {
  const seed = read("apps/api/prisma/seed/gala-night.ts");
  assert.match(seed, /code: 'partner-bokra', titleEn: 'Bokra', provenance: 'PROPOSED', isVisible: false/);
  assert.match(seed, /code: 'partner-waterway', titleEn: 'The Waterway', provenance: 'PROPOSED', isVisible: false/);
  const data = JSON.parse(read("deploy/staging/nov25/gala.data.json"));
  assert.deepEqual(data.partners.map((p) => p.code), ["partner-bokra", "partner-waterway"]);
  const admin = read("apps/admin/src/features/gala/settings/GalaPageCard.tsx");
  assert.match(admin, /suggestedCodes: \["partner-bokra", "partner-waterway"\]/);
  assert.match(admin, /isVisible: false/); // new partner entries start hidden
});

test("Host: approved photo comes from the published CMS item; nothing gates it on an approval flag any more", () => {
  const c = galaCmsFrom({ sections: [{ key: "EVENT_SPEAKERS", items: [{ code: "host", media: logo("raya") }] }] });
  assert.equal(c.host.image.src, `${API}/media/uploads/2026/11/raya.png`);
  assert.equal(galaCmsFrom({ sections: [{ key: "EVENT_SPEAKERS", items: [{ code: "host" }] }] }).host.image, undefined); // no photo → name and line only
  assert.doesNotMatch(read("apps/web/src/components/gala/GalaSections.tsx"), /only\s*\n?\s*\* once MEKI publishes/);
  assert.equal(JSON.parse(read("deploy/staging/nov25/gala.data.json")).assets.host.consentStatus, "CONFIRMED");
});

test("Venue: only exteriors are claimed; no interior / hall / ballroom wording in Gala copy, venue code or Admin examples", () => {
  for (const f of ["apps/web/src/content/gala.ts", "apps/web/src/lib/venue-photos.ts", "apps/web/src/components/gala/GalaSections.tsx"]) {
    assert.doesNotMatch(read(f).replace(/never described as interiors/g, ""), /interior|ballroom|grand hall|\bhall photo/i, f);
  }
  const adminI18n = read("apps/admin/src/lib/i18n-gala.ts");
  assert.doesNotMatch(adminI18n, /Grand hall|Grand Ballroom/);
  assert.equal(galaEn.venue.address, "583 Park Avenue (at East 63rd Street), New York, NY 10065");
});

test("Experience: exterior photo only on the arrival card; dinner/drinks/lamps/auction never get a venue photo; wording approved", () => {
  const data = JSON.parse(read("deploy/staging/nov25/gala.data.json"));
  assert.equal(data.cardImage.code, "black-tie");
  const cms = galaCmsFrom({ sections: [{ key: "EVENT_HIGHLIGHTS", items: [{ code: "black-tie", media: { url: `${API}/media/day.jpg`, alt: "The façade of 583 Park Avenue" } }] }] });
  const cards = experienceCards(galaEn, cms);
  assert.equal(cards.find((c) => c.code === "black-tie").image.alt, "The façade of 583 Park Avenue");
  for (const code of ["dinner", "bar", "lamps", "auction"]) assert.equal(cards.find((c) => c.code === code).image, undefined);
  assert.equal(cards.find((c) => c.code === "dinner").title, "Set-menu dinner");
  assert.equal(cards.find((c) => c.code === "bar").title, "Virgin Drinks");
});

test("Contact: Gala inquiries e-mail Inquiries@meki-us.org is read from the published EVENT_CONTACT item", () => {
  const c = galaCmsFrom({ sections: [{ key: "EVENT_CONTACT", items: [{ code: "email", href: "mailto:Inquiries@meki-us.org" }] }] });
  assert.equal(c.contactEmail, "Inquiries@meki-us.org");
  assert.match(read("apps/api/prisma/seed/gala-night.ts"), /GALA_INQUIRIES_EMAIL = 'Inquiries@meki-us\.org'/);
  assert.equal(JSON.parse(read("deploy/staging/nov25/gala.data.json")).contactEmail, "Inquiries@meki-us.org");
});

test("Sponsorship: Sponsor now still opens the PDF; no payment, checkout or acceptance UI on the page", () => {
  const c = galaCmsFrom({ sections: [{ key: "EVENT_SPONSORSHIP", media: { url: `${API}/media/Sponsorship-Packages.pdf` } }] });
  assert.deepEqual(c.sponsorship, { href: `${API}/media/Sponsorship-Packages.pdf`, label: undefined, document: true });
  assert.doesNotMatch(JSON.stringify(galaEn.sponsorship), /checkout|pay now|USD/i);
});
