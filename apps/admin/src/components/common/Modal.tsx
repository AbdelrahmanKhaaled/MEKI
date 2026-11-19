"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { useDialogFocus } from "./useDialogFocus";

/** Accessible modal: focus moves in and is kept inside (Tab trap), Escape/overlay/close button dismiss, body scroll locked, focus returns to the opener. */
export function Modal({ open, title, onClose, closeLabel, children, footer, size = "md" }: { open: boolean; title: string; onClose: () => void; closeLabel: string; children: React.ReactNode; footer?: React.ReactNode; size?: "md" | "xl" }) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  useDialogFocus(open, panel, onClose);
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="presentation">
      <div className="absolute inset-0 bg-deep-green-3/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} className={`relative w-full ${size === "xl" ? "flex max-h-[92vh] max-w-5xl flex-col" : "max-w-md"} rounded-2xl bg-white p-6 shadow-[var(--shadow-pop)] outline-none`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={id} className="text-xl text-deep-green">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="rounded-lg p-1 text-muted hover:bg-bg">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className={`text-sm text-body ${size === "xl" ? "min-h-0 flex-1 overflow-y-auto" : ""}`}>{children}</div>
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
