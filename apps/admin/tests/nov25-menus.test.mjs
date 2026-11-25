// MEKI final integration (25 Nov 2026) — Admin ↔ website agreement for menus. Run with: pnpm --filter @meki/admin test
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MENUS, HOMEPAGE, menuEntryError, menuState } from "../src/lib/cms.ts";
import { resolveMenu, NAV_ORDER } from "../../web/src/content/pages.ts";
import { en as webEn } from "../../web/src/content/en.ts";
import { ar as webAr } from "../../web/src/content/ar.ts";

test("the Admin 'website menu' equals the website's real navigation, EN and AR, label for label", () => {
  const header = DEFAULT_MENUS["nav-"];
  assert.deepEqual(header.map((e) => e.href), webEn.nav.links.map((l) => l.href));
  assert.deepEqual(header.map((e) => e.en), webEn.nav.links.map((l) => l.label));
  assert.deepEqual(header.map((e) => e.ar), webAr.nav.links.map((l) => l.label));
  assert.deepEqual(resolveMenu(header.map((e) => ({ href: e.href, label: e.en })), "en").map((l) => l.key), NAV_ORDER);
  const giving = DEFAULT_MENUS["giving-"];
  assert.deepEqual(giving.map((e) => e.href), webEn.footer.givingLinks.map((l) => l.href));
  assert.deepEqual(giving.map((e) => e.ar), webAr.footer.givingLinks.map((l) => l.label));
});

test("entries written by 'Use the website's current menu' are valid, so the website uses the stored menu", () => {
  for (const list of Object.values(DEFAULT_MENUS)) {
    const items = list.map((e) => ({ isVisible: true, titleEn: e.en, href: e.href }));
    for (const i of items) assert.equal(menuEntryError(i), null);
    assert.deepEqual(menuState(items), { used: true, invalid: 0 });
  }
});

test("legacy '#anchor' entries (the old one-page seed) are reported as not used — the state Admin used to show silently", () => {
  const legacy = [{ isVisible: true, titleEn: "Who we are", href: "#who-we-are" }, { isVisible: true, titleEn: "Impact", href: "#impact" }];
  assert.equal(menuState(legacy).used, false);
  assert.equal(menuState(legacy).invalid, 2);
});

test("Footer text/note/copyright are edited in Site settings only; the gallery has no fixed size", () => {
  const footer = HOMEPAGE.find((d) => d.key === "FOOTER");
  assert.ok(!footer.labels.includes("rights") && !footer.labels.includes("contactPending"));
  const gallery = HOMEPAGE.find((d) => d.key === "GALLERY");
  assert.equal(gallery.lists[0].fixed, undefined);
  assert.deepEqual(gallery.labels, ["note", "showMore", "showLess"]);
});
