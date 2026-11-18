// Phase 6D — CMS-managed menus. Run with: pnpm --filter @meki/web test
import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { NAV_ORDER, resolveMenu } from "../src/content/pages.ts";

describe("resolveMenu: the CMS menu is used only when every entry is valid", () => {
  test("internal page paths become locale-aware links with their page key", () => {
    const m = resolveMenu([{ href: "/", label: "Home" }, { href: "/about", label: "About MEKI" }, { href: "/faq", label: "FAQ" }], "ar");
    assert.deepEqual(m, [
      { key: "home", href: "/ar", label: "Home", external: false },
      { key: "about", href: "/ar/about", label: "About MEKI", external: false },
      { key: "faq", href: "/ar/faq", label: "FAQ", external: false },
    ]);
  });
  test("https URLs are allowed (external); any other scheme is not", () => {
    assert.deepEqual(resolveMenu([{ href: "https://example.org/report", label: "Report" }], "en"), [{ key: "ext-0", href: "https://example.org/report", label: "Report", external: true }]);
    assert.equal(resolveMenu([{ href: "http://example.org", label: "x" }], "en"), null);
    assert.equal(resolveMenu([{ href: "javascript:alert(1)", label: "x" }], "en"), null);
  });
  test("legacy one-page anchors (current seed data) keep the built-in menu", () => {
    assert.equal(resolveMenu([{ href: "#who-we-are", label: "Who we are" }, { href: "#programmes", label: "Programs" }], "en"), null);
    assert.equal(resolveMenu([{ href: "/about", label: "About" }, { href: "#faq", label: "FAQ" }], "en"), null, "one bad entry → whole list falls back");
  });
  test("empty lists, empty labels and unknown paths fall back", () => {
    assert.equal(resolveMenu([], "en"), null);
    assert.equal(resolveMenu(undefined, "en"), null);
    assert.equal(resolveMenu([{ href: "/about", label: "  " }], "en"), null);
    assert.equal(resolveMenu([{ href: "/not-a-page", label: "x" }], "en"), null);
  });
  test("Gala Night is a fixed entry: a Gala item in the list is ignored, never duplicated or removed", () => {
    assert.deepEqual(resolveMenu([{ href: "/about", label: "About" }, { href: "/events/gala-night", label: "Gala" }], "en")?.map((l) => l.key), ["about"]);
    assert.equal(resolveMenu([{ href: "/events/gala-night", label: "Gala" }], "en"), null);
  });
  test("the built-in fallback still lists the six pages", () => {
    assert.deepEqual(NAV_ORDER, ["home", "about", "programs", "give", "faq", "contact"]);
  });
});
