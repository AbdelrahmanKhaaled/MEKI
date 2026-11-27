// MEKI client confirmations, 24 Nov 2026 (docs/MEKI_CLIENT_EDIT_STATUS.md §7). Run: pnpm --filter @meki/web test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { en } from "../src/content/en.ts";
import { ar } from "../src/content/ar.ts";
import { galaAr, galaEn } from "../src/content/gala.ts";
import { experienceCards, galaCmsFrom, isPdfUrl } from "../src/lib/gala-cms.ts";
import { isAllowedRemoteImage } from "../src/content/media.ts";

const src = (p) => readFileSync(join(import.meta.dirname, "../src", p), "utf8");
const API = "https://api.meki-us.org";

/** A published Gala landing page as the public API returns it after the 24 Nov 2026 sync (Media Library URLs). */
const page = {
  sections: [
    { key: "EVENT_HERO", media: { url: `${API}/media/uploads/2026/11/aaa.jpg`, alt: "583 Park Avenue at night", width: 1809, height: 1298 } },
    { key: "EVENT_VENUE", media: { url: `${API}/media/uploads/2026/11/logo.png`, alt: "583 Park Avenue, New York", width: 1000, height: 1000 }, items: [{ title: "Building exterior", text: "583 Park Avenue, New York", media: { url: `${API}/media/uploads/2026/11/day.jpg`, width: 547, height: 365 } }] },
    { key: "EVENT_SPEAKERS", items: [{ code: "host", media: { url: `${API}/media/uploads/2026/11/raya.png`, alt: "Raya Abirached, host of the evening", width: 1056, height: 1030 } }] },
    { key: "EVENT_SPONSORSHIP", media: { url: `${API}/media/uploads/2026/11/packages.pdf`, alt: null }, ctaPrimaryHref: null },
    { key: "EVENT_HIGHLIGHTS", items: [{ code: "bar", title: "Virgin Drinks" }] },
  ],
};

test("Experience: card 3 is 'Virgin Drinks' (EN) everywhere — dictionary, CMS sync data, admin label; no Craft display", () => {
  assert.equal(galaEn.experience.items.find((i) => i.code === "bar").title, "Virgin Drinks");
  assert.equal(galaEn.experience.items.find((i) => i.code === "dinner").title, "Set-menu dinner");
  for (const g of [galaEn, galaAr]) assert.doesNotMatch(JSON.stringify(g.experience), /Virgin bar|Craft|كحول|الحِرف/);
  const data = JSON.parse(readFileSync(join(import.meta.dirname, "../../../deploy/staging/apply-nov23-client-edits.data.json"), "utf8"));
  assert.equal(data.gala.experience.cards.find((c) => c.code === "bar").titleEn, "Virgin Drinks");
  assert.deepEqual(data.gala.experience.cards.map((c) => c.code), galaEn.experience.items.map((i) => i.code));
  assert.match(readFileSync(join(import.meta.dirname, "../../admin/src/lib/i18n-gala.ts"), "utf8"), /Card 3 — Virgin Drinks/);
});

test("Venue: confirmed address; hero = venue photo from the CMS; first venue photo replaces the map; logo only in the venue area", () => {
  assert.equal(galaEn.venue.address, "583 Park Avenue (at East 63rd Street), New York, NY 10065");
  assert.match(galaAr.venue.address, /\(عند الشارع 63 الشرقي\)/);
  const c = galaCmsFrom(page);
  assert.equal(c.heroImage.src, `${API}/media/uploads/2026/11/aaa.jpg`);
  assert.equal(c.venueLogo.src, `${API}/media/uploads/2026/11/logo.png`);
  assert.deepEqual(c.venuePhotos.map((p) => [p.title, p.w]), [["Building exterior", 547]]);
  const gala = src("components/gala/GalaSections.tsx");
  // a small photo is never enlarged beyond its own width
  assert.match(gala, /style=\{lead\.w \? \{ maxWidth: lead\.w \} : undefined\}/);
  // the venue logo keeps its proportions (intrinsic width/height, width-only sizing) and sits on Deep Green
  assert.match(gala, /width=\{logo\.w \?\? 1000\} height=\{logo\.h \?\? 1000\}/);
  assert.match(gala, /bg-deep-green p-4/);
  // the MEKI logo is not replaced: the venue logo is referenced only by the venue section
  assert.equal((gala.match(/logo\.src/g) ?? []).length, 1);
  assert.doesNotMatch(src("components/Logo.tsx"), /583|Park/);
  // hero overlay keeps text readable; no particles/lamps came back
  assert.match(gala, /rgb\(7_42_34\/0\.72\)/);
  assert.doesNotMatch(gala, /LampField|PointsOfLight|pulse-soft/);
});

test("Host: photo from the published Media Library asset, approved name and line, square crop without distortion", () => {
  const c = galaCmsFrom(page);
  assert.equal(c.host.image.src, `${API}/media/uploads/2026/11/raya.png`);
  assert.equal(c.host.name, undefined); // name/line come from the approved copy unless an editor overrides them
  assert.equal(galaEn.host.name, "Raya Abirached");
  assert.equal(galaEn.host.line, "Your host for the evening.");
  const gala = src("components/gala/GalaSections.tsx");
  assert.match(gala, /object-cover object-top/);
  assert.match(gala, /sizes="\(min-width:640px\) 192px, 160px"/); // ≤ 192 px from a 1056 px source: never upscaled
});

test("Sponsor now + Sponsorship packages: both the official Givebutter sponsorship link and the packages PDF are offered side by side", () => {
  const c = galaCmsFrom(page);
  assert.deepEqual(c.sponsorship, { href: `${API}/media/uploads/2026/11/packages.pdf`, label: undefined, document: true });
  // when both PDF and external URL exist in CMS, both are preserved (PDF as href + external URL as sponsorHref)
  assert.deepEqual(galaCmsFrom({ sections: [{ key: "EVENT_SPONSORSHIP", media: { url: `${API}/media/x.pdf` }, ctaPrimaryHref: "https://givebutter.com/c/misr-el-kheir-foundation-spring-of-dignity-gala-new-york-sponsors" }] }).sponsorship, {
    href: `${API}/media/x.pdf`,
    label: undefined,
    document: true,
    sponsorHref: "https://givebutter.com/c/misr-el-kheir-foundation-spring-of-dignity-gala-new-york-sponsors",
  });
  assert.equal(galaCmsFrom({ sections: [{ key: "EVENT_SPONSORSHIP", media: { url: "http://evil.example/x.pdf" } }] }).sponsorship, null);
  assert.equal(galaCmsFrom({ sections: [{ key: "EVENT_SPONSORSHIP", media: { url: `${API}/media/x.png` } }] }).sponsorship, null);
  assert.equal(galaCmsFrom({ sections: [{ key: "EVENT_SPONSORSHIP", provenance: "DEMO", media: { url: `${API}/media/x.pdf` } }] }).sponsorship, null);
  const gala = src("components/gala/GalaSections.tsx");
  assert.match(gala, /type: "application\/pdf"/);
  assert.match(gala, /data-testid="gala-sponsor-now"/);
  assert.match(gala, /gala-sponsor-packages/);
  assert.match(gala, /\{s\.docNote\}/);
  assert.match(galaEn.sponsorship.docNote, /proposed contributions/);
  assert.match(galaEn.sponsorship.pdf, /PDF, opens in a new tab/);
  assert.equal(galaEn.sponsorship.packagesCta, "Sponsorship packages");
  assert.equal(galaAr.sponsorship.packagesCta, "باقات الرعاية");
  const assetsSrc = src("content/gala-assets.ts");
  assert.match(assetsSrc, /OFFICIAL_GALA_FORMS\.sponsor/);
  assert.match(assetsSrc, /\/gala\/sponsorship-packages\.pdf/);
  // no tiers, prices or payment UI on the public page; dev-only preview stays gated
  assert.match(src("app/[locale]/events/gala-night/page.tsx"), /process\.env\.NODE_ENV !== "production" && process\.env\.NEXT_PUBLIC_GALA_PREVIEW === "1"/);
  assert.doesNotMatch(JSON.stringify([galaEn.sponsorship, galaAr.sponsorship]), /USD|100,000|checkout|pay/i);
});

test("A PDF is never rendered as an image anywhere on the website", () => {
  assert.equal(isPdfUrl(`${API}/media/a.pdf?x=1`), true);
  assert.equal(isPdfUrl(`${API}/media/a.png`), false);
  const c = galaCmsFrom({ sections: [{ key: "EVENT_HERO", media: { url: `${API}/media/a.pdf` } }, { key: "EVENT_SPEAKERS", items: [{ code: "host", media: { url: `${API}/media/a.pdf` } }] }] });
  assert.equal(c.heroImage, null);
  assert.equal(c.host.image, undefined);
  assert.equal(isAllowedRemoteImage(`${API}/media/uploads/a.pdf`, API), false);
  assert.equal(isAllowedRemoteImage(`${API}/media/uploads/a.jpg`, API), true);
  // experience cards keep icons until real photos exist (no venue photo on dinner/drinks)
  const cards = experienceCards(galaEn, galaCmsFrom(page));
  assert.equal(cards.find((x) => x.code === "bar").image, undefined);
  assert.equal(cards.find((x) => x.code === "dinner").image, undefined);
});

test("Social: three official accounts (DB first, these as fallback) with platform icons, new tab, accessible labels", () => {
  const want = [
    ["linkedin", "https://www.linkedin.com/company/misr-el-kheir-international"],
    ["facebook", "https://www.facebook.com/meki.Intr/"],
    ["instagram", "https://www.instagram.com/meki.intr/"],
  ];
  for (const t of [en, ar]) assert.deepEqual(t.footer.social.map((l) => [l.network, l.url]), want);
  const social = src("components/SocialLinks.tsx");
  for (const n of ["linkedin", "facebook", "instagram"]) assert.match(social, new RegExp(`case "${n}":`));
  assert.match(social, /target="_blank"/);
  assert.match(social, /<span className="sr-only">/);
  // site settings (DB) win over the fallback
  assert.match(src("lib/content.ts"), /t\.footer\.social = socialLinks\(home\.site\?\.socialLinks, t\.footer\.social\)/);
  const data = JSON.parse(readFileSync(join(import.meta.dirname, "../../../deploy/staging/apply-nov23-client-edits.data.json"), "utf8"));
  assert.deepEqual(data.site.socialLinksConfirmed.map((l) => [l.network, l.url]), want);
});
