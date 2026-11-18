/**
 * Phase 6E — pure Gala operations rules (no React, no network). Gates mirror the backend (bookings.service.ts,
 * tickets.service.ts, checkin.service.ts, ticket-config.service.ts); the API stays authoritative and re-checks everything.
 *
 * Financial rule: ticket revenue (classification EVENT_TICKET_PAYMENT) is NEVER added to donation figures, never converted
 * between currencies, and no tax-deductible / fair-market value is derived (the API returns none).
 */
import type { Gate } from "./content.ts";

const gate = (reasons: (string | false | null | undefined)[]): Gate => {
  const r = reasons.filter((x): x is string => !!x);
  return { allowed: r.length === 0, reasons: r };
};

/** The approved Gala Night event (seed code). Other ticketed events (e.g. test fixtures) can be chosen explicitly. */
export const GALA_CODE = "EVT-GALA-NIGHT";

export function pickGalaEvent<T extends { id: string; code: string }>(events: T[], chosenId?: string | null): T | null {
  return events.find((e) => e.id === chosenId) ?? events.find((e) => e.code === GALA_CODE) ?? (events.length === 1 ? events[0] : null);
}

// ───────────── status tones ─────────────

export type Tone = "ok" | "warn" | "danger" | "info" | "neutral";
const TONES: Record<"booking" | "bookingPayment" | "ticket" | "job" | "checkin", Record<string, Tone>> = {
  booking: { PENDING: "warn", CONFIRMED: "ok", CANCELLED: "neutral", REFUND_PENDING: "warn", REFUNDED: "info" },
  bookingPayment: { UNPAID: "neutral", PENDING: "warn", PAID: "ok", FAILED: "danger", REFUNDED: "info" },
  ticket: { PENDING: "neutral", ISSUED: "info", CHECKED_IN: "ok", REVOKED: "danger", REFUNDED: "danger" },
  job: { PENDING: "warn", RUNNING: "info", DONE: "ok", FAILED: "danger", SKIPPED: "neutral" },
  checkin: { VALID: "ok", ALREADY_CHECKED_IN: "warn", INVALID: "danger", REVOKED: "danger", REFUNDED: "danger", PAYMENT_NOT_CONFIRMED: "danger" },
};
export type GalaStatusKind = keyof typeof TONES;
export const galaTone = (kind: GalaStatusKind, status: string): Tone => TONES[kind][status] ?? "neutral";

/** Tickets are issued inside the verified-payment transaction: a booking's issuance state follows from its status. */
export type Issuance = "issued" | "awaitingPayment" | "revoked" | "refunded";
export function ticketIssuance(b: { bookingStatus: string; paymentStatus: string }): Issuance {
  if (b.bookingStatus === "REFUNDED") return "refunded";
  if (b.bookingStatus === "CANCELLED" || b.bookingStatus === "REFUND_PENDING") return "revoked";
  if (b.bookingStatus === "CONFIRMED" && b.paymentStatus === "PAID") return "issued";
  return "awaitingPayment";
}

// ───────────── attendance / KPIs ─────────────

/**
 * Attendance from ticket counts. Only ISSUED + CHECKED_IN tickets can be admitted, so they are the denominator; with none, no
 * percentage is shown (never "0 %" from an empty denominator).
 */
export function attendance(byStatus: Record<string, number | undefined>) {
  const checkedIn = byStatus.CHECKED_IN ?? 0;
  const expected = (byStatus.ISSUED ?? 0) + checkedIn;
  return { expected, checkedIn, remaining: byStatus.ISSUED ?? 0, percent: expected > 0 ? Math.round((checkedIn / expected) * 1000) / 10 : null };
}

export function bookingKpis(byStatus: Record<string, number | undefined>) {
  const n = (k: string) => byStatus[k] ?? 0;
  return { total: Object.values(byStatus).reduce<number>((a, x) => a + (x ?? 0), 0), confirmed: n("CONFIRMED"), pending: n("PENDING"), cancelled: n("CANCELLED"), refundPending: n("REFUND_PENDING"), refunded: n("REFUNDED") };
}

export function ticketKpis(byStatus: Record<string, number | undefined>) {
  const n = (k: string) => byStatus[k] ?? 0;
  return { issued: n("ISSUED") + n("CHECKED_IN"), pendingIssue: n("PENDING"), checkedIn: n("CHECKED_IN"), notCheckedIn: n("ISSUED"), void: n("REVOKED") + n("REFUNDED") };
}

/** Registered guests = one ticket per guest, whatever the ticket's state. */
export const registeredGuests = (ticketsByStatus: Record<string, number | undefined>) => Object.values(ticketsByStatus).reduce<number>((a, x) => a + (x ?? 0), 0);

// ───────────── gates ─────────────

export function cancelGate(b: { bookingStatus: string; guests?: { ticket: { status: string } | null }[] }, can: boolean): Gate {
  return gate([
    !can && "permission",
    ["CANCELLED", "REFUND_PENDING", "REFUNDED"].includes(b.bookingStatus) && "alreadyCancelled",
    (b.guests ?? []).some((g) => g.ticket?.status === "CHECKED_IN") && "checkedInGuests",
  ]);
}
const confirmedPaid = (b: { bookingStatus: string; paymentStatus: string }) => b.bookingStatus === "CONFIRMED" && b.paymentStatus === "PAID";
/** Resend = re-queue failed/skipped PDF + e-mail jobs (POST …/resend); only for confirmed, paid bookings. */
export const resendGate = (b: { bookingStatus: string; paymentStatus: string }, can: boolean) => gate([!can && "permission", !confirmedPaid(b) && "notConfirmed"]);
/** Regenerate only creates PDFs that are missing; tickets that have one are never duplicated. */
export function regenerateGate(b: { bookingStatus: string; paymentStatus: string; guests: { ticket: { status: string; hasPdf: boolean } | null }[] }, can: boolean): Gate {
  return gate([!can && "permission", !confirmedPaid(b) && "notConfirmed", !b.guests.some((g) => g.ticket?.status === "ISSUED" && !g.ticket.hasPdf) && "allPdfsPresent"]);
}
export const pdfGate = (t: { hasPdf: boolean }, can: boolean) => gate([!can && "permission", !t.hasPdf && "noPdf"]);
export const revokeGate = (t: { status: string }, can: boolean) => gate([!can && "permission", t.status !== "ISSUED" && t.status !== "PENDING" && "notRevocable"]);
export const reissueGate = (t: { status: string }, can: boolean) => gate([!can && "permission", t.status !== "ISSUED" && "notIssued"]);
export const manualCheckInGate = (t: { status: string; bookingConfirmed: boolean }, can: boolean) =>
  gate([!can && "permission", t.status === "CHECKED_IN" && "alreadyCheckedIn", t.status !== "ISSUED" && t.status !== "CHECKED_IN" && "notIssued", !t.bookingConfirmed && "notConfirmed"]);
export const undoCheckInGate = (t: { status: string }, can: boolean) => gate([!can && "permission", t.status !== "CHECKED_IN" && "notCheckedIn"]);
/** Opening/closing sales needs events.approve (server-enforced). */
export const salesGate = (can: boolean) => gate([!can && "approvePermission"]);
export const reasonError = (s: string) => (s.trim().length >= 3 && s.trim().length <= 500 ? null : "reason");

// ───────────── check-in input ─────────────

/** The QR encodes the opaque token only. Scanner input may carry whitespace / a trailing newline; anything else is INVALID server-side. */
export const QR_TOKEN = /^mkt_[A-Za-z0-9_-]{43}$/;
export const normalizeScan = (raw: string) => raw.trim();
export const looksLikeToken = (raw: string) => QR_TOKEN.test(normalizeScan(raw));
/** Ticket numbers are TK- + 10 Crockford characters; lookups need ≥ 3 characters. */
export const lookupError = (q: string) => (q.trim().length >= 3 && q.trim().length <= 60 ? null : "lookupShort");

/** Guards a scanner against the same code being submitted again while (or right after) it is processed. */
export function createScanGuard(windowMs = 2500) {
  let busy = false;
  let last: { value: string; at: number } | null = null;
  return {
    tryStart(value: string, now = Date.now()) {
      if (busy) return false;
      if (last && last.value === value && now - last.at < windowMs) return false;
      busy = true;
      last = { value, at: now };
      return true;
    },
    done() {
      busy = false;
    },
    get busy() {
      return busy;
    },
  };
}

// ───────────── settings ─────────────

export const PRICE = /^(?:[1-9]\d{0,8})(?:\.\d{1,2})?$/;
/** Ticket labels are printed with the built-in PDF fonts: printable ASCII + Latin-1 (same rule as the API). */
export const LABEL = /^[ -~ -ÿ]+$/;
export const labelError = (s: string, min = 2) => (s.trim().length < min ? "required" : !LABEL.test(s.trim()) ? "latin" : null);
export const capacityError = (s: string) => (s === "" || (/^\d+$/.test(s) && Number(s) >= 1 && Number(s) <= 100000) ? null : "capacity");
export const maxPerBookingError = (s: string) => (/^\d+$/.test(s) && Number(s) >= 1 && Number(s) <= 50 ? null : "maxPerBooking");
/** <input type="datetime-local"> value + IANA zone are shown as entered; the API needs ISO-8601 with an offset. */
export const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
