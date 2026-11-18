// Phase 6D unit tests (website CMS) — run with: pnpm --filter @meki/admin test   (Node built-in runner, native TS type stripping)
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test, { describe } from "node:test";
import {
  FACT_FIELDS, GALA_PATH, HOMEPAGE, SITE_PAGES, faqCategories, faqCategoryError, faqPublishGate, freeKeys, isDirtySection, itemsFor, listCountState, menuEntryError, menuEntryWarning,
  menuState, mergeLabels, nextCode, pagePublishGate, resetsVerification, sectionDeleteGate, sectionPublishGate, sectionUnpublishGate, siteErrors, statDeleteGate, statPublishGate, statValueError, statVerifyGate,
} from "../src/lib/cms.ts";
import { FaqSchema, PageDetailSchema, SECTION_KEYS, SiteSettingsSchema, StatisticSchema } from "../src/lib/cms-schemas.ts";
import { ar, en } from "../src/lib/i18n.ts";
import { NAV, visibleNav } from "../src/lib/navigation.ts";
// the public website's own sources: the admin rules must agree with what the website actually renders
import { PAGE_PATH, resolveMenu } from "../../web/src/content/pages.ts";
import { en as webEn } from "../../web/src/content/en.ts";

const here = import.meta.dirname;
const read = (p) => readFileSync(p, "utf8");

describe("homepage model matches the public website", () => {
  test("every homepage section key is a real SectionKey and appears once", () => {
    const keys = HOMEPAGE.map((d) => d.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const k of keys) assert.ok(SECTION_KEYS.includes(k), k);
    const prisma = read(join(here, "../../api/prisma/schema.prisma")).match(/enum SectionKey \{([^}]*)\}/)[1].replace(/\/\/.*$/gm, "").split(/\s+/).filter(Boolean);
    // site pages use the non-event keys; EVENT_* keys belong to event landing pages (Events module)
    assert.deepEqual([...SECTION_KEYS].sort(), prisma.filter((k) => !k.startsWith("EVENT_")).sort());
  });
  test("fixed list sizes equal the website's built-in lists (another count keeps the built-in list)", () => {
    const fixed = Object.fromEntries(HOMEPAGE.flatMap((d) => [...d.lists.map((l) => [l.name, l.fixed]), ...(d.data ? [[d.data.module, d.data.fixed]] : [])]));
    assert.equal(fixed.trust, webEn.trust.length);
    assert.equal(fixed.verbs, webEn.how.items.length);
    assert.equal(fixed.statistics, webEn.impact.stats.length);
    assert.equal(fixed.programmes, webEn.programmes.items.length);
    assert.equal(fixed.enabling, webEn.enabling.items.length);
    assert.equal(fixed.reasons, webEn.why.items.length);
    assert.equal(fixed.steps, webEn.process.steps.length);
    assert.equal(fixed.never, webEn.process.never.length);
    assert.equal(fixed.photos, webEn.gallery.items.length);
  });
  test("hideable flags equal the website's HIDEABLE_SECTIONS", () => {
    const web = read(join(here, "../../web/src/lib/content.ts")).match(/HIDEABLE_SECTIONS = \[([^\]]*)\]/)[1].match(/"([A-Z_]+)"/g).map((s) => s.slice(1, -1));
    assert.deepEqual(HOMEPAGE.filter((d) => d.hideable).map((d) => d.key).sort(), web.sort());
  });
  test("menus are managed on /menus, not inside the footer editor", () => {
    const footer = HOMEPAGE.find((d) => d.key === "FOOTER");
    assert.deepEqual(footer.lists.map((l) => [l.prefix, l.managedAt]), [["nav-", "/menus"], ["giving-", "/menus"]]);
    assert.equal(footer.hideable, false);
  });
});

describe("item lists and labels", () => {
  const items = [{ code: "step-2", sortOrder: 2 }, { code: "never-1", sortOrder: 0 }, { code: "step-1", sortOrder: 1 }, { code: null, sortOrder: 3 }];
  test("itemsFor selects by prefix or exact codes, in display order", () => {
    assert.deepEqual(itemsFor({ prefix: "step-" }, items).map((i) => i.code), ["step-1", "step-2"]);
    assert.deepEqual(itemsFor({ codes: ["never-1"] }, items).map((i) => i.code), ["never-1"]);
    assert.equal(itemsFor({}, items).length, 4);
  });
  test("count check uses visible items only (hidden items are dropped when publishing)", () => {
    assert.deepEqual(listCountState({ fixed: 2 }, [{ isVisible: true }, { isVisible: false }, { isVisible: true }]), { visible: 2, ok: true });
    assert.equal(listCountState({ fixed: 4 }, [{ isVisible: true }]).ok, false);
    assert.equal(listCountState({}, []).ok, true);
  });
  test("nextCode fills the first gap", () => {
    assert.equal(nextCode("nav-", [{ code: "nav-1" }, { code: "nav-3" }]), "nav-2");
    assert.equal(nextCode("giving-", []), "giving-1");
  });
  test("mergeLabels keeps unknown keys and removes emptied ones", () => {
    assert.deepEqual(mergeLabels({ known: "a", future: "keep" }, { known: "b", other: " " }), { known: "b", future: "keep" });
    assert.deepEqual(mergeLabels(null, { x: "1" }), { x: "1" });
    assert.deepEqual(mergeLabels({ x: "1" }, { x: "" }), {});
  });
  test("freeKeys offers only unused block types", () => {
    assert.deepEqual(freeKeys(["A", "B", "C"], ["B"]), ["A", "C"]);
  });
});

describe("publishing gates mirror the API", () => {
  test("sections: permission, DEMO section, visible DEMO items; delete only when unpublished", () => {
    assert.equal(sectionPublishGate({ provenance: "PROPOSED", items: [{ provenance: "DEMO", isVisible: false }] }, true).allowed, true);
    assert.deepEqual(sectionPublishGate({ provenance: "DEMO", items: [{ provenance: "DEMO", isVisible: true }] }, false).reasons, ["permission", "demo", "demoItem"]);
    assert.deepEqual(sectionUnpublishGate({ status: "DRAFT" }, true).reasons, ["notPublished"]);
    assert.deepEqual(sectionDeleteGate({ status: "PUBLISHED" }, true).reasons, ["unpublishFirst"]);
    assert.equal(sectionDeleteGate({ status: "DRAFT" }, true).allowed, true);
    assert.equal(isDirtySection({ status: "PUBLISHED", hasUnpublishedChanges: false }), false);
    assert.equal(isDirtySection({ status: "DRAFT", hasUnpublishedChanges: false }), true);
  });
  test("pages and FAQs", () => {
    assert.deepEqual(pagePublishGate({ status: "PUBLISHED", provenance: "DEMO", titleEn: " " }, true).reasons, ["alreadyPublished", "demo", "missingTitle"]);
    assert.deepEqual(faqPublishGate({ status: "DRAFT", provenance: "PROPOSED", questionEn: "", answerEn: "" }, true).reasons, ["missingQuestion", "missingAnswer"]);
    assert.equal(faqCategoryError("giving"), null);
    assert.equal(faqCategoryError("Giving Now"), "categoryFormat");
    assert.deepEqual(faqCategories([{ category: "zakat" }, { category: "general" }]), ["general", "zakat"]);
  });
  test("statistics: verify needs a source, publish needs VERIFIED; fact changes reset verification (same list as the API)", () => {
    assert.deepEqual(statVerifyGate({ provenance: "DEMO", sourceRef: "" }, true).reasons, ["demo", "missingSource"]);
    const s = { status: "DRAFT", provenance: "PROPOSED", verificationStatus: "UNVERIFIED", sourceRef: "Annual report 2025 p.4", labelEn: "Beneficiaries" };
    assert.deepEqual(statPublishGate(s, true).reasons, ["notVerified"]);
    assert.equal(statPublishGate({ ...s, verificationStatus: "VERIFIED" }, true).allowed, true);
    assert.deepEqual(statDeleteGate({ status: "PUBLISHED" }, true).reasons, ["unpublishFirst"]);
    assert.equal(resetsVerification("VERIFIED", ["labelEn"]), false);
    assert.equal(resetsVerification("VERIFIED", ["value"]), true);
    assert.equal(resetsVerification("UNVERIFIED", ["value"]), false);
    const api = read(join(here, "../../api/src/modules/statistics/statistics.module.ts")).match(/const FACT_FIELDS = \[([^\]]*)\]/)[1].match(/'(\w+)'/g).map((x) => x.slice(1, -1));
    assert.deepEqual([...FACT_FIELDS], api);
  });
  test("statistic values: at most 2 decimals, no thousands separators or units", () => {
    for (const ok of ["0", "1200", "-3", "12.5", "99.99"]) assert.equal(statValueError(ok), null, ok);
    for (const bad of ["", "1,200", "12.345", "10%", "abc", "1e5"]) assert.equal(statValueError(bad), "valueFormat", bad);
  });
});

describe("menus: admin rules agree with the website's resolveMenu()", () => {
  const entry = (titleEn, href, isVisible = true) => ({ titleEn, href, isVisible });
  test("every admin page option is a website page path (Gala is fixed, not offered)", () => {
    const web = Object.entries(PAGE_PATH).filter(([k]) => k !== "gala").map(([k, v]) => [k, v || "/"]); // the website writes home as "" (locale root)
    assert.deepEqual(SITE_PAGES.map((p) => [p.key, p.path]).sort(), web.sort());
    assert.equal(PAGE_PATH.gala, GALA_PATH);
  });
  test("entry errors", () => {
    assert.equal(menuEntryError(entry("About", "/about")), null);
    assert.equal(menuEntryError(entry("Blog", "https://example.org/blog")), null);
    assert.equal(menuEntryError(entry("", "/about")), "menuLabel");
    assert.equal(menuEntryError(entry("Impact", "#impact")), "menuAnchor");
    assert.equal(menuEntryError(entry("Old", "/nowhere")), "menuHref");
    assert.equal(menuEntryError(entry("Insecure", "http://example.org")), "menuHref");
    assert.equal(menuEntryWarning(entry("Gala", GALA_PATH)), "menuGala");
  });
  const samples = [
    [entry("Home", "/"), entry("About", "/about"), entry("FAQ", "/faq")],
    [entry("Home", "/"), entry("Impact", "#impact")],
    [entry("Home", "/"), entry("Hidden legacy", "#impact", false)],
    [entry("Gala", GALA_PATH)],
    [entry("Home", "/"), entry("Gala", GALA_PATH), entry("External", "https://example.org")],
    [],
    [entry("Home", "/", false)],
  ];
  test("menuState().used ⇔ resolveMenu() returns a menu (for the published = visible entries)", () => {
    for (const s of samples) {
      const published = s.filter((i) => i.isVisible).map((i) => ({ href: i.href, label: i.titleEn }));
      assert.equal(menuState(s).used, resolveMenu(published, "en") !== null, JSON.stringify(s));
    }
  });
  test("the seeded one-page menu (#anchors) is reported as not used", () => {
    const seeded = webEn.nav.links.map((l) => entry(l.label, l.href));
    const st = menuState(seeded);
    assert.equal(st.used, false);
    assert.ok(st.invalid > 0);
  });
});

describe("site settings validation mirrors settings.dto.ts", () => {
  const base = { orgNameEn: "MEKI", contactEmail: "", contactPhone: "", logoPrimaryUrl: "/brand/logo.svg", logoInverseUrl: "", logoIconUrl: "https://cdn.example.org/i.png", socialLinks: [] };
  test("valid record has no errors; empty contact values are allowed (stay empty until MEKI supplies them)", () => {
    assert.ok(Object.values(siteErrors(base)).every((e) => e === null));
  });
  test("invalid values", () => {
    const e = siteErrors({ ...base, orgNameEn: " ", contactEmail: "nope", contactPhone: "call us", logoPrimaryUrl: "javascript:alert(1)", socialLinks: [{ url: "http://x.org" }] });
    assert.deepEqual(e, { orgNameEn: "required", contactEmail: "email", contactPhone: "phone", logoPrimaryUrl: "logo", logoInverseUrl: null, logoIconUrl: null, socialLinks: "social" });
    assert.equal(siteErrors({ ...base, socialLinks: Array.from({ length: 13 }, () => ({ url: "https://x.org" })) }).socialLinks, "social");
  });
});

describe("schemas parse API shapes", () => {
  test("statistic value stays a decimal string; FAQ, page and settings shapes", () => {
    const stat = StatisticSchema.parse({ id: "s", code: "beneficiaries", labelEn: "People", labelAr: null, descriptionEn: null, descriptionAr: null, value: "1200.00", unit: null, prefix: null, suffix: "+", displayFormat: "NUMBER", programmeId: null, sourceRef: null, attributionEn: null, attributionAr: null, reportingPeriodEn: null, reportingPeriodAr: null, verificationStatus: "UNVERIFIED", verifiedAt: null, sortOrder: 0, status: "DRAFT", publishedAt: null, provenance: "PROPOSED", createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" });
    assert.equal(typeof stat.value, "string");
    assert.ok(FaqSchema.safeParse({}).success === false);
    assert.ok(PageDetailSchema.safeParse({ slug: "x" }).success === false);
    assert.ok(SiteSettingsSchema.safeParse({}).success === false);
  });
});

describe("navigation, routes, localization and static guards", () => {
  const keys = (u) => visibleNav(u).flatMap((g) => g.items.map((i) => i.key));
  const user = (...permissions) => ({ permissions, isSuperAdmin: false });
  test("CMS pages appear only with their read permission", () => {
    assert.deepEqual(keys(user("content.read")), ["dashboard", "homepage", "pages", "menus"]);
    assert.deepEqual(keys(user("faq.read")), ["dashboard", "faqs"]);
    assert.deepEqual(keys(user("statistics.read")), ["dashboard", "statistics"]);
    assert.deepEqual(keys(user("settings.read")).filter((k) => k !== "settings"), ["dashboard", "siteSettings"]); // "settings" = upcoming platform settings
  });
  test("every CMS route has a page file", () => {
    for (const r of ["homepage", "pages", "pages/new", "pages/[id]", "menus", "faqs", "faqs/new", "faqs/[id]", "statistics", "settings/site"]) assert.ok(existsSync(join(here, "../src/app/[locale]/(dashboard)", r, "page.tsx")), r);
    for (const i of NAV.flatMap((g) => g.items).filter((x) => x.href)) assert.ok(existsSync(join(here, "../src/app/[locale]/(dashboard)", i.href, "page.tsx")), i.key);
  });
  const deepKeys = (o, p = []) => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? deepKeys(v, [...p, k]) : [[...p, k]]));
  const get = (o, path) => path.reduce((a, k) => a?.[k], o);
  test("every CMS string exists in Arabic (no empty translations); placeholders match", () => {
    for (const k of deepKeys(en.cms)) {
      const a = get(ar.cms, k);
      assert.ok(typeof a === "string" && a.trim(), k.join("."));
      const ph = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      assert.equal(ph(a), ph(get(en.cms, k)), k.join("."));
    }
    for (const k of SECTION_KEYS) assert.ok(en.cms.sections[k] && ar.cms.sections[k], k);
    for (const d of HOMEPAGE) for (const l of d.lists) assert.ok(en.cms.lists[l.name] && ar.cms.lists[l.name], l.name);
    for (const p of SITE_PAGES) assert.ok(en.cms.menus.pages[p.key] && ar.cms.menus.pages[p.key], p.key);
    for (const r of ["menuLabel", "menuAnchor", "menuHref", "menuGala"]) assert.ok(en.cms.errors[r], r);
  });
  const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
  const root = join(here, "../src");
  const files = [...walk(join(root, "features/cms")), ...walk(join(root, "components/cms")), join(root, "services/cms.ts"), join(root, "hooks/useCmsData.ts"), join(root, "lib/cms.ts"), join(root, "lib/cms-schemas.ts")];
  test("no fake data, no network outside lib/api.ts, no browser storage", () => {
    for (const f of files) {
      const s = read(f);
      assert.doesNotMatch(s, /mockData|fakeData|lorem|Math\.random/i, f);
      assert.doesNotMatch(s, /\bfetch\(|new XMLHttpRequest/, f);
      assert.doesNotMatch(s, /localStorage|sessionStorage|document\.cookie/, f);
    }
  });
  test("no statistic figure is hard-coded in the CMS screens", () => {
    for (const f of walk(join(root, "features/cms/statistics"))) assert.doesNotMatch(read(f), /value:\s*["']?\d{2,}/, f);
  });
  test("every publish / unpublish / delete in the CMS goes through a confirmation dialog", () => {
    for (const f of files.filter((x) => x.endsWith(".tsx"))) {
      const s = read(f);
      if (/setSectionStatus|setPageStatus|setFaqStatus|setStatStatus|deleteSection|deleteItem|deleteFaq|deleteStat/.test(s)) assert.match(s, /ConfirmDialog/, f);
    }
  });
});
