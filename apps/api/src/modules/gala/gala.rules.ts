import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import type { EventBookingStatus, BookingPaymentStatus, TicketStatus } from '../../generated/prisma/enums';

/**
 * Pure rules for Gala booking & ticketing (no I/O) — everything here is unit-tested.
 * Money uses Prisma.Decimal only (never floats).
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32

function code(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % 32];
  return out;
}

/** Public, non-sequential booking reference, e.g. EB-7K3QX9M2PA4T (60 bits of CSPRNG entropy). */
export const generateBookingReference = () => `EB-${code(12)}`;
/** Payment-attempt reference echoed by the provider. The "BA-" prefix routes webhook events to the booking handler. */
export const generateBookingAttemptReference = () => `BA-${code(12)}`;
export const BOOKING_ATTEMPT_PREFIX = 'BA-';
/** Printed ticket number, e.g. TK-7K3QX9M2PA (50 bits; unique index guards collisions). Not secret and not a credential. */
export const generateTicketNumber = () => `TK-${code(10)}`;

// ───────────── pricing ─────────────

/** Total = guests x unit price, computed server-side from the configured price. Never from client input. */
export function calculateTotal(unitPrice: string | number | Prisma.Decimal, guestCount: number): Prisma.Decimal {
  if (!Number.isInteger(guestCount) || guestCount < 1) throw new RangeError('guestCount must be a positive integer');
  return new Prisma.Decimal(unitPrice).times(guestCount);
}

// ───────────── QR tokens ─────────────

/** "mkt_" + 256-bit CSPRNG token (base64url, 43 chars). Opaque: encodes no personal data, id or booking detail. */
export const QR_TOKEN_PATTERN = /^mkt_[A-Za-z0-9_-]{43}$/;
export const generateQrToken = () => `mkt_${randomBytes(32).toString('base64url')}`;
/** Only this hash is stored. A 256-bit random secret needs no salt or slow hash. */
export const hashQrToken = (token: string) => createHash('sha256').update(token).digest('hex');
export function verifyQrToken(token: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !QR_TOKEN_PATTERN.test(token)) return false;
  const given = Buffer.from(hashQrToken(token), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return given.length === stored.length && timingSafeEqual(given, stored);
}

// ───────────── guest validation ─────────────

export const normalizeEmail = (v: string) => v.trim().toLowerCase();
export const normalizeName = (v: string) => v.trim().replace(/\s+/g, ' ');
/** Same shape as donor phones, plus at least 7 digits. */
export const PHONE_PATTERN = /^\+?[\d\s()-]{6,40}$/;
export function phoneIsValid(v: string): boolean {
  return PHONE_PATTERN.test(v) && (v.match(/\d/g) ?? []).length >= 7;
}
/** Starts with a letter (so a name can never start with a formula character); digits allowed afterwards ("Smith III"). */
export const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\p{N}' .,-]{0,159}$/u;

export interface GuestInput {
  fullName: string;
  email: string;
}

/** Duplicate ticket guards inside one booking: the same e-mail may not hold two tickets. Returns offending indexes. */
export function findDuplicateGuests(guests: GuestInput[]): number[] {
  const seen = new Map<string, number>();
  const dup: number[] = [];
  guests.forEach((g, i) => {
    const key = normalizeEmail(g.email);
    if (seen.has(key)) dup.push(i);
    else seen.set(key, i);
  });
  return dup;
}

// ───────────── state machine ─────────────

const BOOKING_TRANSITIONS: Record<EventBookingStatus, EventBookingStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED', 'REFUND_PENDING'], // REFUND_PENDING: money arrived after an admin cancellation
  CONFIRMED: ['REFUND_PENDING', 'REFUNDED'],
  CANCELLED: ['REFUND_PENDING'],
  REFUND_PENDING: ['REFUNDED'],
  REFUNDED: [],
};
export const canTransitionBooking = (from: EventBookingStatus, to: EventBookingStatus) => BOOKING_TRANSITIONS[from].includes(to);

const TICKET_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  PENDING: ['ISSUED', 'REVOKED'],
  ISSUED: ['CHECKED_IN', 'REVOKED', 'REFUNDED'],
  CHECKED_IN: ['ISSUED', 'REFUNDED'], // ISSUED: audited undo of an erroneous check-in
  REVOKED: ['REFUNDED'],
  REFUNDED: [],
};
export const canTransitionTicket = (from: TicketStatus, to: TicketStatus) => TICKET_TRANSITIONS[from].includes(to);

/** Tickets may exist as PDFs/QR only while the booking is confirmed and paid. */
export const bookingIsConfirmedAndPaid = (b: { bookingStatus: EventBookingStatus; paymentStatus: BookingPaymentStatus }) =>
  b.bookingStatus === 'CONFIRMED' && b.paymentStatus === 'PAID';

export type CheckInResult = 'VALID' | 'ALREADY_CHECKED_IN' | 'INVALID' | 'REVOKED' | 'REFUNDED' | 'PAYMENT_NOT_CONFIRMED';

/** Decision for a scanned ticket (before the atomic write). */
export function evaluateTicketForCheckIn(
  t: { status: TicketStatus },
  b: { bookingStatus: EventBookingStatus; paymentStatus: BookingPaymentStatus },
): CheckInResult {
  switch (t.status) {
    case 'REVOKED':
      return 'REVOKED';
    case 'REFUNDED':
      return 'REFUNDED';
    case 'CHECKED_IN':
      return 'ALREADY_CHECKED_IN';
    case 'PENDING':
      return 'PAYMENT_NOT_CONFIRMED';
    case 'ISSUED':
      return bookingIsConfirmedAndPaid(b) ? 'VALID' : 'PAYMENT_NOT_CONFIRMED';
  }
}

// ───────────── CSV ─────────────

/**
 * Neutralises spreadsheet formula injection (OWASP): values that start with = + - @ TAB CR LF are prefixed with
 * a single quote so Excel/Sheets treat them as text. Plain phone numbers ("+1 212 555 0100") are left intact.
 */
export function csvSafe(value: unknown): string {
  let s = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r\n]/.test(s) && !/^\+[\d\s()-]+$/.test(s)) s = `'${s}`;
  return s;
}

export function csvCell(value: unknown): string {
  const s = csvSafe(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  return lines.join('\r\n') + '\r\n';
}

// ───────────── idempotency ─────────────

/** Deterministic JSON (sorted keys) so retries with re-ordered fields hash identically. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object)
      .sort()
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
