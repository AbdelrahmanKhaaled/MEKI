import type { ZeffyPayment } from './zeffy.types';

/**
 * Correlation rules (pure, unit-tested). A Zeffy payment is applied to a MEKI booking ONLY when every rule below holds; any doubt
 * leaves it for review. Matching by e-mail, name or amount alone is never attempted.
 *
 * Where can a MEKI reference come from? Zeffy documents `metadata` as "Reserved for future key-value pairs", so the only
 * provider-returned place is a custom question answered on SDI's form (buyer_questions / per-ticket questions). A typed answer is
 * buyer-controlled, which is why it is treated as a CANDIDATE that must also satisfy campaign, amount, currency, status, single
 * ownership and booking-state rules — and why automatic confirmation stays disabled until SDI confirms the mechanism (docs/32).
 */

const REF = /\b(EB|DN)-[0-9A-HJKMNP-TV-Z]{12}\b/g;

/** Every distinct MEKI reference found in the buyer's and attendees' answers (upper-cased). */
export function findReferences(p: Pick<ZeffyPayment, 'buyer_answers' | 'items'>): string[] {
  const texts: string[] = [];
  const collect = (a: unknown) => {
    if (typeof a === 'string') texts.push(a);
    else if (Array.isArray(a)) a.forEach(collect);
  };
  p.buyer_answers.forEach(collect);
  p.items.forEach((i) => i.answers.forEach(collect));
  const refs = new Set<string>();
  for (const t of texts) for (const m of t.toUpperCase().matchAll(REF)) refs.add(m[0]);
  return [...refs];
}

export type Classification = 'EVENT_TICKET_PAYMENT' | 'CHARITABLE_DONATION' | null;

/** Ticket lines → ticket revenue; donation lines only → donation; mixed or empty → null (needs review, never guessed). */
export function classify(p: Pick<ZeffyPayment, 'items'>): Classification {
  const types = new Set(p.items.map((i) => i.type));
  if (types.size === 0) return null;
  if ([...types].every((t) => t === 'ticket')) return 'EVENT_TICKET_PAYMENT';
  if ([...types].every((t) => t === 'donation' || t === 'additional_donation')) return 'CHARITABLE_DONATION';
  return null;
}

export interface BookingFacts {
  id: string;
  eventId: string;
  bookingStatus: string;
  paymentStatus: string;
  totalCents: number;
  currency: string;
  guestCount: number;
}

export interface GalaContext {
  galaCampaignId: string | undefined;
  galaEventId: string | null;
  /** booking whose publicReference equals the single reference found (null if none exists) */
  booking: BookingFacts | null;
  /** another provider payment already matched/confirmed to that booking */
  bookingClaimedByOther: boolean;
}

export type Decision =
  | { status: 'IGNORED'; reason: string }
  | { status: 'UNMATCHED'; reason: string }
  | { status: 'NEEDS_REVIEW'; reason: string }
  | { status: 'MATCHED'; reason: string; bookingId: string };

/**
 * Decision for a payment on the Gala ticket campaign. MATCHED means "safe to apply"; it is applied only when automatic confirmation
 * is enabled, and the established booking pipeline re-checks amount and state inside its own transaction.
 */
export function decideGala(p: ZeffyPayment & { deleted?: boolean }, refs: string[], ctx: GalaContext): Decision {
  if (!ctx.galaCampaignId || p.campaign_id !== ctx.galaCampaignId) return { status: 'IGNORED', reason: 'not the configured Gala ticket campaign' };
  const review = (reason: string): Decision => ({ status: 'NEEDS_REVIEW', reason });
  if (p.deleted) return review('payment deleted at the provider');
  const bookingRefs = refs.filter((r) => r.startsWith('EB-'));
  if (bookingRefs.length === 0) return { status: 'UNMATCHED', reason: 'no MEKI booking reference in the provider record' };
  if (bookingRefs.length > 1) return review(`ambiguous: ${bookingRefs.length} booking references`);
  if (p.status !== 'succeeded') return review(`provider status is ${p.status}, not succeeded`);
  if (p.currency.toLowerCase() !== 'usd') return review(`currency ${p.currency} is not USD`);
  if (p.type !== 'online') return review(`payment type ${p.type} (only online payments are applied automatically)`);
  if (p.refund_status !== 'none' || p.refunds.length) return review(`refund status ${p.refund_status}`);
  if (p.dispute) return review(`disputed (${p.dispute.status})`);
  if (classify(p) !== 'EVENT_TICKET_PAYMENT') return review('items are not ticket lines only');
  const b = ctx.booking;
  if (!b) return review(`booking ${bookingRefs[0]} not found`);
  if (ctx.galaEventId && b.eventId !== ctx.galaEventId) return review('booking belongs to another event');
  if (ctx.bookingClaimedByOther) return review('booking already matched to another provider payment');
  if (b.currency !== 'USD') return review('booking currency is not USD');
  if (p.amount !== b.totalCents) return review(`amount ${p.amount} cents ≠ booking total ${b.totalCents} cents`);
  const ticketCents = p.items.reduce((a, i) => a + i.amount, 0);
  if (ticketCents !== b.totalCents) return review('ticket lines do not add up to the booking total');
  if (p.items.length !== b.guestCount) return review(`${p.items.length} ticket lines ≠ ${b.guestCount} guests`);
  if (b.bookingStatus !== 'PENDING' || !['UNPAID', 'PENDING', 'FAILED'].includes(b.paymentStatus)) {
    return review(`booking is ${b.bookingStatus}/${b.paymentStatus}`);
  }
  return { status: 'MATCHED', reason: 'all correlation rules passed', bookingId: b.id };
}

/** Sum of succeeded refunds in cents. */
export const refundedCents = (p: Pick<ZeffyPayment, 'refunds'>) => p.refunds.filter((r) => r.status === 'succeeded').reduce((a, r) => a + r.amount, 0);
