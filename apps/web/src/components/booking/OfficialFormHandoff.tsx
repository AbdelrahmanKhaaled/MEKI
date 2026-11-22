import { ArrowUpRight, Check } from "lucide-react";
import { getHandoffCopy } from "@/content/official-forms";
import type { OfficialFormKind } from "@/lib/official-forms";

/**
 * Clearly labelled hand-off to SDI's official Zeffy form. Rendered only when the form's release switch is on and the
 * MEKI reference-first flow is not open (including when the API is unreachable). It never shows a MEKI reference and
 * never claims a booking/gift is complete: confirmation comes from SDI/Zeffy.
 */
export function OfficialFormHandoff({ kind, url, locale }: { kind: OfficialFormKind; url: string; locale: string }) {
  const c = getHandoffCopy(locale, kind);
  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-stone-line bg-white p-6 sm:p-8" data-testid={`official-${kind}-handoff`} aria-labelledby={`official-${kind}-title`}>
      <p className="eyebrow mb-3 text-gold-text">{c.eyebrow}</p>
      <h2 id={`official-${kind}-title`} className="mb-3 font-serif text-3xl text-deep-green">{c.title}</h2>
      <p className="mb-5 text-body-grey">{c.text}</p>
      <ul className="mb-7 space-y-2 text-sm text-ink">
        {c.points.map((p) => (
          <li key={p} className="flex gap-2">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-meki-green" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <a href={url} target="_blank" rel="noopener noreferrer external" referrerPolicy="no-referrer" className="btn btn-green inline-flex items-center gap-2" data-testid={`official-${kind}-link`}>
        {c.cta}
        <ArrowUpRight aria-hidden className="size-4 rtl:-scale-x-100" />
        <span className="sr-only">{c.newTab}</span>
      </a>
      <p className="mt-5 text-sm text-body-grey">{c.confirmNote}</p>
    </section>
  );
}
