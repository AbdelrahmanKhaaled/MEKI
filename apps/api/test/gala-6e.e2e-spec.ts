import { randomUUID } from 'node:crypto';
import { MockPaymentProvider } from '../src/modules/donations/payments/mock-payment.provider';
import { TicketPdfService } from '../src/modules/gala/ticket-pdf.service';
import { API, createTestApp, loginAs, uid, type Session, type TestContext } from './helpers';

jest.setTimeout(90_000);

const SECRET = () => process.env.MOCK_PAYMENT_WEBHOOK_SECRET!;
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

/** Phase 6E: read-only operations endpoints (event resolver, jobs, door lookup, check-in history) + booking date filter. */
describe('Phase 6E — Gala operations read models', () => {
  let ctx: TestContext;
  let admin: Session;
  let finance: Session;
  let staff: Session;
  let content: Session;
  const tokens = new Map<string, string>();

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await loginAs(ctx, ['ADMINISTRATOR']);
    finance = await loginAs(ctx, ['FINANCE_MANAGER']);
    staff = await loginAs(ctx, ['EVENT_CHECKIN_STAFF']);
    content = await loginAs(ctx, ['CONTENT_MANAGER']);
    const pdf = ctx.app.get(TicketPdfService);
    const real = pdf.render.bind(pdf);
    jest.spyOn(pdf, 'render').mockImplementation(async (i) => {
      tokens.set(i.ticketNumber, i.qrToken);
      return real(i);
    });
    await admin.patch('/admin/payments/providers/mock', { isEnabled: true }).expect(200);
    await admin.patch('/admin/settings/donation', { paymentsEnabled: true }).expect(200);
  });
  afterAll(async () => {
    await admin.patch('/admin/settings/donation', { paymentsEnabled: false }).expect(200);
    await admin.patch('/admin/payments/providers/mock', { isEnabled: false }).expect(200);
    await ctx.app.close();
  });

  async function makeEvent() {
    const id = uid();
    const page = await ctx.prisma.page.create({ data: { slug: `event-t6e-${id}`, titleEn: 'T6E', status: 'PUBLISHED' } });
    const event = await ctx.prisma.event.create({ data: { code: `EVT-T6E-${id}`, slug: `t6e-${id}`, titleEn: `Ops Gala ${id}`, status: 'PUBLISHED', approvedAt: new Date(), pageId: page.id } });
    await ctx.prisma.eventTicketConfig.create({
      data: { eventId: event.id, ticketPrice: '750.00', currency: 'USD', salesEnabled: true, displayNameEn: 'Every Light Counts', eventDateLabelEn: 'Saturday, December 12, 2026', venueLabelEn: '583 Park Avenue, New York, USA' },
    });
    return event;
  }
  type Ev = Awaited<ReturnType<typeof makeEvent>>;
  const guest = (name: string) => ({ fullName: name, email: `g-${uid()}@example.org`, phone: '+1 212 555 0100', dietaryRequirements: 'Vegetarian' });
  async function bookAndPay(ev: Ev, names: string[]) {
    const b = { purchaser: { fullName: 'Amira Hassan', email: `buyer-${uid()}@example.org`, phone: '+1 212 555 0199' }, guests: names.map(guest), privacyConsent: true };
    const created = (await ctx.http().post(`${API}/public/events/${ev.slug}/bookings`).set('X-Forwarded-For', ip()).set('Idempotency-Key', `k-${randomUUID()}`).send(b).expect(201)).body.data as { reference: string; accessToken: string };
    const s = (await ctx.http().post(`${API}/public/bookings/${created.reference}/checkout`).set('X-Forwarded-For', ip()).set('X-Booking-Token', created.accessToken).expect(200)).body.data;
    const attempt = await ctx.prisma.eventBookingPaymentAttempt.findUniqueOrThrow({ where: { reference: s.attemptReference } });
    const h = MockPaymentProvider.sign(SECRET(), { id: `evt_${uid()}${uid()}`, created: Math.floor(Date.now() / 1000), type: 'payment.succeeded', attemptReference: attempt.reference, sessionRef: attempt.providerSessionRef, paymentRef: `mock_pay_${uid()}`, amount: attempt.amount.toString(), currency: attempt.currency });
    await ctx.http().post(`${API}/webhooks/mock`).set('Content-Type', 'application/json').set(h.header, h.signature).send(h.body).expect(200);
    return ctx.prisma.eventBooking.findUniqueOrThrow({ where: { publicReference: created.reference }, include: { tickets: { include: { guest: true }, orderBy: { createdAt: 'asc' } } } });
  }

  it('GET /admin/gala/events: any gala role (incl. door staff) finds ticketed events; nothing else is exposed', async () => {
    const ev = await makeEvent();
    for (const s of [admin, finance, staff, content]) {
      const rows = (await s.get('/admin/gala/events').expect(200)).body.data as { id: string; code: string }[];
      const row = rows.find((r) => r.id === ev.id);
      expect(row).toBeDefined();
      expect(Object.keys(row!).sort()).toEqual(['code', 'id', 'slug', 'startsAt', 'status', 'timezone', 'titleAr', 'titleEn'].sort());
    }
    await ctx.http().get(`${API}/admin/gala/events`).expect(401);
  });

  it('jobs: per-event list with booking reference + ticket number, status summary and transport; finance reads, door staff cannot', async () => {
    const ev = await makeEvent();
    const other = await makeEvent();
    const b = await bookAndPay(ev, ['Jobs One', 'Jobs Two']);
    await bookAndPay(other, ['Elsewhere Guest']);
    const res = (await admin.get(`/admin/events/${ev.id}/jobs?pageSize=100`).expect(200)).body.data as {
      items: { booking: { publicReference: string }; type: string; ticketNumber: string | null; lastError: string | null }[];
      meta: { total: number };
      summary: Record<string, number>;
      transport: { name: string; delivers: boolean };
    };
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.items.every((j) => j.booking.publicReference === b.publicReference)).toBe(true); // other event's jobs never leak in
    expect(res.items.filter((j) => j.type === 'TICKET_PDF').every((j) => j.ticketNumber && /^TK-/.test(j.ticketNumber))).toBe(true);
    expect(Object.values(res.summary).reduce((a, n) => a + n, 0)).toBe(res.meta.total);
    expect(res.transport.name).toBe('memory');
    expect(JSON.stringify(res)).not.toMatch(/@example\.org|mkt_|dedupeKey|lockedUntil/);
    const done = (await finance.get(`/admin/events/${ev.id}/jobs?status=DONE&type=TICKET_PDF`).expect(200)).body.data as { items: { status: string; type: string }[] };
    expect(done.items.every((j) => j.status === 'DONE' && j.type === 'TICKET_PDF')).toBe(true);
    await staff.get(`/admin/events/${ev.id}/jobs`).expect(403);
    await admin.get(`/admin/events/${ev.id}/jobs?status=BOGUS`).expect(400);
  });

  it('door lookup: ticket number or name, minimal fields, ≥ 3 chars, check-in permission only; does not check in', async () => {
    const ev = await makeEvent();
    const b = await bookAndPay(ev, ['Layla Mansour', 'Omar Said']);
    const t = b.tickets[0];
    const byNumber = (await staff.get(`/admin/events/${ev.id}/check-in/lookup?q=${t.ticketNumber.slice(3, 9).toLowerCase()}`).expect(200)).body.data as Record<string, unknown>[];
    expect(byNumber.map((r) => r.ticketNumber)).toContain(t.ticketNumber);
    expect(Object.keys(byNumber[0]).sort()).toEqual(['bookingConfirmed', 'checkedInAt', 'guestName', 'status', 'ticketId', 'ticketNumber']);
    const byName = (await staff.get(`/admin/events/${ev.id}/check-in/lookup?q=${encodeURIComponent('Omar')}`).expect(200)).body.data as { guestName: string; bookingConfirmed: boolean }[];
    expect(byName).toEqual([expect.objectContaining({ guestName: 'Omar Said', bookingConfirmed: true })]);
    await staff.get(`/admin/events/${ev.id}/check-in/lookup?q=ab`).expect(400);
    await content.get(`/admin/events/${ev.id}/check-in/lookup?q=Omar`).expect(403);
    expect((await ctx.prisma.eventTicket.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('ISSUED');
    // another event's guests are never returned
    const other = await makeEvent();
    expect((await staff.get(`/admin/events/${other.id}/check-in/lookup?q=Omar`).expect(200)).body.data).toEqual([]);
  });

  it('check-in history: valid scan, duplicate scan, bad token, manual + undo — per event, newest first, filterable', async () => {
    const ev = await makeEvent();
    const b = await bookAndPay(ev, ['Hana Adel', 'Karim Fouad']);
    const [t1, t2] = b.tickets;
    const token = tokens.get(t1.ticketNumber)!;
    expect((await staff.post(`/admin/events/${ev.id}/check-in/validate`, { token }).expect(200)).body.data.result).toBe('VALID');
    expect((await staff.post(`/admin/events/${ev.id}/check-in/validate`, { token }).expect(200)).body.data.result).toBe('ALREADY_CHECKED_IN');
    expect((await staff.post(`/admin/events/${ev.id}/check-in/validate`, { token: 'garbage' }).expect(200)).body.data.result).toBe('INVALID');
    await admin.post(`/admin/events/${ev.id}/tickets/${t2.id}/check-in`, {}).expect(200);
    await admin.post(`/admin/events/${ev.id}/tickets/${t2.id}/undo-check-in`, { reason: 'scanned the wrong guest' }).expect(200);
    // only one attendance record despite the duplicate scan
    expect((await ctx.prisma.eventTicket.findUniqueOrThrow({ where: { id: t1.id } })).status).toBe('CHECKED_IN');

    const h = (await staff.get(`/admin/events/${ev.id}/check-in/history?pageSize=50`).expect(200)).body;
    const items = h.data as { kind: string; result: string; ticketNumber: string | null; actorName: string | null; at: string }[];
    expect(items.map((i) => `${i.kind}:${i.result}`)).toEqual(['undo:UNDONE', 'manual:VALID', 'rejected:INVALID', 'rejected:ALREADY_CHECKED_IN', 'checked_in:VALID']);
    expect(items[4].ticketNumber).toBe(t1.ticketNumber);
    expect(items.every((i) => i.actorName)).toBe(true);
    expect(JSON.stringify(h)).not.toMatch(/mkt_|tokenHash|@/);
    const rejected = (await staff.get(`/admin/events/${ev.id}/check-in/history?kind=rejected`).expect(200)).body.data as { kind: string }[];
    expect(rejected.length).toBe(2);
    const other = await makeEvent();
    expect((await staff.get(`/admin/events/${other.id}/check-in/history`).expect(200)).body.data).toEqual([]);
    await finance.get(`/admin/events/${ev.id}/check-in/history`).expect(403);
  });

  it('bookings: date-range filter on the booking date', async () => {
    const ev = await makeEvent();
    const b = await bookAndPay(ev, ['Dated Guest']);
    const day = b.createdAt.toISOString();
    const inRange = (await admin.get(`/admin/events/${ev.id}/bookings?includeTest=true&from=${encodeURIComponent(new Date(Date.parse(day) - 60_000).toISOString())}&to=${encodeURIComponent(new Date(Date.parse(day) + 60_000).toISOString())}`).expect(200)).body.data as { publicReference: string }[];
    expect(inRange.map((x) => x.publicReference)).toEqual([b.publicReference]);
    const future = (await admin.get(`/admin/events/${ev.id}/bookings?includeTest=true&from=${encodeURIComponent(new Date(Date.now() + 86_400_000).toISOString())}`).expect(200)).body.data;
    expect(future).toEqual([]);
    await admin.get(`/admin/events/${ev.id}/bookings?from=yesterday`).expect(400);
  });
});
