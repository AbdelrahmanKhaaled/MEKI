import { randomBytes } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';

/**
 * Money rules:
 *  - API amounts are DECIMAL STRINGS ("25", "25.50"), never JSON numbers, in the original currency.
 *  - Arithmetic uses Prisma.Decimal (decimal.js) only — never JavaScript floats.
 *  - Responses format amounts with the currency's ISO 4217 minor units ("25.00", JPY "2500").
 *  - Different currencies are never added together.
 */
export type Decimal = Prisma.Decimal;
export const Decimal = Prisma.Decimal;
export const D = (v: DecimalInput) => new Prisma.Decimal(v);
export const ZERO = D(0);

/** Accepted decimal inputs (string/number literal or Decimal). Request amounts are always strings. */
export type DecimalInput = string | number | Prisma.Decimal;

/** Up to 12 integer digits, up to 3 decimals, no sign, no exponent, no leading zeros. */
export const AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/;

export function decimalPlaces(amount: string): number {
  const dot = amount.indexOf('.');
  return dot === -1 ? 0 : amount.length - dot - 1;
}

export function formatAmount(value: DecimalInput | null | undefined, minorUnits: number): string | null {
  if (value === null || value === undefined) return null;
  return D(value).toFixed(minorUnits);
}

/** Adds decimals grouped by currency: { USD: "125.00", EGP: "1000.00" }. */
export function sumByCurrency(rows: { currency: string; amount: DecimalInput }[], minor: (c: string) => number) {
  const acc = new Map<string, Prisma.Decimal>();
  for (const r of rows) acc.set(r.currency, (acc.get(r.currency) ?? ZERO).plus(D(r.amount)));
  return Object.fromEntries([...acc.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([c, v]) => [c, v.toFixed(minor(c))]));
}

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (no I, L, O, U)

/** Non-sequential public reference, e.g. DN-7K3QX9M2PA4T (60 bits of CSPRNG entropy). */
export function generateReference(prefix: 'DN' | 'PA' | 'RF' | 'RD', length = 12): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % 32];
  return `${prefix}-${out}`;
}

export const addMonths = (date: Date, months: number) => {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last)); // Jan 31 + 1 month = Feb 28/29
  return d;
};
