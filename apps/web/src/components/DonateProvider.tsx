"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { X, ShieldCheck, ArrowRight } from "lucide-react";
import type { Dict } from "@/content/en";

export type Selection = { amount?: string; frequency?: string; destination?: string } | null;
const Ctx = createContext<(s?: Selection) => void>(() => {});
export const useDonate = () => useContext(Ctx);

/**
 * Payments are NOT active. Every "Give" action opens this informational dialog.
 * It never simulates a successful transaction and never collects payment data.
 */
export function DonateProvider({ t, children }: { t: Dict; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [sel, setSel] = useState<Selection>(null);
  const open = useCallback((s?: Selection) => {
    setSel(s ?? null);
    ref.current?.showModal();
  }, []);
  const close = () => ref.current?.close();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onClick = (e: MouseEvent) => {
      if (e.target === d) d.close();
    };
    d.addEventListener("click", onClick);
    return () => d.removeEventListener("click", onClick);
  }, []);

  const summary = [sel?.amount, sel?.frequency, sel?.destination].filter(Boolean).join(" · ");

  return (
    <Ctx.Provider value={open}>
      {children}
      <dialog
        ref={ref}
        aria-labelledby="donate-dialog-title"
        className="donate-dialog m-auto w-[min(92vw,30rem)] rounded-[1.75rem] bg-paper p-0 text-ink shadow-[var(--shadow-lift)] backdrop:bg-deep-green-3/70 backdrop:backdrop-blur-sm"
      >
        <div className="relative overflow-hidden p-7 sm:p-9">
          <div className="absolute inset-x-0 top-0 h-1 bg-harvest-gold" />
          <button
            onClick={close}
            className="absolute end-4 top-4 grid size-11 place-items-center rounded-full text-body-grey transition hover:bg-limestone hover:text-ink"
            aria-label={t.dialog.close}
          >
            <X className="size-5" />
          </button>
          <div className="mb-5 grid size-14 place-items-center rounded-full bg-meki-green/10 text-meki-green">
            <ShieldCheck className="size-7" strokeWidth={1.6} />
          </div>
          <h2 id="donate-dialog-title" className="mb-3 text-3xl">
            {t.dialog.title}
          </h2>
          <p className="text-body-grey">{t.dialog.body}</p>
          {summary && (
            <div className="mt-5 rounded-2xl border border-stone-line bg-limestone px-4 py-3 text-sm">
              <span className="block text-xs font-bold uppercase tracking-[0.18em] text-gold-text">{t.dialog.selection}</span>
              <span className="font-bold">{summary}</span>
              <span className="mt-1 block text-body-grey">{t.dialog.noCharge}</span>
            </div>
          )}
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#programmes" onClick={close} className="btn btn-green">
              {t.dialog.explore} <ArrowRight className="btn-arrow size-4" />
            </a>
            <button onClick={close} className="btn btn-outline">
              {t.dialog.close}
            </button>
          </div>
        </div>
      </dialog>
    </Ctx.Provider>
  );
}

export function GiveButton({
  className,
  children,
  selection,
  ...rest
}: { className?: string; children: React.ReactNode; selection?: Selection } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  const open = useDonate();
  return (
    <button type="button" className={className} onClick={() => open(selection)} {...rest}>
      {children}
    </button>
  );
}
