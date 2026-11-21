import type { DonorStage } from "@meki/api-client";
import { Check } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { stageIndex } from "@/lib/giving";
import { getGivingCopy } from "@/content/giving";

/**
 * Phase 14 — the four states the donor must be able to tell apart: (1) intention recorded on MEKI, (2) pending external payment on
 * SDI's form, (3) payment verified from SDI's approved report, (4) allocation approved. `stage = null` = nothing recorded yet.
 * Review / not-completed outcomes are never shown as verified.
 */
export function GiftStages({ locale, stage }: { locale: Locale; stage: DonorStage | null }) {
  const c = getGivingCopy(locale).stages;
  const reached = stage === null ? -1 : stageIndex(stage);
  return (
    <div className="rounded-2xl border border-stone-line bg-limestone p-5 sm:p-6" data-testid="gift-stages" data-stage={stage ?? "NONE"}>
      <h3 className="mb-4 font-sans text-xs font-bold uppercase tracking-[0.2em] text-gold-text">{c.title}</h3>
      <ol className="relative space-y-5">
        <span aria-hidden="true" className="absolute inset-y-2 start-[13px] w-px bg-stone-line" />
        {c.items.map((it, i) => {
          const done = i <= reached;
          const current = i === reached + (stage === null ? 1 : 0) && i === Math.max(reached, 0);
          return (
            <li key={it.title} className="relative flex items-start gap-3 ps-0" aria-current={i === reached ? "step" : undefined}>
              <span className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full border text-xs font-bold ${done ? "border-meki-green bg-meki-green text-white" : current ? "border-deep-green bg-paper text-deep-green" : "border-stone-line bg-paper text-body-grey"}`}>
                {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
              </span>
              <span>
                <span className={`block font-bold ${done ? "text-ink" : "text-body-grey"}`}>{it.title}</span>
                <span className="block text-sm text-body-grey">{it.text}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {stage === "NEEDS_REVIEW" && <p className="mt-4 text-sm font-bold text-gold-text" role="status">{c.review}</p>}
      {stage === "NOT_COMPLETED" && <p className="mt-4 text-sm font-bold text-gold-text" role="status">{c.notCompleted}</p>}
    </div>
  );
}
