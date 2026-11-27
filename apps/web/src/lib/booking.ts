/**
 * Pure booking logic (no React, no DOM, no path aliases — runs under `node --test`).
 * The server is authoritative for price, limits and validation; everything here only guides the visitor and mirrors the
 * backend rules (docs/16): it must never be MORE permissive than the API, and it never sends a price.
 */
import type { CreateBookingRequest, CreateHostedBookingRequest } from "@meki/api-client";

export type FieldKey = "fullName" | "email" | "phone" | "dietary";
export type FieldError = "required" | "email" | "phone" | "name" | "unsupportedName" | "dietaryLong" | "duplicateEmail";

export interface PersonForm {
  fullName: string;
  email: string;
  phone: string;
}
export interface GuestForm extends PersonForm {
  dietary: string;
}
export interface BookingForm {
  quantity: number;
  purchaser: PersonForm;
  /** The purchaser is guest #1 (name/e-mail/phone are copied from the purchaser fields) */
  purchaserAttends: boolean;
  guests: GuestForm[];
  consent: boolean;
}

export const emptyPerson = (): PersonForm => ({ fullName: "", email: "", phone: "" });
export const emptyGuest = (): GuestForm => ({ ...emptyPerson(), dietary: "" });

export function newForm(): BookingForm {
  return { quantity: 1, purchaser: emptyPerson(), purchaserAttends: true, guests: [emptyGuest()], consent: false };
}

// ───────────── quantity / guests ─────────────

export const clampQuantity = (q: number, max: number) => Math.min(Math.max(1, Math.trunc(Number.isFinite(q) ? q : 1)), Math.max(1, max));

/** Resizes the guest list to the quantity, keeping what the visitor already typed (extra rows are dropped from the end). */
export function setQuantity(form: BookingForm, quantity: number, max: number): BookingForm {
  const q = clampQuantity(quantity, max);
  const guests = form.guests.slice(0, q);
  while (guests.length < q) guests.push(emptyGuest());
  return { ...form, quantity: q, guests };
}

/** Guests as submitted: when the purchaser attends, guest #1 is the purchaser (contact fields mirrored, dietary stays its own). */
export function effectiveGuests(form: BookingForm): GuestForm[] {
  return form.guests.map((g, i) => (i === 0 && form.purchaserAttends ? { ...g, fullName: form.purchaser.fullName, email: form.purchaser.email, phone: form.purchaser.phone } : g));
}

// ───────────── money (display only) ─────────────

/** Display total: unit price (decimal string from the API) × quantity, in integer cents so there is no float drift. */
export function displayTotal(unitPrice: string, quantity: number): string {
  const [whole, frac = ""] = unitPrice.split(".");
  const cents = BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
  const total = cents * BigInt(quantity);
  const w = total / 100n;
  const c = (total % 100n).toString().padStart(2, "0");
  return c === "00" ? w.toString() : `${w}.${c}`;
}

// ───────────── validation (mirrors the backend DTO + guest-name printability) ─────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[\d\s()-]{6,40}$/;
const NAME = /^[\p{L}\p{M}][\p{L}\p{M}\p{N}' .,-]{0,159}$/u;
const LETTER_OR_MARK = /^[\p{L}\p{M}]$/u;
const SCRIPT_OK = /^[\p{Script=Latin}\p{Script=Arabic}\p{Script=Common}\p{Script=Inherited}]$/u;
const NEUTRAL_OK = /^[\p{N}\p{P}\p{Zs}]$/u;
const CONTROL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/** Same rule as the API: only Latin and Arabic letters can be printed on the PDF ticket (digits/punctuation/space allowed). */
export function isPrintableName(name: string): boolean {
  if (!name || CONTROL.test(name)) return false;
  return Array.from(name).every((c) => (LETTER_OR_MARK.test(c) ? SCRIPT_OK.test(c) : NEUTRAL_OK.test(c)));
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ");

export function validateName(v: string): FieldError | null {
  const n = norm(v);
  if (!n) return "required";
  if (!NAME.test(n)) return "name";
  return isPrintableName(n) ? null : "unsupportedName";
}
export function validateEmail(v: string): FieldError | null {
  const e = v.trim();
  return !e ? "required" : e.length > 191 || !EMAIL.test(e) ? "email" : null;
}
export function validatePhone(v: string): FieldError | null {
  const p = v.trim();
  if (!p) return "required";
  return PHONE.test(p) && (p.match(/\d/g) ?? []).length >= 7 ? null : "phone";
}
export function validateDietary(v: string): FieldError | null {
  const d = v.trim();
  return !d ? "required" : d.length > 500 ? "dietaryLong" : null;
}

export interface FormErrors {
  purchaser: Partial<Record<Exclude<FieldKey, "dietary">, FieldError>>;
  guests: Partial<Record<FieldKey, FieldError>>[];
}

export function validateForm(form: BookingForm): FormErrors {
  const purchaser: FormErrors["purchaser"] = {};
  const pn = validateName(form.purchaser.fullName);
  const pe = validateEmail(form.purchaser.email);
  const pp = validatePhone(form.purchaser.phone);
  if (pn) purchaser.fullName = pn;
  if (pe) purchaser.email = pe;
  if (pp) purchaser.phone = pp;
  const guests = effectiveGuests(form);
  const seen = new Map<string, number>();
  const errs = guests.map((g, i) => {
    const e: Partial<Record<FieldKey, FieldError>> = {};
    // when the purchaser is guest #1 their contact fields are validated once, on the purchaser section
    const own = i === 0 && form.purchaserAttends;
    const n = own ? null : validateName(g.fullName);
    const m = own ? null : validateEmail(g.email);
    const p = own ? null : validatePhone(g.phone);
    const d = validateDietary(g.dietary);
    if (n) e.fullName = n;
    if (m) e.email = m;
    if (p) e.phone = p;
    if (d) e.dietary = d;
    const key = g.email.trim().toLowerCase();
    if (key && !m) {
      if (seen.has(key)) e.email = "duplicateEmail"; // the API refuses two tickets on one e-mail address
      else seen.set(key, i);
    }
    return e;
  });
  return { purchaser, guests: errs };
}

export const hasErrors = (e: FormErrors) => Object.keys(e.purchaser).length > 0 || e.guests.some((g) => Object.keys(g).length > 0);

// ───────────── request + idempotency ─────────────

/** Builds the API body. No price, no totals — the server computes them from its own configuration. */
export function buildRequest(form: BookingForm, locale: "en" | "ar"): CreateBookingRequest {
  const guests = effectiveGuests(form);
  return {
    purchaser: { fullName: norm(form.purchaser.fullName), email: form.purchaser.email.trim(), phone: form.purchaser.phone.trim() },
    guests: guests.map((g, i) => ({
      fullName: norm(g.fullName),
      email: g.email.trim(),
      phone: g.phone.trim(),
      dietaryRequirements: g.dietary.trim(),
      ...(i === 0 && form.purchaserAttends ? { isPurchaser: true } : {}),
    })),
    ticketCount: guests.length,
    locale,
    privacyConsent: true,
  };
}

export function fingerprint(req: CreateBookingRequest | CreateHostedBookingRequest): string {
  return JSON.stringify(req);
}

/**
 * One Idempotency-Key per distinct submission: retries of the SAME payload (network failure, double click after a timeout)
 * reuse the key so the server replays the same booking; any material change gets a fresh key. Kept in memory only.
 */
export class IdempotencyKeeper {
  private fp: string | null = null;
  private key: string | null = null;
  private readonly gen: () => string;
  constructor(gen: () => string = () => globalThis.crypto.randomUUID()) {
    this.gen = gen;
  }
  keyFor(req: CreateBookingRequest | CreateHostedBookingRequest): string {
    const fp = fingerprint(req);
    if (fp !== this.fp || !this.key) {
      this.fp = fp;
      this.key = this.gen();
    }
    return this.key;
  }
}

// ───────────── errors → stable UI keys ─────────────

export type SubmitErrorKey = "network" | "closed" | "unavailable" | "tooMany" | "capacity" | "duplicateGuest" | "unsupportedName" | "invalid" | "rateLimited" | "conflict" | "notFound" | "unknown";

/** Maps API failures to a small set of keys; raw server messages are never shown. */
export function mapSubmitError(code: string, status: number): SubmitErrorKey {
  if (status === 0) return "network";
  if (code === "TICKET_SALES_CLOSED" || code === "HOSTED_BOOKING_DISABLED") return "closed";
  if (code === "PAYMENTS_UNAVAILABLE" || status === 503) return "unavailable";
  if (code === "TOO_MANY_TICKETS") return "tooMany";
  if (code === "INSUFFICIENT_CAPACITY") return "capacity";
  if (code === "DUPLICATE_GUEST") return "duplicateGuest";
  if (code === "UNSUPPORTED_NAME_CHARACTERS") return "unsupportedName";
  if (status === 429) return "rateLimited";
  if (status === 404) return "notFound";
  if (status === 409) return "conflict";
  if (status === 400 || status === 422) return "invalid";
  return "unknown";
}

// ───────────── Phase 12: SDI-hosted (Zeffy) Gala booking ─────────────

export interface HostedForm {
  quantity: number;
  fullName: string;
  email: string;
  consent: boolean;
}
export const newHostedForm = (): HostedForm => ({ quantity: 1, fullName: "", email: "", consent: false });

export function validateHostedForm(f: HostedForm): { fullName?: FieldError; email?: FieldError } {
  const out: { fullName?: FieldError; email?: FieldError } = {};
  const n = validateName(f.fullName);
  if (n) out.fullName = n;
  const e = validateEmail(f.email);
  if (e) out.email = e;
  return out;
}

/** Reference-only request: no price, no guest list, no phone — payment, tickets and attendee details are handled on SDI's form. */
export function buildHostedRequest(f: HostedForm, locale: "en" | "ar"): CreateHostedBookingRequest {
  return { purchaser: { fullName: norm(f.fullName), email: f.email.trim() }, ticketCount: f.quantity, locale, privacyConsent: true };
}

/** Approved platforms hosting SDI's forms. The link is shown only if the BACKEND returned it AND it is https on an allowed host (no credentials). */
export const HOSTED_FORM_HOSTS = ["givebutter.com", "zeffy.com"];
export function isTrustedHostedFormUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password) return false;
    const host = u.hostname.toLowerCase();
    return HOSTED_FORM_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

// ───────────── checkout redirect trust ─────────────

export interface TrustEnv {
  /** Comma-separated hostnames allowed for hosted checkout (NEXT_PUBLIC_CHECKOUT_ALLOWED_HOSTS). Empty = no redirect allowed. */
  allowedHosts: string;
  production: boolean;
  /** Origin of this platform's API, only used to recognise the development-only mock checkout page */
  apiOrigin: string;
}

/**
 * A checkout URL is followed only if the BACKEND returned it AND it passes this check: https, no credentials, exact host (or a
 * subdomain) from the configured allow-list. A test/mock session is refused in production; outside production it is allowed
 * only when it lives on this platform's own API origin (the dev mock page). Nothing a visitor types is ever a destination.
 */
export function isTrustedCheckoutUrl(url: string | null | undefined, session: { isTest: boolean }, env: TrustEnv): boolean {
  if (!url) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.username || u.password) return false;
  if (session.isTest) {
    if (env.production) return false;
    return !!env.apiOrigin && u.origin === env.apiOrigin;
  }
  if (u.protocol !== "https:") return false;
  const hosts = env.allowedHosts.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  const host = u.hostname.toLowerCase();
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

// ───────────── booking status view ─────────────

export type StatusView = "awaiting" | "processing" | "failed" | "confirmed" | "cancelled" | "refundPending" | "refunded";

/** Success is derived ONLY from the API's verified `confirmed` flag, never from how the visitor arrived. */
export function statusView(s: { confirmed: boolean; message: string }): StatusView {
  if (s.confirmed) return "confirmed";
  switch (s.message) {
    case "processing":
      return "processing";
    case "payment_failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "refund_pending":
      return "refundPending";
    case "refunded":
      return "refunded";
    default:
      return "awaiting";
  }
}

export const BOOKING_REF = /^EB-[0-9A-Z]{12}$/;
export const isBookingReference = (v: string | null | undefined): v is string => !!v && BOOKING_REF.test(v);

// ───────────── tab-only token memory (no PII) ─────────────

const KEY = (ref: string) => `meki:booking:${ref}`;
export function rememberBooking(ref: string, token: string, store: Pick<Storage, "setItem"> | undefined = typeof sessionStorage === "undefined" ? undefined : sessionStorage) {
  try {
    if (isBookingReference(ref) && store) store.setItem(KEY(ref), token);
  } catch {
    /* storage unavailable (private mode) */
  }
}
export function recallBooking(ref: string, store: Pick<Storage, "getItem"> | undefined = typeof sessionStorage === "undefined" ? undefined : sessionStorage): string | null {
  try {
    return isBookingReference(ref) && store ? store.getItem(KEY(ref)) : null;
  } catch {
    return null;
  }
}
