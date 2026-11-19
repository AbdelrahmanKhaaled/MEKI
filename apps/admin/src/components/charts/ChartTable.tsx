/**
 * Text alternative for a chart (WCAG 1.1.1 / 1.3.1): a visually hidden data table with the SAME figures the chart draws.
 * The SVG itself is aria-hidden, so screen-reader users get a real table (caption, column headers, row headers) instead of
 * an unlabelled image. Sighted users see no change. Charts set `accessibilityLayer={false}`: Recharts 3 otherwise makes the SVG
 * keyboard-focusable, and a focusable element inside aria-hidden is itself a violation (axe aria-hidden-focus).
 */
export function ChartTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: { label: string; values: string[] }[] }) {
  // sr-only sits on a wrapping DIV: a <table> ignores width:1px and grows to its (nowrap) content width, which widened the
  // page at 360–390 px (found by dashboard.smoke with data).
  return (
    <div className="sr-only">
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={i} scope="col">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <th scope="row">{r.label}</th>
            {r.values.map((v, j) => (
              <td key={j}>{v}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
