import { randomUUID } from 'node:crypto';
import { MockPaymentProvider } from '../src/modules/donations/payments/mock-payment.provider';
import { GalaEmailComposer } from '../src/modules/gala/gala-email.composer';
import { TicketPdfService } from '../src/modules/gala/ticket-pdf.service';
import { API, createTestApp, loginAs, uid, type Session, type TestContext } from './helpers';

jest.setTimeout(60_000); // ticket flows render PDFs and run several verified-payment round trips

const SECRET = () => process.env.MOCK_PAYMENT_WEBHOOK_SECRET!;
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

describe('Phase 5B — Gala booking, guests, tickets, QR check-in, export', () => {
  let ctx: TestContext;
  let admin: Session;
  let finance: Session;
  let staff: Session;
  let contentMgr: Session;
  let campaignMgr: Session;
  const tokens = new Map<string, string>(); // ticketNumber → QR token captured at PDF render time (never stored by the app)

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await loginAs(ctx, ['ADMINISTRATOR']);
    finance = await loginAs(ctx, ['FINANCE_MANAGER']);
    staff = await loginAs(ctx, ['EVENT_CHECKIN_STAFF']);
    contentMgr = await loginAs(ctx, ['CONTENT_MANAGER']);
    campaignMgr = await loginAs(ctx, ['CAMPAIGN_MANAGER']);
    const pdf = ctx.app.get(TicketPdfService);
    const real = pdf.render.bind(pdf);
    jest.spyOn(pdf, 'render').mockImplementation(async (i) => {
      tokens.set(i.ticketNumber, i.qrToken);
      return real(i);
    });
  });
  afterAll(async () => {
    await admin.patch('/admin/settings/donation', { paymentsEnabled: false }).expect(200);
    await admin.patch('/admin/payments/providers/mock', { isEnabled: false }).expect(200);
    await ctx.app.close();
  });

  // ───────── fixtures (unique rows, never truncated) ─────────

  async function makeEvent(o: { capacity?: number; salesEnabled?: boolean; published?: boolean; startsAt?: Date | null; timezone?: string | null; maxTickets?: number } = {}) {
    const id = uid();
    const page = await ctx.prisma.page.create({ data: { slug: `event-t5b-${id}`, titleEn: 'T5B', status: 'PUBLISHED' } });
    const event = await ctx.prisma.event.create({
      data: {
        code: `EVT-T5B-${id}`,
        slug: `t5b-${id}`,
        titleEn: `Test Gala ${id}`,
        status: o.published === false ? 'DRAFT' : 'PUBLISHED',
        approvedAt: new Date(),
        pageId: page.id,
        startsAt: o.startsAt ?? null,
        timezone: o.timezone ?? null,
      },
    });
    await ctx.prisma.eventTicketConfig.create({
      data: {
        eventId: event.id,
        ticketPrice: '750.00',
        currency: 'USD',
        salesEnabled: o.salesEnabled ?? true,
        capacity: o.capacity ?? null,
        maxTicketsPerBooking: o.maxTickets ?? 10,
        displayNameEn: 'Every Light Counts',
        eventDateLabelEn: 'Saturday, December 12, 2026',
        venueLabelEn: '583 Park Avenue, New York, USA',
      },
    });
    return event;
  }
  type Ev = Awaited<ReturnType<typeof makeEvent>>;

  const guest = (n: string, extra: object = {}) => ({ fullName: `Guest ${n}`, email: `g-${n}-${uid()}@example.org`, phone: '+1 212 555 0100', dietaryRequirements: 'None', ...extra });
  const body = (guests = [guest('One')], extra: object = {}) => ({
    purchaser: { fullName: 'Amira Hassan', email: `buyer-${uid()}@example.org`, phone: '+1 212 555 0199' },
    guests,
    privacyConsent: true,
    ...extra,
  });
  const create = (ev: Ev, b: object, key = `k-${randomUUID()}`) => ctx.http().post(`${API}/public/events/${ev.slug}/bookings`).set('X-Forwarded-For', ip()).set('Idempotency-Key', key).send(b);
  const book = async (ev: Ev, guests = [guest('One')], extra: object = {}) => (await create(ev, body(guests, extra)).expect(201)).body.data as { reference: string; accessToken: string; totalAmount: string };
  type Booking = Awaited<ReturnType<typeof book>>;
  const status = (b: Booking, token = b.accessToken) => ctx.http().get(`${API}/public/bookings/${b.reference}/status`).set('X-Forwarded-For', ip()).set('X-Booking-Token', token);
  const checkout = (b: Booking, token = b.accessToken) => ctx.http().post(`${API}/public/bookings/${b.reference}/checkout`).set('X-Forwarded-For', ip()).set('X-Booking-Token', token);
  const dbBooking = (b: Booking) => ctx.prisma.eventBooking.findUniqueOrThrow({ where: { publicReference: b.reference }, include: { tickets: { orderBy: { createdAt: 'asc' } }, transactions: true, attempts: true } });

  const hook = (payload: Record<string, unknown>, secret = SECRET()) => {
    const s = MockPaymentProvider.sign(secret, { id: `evt_${uid()}${uid()}`, created: Math.floor(Date.now() / 1000), ...payload });
    return { body: s.body, sig: s.signature, header: s.header, send: () => ctx.http().post(`${API}/webhooks/mock`).set('Content-Type', 'application/json').set(s.header, s.signature).send(s.body) };
  };
  const resend = (h: { body: string; sig: string; header: string }) => ctx.http().post(`${API}/webhooks/mock`).set('Content-Type', 'application/json').set(h.header, h.sig).send(h.body);

  /** Creates a hosted checkout and returns the attempt (what a provider would echo back). */
  async function startCheckout(b: Booking) {
    const s = (await checkout(b).expect(200)).body.data;
    return ctx.prisma.eventBookingPaymentAttempt.findUniqueOrThrow({ where: { reference: s.attemptReference } });
  }
  type Attempt = Awaited<ReturnType<typeof startCheckout>>;
  const succeed = (a: Attempt, extra: object = {}) =>
    hook({ type: 'payment.succeeded', attemptReference: a.reference, sessionRef: a.providerSessionRef, paymentRef: `mock_pay_${uid()}`, amount: a.amount.toString(), currency: a.currency, ...extra });
  async function payFor(b: Booking) {
    const a = await startCheckout(b);
    const h = succeed(a);
    await h.send().expect(200);
    return { attempt: a, hook: h };
  }
  const tokenOf = (ticketNumber: string) => {
    const t = tokens.get(ticketNumber);
    if (!t) throw new Error(`no captured QR token for ${ticketNumber}`);
    return t;
  };
  const scan = (s: Session, ev: Ev, token: string, extra: object = {}) => s.post(`/admin/events/${ev.id}/check-in/validate`, { token, ...extra });
  const audit = (action: string, entityId?: string) => ctx.prisma.auditLog.findMany({ where: { action, ...(entityId ? { entityId } : {}) } });

  // ═════════════════════════ public ticketing info ═════════════════════════

  let main: Ev;
  it('public ticketing info: server-controlled USD 750 individual ticket, no tables, calendar pending', async () => {
    main = await makeEvent();
    const res = await ctx.http().get(`${API}/public/events/${main.slug}/ticketing`).set('X-Forwarded-For', ip()).expect(200);
    expect(res.body.data).toMatchObject({
      ticket: { type: 'INDIVIDUAL', price: '750.00', currency: 'USD', tablesAvailable: false, perGuest: true },
      classification: 'EVENT_TICKET_PAYMENT',
      salesOpen: true,
      checkoutAvailable: false, // payments are not enabled yet in this suite
      event: { name: 'Every Light Counts', dateLabel: 'Saturday, December 12, 2026', venue: '583 Park Avenue, New York, USA' },
      calendar: { available: false, reason: 'SCHEDULE_PENDING' },
    });
  });

  it('unpublished events and events without ticketing are not bookable', async () => {
    const draft = await makeEvent({ published: false });
    await create(draft, body()).expect(404);
    await ctx.http().get(`${API}/public/events/${draft.slug}/ticketing`).set('X-Forwarded-For', ip()).expect(404);
    await create({ ...main, slug: 'no-such-event-xyz' } as Ev, body()).expect(404);
  });

  it('sales closed → 422 TICKET_SALES_CLOSED, and nothing is created', async () => {
    const closed = await makeEvent({ salesEnabled: false });
    const res = await create(closed, body()).expect(422);
    expect(res.body.error.code).toBe('TICKET_SALES_CLOSED');
    expect(await ctx.prisma.eventBooking.count({ where: { eventId: closed.id } })).toBe(0);
  });

  // ═════════════════════════ booking creation ═════════════════════════

  it('creates a PENDING booking with one PENDING ticket per guest; total = guests × 750 (server-calculated)', async () => {
    const b = await book(main, [guest('A'), guest('B'), guest('C')]);
    expect(b).toMatchObject({ bookingStatus: 'PENDING', paymentStatus: 'UNPAID', ticketCount: 3, unitPrice: '750.00', totalAmount: '2250.00', currency: 'USD', classification: 'EVENT_TICKET_PAYMENT' });
    expect(b.reference).toMatch(/^EB-[0-9A-Z]{12}$/);
    const row = await dbBooking(b);
    expect(row.guestCount).toBe(3);
    expect(row.totalAmount.toString()).toBe('2250');
    expect(row.tickets).toHaveLength(3);
    expect(new Set(row.tickets.map((t) => t.ticketNumber)).size).toBe(3);
    for (const t of row.tickets) {
      expect(t.status).toBe('PENDING'); // tickets are not issued before verified payment
      expect(t.qrTokenHash).toBeNull();
      expect(t.pdfStorageKey).toBeNull();
    }
    const guests = await ctx.prisma.eventBookingGuest.findMany({ where: { bookingId: row.id } });
    expect(guests).toHaveLength(3);
    expect(new Set(row.tickets.map((t) => t.guestId)).size).toBe(3); // exactly one ticket per guest
    expect(await ctx.prisma.donation.count({ where: { sourceEventId: main.id } })).toBe(0); // never a Donation record
  });

  it('purchaser and guest may differ; the purchaser may also be a guest', async () => {
    const b = await book(main, [guest('Own', { isPurchaser: true }), guest('Friend')]);
    const guests = await ctx.prisma.eventBookingGuest.findMany({ where: { booking: { publicReference: b.reference } }, orderBy: { position: 'asc' } });
    expect(guests.map((g) => g.isPurchaser)).toEqual([true, false]);
  });

  it('rejects price manipulation: any client-supplied price/total field is refused, and the server price wins', async () => {
    for (const extra of [{ totalAmount: '1.00' }, { price: '1' }, { unitPrice: '1.00' }, { amount: '1' }, { currency: 'EUR' }]) {
      await create(main, body([guest('X')], extra)).expect(400);
    }
    await create(main, body([guest('X'), guest('Y')], { ticketCount: 1 })).expect(422);
    const ok = await book(main, [guest('X'), guest('Y')], { ticketCount: 2 });
    expect(ok.totalAmount).toBe('1500.00');
  });

  it('validates guests: names, e-mails, phones, dietary field, counts, duplicates, consent', async () => {
    const bad = async (b: object, code?: number) => {
      const res = await create(main, b);
      expect([400, 422]).toContain(res.status);
      if (code) expect(res.status).toBe(code);
      return res;
    };
    await bad(body([guest('X', { fullName: '' })]));
    await bad(body([guest('X', { fullName: '=cmd|x' })]));
    await bad(body([guest('X', { email: 'not-an-email' })]));
    await bad(body([guest('X', { phone: 'abc' })]));
    await bad(body([guest('X', { phone: '12345' })])); // < 7 digits
    await bad(body([guest('X', { dietaryRequirements: '' })]));
    await bad(body([guest('X', { dietaryRequirements: 'x'.repeat(501) })]));
    await bad(body([]));
    await bad(body([guest('X')], { privacyConsent: false }));
    await bad({ ...body(), purchaser: { fullName: 'A B', email: 'bad', phone: '+1 212 555 0100' } });
    const dup = guest('Dup');
    const res = await bad(body([dup, { ...guest('Dup2'), email: dup.email.toUpperCase() }]), 422);
    expect(res.body.error.code).toBe('DUPLICATE_GUEST');
    const limited = await makeEvent({ maxTickets: 2 });
    const tooMany = await create(limited, body([guest('1'), guest('2'), guest('3')])).expect(422);
    expect(tooMany.body.error.code).toBe('TOO_MANY_TICKETS');
    await ctx.http().post(`${API}/public/events/${main.slug}/bookings`).set('X-Forwarded-For', ip()).send(body()).expect(400); // no Idempotency-Key
    await create(main, body(), 'short').expect(400);
  });

  it('idempotency: same key + same body replays the same booking; different body → 409; concurrent double submit → one booking', async () => {
    const key = `k-${randomUUID()}`;
    const b1 = body([guest('Idem')]);
    const first = await create(main, b1, key).expect(201);
    const again = await create(main, b1, key).expect(201);
    expect(again.body.data.reference).toBe(first.body.data.reference);
    expect(again.body.data.replayed).toBe(true);
    const diff = await create(main, body([guest('Other')]), key).expect(409);
    expect(diff.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const key2 = `k-${randomUUID()}`;
    const b2 = body([guest('Race')]);
    const [r1, r2] = await Promise.all([create(main, b2, key2), create(main, b2, key2)]);
    expect([r1.status, r2.status]).toEqual([201, 201]);
    expect(r1.body.data.reference).toBe(r2.body.data.reference);
    expect(await ctx.prisma.eventBooking.count({ where: { idempotencyKey: key2 } })).toBe(1);
  });

  it('capacity: seats are held transactionally; concurrent bookings cannot oversell', async () => {
    const small = await makeEvent({ capacity: 2 });
    const results = await Promise.all([create(small, body([guest('1'), guest('2')])), create(small, body([guest('3'), guest('4')])), create(small, body([guest('5')]))]);
    const ok = results.filter((r) => r.status === 201);
    const full = results.filter((r) => r.status === 422);
    expect(ok.length).toBe(1); // only one of the competing bookings fits
    expect(full.every((r) => r.body.error.code === 'INSUFFICIENT_CAPACITY')).toBe(true);
    const seats = await ctx.prisma.eventTicket.count({ where: { eventId: small.id } });
    expect(seats).toBeLessThanOrEqual(2);
  });

  // ═════════════════════════ public status / IDOR / PII ═════════════════════════

  it('public status needs the booking token, never exposes personal data, and uses one 404 for all failures', async () => {
    const g = guest('Pii');
    const b = await book(main, [g]);
    const s = await status(b).expect(200);
    expect(s.body.data).toMatchObject({ reference: b.reference, bookingStatus: 'PENDING', paymentStatus: 'UNPAID', confirmed: false, message: 'awaiting_payment', tickets: [] });
    const text = JSON.stringify(s.body);
    for (const secret of [g.email, g.fullName, g.phone, 'Amira Hassan', 'buyer-']) expect(text).not.toContain(secret);
    expect(text).not.toMatch(/accessTokenHash|qrToken|storageKey|pdfStorage|idempotency/i);

    await status(b, 'wrong-token').expect(404);
    await ctx.http().get(`${API}/public/bookings/${b.reference}/status`).set('X-Forwarded-For', ip()).expect(404); // no token
    await ctx.http().get(`${API}/public/bookings/EB-ZZZZZZZZZZZZ/status`).set('X-Forwarded-For', ip()).set('X-Booking-Token', b.accessToken).expect(404);
    await ctx.http().get(`${API}/public/bookings/${b.reference}/confirmation`).query({ token: b.accessToken }).set('X-Forwarded-For', ip()).expect(200);
    // another booking's token does not open this booking (IDOR)
    const other = await book(main);
    await status(b, other.accessToken).expect(404);
  });

  it('public endpoints are rate limited per client IP', async () => {
    const b = await book(main);
    const fixed = ip();
    const codes: number[] = [];
    for (let i = 0; i < 70; i++) codes.push((await ctx.http().get(`${API}/public/bookings/${b.reference}/status`).set('X-Forwarded-For', fixed).set('X-Booking-Token', b.accessToken)).status);
    expect(codes).toContain(429);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
  });

  // ═════════════════════════ checkout boundary ═════════════════════════

  it('checkout is unavailable (503) until a payment provider is approved and enabled; no payment is possible meanwhile', async () => {
    const b = await book(main);
    const res = await checkout(b).expect(503);
    expect(res.body.error.code).toBe('PAYMENTS_UNAVAILABLE');
    expect((await dbBooking(b)).paymentStatus).toBe('UNPAID');
  });

  it('enabling the (test-only mock) provider opens a hosted checkout; the browser return/cancel never confirms payment', async () => {
    await admin.patch('/admin/payments/providers/mock', { isEnabled: true }).expect(200);
    await admin.patch('/admin/settings/donation', { paymentsEnabled: true }).expect(200);
    const b = await book(main, [guest('Co')]);
    const s1 = (await checkout(b).expect(200)).body.data;
    expect(s1.checkoutUrl).toMatch(/^http/);
    expect(s1.attemptReference).toMatch(/^BA-/);
    const s2 = (await checkout(b).expect(200)).body.data;
    expect(s2.attemptReference).toBe(s1.attemptReference); // reuse of the open attempt (double click)
    await checkout(b, 'wrong').expect(404);

    const row = await dbBooking(b);
    expect(row).toMatchObject({ paymentStatus: 'PENDING', bookingStatus: 'PENDING', paymentProvider: 'mock' });
    // Simulate the browser coming back from the provider (success or cancel): nothing changes without a verified webhook.
    await ctx.http().get(`${API}/public/bookings/${b.reference}/confirmation`).query({ token: b.accessToken, success: 'true', paid: '1' }).set('X-Forwarded-For', ip()).expect(400); // unknown query params are rejected
    const st = (await status(b).expect(200)).body.data;
    expect(st).toMatchObject({ confirmed: false, message: 'processing', tickets: [] });
    expect((await dbBooking(b)).tickets.every((t) => t.status === 'PENDING')).toBe(true);
  });

  // ═════════════════════════ verified payment → tickets ═════════════════════════

  it('verified payment: PAID + CONFIRMED, one ISSUED ticket per guest with a unique hashed QR token, PDFs stored privately, audited, ledger classified as ticket revenue', async () => {
    const donationsBefore = (await admin.get('/admin/reports/donations/summary?includeTest=true').expect(200)).body.data;
    const donationRows = await ctx.prisma.donation.count();
    const txRows = await ctx.prisma.paymentTransaction.count();

    const b = await book(main, [guest('P1'), guest('P2'), guest('P3')]);
    const { attempt, hook: h } = await payFor(b);
    const row = await dbBooking(b);
    expect(row).toMatchObject({ bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' });
    expect(row.paidAt).not.toBeNull();
    expect(row.tickets).toHaveLength(3);
    expect(row.tickets.every((t) => t.status === 'ISSUED' && !!t.issuedAt)).toBe(true);
    const hashes = row.tickets.map((t) => t.qrTokenHash!);
    expect(new Set(hashes).size).toBe(3);
    for (const t of row.tickets) {
      expect(t.qrTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(t.qrTokenHash).not.toContain(tokenOf(t.ticketNumber)); // only a hash is stored
      expect(tokenOf(t.ticketNumber)).toMatch(/^mkt_[A-Za-z0-9_-]{43}$/);
      expect(t.pdfStorageKey).toMatch(/^tickets\/.+\.pdf$/);
      expect(t.pdfSha256).toMatch(/^[0-9a-f]{64}$/);
    }
    // ledger: ticket revenue, separate from donations
    expect(row.transactions).toHaveLength(1);
    expect(row.transactions[0]).toMatchObject({ type: 'CAPTURE', status: 'SUCCEEDED', classification: 'EVENT_TICKET_PAYMENT', currency: 'USD', isTest: true });
    expect(row.transactions[0].amount.toString()).toBe('2250');
    expect(attempt.id).toBe(row.transactions[0].attemptId);
    expect(await ctx.prisma.donation.count()).toBe(donationRows);
    expect(await ctx.prisma.paymentTransaction.count()).toBe(txRows);
    expect((await admin.get('/admin/reports/donations/summary?includeTest=true').expect(200)).body.data).toEqual(donationsBefore);
    // audit
    const logs = await audit('gala.booking.confirmed', row.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].metadata).toMatchObject({ source: 'verified-payment', ticketsIssued: 3 });
    // purchaser view
    const st = (await status(b).expect(200)).body.data;
    expect(st).toMatchObject({ confirmed: true, message: 'confirmed', bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' });
    expect(st.tickets).toHaveLength(3);
    expect(JSON.stringify(st)).not.toMatch(/mkt_/);

    // ── repeated webhook delivery never issues a second set of tickets ──
    const dup = await resend(h).expect(200);
    expect(dup.body.data).toMatchObject({ received: true, duplicate: true });
    const second = await succeed(attempt, { paymentRef: `mock_pay_${uid()}` }).send().expect(200); // new event id, same attempt
    expect(second.body.data.status).toBe('IGNORED');
    const after = await dbBooking(b);
    expect(after.tickets).toHaveLength(3);
    expect(after.tickets.map((t) => t.qrTokenHash)).toEqual(hashes);
    expect(after.transactions).toHaveLength(1);
    expect(await audit('gala.booking.confirmed', row.id)).toHaveLength(1);
  });

  it('webhook safety: bad signature, wrong amount, wrong session, unknown attempt → no confirmation, no tickets', async () => {
    const b = await book(main, [guest('W1'), guest('W2')]);
    const a = await startCheckout(b);
    const bad = hook({ type: 'payment.succeeded', attemptReference: a.reference, sessionRef: a.providerSessionRef, paymentRef: 'x1', amount: '2250.00', currency: 'USD' }, 'the-wrong-secret-0123456789');
    expect((await bad.send()).status).toBe(400);
    const cheap = await succeed(a, { amount: '750.00' }).send().expect(200);
    expect(cheap.body.data.status).toBe('FAILED'); // rejected for review, acknowledged
    const wrongCur = await succeed(a, { currency: 'EUR' }).send().expect(200);
    expect(wrongCur.body.data.status).toBe('FAILED');
    const wrongSession = await succeed(a, { sessionRef: 'mock_sess_000000000000000000' }).send().expect(200);
    expect(wrongSession.body.data.status).toBe('FAILED');
    const unknown = await succeed(a, { attemptReference: 'BA-NOSUCHATTEMPT' }).send().expect(200);
    expect(unknown.body.data.status).toBe('FAILED');
    const row = await dbBooking(b);
    expect(row).toMatchObject({ bookingStatus: 'PENDING', paymentStatus: 'PENDING' });
    expect(row.tickets.every((t) => t.status === 'PENDING' && t.qrTokenHash === null)).toBe(true);
    expect(row.transactions).toHaveLength(0);
  });

  it('failed payment keeps the booking PENDING (retry allowed); a cancelled checkout is NOT a failed payment', async () => {
    const b = await book(main);
    const a1 = await startCheckout(b);
    await hook({ type: 'payment.cancelled', attemptReference: a1.reference, sessionRef: a1.providerSessionRef }).send().expect(200);
    expect(await dbBooking(b)).toMatchObject({ bookingStatus: 'PENDING', paymentStatus: 'UNPAID' }); // not FAILED

    const a2 = await startCheckout(b);
    expect(a2.id).not.toBe(a1.id);
    await hook({ type: 'payment.failed', attemptReference: a2.reference, sessionRef: a2.providerSessionRef, failureCode: 'card_declined' }).send().expect(200);
    expect(await dbBooking(b)).toMatchObject({ bookingStatus: 'PENDING', paymentStatus: 'FAILED' });
    expect((await status(b).expect(200)).body.data.message).toBe('payment_failed');

    const a3 = await startCheckout(b); // retry after failure
    expect(await dbBooking(b)).toMatchObject({ paymentStatus: 'PENDING' });
    await succeed(a3).send().expect(200);
    const done = await dbBooking(b);
    expect(done).toMatchObject({ bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' });
    // a late failure for the old attempt cannot undo a successful payment
    await hook({ type: 'payment.failed', attemptReference: a2.reference, sessionRef: a2.providerSessionRef }).send().expect(200);
    expect(await dbBooking(b)).toMatchObject({ bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' });
  });

  // ═════════════════════════ ticket PDFs ═════════════════════════

  it('ticket PDFs: purchaser download needs the booking token; no cross-booking or pre-payment access; admin needs gala.tickets.read', async () => {
    const pending = await book(main, [guest('Pre')]);
    const pendingTicket = (await dbBooking(pending)).tickets[0];
    await ctx.http().get(`${API}/public/bookings/${pending.reference}/tickets/${pendingTicket.ticketNumber}/pdf`).query({ token: pending.accessToken }).set('X-Forwarded-For', ip()).expect(404);
    await admin.get(`/admin/events/${main.id}/tickets/${pendingTicket.id}/pdf`).expect(404);

    const a = await book(main, [guest('PdfA')]);
    const b = await book(main, [guest('PdfB')]);
    await payFor(a);
    await payFor(b);
    const ta = (await dbBooking(a)).tickets[0];
    const tb = (await dbBooking(b)).tickets[0];
    const url = (bk: Booking, t: { ticketNumber: string }) => `${API}/public/bookings/${bk.reference}/tickets/${t.ticketNumber}/pdf`;
    const ok = await ctx.http().get(url(a, ta)).set('X-Forwarded-For', ip()).set('X-Booking-Token', a.accessToken).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toMatch(/application\/pdf/);
    expect(ok.headers['cache-control']).toMatch(/no-store/);
    expect(ok.headers['content-disposition']).toContain(`${ta.ticketNumber}.pdf`);
    expect((ok.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    // IDOR: B's token cannot fetch A's ticket; A's token cannot fetch B's ticket; no token; guessed number
    await ctx.http().get(url(a, ta)).set('X-Forwarded-For', ip()).set('X-Booking-Token', b.accessToken).expect(404);
    await ctx.http().get(url(a, tb)).set('X-Forwarded-For', ip()).set('X-Booking-Token', a.accessToken).expect(404);
    await ctx.http().get(url(a, ta)).set('X-Forwarded-For', ip()).expect(404);
    await ctx.http().get(url(a, { ticketNumber: 'TK-0000000000' })).set('X-Forwarded-For', ip()).set('X-Booking-Token', a.accessToken).expect(404);
    // admin download (scoped to the event; storage path never exposed)
    await admin.get(`/admin/events/${main.id}/tickets/${ta.id}/pdf`).expect(200).expect('Content-Type', /pdf/);
    const other = await makeEvent();
    await admin.get(`/admin/events/${other.id}/tickets/${ta.id}/pdf`).expect(404); // wrong event scope
    await staff.get(`/admin/events/${main.id}/tickets/${ta.id}/pdf`).expect(403);
    const detail = (await admin.get(`/admin/events/${main.id}/tickets/${ta.id}`).expect(200)).body.data;
    expect(detail.hasPdf).toBe(true);
    expect(JSON.stringify(detail)).not.toMatch(/pdfStorageKey|qrTokenHash|tickets\//);
    // revoked tickets cannot be downloaded by the purchaser
    await admin.post(`/admin/events/${main.id}/tickets/${ta.id}/revoke`, { reason: 'test revocation' }).expect(200);
    await ctx.http().get(url(a, ta)).set('X-Forwarded-For', ip()).set('X-Booking-Token', a.accessToken).expect(404);
  });

  // ═════════════════════════ QR check-in ═════════════════════════

  describe('check-in', () => {
    let ev: Ev;
    beforeAll(async () => {
      ev = await makeEvent();
    });

    it('VALID once, then ALREADY_CHECKED_IN; records time + staff; audited; no PII for unknown tokens', async () => {
      const b = await book(ev, [guest('Door')]);
      await payFor(b);
      const t = (await dbBooking(b)).tickets[0];
      const tok = tokenOf(t.ticketNumber);

      const peek = await scan(staff, ev, tok, { verifyOnly: true }).expect(200);
      expect(peek.body.data.result).toBe('VALID');
      expect((await ctx.prisma.eventTicket.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('ISSUED'); // verifyOnly changes nothing

      const first = await scan(staff, ev, tok).expect(200);
      expect(first.body.data).toMatchObject({ result: 'VALID', ticket: { ticketNumber: t.ticketNumber, status: 'CHECKED_IN', guestName: 'Guest Door' } });
      const row = await ctx.prisma.eventTicket.findUniqueOrThrow({ where: { id: t.id } });
      expect(row.status).toBe('CHECKED_IN');
      expect(row.checkedInAt).not.toBeNull();
      expect(row.checkedInById).toBe(staff.userId);
      const logs = await audit('gala.checkin.checked_in', t.id);
      expect(logs).toHaveLength(1);
      expect(logs[0].actorId).toBe(staff.userId);

      const replay = await scan(staff, ev, tok).expect(200); // QR replay
      expect(replay.body.data.result).toBe('ALREADY_CHECKED_IN');
      expect((await audit('gala.checkin.rejected', t.id)).length).toBe(1);

      const stats = (await staff.get(`/admin/events/${ev.id}/check-in/statistics`).expect(200)).body.data;
      expect(stats.checkedIn).toBeGreaterThanOrEqual(1);
      expect(stats.validTickets).toBeGreaterThanOrEqual(stats.checkedIn);
    });

    it('INVALID for malformed, guessed, and other-event tokens (reveals nothing)', async () => {
      for (const token of ['', 'mkt_short', 'not-a-token', `mkt_${'A'.repeat(43)}`, `mkt_${'A'.repeat(44)}`]) {
        const res = await scan(staff, ev, token);
        expect(res.status === 200 || res.status === 400).toBe(true);
        if (res.status === 200) expect(res.body.data).toEqual({ result: 'INVALID' });
      }
      const otherEv = await makeEvent();
      const b = await book(otherEv, [guest('Elsewhere')]);
      await payFor(b);
      const tok = tokenOf((await dbBooking(b)).tickets[0].ticketNumber);
      const res = await scan(staff, ev, tok).expect(200); // valid token, wrong event
      expect(res.body.data).toEqual({ result: 'INVALID' });
      expect((await dbBooking(b)).tickets[0].status).toBe('ISSUED');
    });

    it('two simultaneous scans of the same ticket yield exactly one VALID', async () => {
      const b = await book(ev, [guest('Race')]);
      await payFor(b);
      const t = (await dbBooking(b)).tickets[0];
      const tok = tokenOf(t.ticketNumber);
      const results = await Promise.all(Array.from({ length: 8 }, () => scan(staff, ev, tok)));
      const verdicts = results.map((r) => r.body.data.result);
      expect(verdicts.filter((v) => v === 'VALID')).toHaveLength(1);
      expect(verdicts.filter((v) => v === 'ALREADY_CHECKED_IN')).toHaveLength(7);
      expect(await audit('gala.checkin.checked_in', t.id)).toHaveLength(1);
    });

    it('REVOKED, REFUNDED and PAYMENT_NOT_CONFIRMED tickets can never be checked in', async () => {
      // revoked by admin
      const b1 = await book(ev, [guest('Rev')]);
      await payFor(b1);
      const t1 = (await dbBooking(b1)).tickets[0];
      await admin.post(`/admin/events/${ev.id}/tickets/${t1.id}/revoke`, { reason: 'duplicate ticket' }).expect(200);
      expect((await scan(staff, ev, tokenOf(t1.ticketNumber))).body.data.result).toBe('REVOKED');
      expect((await audit('gala.ticket.revoke', t1.id)).length).toBe(1);
      await admin.post(`/admin/events/${ev.id}/tickets/${t1.id}/revoke`, { reason: 'again' }).expect(409);

      // refunded through a verified provider refund event (full amount)
      const b2 = await book(ev, [guest('Ref')]);
      const { attempt } = await payFor(b2);
      const t2 = (await dbBooking(b2)).tickets[0];
      const wrongAmt = await hook({ type: 'refund.succeeded', attemptReference: attempt.reference, providerRefundRef: `mock_re_${uid()}`, amount: '100.00', currency: 'USD' }).send().expect(200);
      expect(wrongAmt.body.data.status).toBe('FAILED'); // partial refunds are not supported → manual review
      expect((await dbBooking(b2)).bookingStatus).toBe('CONFIRMED');
      const refundRef = `mock_re_${uid()}`;
      const rh = hook({ type: 'refund.succeeded', attemptReference: attempt.reference, providerRefundRef: refundRef, amount: '750.00', currency: 'USD' });
      await rh.send().expect(200);
      const refunded = await dbBooking(b2);
      expect(refunded).toMatchObject({ bookingStatus: 'REFUNDED', paymentStatus: 'REFUNDED' });
      expect(refunded.refundedAmount.toString()).toBe('750');
      expect(refunded.tickets[0].status).toBe('REFUNDED');
      expect(refunded.transactions.map((x) => x.type).sort()).toEqual(['CAPTURE', 'REFUND']); // history preserved, append-only
      expect((await scan(staff, ev, tokenOf(t2.ticketNumber))).body.data.result).toBe('REFUNDED');
      const dupRefund = await resend(rh).expect(200); // duplicate delivery
      expect(dupRefund.body.data.duplicate).toBe(true);
      await hook({ type: 'refund.succeeded', attemptReference: attempt.reference, providerRefundRef: `mock_re_${uid()}`, amount: '750.00', currency: 'USD' }).send().expect(200);
      expect((await dbBooking(b2)).transactions.filter((x) => x.type === 'REFUND')).toHaveLength(1);
      expect((await audit('gala.booking.refunded', refunded.id)).length).toBe(1);

      // payment no longer confirmed (e.g. finance corrected the record): ticket cannot be used
      const b3 = await book(ev, [guest('Unpaid')]);
      await payFor(b3);
      const t3 = (await dbBooking(b3)).tickets[0];
      await ctx.prisma.eventBooking.update({ where: { publicReference: b3.reference }, data: { paymentStatus: 'FAILED' } });
      expect((await scan(staff, ev, tokenOf(t3.ticketNumber))).body.data.result).toBe('PAYMENT_NOT_CONFIRMED');
      await ctx.prisma.eventBooking.update({ where: { publicReference: b3.reference }, data: { paymentStatus: 'PAID' } });
    });

    it('re-issue rotates the QR: the old token is dead, the new one works; renaming an issued ticket re-issues it', async () => {
      const b = await book(ev, [guest('Rot')]);
      await payFor(b);
      const bk = await dbBooking(b);
      const t = bk.tickets[0];
      const oldTok = tokenOf(t.ticketNumber);
      const r = await admin.post(`/admin/events/${ev.id}/tickets/${t.id}/reissue`, { reason: 'lost ticket e-mail' }).expect(200);
      expect(r.body.data).toMatchObject({ ticketNumber: t.ticketNumber, pdfGenerated: true });
      const newTok = tokenOf(t.ticketNumber);
      expect(newTok).not.toBe(oldTok);
      expect((await scan(staff, ev, oldTok)).body.data.result).toBe('INVALID');
      expect((await scan(staff, ev, newTok, { verifyOnly: true })).body.data.result).toBe('VALID');
      expect((await audit('gala.ticket.reissue', t.id)).length).toBe(1);

      const guestRow = (await dbBooking(b)) && (await ctx.prisma.eventBookingGuest.findFirstOrThrow({ where: { bookingId: bk.id } }));
      const patched = await admin.patch(`/admin/events/${ev.id}/bookings/${bk.id}`, { guests: [{ id: guestRow.id, fullName: 'Renamed Guest' }] }).expect(200);
      expect(patched.body.data.guests[0].fullName).toBe('Renamed Guest');
      const afterRename = tokenOf(t.ticketNumber);
      expect(afterRename).not.toBe(newTok); // renamed → new QR + PDF
      expect((await scan(staff, ev, newTok)).body.data.result).toBe('INVALID');
      expect((await scan(staff, ev, afterRename)).body.data.ticket.guestName).toBe('Renamed Guest');
    });

    it('manual check-in and audited undo require gala.checkin.manage', async () => {
      const b = await book(ev, [guest('Man')]);
      await payFor(b);
      const t = (await dbBooking(b)).tickets[0];
      await staff.post(`/admin/events/${ev.id}/tickets/${t.id}/check-in`).expect(403);
      await admin.post(`/admin/events/${ev.id}/tickets/${t.id}/check-in`).expect(200);
      await admin.post(`/admin/events/${ev.id}/tickets/${t.id}/check-in`).expect(422); // already checked in
      await admin.post(`/admin/events/${ev.id}/tickets/${t.id}/revoke`, { reason: 'x y z' }).expect(422); // must undo first
      await admin.post(`/admin/events/${ev.id}/tickets/${t.id}/undo-check-in`, { reason: 'scanned by mistake' }).expect(200);
      expect((await scan(staff, ev, tokenOf(t.ticketNumber))).body.data.result).toBe('VALID');
      expect((await audit('gala.checkin.manual', t.id)).length).toBe(1);
      expect((await audit('gala.checkin.undo', t.id)).length).toBe(1);
    });
  });

  // ═════════════════════════ cancellation ═════════════════════════

  it('cancel: unpaid → CANCELLED (tickets revoked); a late payment is recorded for refund review and issues NOTHING', async () => {
    const b = await book(main, [guest('Can1'), guest('Can2')]);
    const a = await startCheckout(b);
    const bk = await dbBooking(b);
    const res = await admin.post(`/admin/events/${main.id}/bookings/${bk.id}/cancel`, { reason: 'purchaser request' }).expect(200);
    expect(res.body.data).toMatchObject({ bookingStatus: 'CANCELLED' });
    expect((await dbBooking(b)).tickets.every((t) => t.status === 'REVOKED')).toBe(true);
    await admin.post(`/admin/events/${main.id}/bookings/${bk.id}/cancel`, { reason: 'again' }).expect(409);
    await checkout(b).expect(422); // cannot be paid any more
    expect((await audit('gala.booking.cancel', bk.id)).length).toBe(1);

    const late = await succeed(a).send().expect(200);
    expect(late.body.data.status).toBe('FAILED'); // flagged REVIEW
    const after = await dbBooking(b);
    expect(after).toMatchObject({ bookingStatus: 'REFUND_PENDING', paymentStatus: 'PAID' });
    expect(after.tickets.every((t) => t.status === 'REVOKED' && t.qrTokenHash === null)).toBe(true);
    expect(after.transactions).toHaveLength(1); // money is on record
    const ev = await ctx.prisma.paymentWebhookEvent.findFirstOrThrow({ where: { provider: 'mock', status: 'FAILED', lastError: { contains: 'REVIEW' } }, orderBy: { receivedAt: 'desc' } });
    expect(ev.lastError).toContain('refund required');
  });

  it('cancel: paid → REFUND_PENDING with revoked tickets; the verified refund then completes it; history is preserved', async () => {
    const b = await book(main, [guest('CanPaid')]);
    const { attempt } = await payFor(b);
    const bk = await dbBooking(b);
    const tok = tokenOf(bk.tickets[0].ticketNumber);
    await admin.post(`/admin/events/${main.id}/bookings/${bk.id}/cancel`, { reason: 'event conflict' }).expect(200);
    expect(await dbBooking(b)).toMatchObject({ bookingStatus: 'REFUND_PENDING', paymentStatus: 'PAID' });
    expect((await scan(staff, main as Ev, tok)).body.data.result).toBe('REVOKED');
    await hook({ type: 'refund.succeeded', attemptReference: attempt.reference, providerRefundRef: `mock_re_${uid()}`, amount: '750.00', currency: 'USD' }).send().expect(200);
    const done = await dbBooking(b);
    expect(done).toMatchObject({ bookingStatus: 'REFUNDED', paymentStatus: 'REFUNDED' });
    expect(done.tickets[0].status).toBe('REFUNDED');
    expect(done.transactions).toHaveLength(2);
    await admin.patch(`/admin/events/${main.id}/bookings/${bk.id}`, { purchaserName: 'Nope Nope' }).expect(409); // terminal bookings are read-only
  });

  // ═════════════════════════ guest list & export ═════════════════════════

  describe('guest list and export', () => {
    let ev: Ev;
    let paidRef: string;
    beforeAll(async () => {
      ev = await makeEvent();
      const evil = guest('Evil', { dietaryRequirements: '=HYPERLINK("http://evil.example","click")', phone: '+1 212 555 0123' });
      const plus = guest('Plus', { dietaryRequirements: '+cmd|\' /C calc\'!A0' });
      const paid = await book(ev, [evil, plus]);
      paidRef = paid.reference;
      await payFor(paid);
      const t = (await dbBooking(paid)).tickets[0];
      await scan(staff, ev, tokenOf(t.ticketNumber)).expect(200); // one checked in
      await book(ev, [guest('Unpaid', { fullName: 'Unpaid Person' })]); // pending, unpaid
      const otherEv = await makeEvent();
      const foreign = await book(otherEv, [guest('Foreign', { fullName: 'Foreign Guest' })]);
      expect(foreign.reference).toBeTruthy();
    });

    it('lists guests (paid and unpaid) with required fields; filters by payment/check-in/ticket status and search; scoped to the event', async () => {
      const all = (await admin.get(`/admin/events/${ev.id}/guests?includeTest=true&pageSize=100`).expect(200)).body;
      expect(all.meta.total).toBe(3);
      expect(all.data[0]).toEqual(expect.objectContaining({ bookingReference: expect.any(String), fullName: expect.any(String), email: expect.any(String), phone: expect.any(String), dietaryRequirements: expect.any(String), ticketNumber: expect.any(String), ticketStatus: expect.any(String), paymentStatus: expect.any(String), checkInStatus: expect.any(String) }));
      expect(JSON.stringify(all)).not.toContain('Foreign Guest'); // other event's guests never leak
      const q = async (s: string) => (await admin.get(`/admin/events/${ev.id}/guests?includeTest=true&${s}`).expect(200)).body;
      expect((await q('paymentStatus=PAID')).meta.total).toBe(2);
      expect((await q('paymentStatus=UNPAID')).meta.total).toBe(1);
      expect((await q('checkInStatus=CHECKED_IN')).meta.total).toBe(1);
      expect((await q('checkInStatus=NOT_CHECKED_IN')).meta.total).toBe(2);
      expect((await q('ticketStatus=PENDING')).meta.total).toBe(1);
      expect((await q('search=Unpaid%20Person')).meta.total).toBe(1);
      expect((await q(`search=${paidRef}`)).meta.total).toBe(2);
      expect((await q('search=g-Evil')).meta.total).toBe(1);
      expect((await admin.get(`/admin/events/${ev.id}/guests?includeTest=true&paymentStatus=BOGUS`)).status).toBe(400);
      // test-provider bookings are excluded by default (all of this suite's bookings are mock-provider)
      expect((await admin.get(`/admin/events/${ev.id}/guests`).expect(200)).body.meta.total).toBe(0);
    });

    it('exports CSV with the required columns, UTF-8 BOM, attachment headers, and neutralised formulas; audited', async () => {
      const res = await admin.get(`/admin/events/${ev.id}/guests/export?includeTest=true`).expect(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="guests-t5b-.*\.csv"/);
      expect(res.headers['cache-control']).toMatch(/no-store/);
      const csv = res.text;
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      expect(csv.split('\r\n')[0].slice(1)).toBe('Booking Reference,Guest Full Name,Email,Phone,Dietary Requirements,Ticket Number,Ticket Status,Payment Status,Check-in Status,Booking Date');
      expect(csv).toContain(paidRef);
      expect(csv).toContain('Unpaid Person');
      expect(csv).not.toContain('Foreign Guest');
      expect(csv).toMatch(/CHECKED_IN/);
      expect(csv).toMatch(/NOT_CHECKED_IN/);
      // formula injection: no cell may start with = + - @ (phones in plain +digits form are exempt)
      expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
      expect(csv).toContain("'+cmd|' /C calc'!A0");
      const cells = csv.slice(1).split('\r\n').flatMap((l) => l.split(',')).filter(Boolean);
      for (const c of cells) expect(/^[=@]/.test(c.replace(/^"/, ''))).toBe(false);
      const logs = await audit('gala.guests.export', ev.id);
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].metadata).toMatchObject({ format: 'csv', rows: 3 });
      // filtered export
      const unpaid = (await admin.get(`/admin/events/${ev.id}/guests/export?includeTest=true&paymentStatus=UNPAID`).expect(200)).text;
      expect(unpaid.trim().split('\r\n')).toHaveLength(2);
    });

    it('exports are permission-protected for both formats (XLSX content is covered in gala-qa.e2e-spec.ts)', async () => {
      await admin.get(`/admin/events/${ev.id}/guests/export?includeTest=true&format=xlsx`).expect(200).expect('Content-Type', /spreadsheetml/);
      await finance.get(`/admin/events/${ev.id}/guests/export?includeTest=true&format=xlsx`).expect(403);
      await finance.get(`/admin/events/${ev.id}/guests/export?includeTest=true`).expect(403); // read but not export
      await staff.get(`/admin/events/${ev.id}/guests/export?includeTest=true`).expect(403);
      await contentMgr.get(`/admin/events/${ev.id}/guests/export?includeTest=true`).expect(403);
      await campaignMgr.get(`/admin/events/${ev.id}/guests/export?includeTest=true`).expect(403);
      await ctx.http().get(`${API}/admin/events/${ev.id}/guests/export`).expect(401);
      await admin.get(`/admin/events/nonexistent-event/guests/export`).expect(404);
    });
  });

  // ═════════════════════════ permissions & least privilege ═════════════════════════

  it('RBAC: each role reaches only its endpoints; unauthenticated = 401; mutations need CSRF', async () => {
    const ev = await makeEvent();
    const b = await book(ev);
    const bk = await dbBooking(b);
    const base = `/admin/events/${ev.id}`;
    const reads = [`${base}/bookings`, `${base}/bookings/${bk.id}`, `${base}/guests`, `${base}/tickets`, `${base}/tickets/${bk.tickets[0].id}`, `${base}/financials`, `${base}/ticketing`];
    for (const s of [contentMgr, campaignMgr, staff]) for (const u of reads) expect([u, (await s.get(u)).status]).toEqual([u, 403]);
    for (const u of reads) expect([u, (await finance.get(u)).status]).toEqual([u, 200]);
    for (const u of reads) expect([u, (await admin.get(u)).status]).toEqual([u, 200]);
    for (const u of reads) await ctx.http().get(`${API}${u}`).expect(401);

    // finance: read-only (no manage, no tickets.manage, no check-in, no export)
    await finance.post(`${base}/bookings/${bk.id}/cancel`, { reason: 'finance should not' }).expect(403);
    await finance.patch(`${base}/bookings/${bk.id}`, { purchaserName: 'Nope Nope' }).expect(403);
    await finance.post(`${base}/tickets/${bk.tickets[0].id}/revoke`, { reason: 'nope nope' }).expect(403);
    await finance.post(`${base}/check-in/validate`, { token: `mkt_${'A'.repeat(43)}` }).expect(403);
    // door staff: validate + statistics only
    await staff.post(`${base}/check-in/validate`, { token: `mkt_${'A'.repeat(43)}` }).expect(200);
    await staff.get(`${base}/check-in/statistics`).expect(200);
    await staff.post(`${base}/bookings/${bk.id}/cancel`, { reason: 'staff should not' }).expect(403);
    // campaign / content managers gain no financial or guest permissions from this phase
    for (const s of [campaignMgr, contentMgr]) {
      await s.post(`${base}/check-in/validate`, { token: `mkt_${'A'.repeat(43)}` }).expect(403);
      await s.post(`${base}/bookings/${bk.id}/cancel`, { reason: 'nope nope' }).expect(403);
    }
    // CSRF: a session cookie without the token is refused on mutations
    await ctx.http().post(`${API}${base}/bookings/${bk.id}/cancel`).set('Cookie', admin.cookie).send({ reason: 'no csrf token' }).expect(403);
    // cross-event scoping (IDOR): this booking/ticket does not exist under another event
    const other = await makeEvent();
    await admin.get(`/admin/events/${other.id}/bookings/${bk.id}`).expect(404);
    await admin.get(`/admin/events/${other.id}/tickets/${bk.tickets[0].id}`).expect(404);
    await admin.post(`/admin/events/${other.id}/bookings/${bk.id}/cancel`, { reason: 'wrong event' }).expect(404);
    await admin.post(`/admin/events/${other.id}/tickets/${bk.tickets[0].id}/revoke`, { reason: 'wrong event' }).expect(404);
    expect((await dbBooking(b)).bookingStatus).toBe('PENDING');
  });

  it('role catalogue: new permissions exist; door staff has only gala.checkin.validate; campaign manager has no gala/finance-approval permissions', async () => {
    const perms = async (key: string) => (await ctx.prisma.rolePermission.findMany({ where: { role: { key } }, include: { permission: true } })).map((r) => r.permission.key);
    const staffPerms = await perms('EVENT_CHECKIN_STAFF');
    expect(staffPerms).toEqual(['gala.checkin.validate']);
    expect((await perms('CAMPAIGN_MANAGER')).filter((p) => p.startsWith('gala.') || p.startsWith('refunds.approve'))).toEqual([]);
    expect((await perms('CONTENT_MANAGER')).filter((p) => p.startsWith('gala.'))).toEqual([]);
    const fin = (await perms('FINANCE_MANAGER')).filter((p) => p.startsWith('gala.')).sort();
    expect(fin).toEqual(['gala.bookings.read', 'gala.guests.read', 'gala.tickets.read']);
    const adm = (await perms('ADMINISTRATOR')).filter((p) => p.startsWith('gala.')).sort();
    expect(adm).toHaveLength(8);
    const all = await ctx.prisma.permission.findMany({ where: { key: { startsWith: 'gala.' } } });
    expect(all.map((p) => p.key).sort()).toEqual(['gala.bookings.manage', 'gala.bookings.read', 'gala.checkin.manage', 'gala.checkin.validate', 'gala.guests.export', 'gala.guests.read', 'gala.tickets.manage', 'gala.tickets.read']);
  });

  // ═════════════════════════ financial separation ═════════════════════════

  it('financial summary is ticket-only, classified EVENT_TICKET_PAYMENT, and never claims a tax-deductible amount', async () => {
    const ev = await makeEvent();
    const b = await book(ev, [guest('F1'), guest('F2')]);
    await payFor(b);
    const b2 = await book(ev, [guest('F3')]);
    const { attempt } = await payFor(b2);
    await hook({ type: 'refund.succeeded', attemptReference: attempt.reference, providerRefundRef: `mock_re_${uid()}`, amount: '750.00', currency: 'USD' }).send().expect(200);
    const res = (await finance.get(`/admin/events/${ev.id}/financials?includeTest=true`).expect(200)).body.data;
    expect(res).toMatchObject({ classification: 'EVENT_TICKET_PAYMENT', currency: 'USD', grossCaptured: '2250.00', refunded: '750.00', net: '1500.00', capturedPayments: 2, refundPayments: 1 });
    expect(res.taxTreatment).toMatchObject({ taxDeductibleAmount: null, fairMarketValueProvided: false });
    expect(res.bookingsByStatus).toMatchObject({ CONFIRMED: 1, REFUNDED: 1 });
    // default view excludes test-provider records
    const real = (await finance.get(`/admin/events/${ev.id}/financials`).expect(200)).body.data;
    expect(real.grossCaptured).toBe('0.00');
    // no receipt is ever generated for tickets
    expect(await ctx.prisma.donationReceipt.count({ where: { donation: { sourceEventId: ev.id } } })).toBe(0);
  });

  it('ticket ledger and booking history are append-only at the database level', async () => {
    const b = await book(main, [guest('Led')]);
    await payFor(b);
    const bk = await dbBooking(b);
    const tx = bk.transactions[0];
    await expect(ctx.prisma.$executeRawUnsafe('UPDATE EventBookingTransaction SET amount = 1 WHERE id = ?', tx.id)).rejects.toThrow();
    await expect(ctx.prisma.$executeRawUnsafe('DELETE FROM EventBookingTransaction WHERE id = ?', tx.id)).rejects.toThrow();
    await expect(ctx.prisma.$executeRawUnsafe('DELETE FROM EventBooking WHERE id = ?', bk.id)).rejects.toThrow();
    await expect(ctx.prisma.$executeRawUnsafe('DELETE FROM EventTicket WHERE id = ?', bk.tickets[0].id)).rejects.toThrow();
    await expect(ctx.prisma.$executeRawUnsafe('DELETE FROM EventBookingGuest WHERE bookingId = ?', bk.id)).rejects.toThrow();
  });

  // ═════════════════════════ ticket configuration ═════════════════════════

  it('ticket configuration: price/sales are server-side admin settings; opening sales needs events.approve; changes are audited', async () => {
    const ev = await makeEvent({ salesEnabled: false });
    const base = `/admin/events/${ev.id}/ticketing`;
    // content manager may edit text/limits but not open sales
    await contentMgr.patch(base, { salesEnabled: true }).expect(403);
    await contentMgr.patch(base, { maxTicketsPerBooking: 4 }).expect(200);
    await campaignMgr.patch(base, { maxTicketsPerBooking: 4 }).expect(403);
    const opened = await admin.patch(base, { salesEnabled: true, ticketPrice: '800.00' }).expect(200);
    expect(opened.body.data).toMatchObject({ salesEnabled: true, ticketPrice: '800.00', maxTicketsPerBooking: 4 });
    const b = await book(ev, [guest('Pr1'), guest('Pr2')]);
    expect(b.totalAmount).toBe('1600.00'); // new price applies to new bookings, from the server configuration
    await admin.patch(base, { ticketPrice: '0' }).expect(400);
    await admin.patch(base, { ticketPrice: '12.345' }).expect(400);
    const logs = await ctx.prisma.auditLog.findMany({ where: { action: 'gala.ticketing.update', entityType: 'EventTicketConfig' } });
    expect(logs.some((l) => JSON.stringify(l.metadata).includes('800.00'))).toBe(true);
    // creating a config starts CLOSED
    const fresh = await ctx.prisma.event.create({ data: { code: `EVT-T5B-${uid()}`, slug: `t5b-n-${uid()}`, titleEn: 'No cfg', pageId: (await ctx.prisma.page.create({ data: { slug: `event-t5b-n-${uid()}`, titleEn: 'x' } })).id } });
    const created = await admin.post(`/admin/events/${fresh.id}/ticketing`, { ticketPrice: '750.00', displayNameEn: 'Every Light Counts', eventDateLabelEn: 'Saturday, December 12, 2026', venueLabelEn: '583 Park Avenue, New York, USA' }).expect(201);
    expect(created.body.data).toMatchObject({ salesEnabled: false, currency: 'USD', ticketPrice: '750.00' });
    await admin.post(`/admin/events/${fresh.id}/ticketing`, { ticketPrice: '750.00', displayNameEn: 'xx', eventDateLabelEn: 'xx', venueLabelEn: 'xx' }).expect(409);
  });

  // MEKI update, 19 Nov 2026 (seed since 6b37e9c): USD 500 per guest (supersedes USD 750) and capacity 350 — both confirmed values.
  it('the seeded Gala configuration is USD 500, individual, sales CLOSED, confirmed capacity 350', async () => {
    const gala = await ctx.prisma.event.findUnique({ where: { code: 'EVT-GALA-NIGHT' }, include: { ticketConfig: true } });
    expect(gala?.ticketConfig).toBeTruthy();
    expect(gala!.ticketConfig!.ticketPrice.toString()).toBe('500');
    expect(gala!.ticketConfig).toMatchObject({ currency: 'USD', salesEnabled: false, capacity: 350, displayNameEn: 'Every Light Counts', eventDateLabelEn: 'Saturday, December 12, 2026', venueLabelEn: '583 Park Avenue, New York, USA' });
    expect(gala!.status).not.toBe('PUBLISHED'); // the seed never publishes anything
  });

  // ═════════════════════════ calendar ═════════════════════════

  it('calendar: pending (409, no invented time) until start time + timezone exist, then a valid .ics', async () => {
    const pending = await makeEvent();
    const r = await ctx.http().get(`${API}/public/events/${pending.slug}/calendar.ics`).set('X-Forwarded-For', ip()).expect(409);
    expect(r.body.error.code).toBe('CALENDAR_PENDING');
    const timed = await makeEvent({ startsAt: new Date('2026-12-13T00:00:00Z'), timezone: 'America/New_York' });
    const info = await ctx.http().get(`${API}/public/events/${timed.slug}/ticketing`).set('X-Forwarded-For', ip()).expect(200);
    expect(info.body.data.calendar).toMatchObject({ available: true });
    const ics = await ctx.http().get(`${API}/public/events/${timed.slug}/calendar.ics`).set('X-Forwarded-For', ip()).expect(200);
    expect(ics.headers['content-type']).toMatch(/text\/calendar/);
    expect(ics.text).toContain('BEGIN:VEVENT');
    expect(ics.text).toContain('DTSTART:20261213T000000Z');
    expect(ics.text).toContain('SUMMARY:Every Light Counts');
    expect(ics.text).toContain('LOCATION:583 Park Avenue\\, New York\\, USA');
    expect(ics.text).not.toContain('DTEND'); // end time not confirmed → not invented
  });

  // ═════════════════════════ e-mail composition ═════════════════════════

  it('e-mail composer: ticket delivery carries the guest PDF; confirmation is refused before verified payment; nothing is "sent"', async () => {
    const composer = ctx.app.get(GalaEmailComposer);
    const g = guest('Mail', { fullName: 'Mail Guest' });
    const pend = await book(main, [g]);
    const pendRow = await dbBooking(pend);
    expect(await composer.compose({ type: 'booking.confirmed', bookingId: pendRow.id, bookingReference: pend.reference })).toBeNull();
    expect(await composer.compose({ type: 'ticket.delivery', bookingId: pendRow.id, bookingReference: pend.reference, ticketId: pendRow.tickets[0].id })).toBeNull();
    const pending = (await composer.compose({ type: 'booking.pending', bookingId: pendRow.id, bookingReference: pend.reference }))!;
    expect(pending.text).toMatch(/NOT confirmed/);
    expect(pending.to).toBe(pendRow.purchaserEmail);

    await payFor(pend);
    const row = await dbBooking(pend);
    const confirmed = (await composer.compose({ type: 'booking.confirmed', bookingId: row.id, bookingReference: pend.reference }))!;
    for (const s of [pend.reference, 'Saturday, December 12, 2026', '583 Park Avenue, New York, USA', 'Mail Guest', row.tickets[0].ticketNumber, 'Thank you']) expect(confirmed.text).toContain(s);
    expect(confirmed.text).toMatch(/calendar invitation will be sent/); // schedule still pending
    expect(confirmed.text).toContain('token='); // secure link for the purchaser
    // Phase 7: the token is in the fragment (never sent to servers / logs / Referer), the reference stays in the query
    expect(confirmed.text).toContain(`?reference=${pend.reference}#token=`);
    expect(confirmed.text).not.toMatch(/[?&]token=/);
    expect(confirmed.html).not.toMatch(/[?&]token=/);
    const delivery = (await composer.compose({ type: 'ticket.delivery', bookingId: row.id, bookingReference: pend.reference, ticketId: row.tickets[0].id }))!;
    expect(delivery.to).toBe(g.email.toLowerCase()); // e-mails are normalised to lower case
    expect(delivery.attachments).toHaveLength(1);
    expect(delivery.attachments[0]).toMatchObject({ filename: `${row.tickets[0].ticketNumber}.pdf`, contentType: 'application/pdf' });
    expect(delivery.attachments[0].content.subarray(0, 5).toString()).toBe('%PDF-');
    expect(delivery.text).not.toContain('token=');
  });

  // ═════════════════════════ regeneration ═════════════════════════

  it('booking-level regeneration only works for confirmed, paid bookings', async () => {
    const b = await book(main, [guest('Reg')]);
    const bk = await dbBooking(b);
    await admin.post(`/admin/events/${main.id}/bookings/${bk.id}/regenerate-tickets`).expect(422);
    await payFor(b);
    const ok = await admin.post(`/admin/events/${main.id}/bookings/${bk.id}/regenerate-tickets`).expect(200);
    expect(ok.body.data).toEqual({ regenerated: 0, failed: 0 }); // nothing was missing
    await finance.post(`/admin/events/${main.id}/bookings/${bk.id}/regenerate-tickets`).expect(403);
  });

  it('admin booking detail: guests, tickets, attempts and ledger; list supports search/filters', async () => {
    const b = await book(main, [guest('Det', { fullName: 'Detail Guest' })]);
    await payFor(b);
    const bk = await dbBooking(b);
    const d = (await admin.get(`/admin/events/${main.id}/bookings/${bk.id}`).expect(200)).body.data;
    expect(d).toMatchObject({ publicReference: b.reference, bookingStatus: 'CONFIRMED', paymentStatus: 'PAID', totalAmount: '750.00', classification: 'EVENT_TICKET_PAYMENT' });
    expect(d.guests[0]).toMatchObject({ fullName: 'Detail Guest', ticket: { status: 'ISSUED', hasPdf: true } });
    expect(d.transactions[0]).toMatchObject({ type: 'CAPTURE', classification: 'EVENT_TICKET_PAYMENT' });
    expect(JSON.stringify(d)).not.toMatch(/accessTokenHash|idempotency|qrTokenHash|pdfStorageKey/);
    const list = (await admin.get(`/admin/events/${main.id}/bookings?includeTest=true&paymentStatus=PAID&search=${b.reference}`).expect(200)).body;
    expect(list.meta.total).toBe(1);
    expect(list.data[0].publicReference).toBe(b.reference);
    await admin.get(`/admin/events/${main.id}/bookings?bookingStatus=BOGUS`).expect(400);
    const updated = await admin.patch(`/admin/events/${main.id}/bookings/${bk.id}`, { purchaserPhone: '+1 212 555 0000', guests: [{ id: d.guests[0].id, dietaryRequirements: 'Vegetarian' }] }).expect(200);
    expect(updated.body.data.guests[0].dietaryRequirements).toBe('Vegetarian');
    const logs = await audit('gala.booking.update', bk.id);
    expect(logs[0].metadata).toMatchObject({ fields: expect.arrayContaining(['purchaserPhone', 'guest.dietaryRequirements']) });
    expect(JSON.stringify(logs[0].metadata)).not.toContain('Vegetarian'); // audit stores field names, not personal data
    await admin.patch(`/admin/events/${main.id}/bookings/${bk.id}`, { guests: [{ id: 'not-a-guest-of-this-booking', fullName: 'Hacker Name' }] }).expect(400);
  });
});
