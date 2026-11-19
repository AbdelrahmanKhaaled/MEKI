import { validateZeffyConfig } from '../../config/env.validation';
import { ZeffyApiError, ZeffyClient } from './zeffy.client';
import { classify, decideGala, findReferences, refundedCents, type GalaContext } from './zeffy-correlation';
import { parseSignatureHeader, signPayload, splitSecrets, verifyZeffySignature } from './zeffy-signature';
import { centsToDecimal, decimalToCents, parseZeffyPayment, parseZeffyPaymentList, ZeffyResponseError } from './zeffy.types';

/**
 * Phase 8A unit tests. Fixtures follow the OFFICIAL schema published at https://api.zeffy.com/api/docs (read 2026-11-18);
 * they are documented-shape fixtures, NOT real provider responses (no credentials exist yet).
 */
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export function zeffyPaymentFixture(o: Record<string, unknown> = {}) {
  return {
    id: UUID(1), object: 'payment', created: 1765000000, amount: 150000, eligible_amount: 0, currency: 'usd', status: 'succeeded', type: 'online',
    refund_status: 'none', refunds: [], dispute: null, description: 'Every Light Counts', contact: UUID(9),
    payment_method: { type: 'card' }, buyer: { email: 'buyer@example.org', first_name: 'Amira', last_name: 'Hassan', is_corporate: false, company_name: null, address: null },
    discount: null, campaign_type: 'ticketing', campaign_id: UUID(100), campaign_category: 'event', parent_campaign_id: null, team_id: null,
    buyer_questions: [{ question: 'MEKI booking reference', type: 'text', answer: 'EB-7K3QX9M2PA4T' }],
    items: [
      { id: UUID(11), object: 'item', type: 'ticket', amount: 75000, currency: 'usd', recurrence_interval: null, rate_id: UUID(50), rate_title: 'Individual ticket', parent_rate_id: null, parent_rate_title: null, contact_id: UUID(21), questions: [], tribute: null },
      { id: UUID(12), object: 'item', type: 'ticket', amount: 75000, currency: 'usd', recurrence_interval: null, rate_id: UUID(50), rate_title: 'Individual ticket', parent_rate_id: null, parent_rate_title: null, contact_id: UUID(22), questions: [], tribute: null },
    ],
    occurrence_id: UUID(60), receipt_url: null, recurring: null, fund: null, metadata: {},
    ...o,
  };
}

describe('Zeffy money (cents, exact)', () => {
  it('converts integer cents ↔ decimal strings without floating point', () => {
    expect(centsToDecimal(75000)).toBe('750.00');
    expect(centsToDecimal(5)).toBe('0.05');
    expect(centsToDecimal(0)).toBe('0.00');
    expect(centsToDecimal(Number.MAX_SAFE_INTEGER)).toBe('90071992547409.91');
    expect(decimalToCents('750.00')).toBe(75000);
    expect(decimalToCents('750')).toBe(75000);
    expect(decimalToCents('0.1')).toBe(10);
    expect(() => centsToDecimal(1.5)).toThrow(ZeffyResponseError);
    expect(() => decimalToCents('1e3')).toThrow();
  });
});

describe('Zeffy payment parsing (documented schema)', () => {
  it('keeps the fields MEKI needs and drops buyer personal data', () => {
    const p = parseZeffyPayment({ ...zeffyPaymentFixture(), unexpected_new_field: { x: 1 } });
    expect(p).toMatchObject({ id: UUID(1), amount: 150000, currency: 'usd', status: 'succeeded', refund_status: 'none', campaign_id: UUID(100) });
    expect(JSON.stringify(p)).not.toMatch(/buyer@example\.org|Amira|Hassan/);
    expect(p.items.map((i) => i.type)).toEqual(['ticket', 'ticket']);
  });
  it('rejects malformed provider records instead of guessing', () => {
    for (const bad of [null, [], { ...zeffyPaymentFixture(), amount: 750.5 }, { ...zeffyPaymentFixture(), amount: '75000' }, { ...zeffyPaymentFixture(), id: 7 }, { ...zeffyPaymentFixture(), object: 'contact' }, { ...zeffyPaymentFixture(), refunds: 'x' }, { ...zeffyPaymentFixture(), dispute: 'lost' }]) {
      expect(() => parseZeffyPayment(bad)).toThrow(ZeffyResponseError);
    }
    expect(() => parseZeffyPaymentList({ data: [], has_more: 'no' })).toThrow(ZeffyResponseError);
    expect(parseZeffyPaymentList({ object: 'list', data: [zeffyPaymentFixture()], has_more: true, next_cursor: 'c1' })).toMatchObject({ hasMore: true, nextCursor: 'c1' });
  });
});

describe('Zeffy webhook signature (documented: t=…,v1=hex(HMAC-SHA256(secret, "{t}.{rawBody}")))', () => {
  const secret = 'whsec_test_0123456789abcdef';
  const body = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'payment.completed' }));
  const now = 1_765_000_000_000;
  const t = now / 1000;
  const header = (s = secret, ts = t, b: Buffer | string = body) => `t=${ts},v1=${signPayload(s, ts, b)}`;
  it('accepts a valid signature (constant-time compare)', () => {
    expect(verifyZeffySignature(body, header(), [secret], 300, now)).toEqual({ ok: true });
  });
  it('rejects missing, malformed, mismatched, modified, stale and future signatures', () => {
    expect(verifyZeffySignature(body, undefined, [secret], 300, now)).toEqual({ ok: false, reason: 'missing' });
    expect(verifyZeffySignature(body, 'v1=abc', [secret], 300, now)).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyZeffySignature(body, `t=${t},v1=${'0'.repeat(64)}`, [secret], 300, now)).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyZeffySignature(Buffer.from(body.toString().replace('evt_1', 'evt_2')), header(), [secret], 300, now)).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyZeffySignature(body, header(secret, t - 301), [secret], 300, now)).toEqual({ ok: false, reason: 'stale' });
    expect(verifyZeffySignature(body, header(secret, t + 301), [secret], 300, now)).toEqual({ ok: false, reason: 'stale' });
    expect(verifyZeffySignature(body, header('another_secret_123456'), [secret], 300, now)).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyZeffySignature(body, header(), [], 300, now)).toEqual({ ok: false, reason: 'not_configured' });
  });
  it('verifies the RAW bytes: a re-serialised (re-spaced) body does not verify', () => {
    const raw = Buffer.from('{"id":"evt_1",  "type":"payment.completed"}');
    const h = `t=${t},v1=${signPayload(secret, t, raw)}`;
    expect(verifyZeffySignature(raw, h, [secret], 300, now).ok).toBe(true);
    expect(verifyZeffySignature(Buffer.from(JSON.stringify(JSON.parse(raw.toString()))), h, [secret], 300, now).ok).toBe(false);
  });
  it('supports secret rotation (comma-separated secrets) and several v1 values', () => {
    expect(splitSecrets(' a , b ,')).toEqual(['a', 'b']);
    expect(verifyZeffySignature(body, header('old_secret_0123456789'), ['new_secret_0123456789', 'old_secret_0123456789'], 300, now).ok).toBe(true);
    expect(parseSignatureHeader(`t=1,v1=${'a'.repeat(64)},v1=${'b'.repeat(64)}`)?.v1).toHaveLength(2);
  });
});

describe('correlation rules (booking ↔ Zeffy payment)', () => {
  const booking = { id: 'bk1', eventId: 'ev1', bookingStatus: 'PENDING', paymentStatus: 'UNPAID', totalCents: 150000, currency: 'USD', guestCount: 2 };
  const ctx = (o: Partial<GalaContext> = {}): GalaContext => ({ galaCampaignId: UUID(100), galaEventId: 'ev1', booking, bookingClaimedByOther: false, ...o });
  const pay = (o: Record<string, unknown> = {}) => parseZeffyPayment(zeffyPaymentFixture(o));
  const decide = (o: Record<string, unknown> = {}, c: Partial<GalaContext> = {}) => {
    const p = pay(o);
    return decideGala(p, findReferences(p), ctx(c));
  };
  it('MATCHED only when every rule holds', () => {
    expect(decide()).toEqual({ status: 'MATCHED', reason: 'all correlation rules passed', bookingId: 'bk1' });
  });
  it('finds references in buyer and attendee answers (case-insensitive, arrays) and nothing else', () => {
    const p = pay({ buyer_questions: [{ question: 'q', type: 'multi_select', answer: ['x', 'ref eb-7k3qx9m2pa4t'] }], items: [] });
    expect(findReferences(p)).toEqual(['EB-7K3QX9M2PA4T']);
    expect(findReferences(pay({ buyer_questions: [] }))).toEqual([]);
    expect(findReferences(pay({ buyer_questions: [{ question: 'q', type: 'text', answer: 'EB-7K3QX9M2PA4' }] }))).toEqual([]); // 11 chars → not a reference
  });
  it('never matches without a reliable reference (no e-mail / amount guessing)', () => {
    expect(decide({ buyer_questions: [] }).status).toBe('UNMATCHED');
    expect(decide({ buyer_questions: [{ question: 'a', type: 'text', answer: 'EB-7K3QX9M2PA4T and EB-AAAAAAAAAAAA' }] })).toMatchObject({ status: 'NEEDS_REVIEW', reason: expect.stringContaining('ambiguous') });
  });
  it.each([
    [{ amount: 140000 }, {}, 'amount'],
    [{ currency: 'cad' }, {}, 'currency'],
    [{ status: 'pending' }, {}, 'status'],
    [{ status: 'failed' }, {}, 'status'],
    [{ type: 'manual' }, {}, 'type'],
    [{ refund_status: 'partial', refunds: [{ id: 'r', amount: 100, currency: 'usd', status: 'succeeded', created: 1 }] }, {}, 'refund'],
    [{ dispute: { id: 'd', object: 'dispute', amount: 150000, currency: 'usd', status: 'needs_response', reason: 'fraudulent', created: 1 } }, {}, 'disputed'],
    [{}, { booking: null }, 'not found'],
    [{}, { bookingClaimedByOther: true }, 'already matched'],
    [{}, { booking: { ...booking, bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' } }, 'CONFIRMED'],
    [{}, { booking: { ...booking, guestCount: 3, totalCents: 150000 } }, 'guests'],
    [{}, { booking: { ...booking, eventId: 'other' } }, 'another event'],
  ])('NEEDS_REVIEW on %j / %j (%s)', (o, c, why) => {
    const d = decide(o, c);
    expect(d.status).toBe('NEEDS_REVIEW');
    expect(d.reason).toContain(why);
  });
  it('other campaigns are ignored; donation and mixed carts are never treated as tickets', () => {
    expect(decide({ campaign_id: UUID(999) }).status).toBe('IGNORED');
    expect(decide({}, { galaCampaignId: undefined }).status).toBe('IGNORED');
    expect(classify(pay({ items: [{ ...zeffyPaymentFixture().items[0], type: 'donation' }] }))).toBe('CHARITABLE_DONATION');
    expect(classify(pay({ items: [zeffyPaymentFixture().items[0], { ...zeffyPaymentFixture().items[0], type: 'additional_donation' }] }))).toBeNull();
    expect(decide({ items: [zeffyPaymentFixture().items[0], { ...zeffyPaymentFixture().items[1], type: 'additional_donation' }] }).status).toBe('NEEDS_REVIEW');
  });
  it('refunded amount counts succeeded refunds only', () => {
    expect(refundedCents(pay({ refunds: [{ id: 'a', amount: 100, currency: 'usd', status: 'succeeded', created: 1 }, { id: 'b', amount: 50, currency: 'usd', status: 'pending', created: 1 }, { id: 'c', amount: 25, currency: 'usd', status: 'failed', created: 1 }] }))).toBe(100);
  });
});

describe('Zeffy REST client (fake transport, no live calls)', () => {
  type Reply = { status: number; body?: unknown; headers?: Record<string, string>; throws?: Error };
  const fakeFetch = (replies: Reply[], seen: { url: string; auth: string | null }[] = []) =>
    (async (url: string, init?: RequestInit) => {
      seen.push({ url: String(url), auth: new Headers(init?.headers).get('authorization') });
      const r = replies.shift();
      if (!r) throw new Error('no more replies');
      if (r.throws) throw r.throws;
      return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: r.headers });
    }) as unknown as typeof fetch;
  const client = (replies: Reply[], seen?: { url: string; auth: string | null }[], waits: number[] = []) =>
    new ZeffyClient({ baseUrl: 'https://api.zeffy.com', apiKey: 'zk_test_key_0123456789', fetchImpl: fakeFetch(replies, seen), sleep: async (ms) => void waits.push(ms), maxRetries: 2 });

  it('fetches one payment with Bearer auth; 404 → null', async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const c = client([{ status: 200, body: zeffyPaymentFixture() }, { status: 404, body: { error: { type: 'invalid_request_error', code: 'resource_not_found', message: 'No payment found', status: 404 } } }], seen);
    expect((await c.getPayment(UUID(1)))?.amount).toBe(150000);
    expect(await c.getPayment(UUID(2))).toBeNull();
    expect(seen[0]).toEqual({ url: `https://api.zeffy.com/api/v1/payments/${UUID(1)}`, auth: 'Bearer zk_test_key_0123456789' });
    await expect(c.getPayment('../users')).rejects.toMatchObject({ code: 'invalid_parameters' }); // ids are validated before any request
  });
  it('paginates with starting_after = next_cursor and limit=100', async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const c = client([
      { status: 200, body: { object: 'list', data: [zeffyPaymentFixture({ id: UUID(1) })], has_more: true, next_cursor: 'cur_2' } },
      { status: 200, body: { object: 'list', data: [zeffyPaymentFixture({ id: UUID(2) })], has_more: false, next_cursor: null } },
    ], seen);
    const ids: string[] = [];
    for await (const p of c.iteratePayments({ createdGte: 1700000000 })) ids.push(p.id);
    expect(ids).toEqual([UUID(1), UUID(2)]);
    expect(seen[0].url).toContain('limit=100');
    expect(seen[0].url).toContain('created%5Bgte%5D=1700000000');
    expect(seen[1].url).toContain('starting_after=cur_2');
  });
  it('maps 401 without retry; honours Retry-After on 429; retries 5xx with backoff; gives up cleanly', async () => {
    await expect(client([{ status: 401, body: { error: { type: 'authentication_error', code: 'invalid_api_key', message: 'Invalid API key', status: 401 } } }]).ping()).rejects.toMatchObject({ status: 401, code: 'invalid_api_key', retryable: false });
    const waits: number[] = [];
    const ok = client([{ status: 429, headers: { 'retry-after': '1' }, body: { error: { code: 'rate_limit_exceeded' } } }, { status: 200, body: { object: 'list', data: [], has_more: false, next_cursor: null } }], undefined, waits);
    await ok.ping();
    expect(waits).toEqual([1000]);
    await expect(client([{ status: 500, body: {} }, { status: 502 }, { status: 503 }]).ping()).rejects.toMatchObject({ status: 503, retryable: true });
  });
  it('timeouts and network failures become retryable errors; malformed responses are rejected', async () => {
    const t = Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    await expect(client([{ status: 0, throws: t }, { status: 0, throws: t }, { status: 0, throws: t }]).ping()).rejects.toMatchObject({ code: 'timeout', status: 0, retryable: true });
    await expect(client([{ status: 200, body: { data: 'nope' } }]).ping()).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(client([{ status: 200, body: { ...zeffyPaymentFixture(), amount: 'x' } }]).getPayment(UUID(1))).rejects.toBeInstanceOf(ZeffyApiError);
  });
});

describe('Zeffy configuration safety', () => {
  const base = { NODE_ENV: 'production' as const, ZEFFY_API_BASE_URL: 'https://api.zeffy.com', ZEFFY_RECONCILIATION_ENABLED: false, ZEFFY_GALA_AUTO_CONFIRM: false };
  it('starts with nothing configured (integration simply disabled)', () => {
    expect(() => validateZeffyConfig(base)).not.toThrow();
  });
  it('fails closed on unsafe values', () => {
    expect(() => validateZeffyConfig({ ...base, ZEFFY_API_BASE_URL: 'https://evil.example' })).toThrow(/api\.zeffy\.com/);
    expect(() => validateZeffyConfig({ ...base, NODE_ENV: 'development', ZEFFY_API_BASE_URL: 'http://api.zeffy.com' })).toThrow(/https/);
    expect(() => validateZeffyConfig({ ...base, ZEFFY_GALA_AUTO_CONFIRM: true, ZEFFY_GALA_TICKET_CAMPAIGN_ID: UUID(1) })).toThrow(/not allowed/);
    expect(() => validateZeffyConfig({ ...base, ZEFFY_RECONCILIATION_ENABLED: true })).toThrow(/ZEFFY_API_KEY/);
    expect(() => validateZeffyConfig({ ...base, ZEFFY_WEBHOOK_SECRET: 'short' })).toThrow(/16/);
    expect(() => validateZeffyConfig({ ...base, ZEFFY_DONATION_FORM_URL: 'https://pay.evil.example/form' })).toThrow(/zeffy/);
    expect(() => validateZeffyConfig({ ...base, ZEFFY_DONATION_FORM_URL: 'http://www.zeffy.com/donation-form/x' })).toThrow(/https/);
    expect(() => validateZeffyConfig({ ...base, ZEFFY_DONATION_FORM_URL: 'https://www.zeffy.com/en-US/donation-form/x' })).not.toThrow();
    expect(() => validateZeffyConfig({ ...base, NODE_ENV: 'development', ZEFFY_GALA_AUTO_CONFIRM: true })).toThrow(/CAMPAIGN_ID/);
  });
});
