"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import type { PublicMedia } from "@meki/api-client";

type Labels = { open: string; close: string; next: string; previous: string; counter: string };
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

/**
 * Programme gallery (Phase 11A): media-library images already filtered by the API (not deleted, not DEMO, consent not
 * refused). Responsive mosaic + native <dialog> lightbox: Escape and focus return come from the browser; arrow keys move
 * (mirrored in RTL); every image has its own alt text, captions are shown when present. Nothing renders without images.
 */
export function ProgrammeGallery({ items, labels, fallbackAlt }: { items: PublicMedia[]; labels: Labels; fallbackAlt: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const total = items.length;
  const go = useCallback((d: number) => setIndex((i) => (i + d + total) % total), [total]);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const onKey = (e: KeyboardEvent) => {
      if (!dlg.open) return;
      const rtl = document.documentElement.dir === "rtl";
      if (e.key === "ArrowRight") go(rtl ? -1 : 1);
      if (e.key === "ArrowLeft") go(rtl ? 1 : -1);
    };
    const onClick = (e: MouseEvent) => e.target === dlg && dlg.close();
    document.addEventListener("keydown", onKey);
    dlg.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      dlg.removeEventListener("click", onClick);
    };
  }, [go]);

  if (total === 0) return null;
  const current = items[index];
  const alt = (m: PublicMedia, i: number) => m.alt || `${fallbackAlt} — ${i + 1}`;

  return (
    <>
      <ul data-stagger className="grid auto-rows-[11rem] grid-cols-2 gap-3 sm:auto-rows-[14rem] md:grid-cols-4">
        {items.map((m, i) => (
          <li key={m.url} data-stagger-item className={i % 5 === 0 ? "col-span-2 row-span-2" : ""}>
            <button
              type="button"
              onClick={() => {
                setIndex(i);
                ref.current?.showModal();
              }}
              aria-label={fill(labels.open, { n: i + 1, total })}
              className="group p10-zoom relative block size-full overflow-hidden rounded-[1.5rem] bg-limestone-2 focus-visible:outline-offset-4"
            >
              <Image src={m.url} alt={alt(m, i)} fill sizes={i % 5 === 0 ? "(min-width:768px) 50vw, 100vw" : "(min-width:768px) 25vw, 50vw"} className="object-cover" />
              <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-deep-green/50 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <Expand aria-hidden="true" className="absolute bottom-3 end-3 size-5 text-white opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            </button>
          </li>
        ))}
      </ul>

      <dialog ref={ref} aria-label={fill(labels.counter, { n: index + 1, total })} className="donate-dialog m-auto w-[min(94vw,72rem)] bg-transparent p-0 backdrop:bg-deep-green-3/90 backdrop:backdrop-blur-sm">
        <figure className="relative">
          <div className="relative aspect-[3/2] w-full overflow-hidden rounded-[1.5rem] bg-deep-green-3">
            <Image key={current.url} src={current.url} alt={alt(current, index)} fill sizes="94vw" className="object-contain" />
          </div>
          <figcaption className="mt-3 flex items-start justify-between gap-4 text-sm text-mint-line">
            <span>{current.caption ?? ""}</span>
            <span className="num shrink-0" aria-live="polite">
              {fill(labels.counter, { n: index + 1, total })}
            </span>
          </figcaption>
          <button type="button" onClick={() => ref.current?.close()} aria-label={labels.close} className="absolute end-3 top-3 grid size-11 place-items-center rounded-full bg-deep-green-3/80 text-white hover:bg-deep-green">
            <X className="size-5" aria-hidden="true" />
          </button>
          {total > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} aria-label={labels.previous} className="absolute start-3 top-[calc(50%-1.5rem)] grid size-11 place-items-center rounded-full bg-paper/90 text-ink hover:bg-paper">
                <ChevronLeft className="size-5 rtl:-scale-x-100" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => go(1)} aria-label={labels.next} className="absolute end-3 top-[calc(50%-1.5rem)] grid size-11 place-items-center rounded-full bg-paper/90 text-ink hover:bg-paper">
                <ChevronRight className="size-5 rtl:-scale-x-100" aria-hidden="true" />
              </button>
            </>
          )}
        </figure>
      </dialog>
    </>
  );
}
