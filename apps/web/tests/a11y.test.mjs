// Phase 9B — accessibility regressions found by the cross-browser axe audit (docs/40). Run: pnpm --filter @meki/web test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const css = readFileSync(join(import.meta.dirname, "../src/app/globals.css"), "utf8");
const header = readFileSync(join(import.meta.dirname, "../src/components/Header.tsx"), "utf8");

test("How-we-work steps: copy is never dimmed while a step is inactive (WCAG 1.4.3)", () => {
  // the whole step used to sit at opacity 0.55 until scroll progress reached it → 1.4–2.6:1 text contrast
  assert.doesNotMatch(css, /\.how-step\s*\{[^}]*opacity/);
  assert.doesNotMatch(css, /\.how-step\.is-active\s*\{[^}]*opacity/);
});

test("How-we-work inactive verb keeps ≥ 3:1 (large text): at least 80 % brand green in the mix", () => {
  const m = css.match(/\.how-verb\s*\{\s*color:\s*color-mix\(in oklab, var\(--color-meki-green\) (\d+)%/);
  assert.ok(m, "inactive verb colour is a brand-green mix");
  assert.ok(Number(m[1]) >= 80, `mix is ${m[1]}% (measured: 80% → 3.45:1, 45% → 2.0:1)`);
  assert.match(css, /\.how-step\.is-active \.how-verb \{ color: var\(--color-meki-green\); \}/); // active state unchanged
});

test("header keeps the skip link and an accessible mobile-menu toggle", () => {
  assert.match(header, /href="#main"/);
  assert.match(header, /aria-expanded=\{open\}/);
  assert.match(header, /aria-controls="mobile-menu"/);
  assert.match(header, /e\.key === "Escape" && setOpen\(false\)/);
});
