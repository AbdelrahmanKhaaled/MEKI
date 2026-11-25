"use client";

import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";

/** Honest preview notice: payments inactive. Dismissible. */
export function PreviewNote({ text, extra, closeLabel }: { text: string; extra?: string; closeLabel: string }) {
  const [past, setPast] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const on = () => setPast(window.scrollY > window.innerHeight * 0.8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  if (dismissed) return null;
  return (
    <div
      role="note"
      className={`fixed bottom-3 start-3 z-40 max-w-[calc(100vw-1.5rem)] transition-all duration-500 sm:max-w-md ${
        past ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <p className="flex items-start gap-2 rounded-2xl border border-dashed border-gold-text/50 bg-paper/95 py-2.5 pe-2 ps-4 text-xs leading-snug text-gold-text shadow-[var(--shadow-card)] backdrop-blur">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        <span className="flex-1">
          {text}
          {extra && <span className="mt-0.5 block">{extra}</span>}
        </span>
        <button type="button" onClick={() => setDismissed(true)} aria-label={closeLabel} className="-my-1 grid size-8 shrink-0 place-items-center rounded-full hover:bg-limestone">
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </p>
    </div>
  );
}
