"use client";

/**
 * Homepage → Hero: the two hero images, managed through the EXISTING Media Library (MediaPicker: browse + upload, real media
 * ids only — nothing copied). Selections are part of the section's draft form: they are saved with "Save" and reach visitors
 * only when the section is published. "Restore default" clears the slot (the website shows its curated photo again).
 */
import { useState } from "react";
import { ImagePlus, RotateCcw, Upload } from "lucide-react";
import { useLocale } from "@/components/common/Providers";
import { MediaPicker } from "@/components/content/media";
import { Bilingual, ProvenanceBadge, Thumb } from "@/components/content/ui";
import type { Media } from "@/lib/content-schemas";
import { HERO_RULES, heroImageProblems, type HeroSlot } from "@/lib/hero-images";
import { fill } from "@/lib/i18n";
import { liveAr, liveEn } from "@/lib/i18n-live";

export interface HeroImageValue {
  media: Media | null;
  altEn: string;
  altAr: string;
}

export function HeroImagesField({ main, secondary, onChange, disabled }: { main: HeroImageValue; secondary: HeroImageValue; onChange: (slot: HeroSlot, patch: Partial<HeroImageValue>) => void; disabled?: boolean }) {
  const { locale } = useLocale();
  const x = (locale === "ar" ? liveAr : liveEn).hero;
  return (
    <section className="rounded-xl border border-line p-4" aria-labelledby="hero-images-title" data-testid="hero-images">
      <h3 id="hero-images-title" className="text-sm font-bold text-ink">{x.title}</h3>
      <p className="mb-4 mt-1 text-xs text-muted">{x.hint}</p>
      <div className="grid gap-5 lg:grid-cols-2">
        <Slot slot="main" value={main} onChange={(p) => onChange("main", p)} disabled={disabled} />
        <Slot slot="secondary" value={secondary} onChange={(p) => onChange("secondary", p)} disabled={disabled} />
      </div>
    </section>
  );
}

function Slot({ slot, value, onChange, disabled }: { slot: HeroSlot; value: HeroImageValue; onChange: (p: Partial<HeroImageValue>) => void; disabled?: boolean }) {
  const { locale } = useLocale();
  const x = (locale === "ar" ? liveAr : liveEn).hero;
  const [picker, setPicker] = useState<null | "browse" | "upload">(null);
  const [error, setError] = useState<string | null>(null);
  const rule = HERO_RULES[slot];
  const m = value.media;
  const pick = (chosen: Media | undefined) => {
    setPicker(null);
    if (!chosen) return;
    const problems = heroImageProblems(chosen, slot);
    if (problems.length) {
      setError(problems.map((p) => fill(x.invalid[p] ?? p, { w: rule.minWidth, h: rule.minHeight })).join(" "));
      return;
    }
    setError(null);
    onChange({ media: chosen });
  };
  return (
    <div className="space-y-3" data-testid={`hero-image-${slot}`} data-media-id={m?.id ?? ""}>
      <p className="text-sm font-bold text-ink">{slot === "main" ? x.main : x.secondary}</p>
      <div className="flex flex-wrap items-start gap-4">
        {m ? (
          <Thumb media={m} className={slot === "main" ? "h-40 w-30 rounded-t-full" : "size-28 rounded-full"} />
        ) : (
          <span className={`grid shrink-0 place-items-center border border-dashed border-line bg-bg p-2 text-center text-[0.7rem] text-muted ${slot === "main" ? "h-40 w-30 rounded-t-full" : "size-28 rounded-full"}`}>{x.defaultImage}</span>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          {m ? (
            <>
              <p className="truncate text-xs text-muted"><bdi>{m.originalName ?? m.code ?? m.storageKey}</bdi>{m.width && m.height ? <span className="num"> · {m.width} × {m.height}</span> : null}</p>
              <ProvenanceBadge value={m.provenance} />
            </>
          ) : (
            <p className="text-xs text-muted">{slot === "main" ? x.defaultMain : x.defaultSecondary}</p>
          )}
          <p className="text-xs text-muted">{slot === "main" ? x.mainRule : x.secondaryRule}</p>
          {!disabled && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-admin btn-ghost !min-h-9" onClick={() => setPicker("browse")} data-testid={`hero-${slot}-choose`}>
                <ImagePlus className="size-4" aria-hidden="true" /> {m ? x.replace : x.choose}
              </button>
              <button type="button" className="btn-admin btn-ghost !min-h-9" onClick={() => setPicker("upload")}>
                <Upload className="size-4" aria-hidden="true" /> {x.upload}
              </button>
              {m && (
                <button type="button" className="btn-admin btn-ghost !min-h-9" onClick={() => { setError(null); onChange({ media: null }); }} data-testid={`hero-${slot}-restore`}>
                  <RotateCcw className="size-4" aria-hidden="true" /> {x.restore}
                </button>
              )}
            </div>
          )}
          {error && <p className="text-xs text-danger" role="alert">{error}</p>}
        </div>
      </div>
      <Bilingual label={x.alt} en={value.altEn} ar={value.altAr} onEn={(s) => onChange({ altEn: s })} onAr={(s) => onChange({ altAr: s })} disabled={disabled} maxLength={300} />
      <p className="-mt-2 text-xs text-muted">{x.altHint}</p>
      {picker && <MediaPicker open mode="single" initialTab={picker} initial={m ? [m] : []} defaultCategory="HERO" onClose={() => setPicker(null)} onConfirm={(sel) => pick(sel[0])} />}
    </div>
  );
}
