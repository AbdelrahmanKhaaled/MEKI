"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface MenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  active?: boolean;
}

/**
 * Accessible menu button: aria-haspopup/expanded, closes on outside click / Escape / selection, arrow-key navigation,
 * opens toward the inline-end edge (flips automatically in RTL).
 */
export function Dropdown({ trigger, items, label, align = "end", className = "" }: { trigger: React.ReactNode; items: MenuItem[]; label: string; align?: "start" | "end"; className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  };

  return (
    <div ref={root} className={`relative ${className}`} onKeyDown={onKey}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={id} aria-label={label} onClick={() => setOpen((o) => !o)} className="inline-flex items-center">
        {trigger}
      </button>
      {open && (
        <ul id={id} role="menu" aria-label={label} className={`absolute z-40 mt-2 min-w-44 rounded-xl border border-line bg-white p-1 shadow-[var(--shadow-pop)] ${align === "end" ? "end-0" : "start-0"}`}>
          {items.map((it) => (
            <li key={it.key} role="none">
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className={`flex w-full items-center rounded-lg px-3 py-2 text-start text-sm hover:bg-bg ${it.active ? "font-bold text-meki-green-dark" : "text-ink"}`}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
