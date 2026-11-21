/**
 * Phase 14 — pure helpers for the hosted giving flows (general / programme / Gala donation). No network, no storage, so every
 * rule is unit-testable. The server re-validates everything; nothing here decides whether money moves.
 */
import type { CharitableClassification, CreateDonationIntentRequest, DonationIntentType, DonorStage, GivingGateReason, HostedLimits, PublicGivingOptions, ZakatAvailability } from "@meki/api-client";

export type GivingMode = "general" | "gala";
/** "" = where it is needed most (general giving); otherwise a programme slug. */
export type Destination = "" | string;

export type GivingFormState = {
  destination: Destination;
  classification: CharitableClassification | "";
  amount: string;
  fullName: string;
  email: string;
  acceptTerms: boolean;
  /** Phase 14B: the donor accepted that this gift goes to the approved Gala project instead (Gala-only mode) */
  acceptGala: boolean;
};
export const newGivingForm = (destination: Destination = "", amount = ""): GivingFormState => ({ destination, classification: "", amount, fullName: "", email: "", acceptTerms: false, acceptGala: false });

const SLUG = /^[a-z0-9-]{2,100}$/;
/** Programme preselection from `?programme=<slug>` — only a slug that exists in the published list is accepted. */
export function preselect(param: string | string[] | undefined, slugs: string[]): Destination {
  const v = Array.isArray(param) ? param[0] : param;
  return v && SLUG.test(v) && slugs.includes(v) ? v : "";
}

export function intentTypeFor(mode: GivingMode, destination: Destination, galaRedirect = false): DonationIntentType {
  if (mode === "gala" || galaRedirect) return "GALA_DONATION";
  return destination ? "PROGRAM_DONATION" : "GENERAL_DONATION";
}

export type GiftErrors = Partial<Record<"classification" | "amount" | "fullName" | "email" | "acceptTerms", "required" | "email" | "amountInvalid" | "amountMin" | "amountMax" | "zakatUnavailable">>;

const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/** Normalises "1,250.50" / " 25 " / Arabic-Indic digits to a decimal string; null when not a valid USD amount. */
export function normaliseAmount(v: string): string | null {
  const ascii = v.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[,\s]/g, "");
  return AMOUNT.test(ascii) && Number(ascii) > 0 ? ascii : null;
}

/** Step 1 (the gift). `zakatAllowed` is the server's answer for the chosen destination. */
export function validateGift(f: GivingFormState, limits: Pick<HostedLimits, "min" | "max">, zakatAllowed: boolean): GiftErrors {
  const e: GiftErrors = {};
  if (!f.classification) e.classification = "required";
  else if (f.classification === "ZAKAT" && !zakatAllowed) e.classification = "zakatUnavailable";
  const a = normaliseAmount(f.amount);
  if (!f.amount.trim()) e.amount = "required";
  else if (!a) e.amount = "amountInvalid";
  else if (limits.min && Number(a) < Number(limits.min)) e.amount = "amountMin";
  else if (limits.max && Number(a) > Number(limits.max)) e.amount = "amountMax";
  return e;
}

/** Step 2 (contact — needed only to find the gift if the donor contacts MEKI; Zeffy collects payment details). */
export function validateDetails(f: GivingFormState): GiftErrors {
  const e: GiftErrors = {};
  const name = f.fullName.trim().replace(/\s+/g, " ");
  if (name.length < 2) e.fullName = "required";
  if (!f.email.trim()) e.email = "required";
  else if (!EMAIL.test(f.email.trim())) e.email = "email";
  return e;
}

/**
 * `galaRedirect` (Phase 14B, Gala-only mode): the donor started from a program / general option and EXPLICITLY accepted the Gala
 * destination — the request then names the source interest and carries the acknowledgement (the API refuses it otherwise).
 */
export function buildIntentRequest(mode: GivingMode, f: GivingFormState, locale: "en" | "ar", eventSlug = "gala-night", galaRedirect = false): CreateDonationIntentRequest {
  const intentType = intentTypeFor(mode, f.destination, galaRedirect);
  return {
    intentType,
    ...(intentType === "PROGRAM_DONATION" ? { programmeSlug: f.destination } : {}),
    ...(intentType === "GALA_DONATION" ? { eventSlug } : {}),
    ...(galaRedirect && mode === "general" ? { sourceInterest: f.destination || "general", acknowledgeGalaDestination: f.acceptGala } : {}),
    amount: normaliseAmount(f.amount) ?? f.amount,
    currency: "USD",
    classification: f.classification as CharitableClassification,
    donor: { fullName: f.fullName.trim().replace(/\s+/g, " "), email: f.email.trim() },
    acceptTerms: true,
    locale,
  };
}

/** One Idempotency-Key per distinct submission (retries of the same payload reuse it). In memory only. */
export class IntentKeeper {
  private fp: string | null = null;
  private key: string | null = null;
  private readonly gen: () => string;
  constructor(gen: () => string = () => globalThis.crypto.randomUUID()) {
    this.gen = gen;
  }
  keyFor(req: CreateDonationIntentRequest): string {
    const fp = JSON.stringify(req);
    if (fp !== this.fp || !this.key) {
      this.fp = fp;
      this.key = this.gen();
    }
    return this.key;
  }
}

export type IntentErrorKey = "network" | "closed" | "zakat" | "amount" | "invalid" | "rateLimited" | "conflict" | "unavailable" | "unknown";
/** API failures → a small set of UI keys; raw server messages are never shown. */
export function mapIntentError(code: string, status: number): IntentErrorKey {
  if (status === 0) return "network";
  if (code === "GIVING_CHANNEL_DISABLED") return "closed";
  if (code === "ZAKAT_NOT_ALLOWED") return "zakat";
  if (code.startsWith("AMOUNT_") || code === "INVALID_AMOUNT" || code === "INVALID_AMOUNT_PRECISION") return "amount";
  if (code === "IDEMPOTENCY_KEY_REUSED") return "conflict";
  if (status === 429) return "rateLimited";
  if (status === 503) return "unavailable";
  if (status === 400 || status === 422) return "invalid";
  return "unknown";
}

/** The four states the UI must keep apart (intention / pending external / verified / allocated), plus the review outcomes. */
export const STAGE_ORDER = ["INTENDED", "PENDING_EXTERNAL", "VERIFIED", "ALLOCATED"] as const;
export function stageIndex(stage: DonorStage): number {
  if (stage === "ALLOCATED") return 3;
  if (stage === "VERIFIED") return 2;
  return 1; // PENDING_EXTERNAL, NEEDS_REVIEW, NOT_COMPLETED: never shown as verified
}

/** Reason → copy key for closed channels / Zakat (falls back to a generic message). */
export const reasonKey = (r: GivingGateReason | null | undefined): GivingGateReason | "generic" => r ?? "generic";

// ───────────── donor access token: this tab only, never in a URL ─────────────

const TOKEN_PREFIX = "meki.gift.";
export function rememberGift(reference: string, token: string) {
  try {
    globalThis.sessionStorage?.setItem(TOKEN_PREFIX + reference, token);
  } catch {
    /* private mode: the status page then shows the generic "being verified" message */
  }
}
export function recallGift(reference: string): string | null {
  try {
    return globalThis.sessionStorage?.getItem(TOKEN_PREFIX + reference) ?? null;
  } catch {
    return null;
  }
}
export const DONATION_REFERENCE = /^DN-[0-9A-Z]{12}$/;

// ───────────── Phase 14B: routing (own channel / Gala-only redirect / closed) ─────────────

export type Route =
  | { kind: "own"; available: true; zakat: ZakatAvailability; destinationName: string }
  | { kind: "galaOffer"; available: boolean; accepted: boolean; ownReason: GivingGateReason | null; zakat: ZakatAvailability; destinationName: string; interestName: string; eventSlug: string }
  | { kind: "closed"; available: false; reason: GivingGateReason | null; zakat: ZakatAvailability; destinationName: string };

/**
 * Where a general / program gift can go RIGHT NOW, from the server's options only:
 *  - its own SDI channel when open;
 *  - otherwise, in Gala-only mode, an OFFER to support the approved Gala project — payable only once the donor accepted it;
 *  - otherwise closed (preview), with the server's reason.
 * A program gift is never turned into a Gala gift without `accepted`.
 */
export function resolveRoute(o: PublicGivingOptions, destination: Destination, accepted: boolean, generalName: string): Route {
  const p = destination ? o.programmes.find((x) => x.slug === destination) : undefined;
  const own = destination ? { available: !!p?.payable, reason: p?.reason ?? "NOT_AUTHORIZED_BY_SDI", zakat: p?.zakat ?? { allowed: false, reason: "NOT_ZAKAT_ELIGIBLE" as const }, name: p?.name ?? "" } : { available: o.channels.general.available, reason: o.channels.general.reason, zakat: o.channels.general.zakat, name: generalName };
  if (own.available) return { kind: "own", available: true, zakat: own.zakat, destinationName: own.name };
  const g = o.galaOnly;
  if (g?.active && g.project) return { kind: "galaOffer", available: accepted, accepted, ownReason: own.reason, zakat: g.zakat, destinationName: g.project.name, interestName: own.name, eventSlug: g.eventSlug };
  return { kind: "closed", available: false, reason: own.reason, zakat: own.zakat, destinationName: own.name };
}

/** True when a "Give" entry point leads to a payable journey (own channel or a Gala-only offer). Used by every Give button. */
export function isRoutable(o: PublicGivingOptions | null, programmeSlug?: string): boolean {
  if (!o) return false;
  if (o.galaOnly?.active) return true;
  if (programmeSlug) return !!o.programmes.find((p) => p.slug === programmeSlug)?.payable;
  return o.channels.general.available;
}

/** The /give URL a Give button opens: the programme of interest and the chosen amount travel as query parameters (never a token). */
export function giveHref(locale: "en" | "ar", s: { programmeSlug?: string; amount?: string } = {}): string {
  const q = new URLSearchParams();
  if (s.programmeSlug && /^[a-z0-9-]{2,100}$/.test(s.programmeSlug)) q.set("programme", s.programmeSlug);
  const a = s.amount ? normaliseAmount(s.amount) : null;
  if (a) q.set("amount", a);
  const qs = q.toString();
  return `/${locale}/give${qs ? `?${qs}` : ""}#prepare`;
}
