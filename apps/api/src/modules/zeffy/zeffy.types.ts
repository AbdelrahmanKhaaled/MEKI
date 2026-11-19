/**
 * Zeffy public API v1 — the subset MEKI reads, transcribed from the official OpenAPI document served at
 * https://api.zeffy.com/api/docs (OpenAPI 3.1, "Zeffy API" 1.0, read 2026-11-18). Field meanings quoted there:
 *  - payment.amount / eligible_amount / refunds[].amount / items[].amount: "Amount in cents" (integers)
 *  - payment.refund_status: none | partial | full; refunds[].status: pending | succeeded | failed
 *  - payment.status: string (list filter values: succeeded | failed | pending)
 *  - payment.metadata: "Reserved for future key-value pairs" (so NO custom reference can be passed today)
 *  - payment.updated / payment.deleted webhooks carry an id-only reference; fetch GET /api/v1/payments/:id (404 = deleted)
 * Unknown extra fields are ignored on purpose (forward compatible); missing or mistyped REQUIRED fields reject the record.
 */

export interface ZeffyRefund {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created: number;
}

export interface ZeffyItem {
  id: string;
  type: string; // donation | ticket | additional_donation
  amount: number;
  currency: string;
  recurrence_interval: string | null;
  rate_id: string | null;
  rate_title: string | null;
  /** answers only (questions text is kept to locate a reference); attendee contact ids are not kept */
  answers: unknown[];
}

/** Normalised Zeffy payment. Personal data (buyer name/e-mail/address) is deliberately NOT carried. */
export interface ZeffyPayment {
  id: string;
  created: number;
  amount: number;
  eligible_amount: number;
  currency: string;
  status: string;
  type: string;
  refund_status: string;
  refunds: ZeffyRefund[];
  dispute: { status: string; amount: number } | null;
  campaign_id: string | null;
  campaign_category: string | null;
  occurrence_id: string | null;
  recurring: { status: string; interval: string | null; subscription_id: string | null } | null;
  items: ZeffyItem[];
  /** buyer_questions[].answer values (text only used to find a MEKI reference) */
  buyer_answers: unknown[];
}

export class ZeffyResponseError extends Error {
  readonly code = 'ZEFFY_INVALID_RESPONSE';
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (o: Record<string, unknown>, k: string) => {
  if (typeof o[k] !== 'string') throw new ZeffyResponseError(`${k} must be a string`);
  return o[k] as string;
};
const strN = (o: Record<string, unknown>, k: string) => {
  if (o[k] === null || o[k] === undefined) return null;
  if (typeof o[k] !== 'string') throw new ZeffyResponseError(`${k} must be a string or null`);
  return o[k] as string;
};
/** Cents: the API documents integers; anything else (fractions, NaN, huge values) is rejected rather than rounded. */
const cents = (o: Record<string, unknown>, k: string) => {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw new ZeffyResponseError(`${k} must be a non-negative integer number of cents`);
  return v;
};
const num = (o: Record<string, unknown>, k: string) => {
  if (typeof o[k] !== 'number' || !Number.isFinite(o[k] as number)) throw new ZeffyResponseError(`${k} must be a number`);
  return o[k] as number;
};
const arr = (o: Record<string, unknown>, k: string) => {
  if (o[k] === null || o[k] === undefined) return [];
  if (!Array.isArray(o[k])) throw new ZeffyResponseError(`${k} must be an array`);
  return o[k] as unknown[];
};

export function parseZeffyPayment(raw: unknown): ZeffyPayment {
  if (!isObj(raw)) throw new ZeffyResponseError('payment must be an object');
  if (raw.object !== undefined && raw.object !== 'payment') throw new ZeffyResponseError('object must be "payment"');
  const refunds = arr(raw, 'refunds').map((r) => {
    if (!isObj(r)) throw new ZeffyResponseError('refund must be an object');
    return { id: str(r, 'id'), amount: cents(r, 'amount'), currency: str(r, 'currency'), status: str(r, 'status'), created: num(r, 'created') };
  });
  const items = arr(raw, 'items').map((i) => {
    if (!isObj(i)) throw new ZeffyResponseError('item must be an object');
    return {
      id: str(i, 'id'),
      type: str(i, 'type'),
      amount: cents(i, 'amount'),
      currency: str(i, 'currency'),
      recurrence_interval: strN(i, 'recurrence_interval'),
      rate_id: strN(i, 'rate_id'),
      rate_title: strN(i, 'rate_title'),
      answers: arr(i, 'questions').map((q) => (isObj(q) ? q.answer : undefined)),
    };
  });
  const d = raw.dispute;
  if (d !== null && d !== undefined && !isObj(d)) throw new ZeffyResponseError('dispute must be an object or null');
  const rec = raw.recurring;
  if (rec !== null && rec !== undefined && !isObj(rec)) throw new ZeffyResponseError('recurring must be an object or null');
  return {
    id: str(raw, 'id'),
    created: num(raw, 'created'),
    amount: cents(raw, 'amount'),
    eligible_amount: cents(raw, 'eligible_amount'),
    currency: str(raw, 'currency'),
    status: str(raw, 'status'),
    type: str(raw, 'type'),
    refund_status: str(raw, 'refund_status'),
    refunds,
    dispute: isObj(d) ? { status: str(d, 'status'), amount: cents(d, 'amount') } : null,
    campaign_id: strN(raw, 'campaign_id'),
    campaign_category: strN(raw, 'campaign_category'),
    occurrence_id: strN(raw, 'occurrence_id'),
    recurring: isObj(rec) ? { status: str(rec, 'status'), interval: strN(rec, 'interval'), subscription_id: strN(rec, 'subscription_id') } : null,
    items,
    buyer_answers: arr(raw, 'buyer_questions').map((q) => (isObj(q) ? q.answer : undefined)),
  };
}

export function parseZeffyPaymentList(raw: unknown): { data: ZeffyPayment[]; hasMore: boolean; nextCursor: string | null } {
  if (!isObj(raw) || !Array.isArray(raw.data) || typeof raw.has_more !== 'boolean') throw new ZeffyResponseError('payment list must have data[] and has_more');
  const nextCursor = raw.next_cursor === null || raw.next_cursor === undefined ? null : typeof raw.next_cursor === 'string' ? raw.next_cursor : (() => { throw new ZeffyResponseError('next_cursor must be a string or null'); })();
  return { data: raw.data.map(parseZeffyPayment), hasMore: raw.has_more, nextCursor };
}

/** Exact cents → decimal string (no floating point): 75000 → "750.00". */
export function centsToDecimal(c: number): string {
  if (!Number.isSafeInteger(c) || c < 0) throw new ZeffyResponseError('invalid cents value');
  const s = String(c).padStart(3, '0');
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
}

/** Exact decimal string → cents (no floating point): "750.00" / "750" / "750.5" → 75000 / 75000 / 75050. */
export function decimalToCents(d: string): number {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(d.trim());
  if (!m) throw new Error(`not a decimal amount: ${d}`);
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}
