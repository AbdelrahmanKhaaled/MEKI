import { Fragment, type ReactNode } from "react";

/** Names that must never wrap inside (MEKI client edits, 22 Nov 2026, item 4: "Misr El-Kheir" broke as "EL-" / "KHEIR" on mobile). */
const KEEP_TOGETHER = /(Misr El-Kheir|مصر الخير)/g;

/**
 * Renders text with each protected name wrapped in a `white-space: nowrap` span. CMS text stays plain text (no HTML is
 * interpreted); a nowrap span is used rather than U+2011 so the hyphen keeps the brand font's glyph and screen readers and
 * copy/paste get the ordinary hyphen.
 */
export function NoBreak({ text }: { text: string }): ReactNode {
  const parts = text.split(KEEP_TOGETHER);
  if (parts.length === 1) return text;
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <span key={i} className="whitespace-nowrap">
        {p}
      </span>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}
