// MEKI final integration (25 Nov 2026) — CMS ↔ website synchronisation: Site settings in the footer, real navigation menus,
// list-driven gallery, approved hero / program photos. Run: pnpm --filter @meki/web test
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const SRC = join(import.meta.dirname, "../src") + "/";
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === "@/lib/api") return { url: "data:text/javascript,export const fetchPublicContent=async()=>null;", shortCircuit: true };
    if (spec.startsWith("@/")) {
      const base = SRC + spec.slice(2);
      for (const ext of [".ts", ".tsx", "/index.ts"]) if (existsSync(base + ext)) return next(pathToFileURL(base + ext).href, ctx);
    }
    return next(spec, ctx);
  },
});
const { en } = await import("../src/content/en.ts");
const { ar } = await import("../src/content/ar.ts");
const { media, coverSizes } = await import("../src/content/media.ts");
const { resolveMenu, NAV_ORDER } = await import("../src/content/pages.ts");
const { mergeContent, applySiteSettings, galleryItem } = await import(pathToFileURL(SRC + "lib/content.ts").href);
const src = (p) => readFileSync(join(SRC, p), "utf8");

const site = (over = {}) => ({
  orgName: "MEKI", tagline: null, legacyLine: null, logos: { primary: null, inverse: null, icon: null }, contactEmail: null, contactPhone: null, address: null,
  socialLinks: [], defaultLocale: "en", supportedLocales: ["en", "ar"], footerText: null, footerNote: null, copyright: null, seoTitle: null, seoDescription: null, ogImageUrl: null, ...over,
});
const home = (over = {}) => ({ site: site(), donation: {}, page: { sections: [], seoTitle: null, seoDescription: null, hiddenSectionKeys: [] }, programmes: [], campaigns: [], statistics: [], faqs: [], ...over });
const sectionOf = (key, over = {}) => ({ key, eyebrow: null, title: null, subtitle: null, body: null, ctaPrimaryLabel: null, ctaSecondaryLabel: null, media: null, labels: {}, items: [], ...over });

test("bug 2: Copyright saved in Site settings reaches the public footer (EN and AR)", () => {
  for (const [d, text] of [[en, "© MEKI 2027. All rights reserved."], [ar, "© MEKI 2027. جميع الحقوق محفوظة."]]) {
    const t = mergeContent(d, home({ site: site({ copyright: text }) }));
    assert.equal(t.footer.rights, text);
  }
  // the seeded value equals the built-in default → unchanged; absent → built-in
  assert.equal(mergeContent(en, home({ site: site({ copyright: en.footer.rights }) })).footer.rights, en.footer.rights);
  assert.equal(mergeContent(en, home()).footer.rights, en.footer.rights);
  // the footer shows the stored text as written when it carries ©, otherwise prefixes the CURRENT year (never a frozen 2026)
  const footer = src("components/sections/FinalFooter.tsx");
  assert.match(footer, /new Date\(\)\.getFullYear\(\)/);
  assert.doesNotMatch(footer, /const year = 2026/);
  assert.match(footer, /data-testid="footer-copyright"/);
});

test("bug 3: footer text, footer note, contact details, tagline and legacy line from Site settings are consumed; nothing is invented", () => {
  const t = mergeContent(en, home({ site: site({ footerText: "Registered in New York.", footerNote: "Mon–Fri, 9–5 ET", contactEmail: "Inquiries@meki-us.org", contactPhone: "+1 212 555 0100", address: "583 Park Avenue", tagline: "Built Together.", legacyLine: "Inspired by Misr El-Kheir." }) }));
  assert.equal(t.footer.text, "Registered in New York.");
  assert.equal(t.footer.note, "Mon–Fri, 9–5 ET");
  assert.equal(t.footer.email, "Inquiries@meki-us.org");
  assert.equal(t.footer.phone, "+1 212 555 0100");
  assert.equal(t.footer.address, "583 Park Avenue");
  assert.equal(t.footer.tagline, "Built Together.");
  assert.equal(t.footer.legacy, "Inspired by Misr El-Kheir.");
  const none = mergeContent(en, home());
  for (const k of ["text", "note", "email", "phone", "address"]) assert.equal(none.footer[k], undefined, k);
  // the seeded placeholder note is never shown next to real details
  assert.equal(mergeContent(en, home({ site: site({ footerNote: en.footer.contactPending, contactEmail: "a@b.org" }) })).footer.note, undefined);
  // an invalid e-mail is not rendered as a link
  assert.equal(mergeContent(en, home({ site: site({ contactEmail: "not an email" }) })).footer.email, undefined);
  // a value edited in the homepage Footer section keeps priority over the Site-settings one
  const edited = mergeContent(en, home({ site: site({ tagline: "From settings" }), page: { sections: [sectionOf("FOOTER", { title: "From footer section" })], seoTitle: null, seoDescription: null, hiddenSectionKeys: [] } }));
  assert.equal(edited.footer.tagline, "From footer section");
  const footer = src("components/sections/FinalFooter.tsx");
  for (const k of ["f.text", "f.email", "f.phone", "f.address", "f.note"]) assert.ok(footer.includes(k), k);
  assert.match(footer, /mailto:\$\{f\.email\}/);
});

test("Site settings SEO title/description and social links reach the page metadata / footer", () => {
  const t = mergeContent(en, home({ site: site({ seoTitle: "New title", seoDescription: "New description", socialLinks: [{ network: "linkedin", url: "https://www.linkedin.com/company/misr-el-kheir-international" }, { network: "x", url: "javascript:alert(1)" }] }) }));
  assert.equal(t.meta.title, "New title");
  assert.equal(t.meta.description, "New description");
  assert.deepEqual(t.footer.social, [{ network: "linkedin", url: "https://www.linkedin.com/company/misr-el-kheir-international" }]); // https only
  assert.deepEqual(en.footer.social.map((s) => s.network), ["linkedin", "facebook", "instagram"]);
  const s = site({ copyright: "x" });
  const t2 = structuredClone(en);
  applySiteSettings(t2, en, s);
  assert.equal(t2.footer.rights, "x");
  applySiteSettings(t2, en, null); // no site payload → no change, no crash
});

test("bug 1: the seeded / built-in menu IS the website's real navigation (no more '#anchor' entries Admin showed but the site ignored)", () => {
  for (const [d, loc] of [[en, "en"], [ar, "ar"]]) {
    const header = resolveMenu(d.nav.links, loc);
    assert.ok(header, `${loc} header menu must be valid`);
    assert.deepEqual(header.map((l) => l.key), NAV_ORDER);
    assert.ok(d.nav.links.every((l) => l.href.startsWith("/")), `${loc}: no anchors`);
    const giving = resolveMenu(d.footer.givingLinks, loc);
    assert.ok(giving);
    assert.deepEqual(giving.map((l) => l.key), ["give", "faq"]);
  }
  assert.deepEqual(en.nav.links.map((l) => l.label), ["Home", "About MEKI", "Programs", "Give", "FAQ", "Contact"]);
  // an editor's change to a label and a URL is what the site renders
  const t = mergeContent(en, home({ page: { sections: [sectionOf("FOOTER", { items: [{ code: "nav-1", title: "Start", href: "/", text: null, media: null }, { code: "nav-2", title: "Our story", href: "/about", text: null, media: null }] })], seoTitle: null, seoDescription: null, hiddenSectionKeys: [] } }));
  assert.deepEqual(resolveMenu(t.nav.links, "en").map((l) => [l.label, l.href]), [["Start", "/en"], ["Our story", "/en/about"]]);
  // the Admin default list equals the website's list (label for label, EN and AR)
  const admin = readFileSync(join(import.meta.dirname, "../../admin/src/lib/cms.ts"), "utf8");
  for (const l of en.nav.links) assert.ok(admin.includes(`{ href: "${l.href}", en: "${l.label}"`), l.label);
  for (const l of ar.nav.links) assert.ok(admin.includes(`ar: "${l.label}" }`), l.label);
});

test("gallery is list-driven: any number of published photos is shown (previously only exactly 7)", () => {
  const items = Array.from({ length: 26 }, (_, i) => ({ code: `g25-p${i}`, title: `Title ${i}`, text: i % 2 ? "Luxor" : null, href: i % 3 ? "/programs/wash" : null, media: { url: `https://api.meki-us.org/media/x/${i}.webp`, alt: null } }));
  const t = mergeContent(en, home({ page: { sections: [sectionOf("GALLERY", { items })], seoTitle: null, seoDescription: null, hiddenSectionKeys: [] } }));
  assert.equal(t.gallery.items.length, 26);
  assert.deepEqual(t.gallery.items[1], { image: "https://api.meki-us.org/media/x/1.webp", title: "Title 1", place: "Luxor", program: "wash" });
  // An explicitly empty published gallery stays empty.
  assert.equal(mergeContent(en, home({ page: { sections: [sectionOf("GALLERY", { items: [] })], seoTitle: null, seoDescription: null, hiddenSectionKeys: [] } })).gallery.items.length, 0);
  assert.equal(galleryItem({ title: "x", text: null, href: null, media: null, code: null }, undefined).title, "x");
  const gallery = src("components/sections/Gallery.tsx");
  assert.doesNotMatch(gallery, /g\.items\[6\]/);
  assert.match(gallery, /FIRST_BATCH/);
  assert.match(gallery, /<details/); // "Show more photos" works without JavaScript
});

test("24 Nov delivery: Home P photos are the hero defaults; each program has its own cover; the clear water photo replaced the unclear one", () => {
  assert.equal(en.hero.image, "hero-family");
  assert.equal(en.hero.secondaryImage, "hero-school");
  assert.equal(ar.hero.image, "hero-family");
  for (const k of ["hero-family", "hero-school", "water-pipeline", "program-social-solidarity", "program-health", "program-education", "program-economic-empowerment", "program-housing", "program-wash", "program-emergency-response", "program-heritage-culture", "program-scientific-research"]) {
    assert.ok(media[k], k);
    assert.ok(existsSync(join(import.meta.dirname, "../public", media[k].src)), `${k} file exists`);
  }
  assert.equal(en.campaigns.items.find((c) => c.slug === "water").image, "water-pipeline");
  for (const p of en.programmes.items) assert.equal(p.image, `program-${p.slug}`, p.slug);
  for (const p of ar.programmes.items) assert.equal(p.image, `program-${p.slug}`, p.slug);
  // the original (older) static photos are still shipped — nothing was overwritten
  for (const k of ["hero-field", "water-pipe", "water-pier"]) assert.ok(existsSync(join(import.meta.dirname, "../public", media[k].src)), k);
});

test("delivery manifest: every delivered file is mapped exactly once (101 photos + 1 HEIC converted), no byte-identical duplicates", () => {
  const m = JSON.parse(readFileSync(join(import.meta.dirname, "../../../deploy/staging/nov25/client-delivery.manifest.json"), "utf8"));
  assert.equal(m.count, 102);
  assert.equal(m.entries.length, 102);
  assert.equal(new Set(m.entries.map((e) => e.sha256)).size, 102);
  assert.equal(new Set(m.entries.map((e) => e.key)).size, 102);
  const roles = m.entries.reduce((a, e) => ((a[e.role] = (a[e.role] ?? 0) + 1), a), {});
  assert.deepEqual([roles["hero-main"], roles["hero-secondary"], roles.cover, roles.water], [1, 1, 9, 1]);
  assert.ok(m.entries.every((e) => e.titleEn && e.titleAr && e.placeEn && e.placeAr));
  const programs = new Set(m.entries.filter((e) => e.program).map((e) => e.program));
  assert.equal(programs.size, 9);
});

test("Site settings → Branding: only safe logo files are used, otherwise the approved built-in artwork", () => {
  const ok = mergeContent(en, home({ site: site({ logos: { primary: "/brand/MEKI_Secondary_Green.png", inverse: "/brand/MEKI_Secondary_White.png", icon: null } }) }));
  assert.deepEqual(ok.brand, { green: "/brand/MEKI_Secondary_Green.png", white: "/brand/MEKI_Secondary_White.png" });
  const bad = mergeContent(en, home({ site: site({ logos: { primary: "https://evil.example/x.png", inverse: "javascript:alert(1)", icon: null } }) }));
  assert.equal(bad.brand, undefined);
  assert.equal(mergeContent(en, home()).brand, undefined);
  const logo = src("components/Logo.tsx");
  assert.match(logo, /brand\?\.\[variant\] \?\? LOGO_SRC\[variant\]/);
  assert.match(logo, /width=\{1200\} height=\{365\}/); // proportions never changed
  for (const f of ["components/Header.tsx", "components/sections/FinalFooter.tsx"]) assert.match(src(f), /brand=\{t\.brand\}/, f);
});

test("quality: landscape photos in narrow (cropped) frames are requested at the width the frame needs, portrait photos unchanged", () => {
  // 16:9 photo in a 3:4 arch → 2.37× wider than the frame; conditions in parentheses are never scaled
  assert.equal(coverSizes("(min-width: 1280px) 26vw, (min-width: 768px) 45vw, 75vw", { w: 2200, h: 1237 }, 0.75), "(min-width: 1280px) 62vw, (min-width: 768px) 107vw, 178vw");
  assert.equal(coverSizes("(min-width: 1280px) 26vw, 75vw", { w: 1333, h: 2000 }, 0.75), "(min-width: 1280px) 26vw, 75vw");
  assert.equal(coverSizes("144px", { w: 100, h: 100 }, 1), "144px");
  assert.ok(src("components/sections/Hero.tsx").includes("coverSizes("));
  assert.ok(src("components/pages/ProgramsGrid.tsx").includes("coverSizes("));
});
