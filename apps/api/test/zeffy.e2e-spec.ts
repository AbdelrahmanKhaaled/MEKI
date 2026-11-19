import { ZEFFY_TEST_CAMPAIGN, ZEFFY_TEST_EVENT_CODE, ZEFFY_TEST_SECRET } from './zeffy-env';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../src/config/app-config.service';
import { GalaJobsService } from '../src/modules/gala/gala-jobs.service';
import { ZeffyClient } from '../src/modules/zeffy/zeffy.client';
import { signPayload } from '../src/modules/zeffy/zeffy-signature';
import { ZeffyService } from '../src/modules/zeffy/zeffy.service';
import { API, createTestApp, loginAs, uid, type Session, type TestContext } from './helpers';

jest.setTimeout(120_000);

/**
 * Phase 8A — Zeffy webhook + reconciliation against the real app and the *_test database.
 * The Zeffy REST API is replaced by an in-memory fake that serves DOCUMENTED-SHAPE fixtures (https://api.zeffy.com/api/docs):
 * this verifies MEKI's handling, not Zeffy's real behaviour (no credentials yet; no live request is ever made).
 */
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const uuid = () => randomUUID();

describe('Phase 8A — Zeffy integration (fixtures, test DB)', () => {
  let ctx: TestContext;
  let admin: Session;
  let finance: Session;
  let content: Session;
  let zeffy: ZeffyService;
  const store = new Map<string, Record<string, unknown>>(); // fake Zeffy organization: payment id → payment JSON
  let eventSlug = '';
  let eventId = '';

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await loginAs(ctx, ['ADMINISTRATOR']);
    finance = await loginAs(ctx, ['FINANCE_MANAGER']);
    content = await loginAs(ctx, ['CONTENT_MANAGER']);
    zeffy = ctx.app.get(ZeffyService);
    const fakeFetch = (async (url: string) => {
      const u = new URL(String(url));
      const m = /^\/api\/v1\/payments\/(.+)$/.exec(u.pathname);
      if (m) {
        const p = store.get(m[1]);
        return new Response(JSON.stringify(p ?? { error: { type: 'invalid_request_error', code: 'resource_not_found', message: 'No payment found', status: 404 } }), { status: p ? 200 : 404 });
      }
      if (u.pathname === '/api/v1/payments') {
        const gte = Number(u.searchParams.get('created[gte]') ?? 0);
        const data = [...store.values()].filter((p) => (p.created as number) >= gte);
        return new Response(JSON.stringify({ object: 'list', data, has_more: false, next_cursor: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { code: 'resource_not_found' } }), { status: 404 });
    }) as unknown as typeof fetch;
    zeffy.useClient(new ZeffyClient({ baseUrl: 'https://api.zeffy.com', apiKey: 'zk_e2e_fake_key_never_used_live', fetchImpl: fakeFetch, sleep: async () => undefined }));

    // isolated ticketed event (never Gala Night), sales open only so the public booking API accepts bookings
    let ev = await ctx.prisma.event.findUnique({ where: { code: ZEFFY_TEST_EVENT_CODE } });
    if (!ev) {
      const page = await ctx.prisma.page.create({ data: { slug: `event-zeffy-e2e-${uid()}`, titleEn: 'Zeffy E2E', status: 'PUBLISHED' } });
      ev = await ctx.prisma.event.create({ data: { code: ZEFFY_TEST_EVENT_CODE, slug: `zeffy-e2e-${uid()}`, titleEn: 'Zeffy E2E Gala', status: 'PUBLISHED', approvedAt: new Date(), pageId: page.id } });
      await ctx.prisma.eventTicketConfig.create({ data: { eventId: ev.id, ticketPrice: '750.00', currency: 'USD', salesEnabled: true, displayNameEn: 'Every Light Counts', eventDateLabelEn: 'Saturday, December 12, 2026', venueLabelEn: '583 Park Avenue, New York, USA' } });
    }
    eventSlug = ev.slug;
    eventId = ev.id;
  });
  afterAll(async () => {
    zeffy.useClient(null);
    await ctx.app.close();
  });

  async function book(names: string[]) {
    const body = { purchaser: { fullName: 'Amira Hassan', email: `buyer-${uid()}@example.org`, phone: '+1 212 555 0199' }, guests: names.map((n) => ({ fullName: n, email: `g-${uid()}@example.org`, phone: '+1 212 555 0100', dietaryRequirements: 'None' })), privacyConsent: true };
    const r = (await ctx.http().post(`${API}/public/events/${eventSlug}/bookings`).set('X-Forwarded-For', ip()).set('Idempotency-Key', `k-${uuid()}`).send(body).expect(201)).body.data as { reference: string; accessToken: string };
    return r;
  }
  const dbBooking = (ref: string) => ctx.prisma.eventBooking.findUniqueOrThrow({ where: { publicReference: ref }, include: { tickets: true, transactions: true, attempts: true } });
  const record = (id: string) => ctx.prisma.providerPayment.findUnique({ where: { provider_providerPaymentId: { provider: 'zeffy', providerPaymentId: id } } });

  /** Documented Payment shape (subset values are realistic; personal data is fake). */
  function payment(o: { ref?: string | null; amount?: number; tickets?: number; status?: string; currency?: string; campaign?: string; refunds?: unknown[]; refund_status?: string; dispute?: unknown } = {}) {
    const tickets = o.tickets ?? 2;
    const amount = o.amount ?? tickets * 75000;
    const id = uuid();
    const p = {
      id, object: 'payment', created: Math.floor(Date.now() / 1000), amount, eligible_amount: 0, currency: o.currency ?? 'usd', status: o.status ?? 'succeeded', type: 'online',
      refund_status: o.refund_status ?? 'none', refunds: o.refunds ?? [], dispute: o.dispute ?? null, description: 'Every Light Counts', contact: uuid(),
      payment_method: { type: 'card' }, buyer: { email: 'buyer@example.org', first_name: 'Amira', last_name: 'Hassan', is_corporate: false, company_name: null, address: null },
      discount: null, campaign_type: 'ticketing', campaign_id: o.campaign ?? ZEFFY_TEST_CAMPAIGN, campaign_category: 'event', parent_campaign_id: null, team_id: null,
      buyer_questions: o.ref === null ? [] : [{ question: 'MEKI booking reference', type: 'text', answer: o.ref ?? '' }],
      items: Array.from({ length: tickets }, () => ({ id: uuid(), object: 'item', type: 'ticket', amount: amount / tickets, currency: o.currency ?? 'usd', recurrence_interval: null, rate_id: uuid(), rate_title: 'Individual ticket', parent_rate_id: null, parent_rate_title: null, contact_id: uuid(), questions: [], tribute: null })),
      occurrence_id: uuid(), receipt_url: null, recurring: null, fund: null, metadata: {},
    };
    store.set(id, p);
    return p;
  }
  function deliver(type: string, data: unknown, opts: { eventId?: string; secret?: string; ts?: number; tamper?: boolean; header?: string | null } = {}) {
    const body = JSON.stringify({ id: opts.eventId ?? `evt_${uuid()}`, type, version: 1, dispatchedAt: new Date().toISOString(), data });
    const ts = opts.ts ?? Math.floor(Date.now() / 1000);
    const sig = `t=${ts},v1=${signPayload(opts.secret ?? ZEFFY_TEST_SECRET, ts, body)}`;
    const req = ctx.http().post(`${API}/integrations/zeffy/webhook`).set('Content-Type', 'application/json');
    if (opts.header !== null) req.set('Zeffy-Signature', opts.header ?? sig);
    return req.send(opts.tamper ? body.replace('"version":1', '"version":2') : body);
  }

  it('rejects unauthenticated deliveries before touching any state (missing, malformed, wrong secret, stale, tampered)', async () => {
    const p = payment({ ref: 'EB-AAAAAAAAAAAA' });
    const id = `evt_${uuid()}`;
    await deliver('payment.completed', p, { eventId: id, header: null }).expect(400);
    await deliver('payment.completed', p, { eventId: id, header: 't=1,v1=zz' }).expect(400);
    await deliver('payment.completed', p, { eventId: id, secret: 'not_the_right_secret_000000' }).expect(400);
    await deliver('payment.completed', p, { eventId: id, ts: Math.floor(Date.now() / 1000) - 600 }).expect(400);
    await deliver('payment.completed', p, { eventId: id, tamper: true }).expect(400);
    expect(await ctx.prisma.paymentWebhookEvent.count({ where: { provider: 'zeffy', providerEventId: id } })).toBe(0);
    expect(await record(p.id)).toBeNull();
  });

  it('verified payment with a unique reference confirms the booking ONCE through the established pipeline (one ticket per guest)', async () => {
    const b = await book(['Layla Mansour', 'محمد عبد الرحمن']);
    // the return URL / status poll alone never confirms
    expect((await ctx.http().get(`${API}/public/bookings/${b.reference}/status`).set('X-Booking-Token', b.accessToken).expect(200)).body.data.confirmed).toBe(false);
    const p = payment({ ref: `Booking ${b.reference.toLowerCase()}` });
    const evId = `evt_${uuid()}`;
    // concurrent duplicate deliveries of the same event (Zeffy retries keep the event id) + a second event for the same payment
    const results = await Promise.all([deliver('payment.completed', p, { eventId: evId }), deliver('payment.completed', p, { eventId: evId }), deliver('payment.completed', p, { eventId: evId })]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    await deliver('payment.created', p).expect(200);
    await ctx.app.get(GalaJobsService).runDue({ limit: 50 });
    const row = await dbBooking(b.reference);
    expect(row).toMatchObject({ bookingStatus: 'CONFIRMED', paymentStatus: 'PAID', paymentProvider: 'zeffy', providerReference: p.id });
    expect(row.tickets.map((t) => t.status)).toEqual(['ISSUED', 'ISSUED']);
    expect(row.transactions.filter((t) => t.type === 'CAPTURE')).toHaveLength(1);
    expect(row.transactions[0]).toMatchObject({ classification: 'EVENT_TICKET_PAYMENT', provider: 'zeffy', isTest: false });
    expect(row.attempts.filter((a) => a.provider === 'zeffy')).toHaveLength(1);
    expect(await record(p.id)).toMatchObject({ matchStatus: 'CONFIRMED', matchedEntityType: 'EventBooking', matchedEntityId: row.id, correlationRef: b.reference, amount: expect.anything() });
    expect((await ctx.http().get(`${API}/public/bookings/${b.reference}/status`).set('X-Booking-Token', b.accessToken).expect(200)).body.data.confirmed).toBe(true);
    // the stored event carries no buyer personal data
    const stored = await ctx.prisma.paymentWebhookEvent.findMany({ where: { provider: 'zeffy', providerEventId: evId } });
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored[0].payload)).not.toMatch(/buyer@example\.org|Amira|Hassan/);
    // a second payment that names the same (now confirmed) booking is never applied
    const p2 = payment({ ref: b.reference });
    await deliver('payment.completed', p2).expect(200);
    expect(await record(p2.id)).toMatchObject({ matchStatus: 'NEEDS_REVIEW' });
    expect((await dbBooking(b.reference)).transactions.filter((t) => t.type === 'CAPTURE')).toHaveLength(1);
  });

  it.each([
    ['no reference (never matched by e-mail or amount)', { ref: null }, 'UNMATCHED'],
    ['wrong amount', { amount: 140000 }, 'NEEDS_REVIEW'],
    ['wrong currency', { currency: 'cad' }, 'NEEDS_REVIEW'],
    ['pending payment', { status: 'pending' }, 'NEEDS_REVIEW'],
    ['failed payment', { status: 'failed' }, 'NEEDS_REVIEW'],
    ['wrong campaign', { campaign: '00000000-0000-4000-8000-00000000dead' }, 'IGNORED'],
  ])('%s → %s, booking stays pending, no ticket issued', async (_label, o, expected) => {
    const b = await book(['Guest One', 'Guest Two']);
    const p = payment({ ref: b.reference, ...(o as object) });
    if ((o as { ref?: null }).ref === null) p.buyer_questions = [];
    store.set(p.id, p);
    await deliver('payment.completed', p).expect(200);
    expect((await record(p.id))?.matchStatus).toBe(expected);
    const row = await dbBooking(b.reference);
    expect(row).toMatchObject({ bookingStatus: 'PENDING' });
    expect(row.tickets.every((t) => t.status === 'PENDING' && t.qrTokenHash === null)).toBe(true);
  });

  it('ambiguous references are never applied', async () => {
    const a = await book(['A One', 'A Two']);
    const b = await book(['B One', 'B Two']);
    const p = payment({ ref: `${a.reference} / ${b.reference}` });
    await deliver('payment.completed', p).expect(200);
    expect(await record(p.id)).toMatchObject({ matchStatus: 'NEEDS_REVIEW', matchReason: expect.stringContaining('ambiguous') });
    expect((await dbBooking(a.reference)).bookingStatus).toBe('PENDING');
  });

  it('id-only payment.updated reads the authoritative state: pending → succeeded confirms; out-of-order snapshots never regress', async () => {
    const b = await book(['Hana Adel']);
    const p = payment({ ref: b.reference, tickets: 1, status: 'pending' });
    await deliver('payment.created', p).expect(200);
    expect((await record(p.id))?.matchStatus).toBe('NEEDS_REVIEW');
    p.status = 'succeeded';
    store.set(p.id, p);
    await deliver('payment.updated', { id: p.id, object: 'payment' }).expect(200);
    expect((await dbBooking(b.reference)).bookingStatus).toBe('CONFIRMED');
    // a late, older snapshot (still pending) arriving afterwards does not overwrite the newer state
    const old = { ...p, status: 'pending' };
    const late = JSON.stringify({ id: `evt_${uuid()}`, type: 'payment.created', version: 1, dispatchedAt: new Date(Date.now() - 3_600_000).toISOString(), data: old });
    const ts = Math.floor(Date.now() / 1000);
    await ctx.http().post(`${API}/integrations/zeffy/webhook`).set('Content-Type', 'application/json').set('Zeffy-Signature', `t=${ts},v1=${signPayload(ZEFFY_TEST_SECRET, ts, late)}`).send(late).expect(200);
    expect(await record(p.id)).toMatchObject({ status: 'succeeded', matchStatus: 'CONFIRMED' });
  });

  it('refunds: a full refund is applied through the established refund pipeline; a partial refund only flags review', async () => {
    const full = await book(['Refund Full']);
    const pf = payment({ ref: full.reference, tickets: 1 });
    await deliver('payment.completed', pf).expect(200);
    expect((await dbBooking(full.reference)).bookingStatus).toBe('CONFIRMED');
    store.set(pf.id, { ...pf, refund_status: 'full', refunds: [{ id: `re_${uid()}`, object: 'refund', amount: 75000, currency: 'usd', status: 'succeeded', created: Math.floor(Date.now() / 1000) }] });
    await deliver('payment.updated', { id: pf.id, object: 'payment' }).expect(200);
    const refunded = await dbBooking(full.reference);
    expect(refunded).toMatchObject({ bookingStatus: 'REFUNDED', paymentStatus: 'REFUNDED' });
    expect(refunded.tickets.every((t) => t.status === 'REFUNDED')).toBe(true);
    expect(refunded.transactions.map((t) => t.type).sort()).toEqual(['CAPTURE', 'REFUND']);

    const part = await book(['Refund Part', 'Refund Part Two']);
    const pp = payment({ ref: part.reference });
    await deliver('payment.completed', pp).expect(200);
    store.set(pp.id, { ...pp, refund_status: 'partial', refunds: [{ id: `re_${uid()}`, object: 'refund', amount: 75000, currency: 'usd', status: 'succeeded', created: Math.floor(Date.now() / 1000) }] });
    await deliver('payment.updated', { id: pp.id, object: 'payment' }).expect(200);
    expect(await record(pp.id)).toMatchObject({ matchStatus: 'NEEDS_REVIEW', matchReason: expect.stringContaining('partial refund') });
    expect((await dbBooking(part.reference)).bookingStatus).toBe('CONFIRMED'); // never reversed by inference
  });

  it('payment.deleted flags review but never reverses accounting; unknown event types change nothing', async () => {
    const b = await book(['Deleted Case']);
    const p = payment({ ref: b.reference, tickets: 1 });
    await deliver('payment.completed', p).expect(200);
    store.delete(p.id);
    await deliver('payment.deleted', { id: p.id, object: 'payment' }).expect(200);
    expect(await record(p.id)).toMatchObject({ matchStatus: 'NEEDS_REVIEW', deletedAtProvider: expect.any(Date) });
    expect((await dbBooking(b.reference)).bookingStatus).toBe('CONFIRMED');
    const evId = `evt_${uuid()}`;
    await deliver('contact.created', { id: uuid(), object: 'contact' }, { eventId: evId }).expect(200);
    await deliver('something.new', { id: 'x' }).expect(200);
    expect((await ctx.prisma.paymentWebhookEvent.findFirstOrThrow({ where: { provider: 'zeffy', providerEventId: evId } })).status).toBe('IGNORED');
  });

  it('with automatic confirmation disabled (the default), a fully matched payment is only MATCHED — no booking change', async () => {
    const config = ctx.app.get(AppConfigService);
    const real = config.get.bind(config);
    const spy = jest.spyOn(config, 'get').mockImplementation(((k: string) => (k === 'ZEFFY_GALA_AUTO_CONFIRM' ? false : real(k as never))) as typeof config.get);
    try {
      const b = await book(['Manual Gate']);
      const p = payment({ ref: b.reference, tickets: 1 });
      await deliver('payment.completed', p).expect(200);
      expect(await record(p.id)).toMatchObject({ matchStatus: 'MATCHED', matchReason: expect.stringContaining('disabled') });
      expect((await dbBooking(b.reference)).bookingStatus).toBe('PENDING');
    } finally {
      spy.mockRestore();
    }
  });

  it('reconciliation recovers a missed webhook, is idempotent, audited, and permission-controlled', async () => {
    const b = await book(['Missed Webhook', 'Second Guest']);
    const p = payment({ ref: b.reference });
    await finance.post('/admin/integrations/zeffy/reconcile', { days: 2 }).expect(403); // payments.manage required
    const first = (await admin.post('/admin/integrations/zeffy/reconcile', { days: 2 }).expect(200)).body.data;
    expect(first.ok).toBe(true);
    expect((await dbBooking(b.reference)).bookingStatus).toBe('CONFIRMED');
    const again = (await admin.post('/admin/integrations/zeffy/reconcile', { days: 2 }).expect(200)).body.data;
    expect(again.failed).toBe(0);
    const row = await dbBooking(b.reference);
    expect(row.transactions.filter((t) => t.type === 'CAPTURE')).toHaveLength(1);
    expect(row.tickets.filter((t) => t.status === 'ISSUED')).toHaveLength(2);
    expect(await ctx.prisma.paymentWebhookEvent.count({ where: { provider: 'zeffy', providerEventId: `api-sync:${p.id}` } })).toBe(1);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'zeffy.reconcile.run' } })).toBeGreaterThanOrEqual(2);
  });

  it('admin status is truthful and never exposes secrets; list and recheck are permission-controlled', async () => {
    const status = (await finance.get('/admin/integrations/zeffy/status').expect(200)).body.data;
    expect(status).toMatchObject({ provider: 'zeffy', configured: { apiKey: true, webhookSecret: true, galaTicketCampaign: true }, hostedCheckout: { available: false }, api: { state: 'ok' } });
    expect(status.webhook.lastVerifiedAt).not.toBeNull();
    const text = JSON.stringify(status);
    for (const secret of [ZEFFY_TEST_SECRET, 'zk_e2e_fake_key_never_used_live', ZEFFY_TEST_CAMPAIGN]) expect(text).not.toContain(secret);
    await content.get('/admin/integrations/zeffy/status').expect(403);
    const list = (await finance.get('/admin/integrations/zeffy/payments?matchStatus=CONFIRMED&pageSize=100').expect(200)).body;
    expect(list.data.length).toBeGreaterThan(0);
    expect(JSON.stringify(list)).not.toMatch(/buyer@example\.org|Amira/);
    await finance.post(`/admin/integrations/zeffy/payments/${list.data[0].id}/recheck`, {}).expect(403);
    const re = (await admin.post(`/admin/integrations/zeffy/payments/${list.data[0].id}/recheck`, {}).expect(200)).body.data;
    expect(re.id).toBe(list.data[0].id);
    // no hosted checkout exists: the public booking API still reports checkout unavailable for the provider
    const info = (await ctx.http().get(`${API}/public/events/${eventSlug}/ticketing`).expect(200)).body.data;
    expect(info.checkoutAvailable).toBe(false);
    expect(eventId).toBeTruthy();
  });
});
