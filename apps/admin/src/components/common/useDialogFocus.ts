"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus management for modal surfaces (role="dialog" aria-modal="true"), WCAG 2.1.2 / 2.4.3:
 * focus moves into the dialog, Tab / Shift+Tab stay inside it, Escape closes it, and focus returns to the opener on close.
 * `initial` (optional) receives focus first; otherwise the container itself (it should have tabIndex={-1}).
 */
export function useDialogFocus(open: boolean, container: RefObject<HTMLElement | null>, onClose: () => void, initial?: RefObject<HTMLElement | null>) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    (initial?.current ?? container.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== "Tab" || !container.current) return;
      const items = [...container.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      // Move focus ourselves on EVERY Tab (not only at the edges): Safari/WebKit skips links on Tab by default, so leaving the
      // step to the browser would let focus escape a drawer whose only other focusable items are links.
      e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next = i === -1 ? (e.shiftKey ? items.length - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + items.length) % items.length;
      items[next].focus();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (prev && document.contains(prev)) prev.focus();
    };
  }, [open, container, initial]);
}
