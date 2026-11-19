// Phase 9B — accessibility regressions found by the cross-browser audit (docs/40). Run: pnpm --filter @meki/admin test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const src = (p) => readFileSync(join(import.meta.dirname, "../src", p), "utf8");

test("charts: the SVG is hidden from assistive technology and every chart renders a captioned data table (WCAG 1.1.1 / 1.3.1)", () => {
  const files = ["components/charts/TrendChart.tsx", "components/charts/BreakdownCharts.tsx"];
  for (const f of files) {
    const s = src(f);
    assert.doesNotMatch(s, /role="img"/, `${f}: no unlabelled role="img" chart containers`);
    assert.doesNotMatch(s, /aria-label="bar chart"/, `${f}: no hard-coded English label`);
  }
  const all = files.map(src).join("\n");
  assert.equal((all.match(/<ChartTable /g) ?? []).length, 4, "TrendChart, DonutChart, VerticalBars, StackedBars");
  assert.equal((all.match(/accessibilityLayer={false}/g) ?? []).length, 4, "no focusable SVG inside aria-hidden (axe aria-hidden-focus)");
  assert.match(all, /<Pie rootTabIndex={-1} /); // the Pie layer is focusable by default too
  const table = src("components/charts/ChartTable.tsx");
  assert.match(table, /<div className="sr-only">\s*<table>/); // never sr-only on the <table> itself (it overflowed the page on phones)
  assert.match(table, /<caption>/);
  assert.match(table, /scope="col"/);
  assert.match(table, /scope="row"/);
});

test("dashboard passes localized captions and headers to every chart table", () => {
  const d = src("features/dashboard/DashboardPage.tsx");
  assert.match(d, /<TrendChart [^>]*caption=\{d\.trend\.title\} periodLabel=\{d\.chartTable\.period\}/);
  for (const c of ["DonutChart", "VerticalBars", "StackedBars"]) assert.match(d, new RegExp(`<${c} [^>]*table=\\{\\{ caption:`), c);
  const i18n = src("lib/i18n.ts");
  assert.match(i18n, /chartTable: \{ period: "Period", category: "Category", amount: "Amount", share: "Share" \}/);
  assert.match(i18n, /chartTable: \{ period: "الفترة", category: "الفئة", amount: "المبلغ", share: "النسبة" \}/);
});

test("modal surfaces share one focus manager: focus in, Tab trap, Escape, focus return (WCAG 2.1.2 / 2.4.3)", () => {
  const hook = src("components/common/useDialogFocus.ts");
  assert.match(hook, /e\.key === "Escape"/);
  assert.match(hook, /e\.key !== "Tab"/);
  assert.match(hook, /prev\.focus\(\)/);
  const modal = src("components/common/Modal.tsx");
  assert.match(modal, /useDialogFocus\(open, panel, onClose\)/);
  const sidebar = src("components/layout/Sidebar.tsx");
  assert.match(sidebar, /useDialogFocus\(mobileOpen, drawer, onClose, closeBtn\)/);
  assert.match(sidebar, /<div ref=\{drawer\} [^>]*role="dialog" aria-modal="true"/);
  assert.match(sidebar, /<button ref=\{closeBtn\} /);
});

test("admin text tokens meet WCAG 1.4.3 for small text (measured ≥ 4.6:1 on white, page bg and own 10 % tint)", () => {
  const css = src("app/globals.css");
  const L = (h) => { const [r, g, b] = [1, 3, 5].map((i) => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  for (const name of ["muted", "ok", "warn", "danger", "body"]) {
    const hex = css.match(new RegExp(`--color-${name}: (#[0-9a-f]{6});`))?.[1];
    assert.ok(hex, name);
    assert.ok(ratio(hex, "#ffffff") >= 4.5 && ratio(hex, "#f5f7f5") >= 4.5, `${name} ${hex}: ${ratio(hex, "#f5f7f5").toFixed(2)}:1`);
  }
  assert.match(src("components/layout/Sidebar.tsx"), /tracking-\[0\.14em\] text-mint\/70/); // group labels on deep green: 5.3:1 (was /60 → 4.3:1)
  assert.match(src("components/charts/TrendChart.tsx"), /axis: "#66736d"/);
});

test("dashboard quick actions: subtitle text is not faded on the coloured tile (white/80 on #008066 was 3.7:1)", () => {
  assert.doesNotMatch(src("features/dashboard/DashboardPage.tsx"), /block truncate text-xs opacity-80/);
});

test("finance DataTable: the horizontal scroll container is keyboard-reachable and named (axe scrollable-region-focusable)", () => {
  assert.ok(src("components/finance/ui.tsx").includes('<div tabIndex={0} role="region" aria-label={caption} className="-mx-5 hidden overflow-x-auto'));
});
