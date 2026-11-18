import { randomUUID } from 'node:crypto';
import { MockPaymentProvider } from '../src/modules/donations/payments/mock-payment.provider';
import { GalaJobsService } from '../src/modules/gala/gala-jobs.service';
import { MAIL_TRANSPORT, type MemoryMailTransport } from '../src/modules/gala/mail-transport';
import { TicketPdfService } from '../src/modules/gala/ticket-pdf.service';
import { API, createTestApp, loginAs, uid, type Session, type TestContext } from './helpers';

jest.setTimeout(120_000);

const SECRET = () => process.env.MOCK_PAYMENT_WEBHOOK_SECRET!;
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

/**
 * Phase 7 — one booking walked through every connected module (test database, MOCK provider — never a real payment):
 * public booking → checkout (return URL proves nothing) → verified webhook → confirmed booking → tickets + PDFs → e-mail jobs
 * (memory transport) → purchaser status/PDF → door scan (valid, duplicate) → attendance + history + admin jobs →
 * refund event → tickets refunded → scan refused. Ticket money never touches the donation tables.
 */
describe('Phase 7 — Gala end-to-end integration across modules', () => {
  let ctx: TestContext;
  let admin: Session;
  let staff: Session;
  let finance: Session;
  let mail: MemoryMailTransport;
  const tokens = new Map<string, string>();

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await loginAs(ctx, ['ADMINISTRATOR']);
    staff = await loginAs(ctx, ['EVENT_CHECKIN_STAFF']);
    finance = await loginAs(ctx, ['FINANCE_MANAGER']);
    mail = ctx.app.get(MAIL_TRANSPORT) as MemoryMailTransport;
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

  it('booking → verified payment → tickets → e-mail → check-in → attendance → refund', async () => {
    // fixture event (isolated, never Gala Night)
    const id = uid();
    const page = await ctx.prisma.page.create({ data: { slug: `event-t7-${id}`, titleEn: 'T7', status: 'PUBLISHED' } });
    const ev = await ctx.prisma.event.create({ data: { code: `EVT-T7-${id}`, slug: `t7-${id}`, titleEn: `Integration Gala ${id}`, status: 'PUBLISHED', approvedAt: new Date(), pageId: page.id } });
    await ctx.prisma.eventTicketConfig.create({ data: { eventId: ev.id, ticketPrice: '750.00', currency: 'USD', salesEnabled: true, displayNameEn: 'Every Light Counts', eventDateLabelEn: 'Saturday, December 12, 2026', venueLabelEn: '583 Park Avenue, New York, USA' } });
    const donationsBefore = await ctx.prisma.donation.count();
    const donationTxBefore = await ctx.prisma.paymentTransaction.count();

    // 1. public availability + booking (server-priced, idempotent)
    const info = (await ctx.http().get(`${API}/public/events/${ev.slug}/ticketing`).expect(200)).body.data;
    expect(info).toMatchObject({ salesOpen: true, checkoutAvailable: true, ticket: { price: '750.00', currency: 'USD', tablesAvailable: false } });
    expect(info.calendar.available).toBe(false); // no approved time + zone → no calendar link
    const body = {
      purchaser: { fullName: 'Amira Hassan', email: `buyer-${uid()}@example.org`, phone: '+1 212 555 0199' },
      guests: [
        { fullName: 'Layla Mansour', email: `l-${uid()}@example.org`, phone: '+1 212 555 0100', dietaryRequirements: 'Vegetarian' },
        { fullName: 'محمد عبد الرحمن', email: `m-${uid()}@example.org`, phone: '+1 212 555 0101', dietaryRequirements: 'None' },
      ],
      privacyConsent: true,
    };
    const key = `k-${randomUUID()}`;
    const created = (await ctx.http().post(`${API}/public/events/${ev.slug}/bookings`).set('X-Forwarded-For', ip()).set('Idempotency-Key', key).send(body).expect(201)).body.data;
    const replay = (await ctx.http().post(`${API}/public/events/${ev.slug}/bookings`).set('X-Forwarded-For', ip()).set('Idempotency-Key', key).send(body).expect(201)).body.data;
    expect(replay.reference).toBe(created.reference);
    expect(created.totalAmount).toBe('1500.00');
    await ctx.http().post(`${API}/public/events/${ev.slug}/bookings`).set('X-Forwarded-For', ip()).set('Idempotency-Key', `k-${randomUUID()}`).send({ ...body, totalAmount: '1.00' }).expect(400); // no client price

    // 2. checkout; the return URL / status poll alone never confirms
    const checkout = (await ctx.http().post(`${API}/public/bookings/${created.reference}/checkout`).set('X-Forwarded-For', ip()).set('X-Booking-Token', created.accessToken).expect(200)).body.data;
    const pending = (await ctx.http().get(`${API}/public/bookings/${created.reference}/confirmation`).set('X-Booking-Token', created.accessToken).expect(200)).body.data;
    expect(pending.confirmed).toBe(false);
    await ctx.http().get(`${API}/public/bookings/${created.reference}/status`).set('X-Booking-Token', 'wrong-token').expect(404); // cross-user access refused

    // 3. verified provider event (signed) → confirmed + tickets issued + PDFs; duplicate delivery is idempotent
    const attempt = await ctx.prisma.eventBookingPaymentAttempt.findUniqueOrThrow({ where: { reference: checkout.attemptReference } });
    const h = MockPaymentProvider.sign(SECRET(), { id: `evt_${uid()}${uid()}`, created: Math.floor(Date.now() / 1000), type: 'payment.succeeded', attemptReference: attempt.reference, sessionRef: attempt.providerSessionRef, paymentRef: `mock_pay_${uid()}`, amount: '1500.00', currency: 'USD' });
    const send = () => ctx.http().post(`${API}/webhooks/mock`).set('Content-Type', 'application/json').set(h.header, h.signature).send(h.body);
    await send().expect(200);
    expect((await send().expect(200)).body.data.duplicate).toBe(true);
    const unsigned = await ctx.http().post(`${API}/webhooks/mock`).set('Content-Type', 'application/json').set(h.header, 'bad').send(h.body);
    expect(unsigned.status).toBeGreaterThanOrEqual(400);
    await ctx.app.get(GalaJobsService).runDue({ limit: 50 });
    const booking = await ctx.prisma.eventBooking.findUniqueOrThrow({ where: { publicReference: created.reference }, include: { tickets: true, transactions: true, jobs: true } });
    expect(booking).toMatchObject({ bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' });
    expect(booking.tickets).toHaveLength(2);
    expect(new Set(booking.tickets.map((t) => t.ticketNumber)).size).toBe(2);
    expect(new Set(booking.tickets.map((t) => t.qrTokenHash)).size).toBe(2);
    expect(booking.tickets.every((t) => t.status === 'ISSUED' && t.pdfStorageKey)).toBe(true);
    expect(booking.transactions.filter((t) => t.type === 'CAPTURE')).toHaveLength(1);
    expect(booking.transactions.every((t) => t.classification === 'EVENT_TICKET_PAYMENT')).toBe(true);

    // 4. e-mail jobs delivered through the (test) transport: confirmation link carries the token only in the fragment
    const sent = mail.sent.filter((m) => m.text.includes(created.reference));
    const confirmation = sent.find((m) => m.to === body.purchaser.email);
    expect(confirmation?.text).toContain(`#token=`);
    expect(confirmation?.text).not.toMatch(/[?&]token=/);
    expect(sent.filter((m) => m.attachments.length === 1)).toHaveLength(2); // one ticket e-mail (with its own PDF) per guest
    expect(booking.jobs.every((j) => j.status === 'DONE')).toBe(true);
    expect(JSON.stringify(booking.jobs)).not.toMatch(/mkt_|@example\.org/); // nothing private in job rows

    // 5. purchaser view + PDF with the token only
    const st = (await ctx.http().get(`${API}/public/bookings/${created.reference}/status`).set('X-Booking-Token', created.accessToken).expect(200)).body.data;
    expect(st.confirmed).toBe(true);
    const tk = booking.tickets[0];
    await ctx.http().get(`${API}/public/bookings/${created.reference}/tickets/${tk.ticketNumber}/pdf`).set('X-Booking-Token', created.accessToken).expect(200);
    await ctx.http().get(`${API}/public/bookings/${created.reference}/tickets/${tk.ticketNumber}/pdf`).expect(404);

    // 6. door: scan → VALID, rescan → ALREADY_CHECKED_IN (one attendance), concurrency: 5 parallel scans of the second ticket → one VALID
    const scan = (token: string) => staff.post(`/admin/events/${ev.id}/check-in/validate`, { token });
    expect((await scan(tokens.get(tk.ticketNumber)!).expect(200)).body.data.result).toBe('VALID');
    expect((await scan(tokens.get(tk.ticketNumber)!).expect(200)).body.data.result).toBe('ALREADY_CHECKED_IN');
    const second = booking.tickets[1];
    const burst = await Promise.all(Array.from({ length: 5 }, () => scan(tokens.get(second.ticketNumber)!)));
    expect(burst.map((r) => r.body.data.result).filter((r) => r === 'VALID')).toHaveLength(1);
    const stats = (await staff.get(`/admin/events/${ev.id}/check-in/statistics`).expect(200)).body.data;
    expect(stats).toMatchObject({ validTickets: 2, checkedIn: 2, remaining: 0, percentCheckedIn: 100 });
    const history = (await staff.get(`/admin/events/${ev.id}/check-in/history?pageSize=50`).expect(200)).body.data as { kind: string }[];
    expect(history.filter((x) => x.kind === 'checked_in')).toHaveLength(2);

    // 7. admin views agree: financials (ticket class only, test included), jobs, guests export permission split
    const fin = (await finance.get(`/admin/events/${ev.id}/financials?includeTest=true`).expect(200)).body.data;
    expect(fin).toMatchObject({ classification: 'EVENT_TICKET_PAYMENT', grossCaptured: '1500.00', net: '1500.00', taxTreatment: { taxDeductibleAmount: null } });
    expect(fin.ticketsByStatus.CHECKED_IN).toBe(2);
    const jobs = (await admin.get(`/admin/events/${ev.id}/jobs?pageSize=50`).expect(200)).body.data;
    expect(jobs.items.length).toBe(booking.jobs.length);
    await finance.get(`/admin/events/${ev.id}/guests/export`).expect(403);
    await staff.get(`/admin/events/${ev.id}/bookings`).expect(403);

    // 8. refund event (checked-in tickets are kept as history; the money state follows the verified event)
    const r = MockPaymentProvider.sign(SECRET(), { id: `evt_${uid()}${uid()}`, created: Math.floor(Date.now() / 1000), type: 'refund.succeeded', attemptReference: attempt.reference, providerRefundRef: `mock_re_${uid()}`, amount: '1500.00', currency: 'USD' });
    await ctx.http().post(`${API}/webhooks/mock`).set('Content-Type', 'application/json').set(r.header, r.signature).send(r.body).expect(200);
    const after = await ctx.prisma.eventBooking.findUniqueOrThrow({ where: { id: booking.id }, include: { transactions: true } });
    expect(after.paymentStatus).toBe('REFUNDED');
    expect(after.transactions.map((t) => t.type).sort()).toEqual(['CAPTURE', 'REFUND']);
    const fin2 = (await finance.get(`/admin/events/${ev.id}/financials?includeTest=true`).expect(200)).body.data;
    expect(fin2).toMatchObject({ grossCaptured: '1500.00', refunded: '1500.00', net: '0.00' });

    // 9. financial separation: no donation or donation-payment record was created by any of this
    expect(await ctx.prisma.donation.count()).toBe(donationsBefore);
    expect(await ctx.prisma.paymentTransaction.count()).toBe(donationTxBefore);
  });
});
