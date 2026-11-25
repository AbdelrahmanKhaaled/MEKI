"use client";

import { trackConfirmedDonation } from "@/lib/donation-tracking";
import { useEffect, useState } from "react";
import { Hourglass } from "lucide-react";
import type { PublicDonationIntentStatus } from "@meki/api-client";
import { ApiRequestError, clientApi } from "@/lib/api";
import { formatMoney, type Locale } from "@/lib/i18n";
import { recallGift } from "@/lib/giving";
import { getGivingCopy } from "@/content/giving";
import { GiftStages } from "./GiftStages";

type State = { kind: "loading" } | { kind: "noToken" } | { kind: "notFound" } | { kind: "error" } | { kind: "ok"; data: PublicDonationIntentStatus };

/**
 * Phase 14 — donor status / return page. The access token lives only in this tab (sessionStorage), never in a URL. Whatever the
 * donor did on Zeffy, this page only DISPLAYS the server's state; it can never mark a payment as confirmed.
 */
export function IntentStatus({ locale, reference }: { locale: Locale; reference: string }) {
  const c = getGivingCopy(locale);
  const s = c.status;
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    const token = recallGift(reference);
    const lookup = token ? clientApi<PublicDonationIntentStatus>(`/public/donation-intents/${reference}/status?locale=${locale}`, { token }).then((data): State => ({ kind: "ok", data })) : Promise.resolve<State>({ kind: "noToken" });
    lookup
      .catch((e): State => ({ kind: e instanceof ApiRequestError && e.status === 404 ? "notFound" : "error" }))
      .then((result) => {
        if (!alive) return;
        if (result.kind === "ok") {
          const { data } = result;
          if (data.reference === reference && data.verifiedAt && (data.stage === "VERIFIED" || data.stage === "ALLOCATED")) trackConfirmedDonation(data.reference);
        }
        setState(result);
      });
    return () => {
      alive = false;
    };
  }, [reference, locale]);

  const verified = state.kind === "ok" && (state.data.stage === "VERIFIED" || state.data.stage === "ALLOCATED");
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]" data-testid="intent-status" data-state={state.kind}>
      <section className="rounded-2xl border border-stone-line bg-white p-5 sm:p-7" aria-live="polite">
        {!verified && (
          <div className="mb-6 flex items-start gap-3 rounded-xl bg-limestone p-4">
            <Hourglass className="mt-0.5 size-5 shrink-0 text-gold-text" aria-hidden="true" />
            <div>
              <p className="font-bold text-ink" data-testid="being-verified">{s.verifying}</p>
              <p className="text-sm text-body-grey">{s.verifyingText}</p>
            </div>
          </div>
        )}
        <p className="mb-4 font-mono text-xl tracking-wider text-deep-green" dir="ltr">{reference}</p>
        {state.kind === "noToken" && <p className="text-body-grey">{s.noToken}</p>}
        {state.kind === "notFound" && <p className="font-bold text-red-700">{s.notFound}</p>}
        {state.kind === "error" && <p className="font-bold text-red-700">{c.errors.network}</p>}
        {state.kind === "ok" && (
          <dl className="divide-y divide-stone-line rounded-xl border border-stone-line">
            {[
              [s.rows.type, c.classification[state.data.classification]],
              // Phase 14B: a Gala-only gift shows the option the donor started from AND where the gift actually goes
              ...(state.data.interest ? [[s.rows.interest, state.data.interest.name ?? c.form.galaOffer.generalInterest]] : []),
              [s.rows.designation, state.data.designation.name ?? c.designationGeneral],
              [s.rows.amount, formatMoney(state.data.intendedAmount, state.data.currency, locale)],
              [s.rows.stage, s.stageLabel[state.data.stage]],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-wrap justify-between gap-2 px-4 py-3">
                <dt className="text-sm text-body-grey">{k}</dt>
                <dd className="font-bold text-ink" dir="auto">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="mt-5 text-sm text-body-grey">{c.reference.receipts}</p>
      </section>
      <aside aria-label={c.stages.title} className="self-start">
        <GiftStages locale={locale} stage={state.kind === "ok" ? state.data.stage : "PENDING_EXTERNAL"} />
      </aside>
    </div>
  );
}
