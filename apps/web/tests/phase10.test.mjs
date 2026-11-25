// Phase 10 — visual enhancement guards (docs/43–45). Run: pnpm --filter @meki/web test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const src = (p) => readFileSync(join(import.meta.dirname, "../src", p), "utf8");
const css = src("app/globals.css");

test("homepage isolation: the homepage imports none of the secondary-page components changed in Phase 10", () => {
  const home = src("app/[locale]/page.tsx");
  for (const c of ["PageShell", "PageHero", "PageCta", "FlowBand", "GalaSections", "LegalPage", "ProgramsGrid", "FaqAccordion"]) assert.doesNotMatch(home, new RegExp(c), c);
});

test("Phase 10 CSS adds only new p10- classes after the existing rules; the reduced-motion rule is intact", () => {
  const i = css.indexOf("/* ---------- Phase 10:");
  assert.ok(i > 0, "Phase 10 block present");
  const block = css.slice(i);
  const selectors = [...block.matchAll(/^([^@/\s{}][^{]*)\{/gm)].map((m) => m[1].trim());
  for (const sel of selectors) assert.match(sel, /\.p10-|^(from|to|\d+%)/, `unexpected selector in Phase 10 block: ${sel}`);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?animation-duration: 0\.01ms !important; transition-duration: 0\.01ms !important;/);
});

test("transactional pages give the transparent header a dark surface (white links were invisible on limestone)", () => {
  for (const p of ["events/gala-night/book/page.tsx", "events/gala-night/booking/page.tsx", "events/gala-night/booking/[reference]/page.tsx", "donation/return/page.tsx"]) {
    const s = src(`app/[locale]/${p}`);
    assert.match(s, /<FlowBand/, p);
    assert.doesNotMatch(s, /bg-limestone pb-24 pt-32/, `${p}: content must not start directly under the header`);
  }
});

test("Gala page: the ticket price comes from the published ticketing API (same value the booking flow charges), brief text as fallback", () => {
  const page = src("app/[locale]/events/gala-night/page.tsx");
  assert.match(page, /ticketing\?\.ticket\?\.price/);
  assert.match(page, /<GalaAttendance g=\{g\} price=\{apiPrice\}/);
  assert.match(src("components/gala/GalaSections.tsx"), /\{price \?\? a\.price\}/);
});

test("Gala page still never opens sales by itself and never invents causes", () => {
  const page = src("app/[locale]/events/gala-night/page.tsx");
  // Phase 12: still API-driven only — MEKI checkout gate, or (SDI-hosted mode) the hosted-form gate; never opened by the page itself.
  assert.match(page, /const bookingOpen = !!ticketing && ticketing\.salesOpen && !ticketing\.soldOut && \(hostedMode \? !!ticketing\.hosted\?\.available : ticketing\.checkoutAvailable\);/);
  assert.match(page, /<GalaCauses g=\{g\} causes=\{\[\]\} \/>/);
  assert.match(page, /process\.env\.NODE_ENV !== "production" && process\.env\.NEXT_PUBLIC_GALA_PREVIEW === "1"/); // sponsorship tiers: dev preview only
});

test("decorative motion is hidden from assistive technology", () => {
  const gala = src("components/gala/GalaSections.tsx");
  // MEKI client edits (22 Nov 2026, Gala item 14): the lamp fields, particles and glowing dots were removed from the Gala page.
  assert.doesNotMatch(gala, /LampField|PointsOfLight|p10-lamp|p10-travel/);
  assert.match(gala, /aria-hidden="true"/);
  assert.match(src("components/pages/FlowBand.tsx"), /aria-hidden="true"/);
  const hero = src("components/pages/PageShell.tsx");
  assert.match(hero, /layout\?: "arch" \| "backdrop" \| "mosaic" \| "plain"/);
  assert.doesNotMatch(hero, /alt="[^"]+"/, "hero photos are decorative (alt=\"\"); the heading carries the meaning");
});

test("Gala hero scroll cue is a real, named link (site smoke flagged an unnamed icon link)", () => {
  assert.match(src("components/gala/GalaSections.tsx"), /<a href="#purpose" aria-label=\{g\.purpose\.eyebrow\}/);
});
