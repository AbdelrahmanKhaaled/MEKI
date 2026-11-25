// MEKI client edits — "MEKI-US Website Edits for the IT Team" (22 Nov 2026) + feedback (23 Nov 2026).
// docs/MEKI_CLIENT_EDIT_STATUS.md. Run: pnpm --filter @meki/web test
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { en } from "../src/content/en.ts";
import { ar } from "../src/content/ar.ts";
import { galaAr, galaEn } from "../src/content/gala.ts";
import { EMPTY_GALA_CMS, experienceCards, galaCmsFrom } from "../src/lib/gala-cms.ts";

const src = (p) => readFileSync(join(import.meta.dirname, "../src", p), "utf8");
const pub = (p) => join(import.meta.dirname, "../public", p);

test("item 3: hero intro is the approved mission (EN), Arabic mirrors it", () => {
  assert.equal(en.hero.lead, "We partner with people, communities and institutions worldwide to deliver evidence-based development that lasts, with every contribution transparently accounted for and its impact measured.");
  assert.equal(ar.hero.lead, ar.about.mission);
});

test("item 4: 'Misr El-Kheir' never breaks across lines (hero eyebrow and lead, About, footer)", () => {
  const nb = src("components/NoBreak.tsx");
  assert.match(nb, /Misr El-Kheir/);
  assert.match(nb, /whitespace-nowrap/);
  assert.match(src("components/sections/Hero.tsx"), /<NoBreak text=\{h\.eyebrow\} \/>/);
  assert.match(src("components/sections/Hero.tsx"), /<NoBreak text=\{h\.lead\} \/>/);
  assert.match(src("components/sections/FinalFooter.tsx"), /<NoBreak text=\{f\.legacy\} \/>/);
});

test("item 6: Who we are — approved two paragraphs, legacy line no longer rendered there", () => {
  const paras = en.about.body.split(/\n\s*\n/);
  assert.equal(paras.length, 2);
  assert.match(paras[0], /^For 20 years, Misr El-Kheir has worked alongside families/);
  assert.match(paras[1], /MEKI brings that experience to partners around the world\.$/);
  assert.equal(ar.about.body.split(/\n\s*\n/).length, 2);
  const about = src("components/sections/TrustAbout.tsx");
  assert.doesNotMatch(about, /\{a\.legacy\}/);
  assert.match(about, /a\.body\.split\(\/\\n\\s\*\\n\/\)/);
});

test("item 7 (superseded 25 Nov by the Programs Word document — see tests/nov25.test.mjs): nine programs with subtitle, summary, areas and outcomes — EN and AR", () => {
  assert.equal(en.programmes.title, "Nine Programs. One Commitment.");
  assert.match(en.programmes.intro, /^Building on 20 years of experience/);
  assert.equal(en.programmes.themesLabel, "Areas of work");
  assert.equal(en.programmes.outcomesLabel, "The change we aim to create");
  for (const t of [en, ar]) {
    assert.equal(t.programmes.items.length, 9);
    for (const p of t.programmes.items) {
      assert.ok(p.short && p.summary, p.slug);
      assert.ok(p.themes.length >= 2 && p.themes.length <= 3, p.slug);
      assert.equal(p.areaTexts.length, p.themes.length, p.slug);
      assert.ok(p.outcomes.length >= 4, p.slug);
    }
  }
  const health = en.programmes.items.find((p) => p.slug === "health");
  assert.deepEqual(health.themes, ["Improving Equitable Access to Healthcare", "Strengthening Continuity and Financial Protection", "Advancing Healthcare Service Capacity"]);
  assert.equal(en.programmes.items[0].short, "Alleviating Basic Household Needs Today. Building Resilience for Tomorrow.");
  // the block order on the page: italic line → sentences → What we do → The change we aim for
  const comp = src("components/sections/Programmes.tsx");
  const order = ["{item.short}", "{item.summary}", "{p.themesLabel}", "{p.outcomesLabel}"].map((k) => comp.indexOf(k));
  assert.ok(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), `layout order ${order}`);
  assert.doesNotMatch(comp, /\{cur\.mandate\}|\{item\.mandate\}/);
});

test("item 7: 'How it works' — five numbered steps in one row (EN/AR)", () => {
  assert.deepEqual(en.programmes.how.map((s) => s.title), ["Understand", "Plan", "Connect", "Adapt", "Measure"]);
  assert.equal(ar.programmes.how.length, 5);
  assert.match(src("components/sections/Programmes.tsx"), /lg:grid-cols-5/);
  assert.match(src("lib/content.ts"), /byCode\(progSec, "how-"\)/);
});

test("item 9: US spelling — no 'enrol' / 'enrolment' in English copy", () => {
  assert.doesNotMatch(JSON.stringify(en), /\benrol\b|\benrolment\b/);
});

test("item 10: enabling functions — 'They are capabilities, not programs.' removed; tagline + sentence per function", () => {
  assert.equal(en.enabling.intro, "Three capabilities support all nine programs.");
  assert.doesNotMatch(JSON.stringify([en.enabling, ar.enabling]), /capabilities, not programs|إنها قدرات، وليست برامج/);
  // 25 Nov: taglines from the Programs Word document
  assert.deepEqual(en.enabling.items.map((i) => i.tagline), ["Stronger Local Partners. Greater Community Impact.", "Closer to Communities. More Responsive to Their Needs.", "Turning Evidence into Meaningful Action."]);
  assert.equal(ar.enabling.items.every((i) => i.tagline && i.text), true);
});

test("item 11: 'Released against milestones, with results reported back' replaced in the trust strip and Why support MEKI", () => {
  assert.equal(en.trust[1].title, "Results are reported back to supporters.");
  assert.match(en.why.items[0].text, /Results are reported back to supporters\.$/);
  assert.doesNotMatch(JSON.stringify([en.trust, en.why]), /released against milestones|Released against milestones/);
  assert.match(src("components/sections/TrustAbout.tsx"), /\{item\.text && /);
});

test("items 12 + 23 Nov feedback: one gallery caption format 'Title – Place' with the program; only known program slugs", () => {
  const slugs = new Set(en.programmes.items.map((p) => p.slug));
  for (const t of [en, ar]) {
    assert.equal(t.gallery.items.length, 7);
    for (const g of t.gallery.items) {
      assert.ok(g.title && g.place, JSON.stringify(g));
      assert.doesNotMatch(g.title, / – |·/);
      assert.ok(slugs.has(g.program), g.program);
    }
  }
  assert.deepEqual(en.gallery.items.map((g) => g.program), ar.gallery.items.map((g) => g.program));
  const gallery = src("components/sections/Gallery.tsx");
  assert.match(gallery, /photoCaption\(item\.title, item\.place\)/);
  assert.match(gallery, /programName\(t, item\.program\)/);
  // the mobile column is full width, so the image request must be too (was "50vw" → blurry on phones)
  assert.match(gallery, /\(min-width:640px\) 48vw, 100vw/);
});

test("item 13: one capitalization style for buttons", () => {
  assert.equal(en.hero.ctaSecondary, "Explore our programs");
  assert.equal(en.hero.ctaPrimary, "Attend the Gala");
  assert.equal(galaEn.hero.cta, "Book your place");
  assert.equal(galaEn.booking.book.cta, "Book your place");
  assert.equal(galaEn.venue.mapLabel, "View on map");
  const all = JSON.stringify([en, galaEn]) + src("content/pages.ts");
  assert.doesNotMatch(all, /Explore Our Programs|Book Your Place|Donate Without Attending|View On Map/);
});

test("item 14: 'Follow us' with Instagram @meki.intr in the footer and at the end of the Gala page; links open in a new tab", () => {
  assert.deepEqual(en.footer.social.map((l) => l.network), ["linkedin", "facebook", "instagram"]); // 24 Nov 2026: three official accounts
  assert.deepEqual(ar.footer.social, en.footer.social);
  const social = src("components/SocialLinks.tsx");
  assert.match(social, /target="_blank"/);
  assert.match(social, /rel="noopener noreferrer"/);
  assert.match(social, /if \(shown\.length === 0\) return null;/);
  assert.match(src("components/sections/FinalFooter.tsx"), /<SocialLinks links=\{f\.social\}/);
  assert.match(src("app/[locale]/events/gala-night/page.tsx"), /<GalaFollow g=\{g\} links=\{t\.footer\.social\}/);
  // only https links from Site settings are accepted (validated in lib/content.ts)
  assert.match(src("lib/content.ts"), /export function socialLinks\(/);
});

test("item 15: approved logo files everywhere — green on light, white on dark; icon-only favicon; new link-sharing image", () => {
  const logo = src("components/Logo.tsx");
  assert.match(logo, /\/brand\/MEKI_Secondary_Green\.png/);
  assert.match(logo, /\/brand\/MEKI_Secondary_White\.png/);
  assert.match(logo, /width=\{1200\} height=\{365\}/); // intrinsic ratio of the approved artwork → never stretched
  for (const f of ["brand/MEKI_Secondary_Green.png", "brand/MEKI_Secondary_White.png", "brand/MEKI_Icon_Approved_32.png", "brand/MEKI_Icon_Approved_Apple_180.png", "og/meki-og-approved-logo.jpg"]) assert.ok(existsSync(pub(f)), f);
  assert.match(src("app/[locale]/layout.tsx"), /MEKI_Icon_Approved_32\.png/);
  assert.match(src("lib/site.ts"), /\/og\/meki-og-approved-logo\.jpg/);
  const header = src("components/Header.tsx");
  assert.match(header, /<Logo variant="white"/); // transparent header over the dark green hero
  assert.match(header, /<Logo variant="green"/); // solid light header
  assert.match(src("components/sections/FinalFooter.tsx"), /<Logo variant="white"/);
  const manifest = JSON.parse(readFileSync(pub("brand/approved-logo-manifest.json"), "utf8"));
  assert.ok(manifest.files.some((f) => f.source === "MEKI_secondary_green.png") && manifest.files.some((f) => f.source === "MEKI_secondary_rev.png"));
});

test("Gala item 14: no glowing dots, particles or abstract lights image on the Gala page", () => {
  const gala = src("components/gala/GalaSections.tsx");
  assert.doesNotMatch(gala, /LampField|PointsOfLight|p10-lamp|p10-travel|spin-slower-rev|pulse-soft/);
});

test("Gala items 18–19: five experience cards; Set-menu dinner, Virgin bar; no Craft display; auction names no brands", () => {
  for (const g of [galaEn, galaAr]) {
    assert.deepEqual(g.experience.items.map((i) => i.code), ["black-tie", "dinner", "bar", "lamps", "auction"]);
    assert.doesNotMatch(JSON.stringify(g.experience), /Craft|craft|الحِرف/);
  }
  assert.deepEqual(galaEn.experience.items[1], { code: "dinner", title: "Set-menu dinner", text: "A plated, halal set menu." });
});

test("Gala item 20: 'The evening at a glance'; no '(America/New_York)'", () => {
  assert.equal(galaEn.timeline.title, "The evening at a glance");
  for (const g of [galaEn, galaAr]) assert.doesNotMatch(JSON.stringify(g), /America\/New_York/);
});

test("Gala items 17, 21, 22: host line, cross street + ZIP, one ticket per guest with no plus-one, USD 500 kept", () => {
  assert.equal(galaEn.host.name, "Raya Abirached");
  assert.equal(galaEn.host.line, "Your host for the evening.");
  assert.equal(galaEn.venue.address, "583 Park Avenue (at East 63rd Street), New York, NY 10065"); // format confirmed 24 Nov 2026
  assert.match(galaAr.venue.address, /10065/);
  assert.deepEqual(galaEn.attendance.rules, ["One ticket per guest", "Each ticket carries the guest's own name", "No plus-one"]);
  assert.equal(galaEn.attendance.price, "USD 500");
});

test("Gala CMS: nothing is shown without published material; only https/same-origin images; DEMO ignored", () => {
  assert.deepEqual(galaCmsFrom(null), EMPTY_GALA_CMS);
  assert.deepEqual(galaCmsFrom({ sections: [] }).heroImage, null);
  const page = {
    sections: [
      { key: "EVENT_HERO", media: { url: "https://api.example.org/media/venue.webp", alt: "583 Park Avenue at dusk" } },
      { key: "EVENT_ABOUT", items: [{ title: "Grand Ballroom", text: "583 Park Avenue", media: { url: "https://api.example.org/media/hall.webp" } }, { title: "no image" }] },
      {
        key: "EVENT_HIGHLIGHTS",
        items: [
          { code: "dinner", media: { url: "https://api.example.org/media/dish.webp", alt: "Plated dish" } },
          { code: "bar", title: "Virgin bar", media: { url: "http://insecure.example.org/a.webp" } },
          { code: "lamps", provenance: "DEMO", media: { url: "https://api.example.org/media/demo.webp" } },
        ],
      },
      { key: "EVENT_SPEAKERS", items: [{ code: "host", media: { url: "/media/raya.webp", alt: "Raya Abirached" } }] },
      {
        key: "EVENT_SPONSORSHIP",
        ctaPrimaryHref: "https://example.org/packages.pdf",
        items: [{ title: "Partner A", media: { url: "https://api.example.org/media/a.png" }, href: "javascript:alert(1)" }, { title: "No logo" }],
      },
      { key: "EVENT_CONTACT", items: [{ code: "email", href: "mailto:gala@example.org" }] },
    ],
  };
  const c = galaCmsFrom(page);
  assert.equal(c.heroImage.src, "https://api.example.org/media/venue.webp");
  assert.equal(c.purposePhotos.length, 1);
  assert.equal(c.experience.dinner.image.alt, "Plated dish");
  assert.equal(c.experience.bar.image, undefined); // http image refused
  assert.equal(c.experience.lamps, undefined); // DEMO skipped
  assert.equal(c.host.image.src, "/media/raya.webp");
  assert.deepEqual(c.sponsorship, { href: "https://example.org/packages.pdf", label: undefined, document: false });
  assert.deepEqual(c.partners.map((p) => [p.name, p.href]), [["Partner A", undefined]]); // unsafe link dropped, logo kept
  assert.equal(c.contactEmail, "gala@example.org");
  // a non-https sponsorship link never produces a button
  assert.equal(galaCmsFrom({ sections: [{ key: "EVENT_SPONSORSHIP", ctaPrimaryHref: "http://x.example.org" }] }).sponsorship, null);
  assert.equal(galaCmsFrom({ sections: [{ key: "EVENT_CONTACT", items: [{ href: "mailto:not-an-email" }] }] }).contactEmail, null);
  // card wording stays the approved copy unless an editor overrides it
  const cards = experienceCards(galaEn, c);
  assert.equal(cards[1].title, "Set-menu dinner");
  assert.equal(cards[1].image.src, "https://api.example.org/media/dish.webp");
  assert.equal(cards[2].title, "Virgin bar");
});

test("Gala page: sponsor button only with a published link; partner logos and contact email only when published", () => {
  const gala = src("components/gala/GalaSections.tsx");
  assert.match(gala, /\{sponsor \? \(/);
  assert.match(gala, /\{s\.pending\}/); // the 'being finalized' note stays until MEKI supplies the packages
  assert.match(gala, /\{partners\.length > 0 && \(/);
  assert.match(gala, /\{contactEmail && \(/);
  assert.match(gala, /\{!lead && \(/); // the drawn map stays until venue photos are published
  const page = src("app/[locale]/events/gala-night/page.tsx");
  assert.match(page, /const published = event \? galaCmsFrom\(/);
  assert.match(page, /<SponsorshipSection g=\{g\} tiers=\{sponsorPreview \? PROPOSED_SPONSORSHIP : undefined\} sponsor=\{cms\.sponsorship\} partners=\{cms\.partners\} \/>/);
});

test("Hero photos: the approved 24 Nov 2026 delivery (Home P) replaced the old lady / pier photos as the built-in default", () => {
  assert.equal(en.hero.image, "hero-family");
  assert.equal(en.hero.secondaryImage, "hero-school");
  assert.match(src("components/sections/Hero.tsx"), /slotImage\(h\.image, "hero-family"\)/);
});
