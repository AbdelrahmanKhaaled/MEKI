"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { X, ShieldCheck, ArrowRight, Lock } from "lucide-react";
import type { CreatedDonation, CreateDonationRequest, DonationDesignation, DonationFrequency, PaymentSessionResponse, PublicDonationConfig } from "@meki/api-client";
import type { Dict } from "@/content/en";
import type { Locale } from "@/lib/i18n";
import type { LiveCampaign } from "@/lib/content";
import { ApiRequestError, clientApi } from "@/lib/api";
import { rememberDonation } from "@/lib/donation-session";

/** A fully validated choice from the donation form; the backend re-validates everything. */
export type CheckoutChoice = {
  amount: string; // decimal string, never a float
  currency: string;
  frequency: DonationFrequency;
  designation: DonationDesignation;
  slug?: string;
  /** Human-readable summary shown in the dialog */
  summary: string;
};

export type Selection = { amount?: string; frequency?: string; destination?: string; checkout?: CheckoutChoice } | null;

type DonationCtx = {
  open: (s?: Selection) => void;
  /** Backend donation configuration; null until loaded or when the API is unreachable (= preview mode). */
  config: PublicDonationConfig | null;
  liveCampaigns: LiveCampaign[];
  /** Destination the donation form should preselect (a new object per click, so repeated clicks re-apply). */
  preselect: { value: string } | null;
};

const Ctx = createContext<DonationCtx>({ open: () => {}, config: null, liveCampaigns: [], preselect: null });
export const useDonate = () => useContext(Ctx).open;
export const useDonationContext = () => useContext(Ctx);

const NAME = /^[\p{L}\p{M}' .-]{1,120}$/u;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * Every "Give" action opens this dialog.
 *  - Payments NOT live (no API, provider unconfigured, or disabled): the original informational preview dialog.
 *    It never simulates a transaction and never collects payment data.
 *  - Payments live: a short donor-details step, then the donation is created and the donor is redirected to the
 *    provider-hosted checkout. Card data is only ever entered on the provider's page.
 */
export function DonateProvider({ t, locale, liveCampaigns = [], children }: { t: Dict; locale?: Locale; liveCampaigns?: LiveCampaign[]; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [sel, setSel] = useState<Selection>(null);
  const [config, setConfig] = useState<PublicDonationConfig | null>(null);
  const [preselect, setPreselect] = useState<{ value: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    clientApi<PublicDonationConfig>("/public/donations/config", { timeoutMs: 6000 })
      .then((c) => !cancelled && setConfig(c))
      .catch(() => !cancelled && setConfig(null)); // API unreachable → preview mode
    return () => {
      cancelled = true;
    };
  }, []);

  const live = !!config?.paymentsEnabled;

  const open = useCallback(
    (s?: Selection) => {
      // With payments live, card-level "Give" buttons (no amount yet) take the donor to the form, preselected.
      if (live && !s?.checkout) {
        const dest = s?.destination;
        const programme = dest ? t.programmes.items.find((p) => p.name === dest) : undefined;
        const campaign = dest ? liveCampaigns.find((c) => c.title === dest && c.acceptingDonations) : undefined;
        setPreselect({ value: campaign ? `campaign:${campaign.slug}` : programme ? `programme:${programme.slug}` : "general" });
        document.getElementById("give")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      setSel(s ?? null);
      ref.current?.showModal();
    },
    [live, liveCampaigns, t.programmes.items],
  );
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
    <Ctx.Provider value={{ open, config, liveCampaigns, preselect }}>
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
          {sel?.checkout && config ? (
            <CheckoutStep key={sel.checkout.summary + sel.checkout.amount} t={t} locale={locale ?? "en"} choice={sel.checkout} testMode={config.testMode} onClose={close} />
          ) : (
            <>
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
            </>
          )}
        </div>
      </dialog>
    </Ctx.Provider>
  );
}

const field =
  "min-h-11 w-full rounded-xl border border-stone-line bg-paper px-4 text-[0.95rem] text-ink transition-[border-color,box-shadow] duration-300 hover:border-meki-green/60 focus:border-meki-green focus:shadow-[0_0_0_4px_rgb(0_128_102/0.12)] focus:outline-none";
const fieldLabel = "mb-1.5 block text-[0.7rem] font-bold uppercase tracking-[0.16em] text-body-grey";

/** Donor details → POST /public/donations → POST …/payment-session → redirect to the provider-hosted checkout. */
function CheckoutStep({ t, locale, choice, testMode, onClose }: { t: Dict; locale: Locale; choice: CheckoutChoice; testMode: boolean; onClose: () => void }) {
  const c = t.checkout;
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", anonymous: false, privacy: false, marketing: false });
  const [phase, setPhase] = useState<"idle" | "submitting" | "redirecting">("idle");
  const [error, setError] = useState<string | null>(null);
  // One key per dialog opening: retries of the same submission can never create a second donation.
  const keyRef = useRef(newKey());

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const message = (e: unknown) => {
    if (e instanceof ApiRequestError) {
      if (e.status === 429) return c.errors.RATE_LIMITED;
      const known = (c.errors as Record<string, string>)[e.code];
      if (known) return known;
    }
    return c.errors.GENERIC;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (phase !== "idle") return; // duplicate-submission guard
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const email = form.email.trim();
    if (!NAME.test(firstName) || !NAME.test(lastName)) return setError(c.invalidName);
    if (!EMAIL.test(email)) return setError(c.invalidEmail);
    if (!form.privacy) return setError(c.consentRequired);
    setError(null);
    setPhase("submitting");

    const request: CreateDonationRequest = {
      amount: choice.amount,
      currency: choice.currency,
      frequency: choice.frequency,
      designation: choice.designation,
      ...(choice.designation === "CAMPAIGN" ? { campaignSlug: choice.slug } : {}),
      ...(choice.designation === "PROGRAMME" ? { programmeSlug: choice.slug } : {}),
      donor: { firstName, lastName, email },
      privacyConsent: true,
      marketingConsent: form.marketing,
      isAnonymous: form.anonymous,
      locale,
      attribution: { source: "landing-quick-donate" },
    };
    try {
      let created: CreatedDonation;
      try {
        created = await clientApi<CreatedDonation>("/public/donations", { method: "POST", body: request, idempotencyKey: keyRef.current });
      } catch (e) {
        // Details changed after an earlier successful attempt with this key → start a fresh donation.
        if (e instanceof ApiRequestError && e.code === "IDEMPOTENCY_KEY_REUSED") {
          keyRef.current = newKey();
          created = await clientApi<CreatedDonation>("/public/donations", { method: "POST", body: request, idempotencyKey: keyRef.current });
        } else throw e;
      }
      rememberDonation(created.reference, created.accessToken);
      const session = await clientApi<PaymentSessionResponse>(`/public/donations/${encodeURIComponent(created.reference)}/payment-session`, {
        method: "POST",
        token: created.accessToken,
      });
      const url = session.checkoutUrl ? new URL(session.checkoutUrl) : null;
      if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) throw new ApiRequestError("PROVIDER_UNAVAILABLE", 502);
      setPhase("redirecting");
      window.location.assign(url.toString());
    } catch (e) {
      setPhase("idle");
      setError(message(e));
    }
  };

  const busy = phase !== "idle";
  return (
    <form onSubmit={submit} noValidate aria-busy={busy}>
      {testMode && (
        <p role="note" className="mb-4 rounded-xl bg-[#b00020] px-3 py-2 text-center text-xs font-bold uppercase tracking-[0.14em] text-white">
          {c.testBanner}
        </p>
      )}
      <h2 id="donate-dialog-title" className="mb-2 text-3xl">
        {c.title}
      </h2>
      <p className="mb-4 text-sm text-body-grey">{c.intro}</p>
      <div className="mb-5 rounded-2xl border border-stone-line bg-limestone px-4 py-3 text-sm">
        <span className="block text-xs font-bold uppercase tracking-[0.18em] text-gold-text">{t.dialog.selection}</span>
        <span className="font-bold">{choice.summary}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={fieldLabel}>{c.firstName}</span>
          <input className={field} autoComplete="given-name" required maxLength={120} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} disabled={busy} />
        </label>
        <label className="block">
          <span className={fieldLabel}>{c.lastName}</span>
          <input className={field} autoComplete="family-name" required maxLength={120} value={form.lastName} onChange={(e) => set("lastName", e.target.value)} disabled={busy} />
        </label>
      </div>
      <label className="mt-3 block">
        <span className={fieldLabel}>{c.email}</span>
        <input className={field} type="email" dir="ltr" autoComplete="email" required maxLength={191} value={form.email} onChange={(e) => set("email", e.target.value)} disabled={busy} />
      </label>
      <div className="mt-4 space-y-2.5 text-sm">
        {(
          [
            ["anonymous", c.anonymous],
            ["privacy", c.privacy],
            ["marketing", c.marketing],
          ] as const
        ).map(([k, text]) => (
          <label key={k} className="flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-meki-green" checked={form[k]} onChange={(e) => set(k, e.target.checked)} disabled={busy} required={k === "privacy"} />
            <span>
              {text}
              {k === "privacy" && <span className="block text-xs text-body-grey">{c.privacyPending}</span>}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-[#b00020]/30 bg-[#b00020]/5 px-3 py-2 text-sm text-[#8a0019]">
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className="btn btn-gold min-h-12 flex-1 disabled:cursor-wait disabled:opacity-70">
          <Lock className="size-4" aria-hidden="true" />
          <span aria-live="polite">{phase === "submitting" ? c.submitting : phase === "redirecting" ? c.redirecting : c.submit}</span>
        </button>
        <button type="button" onClick={onClose} disabled={busy} className="btn btn-outline">
          {c.back}
        </button>
      </div>
      <p className="mt-3 text-center text-[0.72rem] text-body-grey">{t.quick.secure}</p>
    </form>
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
