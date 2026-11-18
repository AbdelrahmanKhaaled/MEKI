/**
 * Phase 6B pure finance logic (no React, no DOM — runs under `node --test`). Rules enforced here:
 *  - money is a decimal STRING; arithmetic uses BigInt fixed-point (metrics.toUnits) — never floating point;
 *  - totals are per currency; different currencies are never added together;
 *  - only provider-verified payments (PAID / PARTIALLY_REFUNDED / REFUNDED) of NON-test records count as collected money;
 *    recurring agreements are commitments, never revenue;
 *  - an action is offered only when the backend endpoint exists, the user holds the permission, the lifecycle allows it and
 *    (for anything that moves money) a real, non-test provider is configured on the server. The API remains authoritative.
 */
import { toUnits } from "./metrics.ts";
import type { Provider } from "./finance-schemas.ts";

// ───────────── money ─────────────

const SCALE = 1_000_000n;

/** BigInt units (6 dp) → canonical decimal string with at least 2 and at most 3 decimals (DB stores Decimal(18,3)). */
export function unitsToDecimal(u: bigint): string {
  const neg = u < 0n;
  const abs = neg ? -u : u;
  const whole = abs / SCALE;
  let frac = (abs % SCALE).toString().padStart(6, "0").slice(0, 3);
  if (frac.endsWith("0")) frac = frac.slice(0, 2);
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

export const addMoney = (...xs: string[]) => unitsToDecimal(xs.reduce((a, x) => a + toUnits(x), 0n));
export const subMoney = (a: string, b: string) => unitsToDecimal(toUnits(a) - toUnits(b));
export const cmpMoney = (a: string, b: string) => {
  const d = toUnits(a) - toUnits(b);
  return d === 0n ? 0 : d > 0n ? 1 : -1;
};

/** Positive decimal string with at most `minorUnits` decimals (the API applies the same rule — this is UX only). */
export function isValidAmount(s: string, minorUnits = 2): boolean {
  const m = /^(\d{1,15})(?:\.(\d+))?$/.exec(s.trim());
  if (!m) return false;
  if ((m[2]?.length ?? 0) > minorUnits) return false;
  return toUnits(s.trim()) > 0n;
}

// ───────────── statuses ─────────────

export const CONFIRMED_PAYMENT = ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] as const;
export const isConfirmedPayment = (paymentStatus: string) => (CONFIRMED_PAYMENT as readonly string[]).includes(paymentStatus);

export type StatusKind = "donation" | "payment" | "attempt" | "tx" | "txType" | "refund" | "recurring" | "receipt" | "webhook";
export type Tone = "ok" | "warn" | "danger" | "info" | "neutral";

const TONES: Record<StatusKind, Record<string, Tone>> = {
  donation: { COMPLETED: "ok", PENDING: "warn", FAILED: "danger", CANCELLED: "neutral", EXPIRED: "neutral" },
  payment: { PAID: "ok", PARTIALLY_REFUNDED: "info", REFUNDED: "info", UNPAID: "warn", AUTHORIZED: "warn", FAILED: "danger" },
  attempt: { SUCCEEDED: "ok", AUTHORIZED: "info", CREATED: "warn", REQUIRES_ACTION: "warn", FAILED: "danger", CANCELLED: "neutral", EXPIRED: "neutral" },
  tx: { SUCCEEDED: "ok", FAILED: "danger" },
  txType: { CAPTURE: "ok", AUTHORIZATION: "info", REFUND: "info", FAILURE: "danger", CANCELLATION: "neutral" },
  refund: { REQUESTED: "warn", APPROVED: "info", PROCESSING: "info", SUCCEEDED: "ok", REJECTED: "neutral", FAILED: "danger" },
  recurring: { ACTIVE: "ok", PENDING_ACTIVATION: "warn", PAUSED: "neutral", PAST_DUE: "warn", CANCELLED: "neutral", FAILED: "danger" },
  receipt: { ISSUED: "ok", VOID: "neutral" },
  webhook: { PROCESSED: "ok", RECEIVED: "warn", IGNORED: "neutral", FAILED: "danger" },
};
/** Unknown statuses are shown neutrally with their raw code — never guessed into a "success". */
export const statusTone = (kind: StatusKind, status: string): Tone => TONES[kind][status] ?? "neutral";

// ───────────── people / designation ─────────────

export function donorName(d: { firstName: string; lastName: string; organizationName?: string | null } | undefined | null): string | null {
  if (!d) return null;
  const n = (d.organizationName || `${d.firstName} ${d.lastName}`).trim();
  return n || null;
}

export interface DesignationView {
  kind: "GENERAL_FUND" | "CAMPAIGN" | "PROGRAMME" | "NONE";
  title: string | null;
}
export function designationOf(allocations: { designation: string; campaign: { titleEn: string } | null; programme: { nameEn: string } | null }[]): DesignationView {
  const a = allocations[0];
  if (!a) return { kind: "NONE", title: null };
  if (a.campaign) return { kind: "CAMPAIGN", title: a.campaign.titleEn };
  if (a.programme) return { kind: "PROGRAMME", title: a.programme.nameEn };
  return { kind: a.designation === "GENERAL_FUND" ? "GENERAL_FUND" : "NONE", title: null };
}

// ───────────── per-currency totals (donor profile, recurring history) ─────────────

export interface CurrencyTotal {
  currency: string;
  count: number;
  gross: string;
  refunded: string;
  net: string;
}

/**
 * Collected totals per currency from a list of donations: verified payments only, test records excluded, refunds subtracted.
 * Currencies are kept apart (one row each, sorted by code).
 */
export function confirmedTotalsByCurrency(rows: { amount: string; refundedAmount?: string; currency: string; paymentStatus: string; isTest?: boolean }[]): CurrencyTotal[] {
  const acc = new Map<string, { count: number; gross: bigint; refunded: bigint }>();
  for (const r of rows) {
    if (r.isTest || !isConfirmedPayment(r.paymentStatus)) continue;
    const c = acc.get(r.currency) ?? { count: 0, gross: 0n, refunded: 0n };
    c.count += 1;
    c.gross += toUnits(r.amount);
    c.refunded += toUnits(r.refundedAmount ?? "0");
    acc.set(r.currency, c);
  }
  return [...acc.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, v]) => ({ currency, count: v.count, gross: unitsToDecimal(v.gross), refunded: unitsToDecimal(v.refunded), net: unitsToDecimal(v.gross - v.refunded) }));
}

/** The donor detail endpoint returns at most this many donations; totals from a full page are flagged as partial. */
export const DONOR_HISTORY_LIMIT = 100;

// ───────────── payment provider truth ─────────────

export interface ProviderState {
  /** a provider that is configured on the server, enabled, active for new payments and NOT a test provider */
  live: Provider | null;
  /** only a test/mock provider is active (development) */
  testOnly: boolean;
  /** nothing is active on the server */
  none: boolean;
}
export function providerState(providers: Provider[]): ProviderState {
  const active = providers.find((p) => p.activeOnServer && p.configuredOnServer);
  const live = active && active.isEnabled && !active.isTestProvider ? active : null;
  return { live, testOnly: !!active && active.isTestProvider, none: !active };
}
export const isTestProviderCode = (code: string | null | undefined, providers: Provider[] | undefined) => !!code && !!providers?.find((p) => p.code === code)?.isTestProvider;

// ───────────── refunds ─────────────

export const OPEN_REFUND = ["REQUESTED", "APPROVED", "PROCESSING"] as const;

/** amount − already refunded − refunds still open (requested/approved/processing) — the API's own formula. */
export function refundableBalance(amount: string, refundedAmount: string, refunds: { amount: string; status: string }[]): string {
  const open = refunds.filter((r) => (OPEN_REFUND as readonly string[]).includes(r.status)).reduce((a, r) => a + toUnits(r.amount), 0n);
  const v = toUnits(amount) - toUnits(refundedAmount) - open;
  return unitsToDecimal(v < 0n ? 0n : v);
}

export type GateReason =
  | "permission"
  | "notConfirmed"
  | "testRecord"
  | "noBalance"
  | "providerUnknown"
  | "providerNotLive"
  | "providerNoRefunds"
  | "wrongState"
  | "ownRequest";
export interface Gate {
  allowed: boolean;
  reasons: GateReason[];
}
const gate = (reasons: (GateReason | false)[]): Gate => {
  const r = reasons.filter((x): x is GateReason => !!x);
  return { allowed: r.length === 0, reasons: r };
};

/** The provider that processed a payment must be configured on the server, enabled, not a test provider and refund-capable. */
function providerReasons(code: string | null | undefined, providers: Provider[] | null | undefined): (GateReason | false)[] {
  if (!providers) return ["providerUnknown"]; // cannot verify (no payments.read) → never enabled
  const p = code ? providers.find((x) => x.code === code) : undefined;
  if (!p || !p.configuredOnServer || !p.isEnabled || p.isTestProvider) return ["providerNotLive"];
  return [!p.supportsRefunds && "providerNoRefunds"];
}

export function refundRequestGate(input: {
  canRequest: boolean;
  donation: { paymentStatus: string; isTest: boolean; provider?: string | null; amount: string; refundedAmount: string; refunds: { amount: string; status: string }[] };
  providers: Provider[] | null | undefined;
}): Gate {
  const d = input.donation;
  return gate([
    !input.canRequest && "permission",
    !["PAID", "PARTIALLY_REFUNDED"].includes(d.paymentStatus) && "notConfirmed",
    d.isTest && "testRecord",
    toUnits(refundableBalance(d.amount, d.refundedAmount, d.refunds)) <= 0n && "noBalance",
    ...providerReasons(d.provider, input.providers),
  ]);
}

/**
 * Approve/reject: REQUESTED only, never one's own request (four-eyes, enforced again by the API). Approving leads to money
 * moving, so it also needs a live refund-capable provider and a non-test record; rejecting moves no money and does not.
 */
export function refundDecisionGate(input: {
  decision: "approve" | "reject";
  canApprove: boolean;
  status: string;
  requestedById: string;
  userId: string | undefined;
  isTest: boolean;
  provider: string | null;
  providers: Provider[] | null | undefined;
}): Gate {
  const approve = input.decision === "approve";
  return gate([
    !input.canApprove && "permission",
    input.status !== "REQUESTED" && "wrongState",
    input.requestedById === input.userId && "ownRequest",
    approve && input.isTest && "testRecord",
    ...(approve ? providerReasons(input.provider, input.providers) : []),
  ]);
}

/** Execute sends money back through the provider: APPROVED only, and only with a live refund-capable provider. */
export function refundExecuteGate(input: { canExecute: boolean; status: string; isTest: boolean; provider: string | null; providers: Provider[] | null | undefined }): Gate {
  return gate([!input.canExecute && "permission", input.status !== "APPROVED" && "wrongState", input.isTest && "testRecord", ...providerReasons(input.provider, input.providers)]);
}

// ───────────── recurring ─────────────

export type RecurringAction = "pause" | "resume" | "cancel";
/** Mirrors RecurringService TRANSITIONS (the API re-checks and also asks the provider). */
const TRANSITIONS: Record<RecurringAction, string[]> = {
  pause: ["ACTIVE", "PAST_DUE"],
  resume: ["PAUSED"],
  cancel: ["PENDING_ACTIVATION", "ACTIVE", "PAUSED", "PAST_DUE"],
};
export const recurringActions = (status: string): RecurringAction[] => (Object.keys(TRANSITIONS) as RecurringAction[]).filter((a) => TRANSITIONS[a].includes(status));

/** A recurring agreement is a commitment; only its verified, non-test charges are collected money (in the agreement currency). */
export function recurringCollected(history: { amount: string; currency: string; paymentStatus: string }[], currency: string, isTest: boolean) {
  const captured = history.filter((h) => h.currency === currency && isConfirmedPayment(h.paymentStatus));
  return {
    capturedCount: captured.length,
    collected: isTest ? null : unitsToDecimal(captured.reduce((a, h) => a + toUnits(h.amount), 0n)),
    notCaptured: history.length - captured.length,
  };
}

// ───────────── receipts ─────────────

export type ReceiptAvailability = "issued" | "voidOnly" | "notIssued" | "notEligible";
/** What the donation's receipt situation is, from the receipts the API returned (never inferred from the frontend). */
export function receiptAvailability(paymentStatus: string, receipts: { status: string }[]): ReceiptAvailability {
  if (receipts.some((r) => r.status === "ISSUED")) return "issued";
  if (receipts.length > 0) return "voidOnly";
  return isConfirmedPayment(paymentStatus) ? "notIssued" : "notEligible";
}
/** Test receipts use the backend's separate `TEST-` numbering series (receipts.service nextNumber). */
export const isTestReceiptNumber = (n: string) => n.startsWith("TEST-");

// ───────────── list filters → API query ─────────────

/** "YYYY-MM-DD" date inputs → inclusive UTC ISO range; null when the range is inverted (shown as a validation error). */
export function dayRange(from: string, to: string): { from?: string; to?: string } | null {
  const ok = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
  const f = ok(from) ? `${from}T00:00:00.000Z` : undefined;
  const t = ok(to) ? `${to}T23:59:59.999Z` : undefined;
  if (f && t && f > t) return null;
  return { from: f, to: t };
}

/** Drops empty values so the query key and the URL only contain filters that really change the request. */
export function cleanQuery<T extends Record<string, string | number | boolean | undefined | null>>(q: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") (out as Record<string, unknown>)[k] = v;
  return out;
}

export const clampPage = (page: number, totalPages: number) => Math.min(Math.max(1, Math.floor(page) || 1), Math.max(1, totalPages));
