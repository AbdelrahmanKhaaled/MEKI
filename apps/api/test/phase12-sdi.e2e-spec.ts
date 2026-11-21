import { restoreSdiEnv, SDI_GALA_FORM } from './sdi-env';
import ExcelJS from 'exceljs';
import { API, createTestApp, loginAs, uid, type Session, type TestContext } from './helpers';
import { BookingPaymentsService } from '../src/modules/gala/booking-payments.service';
import { validateSdiHostedConfig, type EnvironmentVariables } from '../src/config/env.validation';
import { missingBusinessDays } from '../src/modules/sdi/sdi-reports.service';
import { normaliseReference, parseAmount, parseCsv, parseDate } from '../src/modules/sdi/sdi-report.parser';

/**
 * Phase 12 — SDI hosted forms, Zeffy ticket ownership, SDI report import + reconciliation.
 * Every report in this file is a SYNTHETIC FIXTURE (isSynthetic=true, "SYNTHETIC" in the file name). SDI has not supplied a real
 * sample; nothing here claims to validate SDI's real format. Runs against the *_test database; nothing is deleted.
 */
describe('Phase 12 — SDI hosted Gala booking, ticket ownership and report reconciliation', () => {
  let ctx: TestContext;
  let finance: Session; // uploader (sdi.reports.upload)
  let admin: Session; // approver (sdi.reports.approve)
  let staff: Session;
  let slug: string;
  let eventId: string;
  const tag = uid();
  const HEADERS = 'Order ID,MEKI Booking Reference,Ticket Type,Quantity,Amount,Refunded,Currency,Status,Date';
  const MAPPING = {
    orderId: 'Order ID', bookingReference: 'MEKI Booking Reference', ticketType: 'Ticket Type', quantity: 'Quantity', amount: 'Amount', refundedAmount: 'Refunded',
    currency: 'Currency', status: 'Status', date: 'Date', dateFormat: 'ISO',
    statusMap: { succeeded: 'COMPLETED', pending: 'PENDING', cancelled: 'CANCELLED', refunded: 'REFUNDED', 'partially refunded': 'PARTIALLY_REFUNDED', failed: 'FAILED' },
    donationTicketTypes: ['Donation'],
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    finance = await loginAs(ctx, ['FINANCE_MANAGER']);
    admin = await loginAs(ctx, ['ADMINISTRATOR']);
    staff = await loginAs(ctx, ['EVENT_CHECKIN_STAFF']);
    const page = await ctx.prisma.page.create({ data: { slug: `event-p12-${tag}`, titleEn: 'P12', status: 'PUBLISHED' } });
    const ev = await ctx.prisma.event.create({ data: { code: `EVT-P12-${tag}`.toUpperCase(), slug: `p12-${tag}`, titleEn: `P12 Gala ${tag}`, status: 'PUBLISHED', approvedAt: new Date(), pageId: page.id } });
    await ctx.prisma.eventTicketConfig.create({ data: { eventId: ev.id, ticketPrice: '750.00', currency: 'USD', salesEnabled: true, maxTicketsPerBooking: 10, displayNameEn: 'Every Light Counts', eventDateLabelEn: 'Saturday, December 12, 2026', venueLabelEn: '583 Park Avenue' } });
    slug = ev.slug;
    eventId = ev.id;
  });
  afterAll(async () => {
    await ctx.app.close();
    restoreSdiEnv();
  });

  const hosted = (n: number, key = uid() + uid() + uid()) =>
    ctx.http().post(`${API}/public/events/${slug}/hosted-bookings`).set('Idempotency-Key', key).send({ purchaser: { fullName: 'Amira Hassan', email: `buyer-${key.slice(0, 12).toLowerCase()}@example.org` }, ticketCount: n, privacyConsent: true });
  const book = async (n: number) => (await hosted(n).expect(201)).body.data as { reference: string; accessToken: string; totalAmount: string };
  const csv = (rows: string[]) => Buffer.from([HEADERS, ...rows].join('\r\n'), 'utf8');
  const upload = (who: Session, buf: Buffer, name: string, kind = 'RECONCILIATION', synthetic = true) =>
    who.post('/admin/sdi/reports').field('kind', kind).field('isSynthetic', String(synthetic)).attach('file', buf, { filename: name, contentType: name.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv' });
  const importCsv = async (rows: string[]) => {
    const up = await upload(finance, csv(rows), `SYNTHETIC-fixture-${uid()}.csv`).expect(201);
    const pv = await finance.post(`/admin/sdi/reports/${up.body.data.id}/preview`, { mapping: MAPPING }).expect(200);
    const rowsRes = await finance.get(`/admin/sdi/reports/${up.body.data.id}/rows?pageSize=100`).expect(200);
    return { id: up.body.data.id as string, summary: pv.body.data.summary, rows: rowsRes.body.data as { rowNumber: number; matchStatus: string; matchNote: string | null; sourceOrderId: string }[] };
  };
  const statusOf = (rows: { rowNumber: number; matchStatus: string }[], rowNumber: number) => rows.find((r) => r.rowNumber === rowNumber)?.matchStatus;
  const booking = (reference: string) => ctx.prisma.eventBooking.findUniqueOrThrow({ where: { publicReference: reference }, include: { tickets: true, jobs: true, transactions: true } });

  it('ticketing info advertises the hosted SDI form (no MEKI checkout); legacy guest booking and MEKI checkout are refused', async () => {
    const info = (await ctx.http().get(`${API}/public/events/${slug}/ticketing`).expect(200)).body.data;
    expect(info.mode).toBe('zeffy_hosted');
    expect(info.checkoutAvailable).toBe(false);
    expect(info.hosted).toMatchObject({ available: true, formUrl: SDI_GALA_FORM, referenceQuestion: 'MEKI Booking Reference', ticketsIssuedBy: 'ZEFFY', referencePrefill: false });
    const legacy = await ctx.http().post(`${API}/public/events/${slug}/bookings`).set('Idempotency-Key', uid() + uid() + uid()).send({ purchaser: { fullName: 'A B', email: 'a@example.org', phone: '+1 212 555 0100' }, guests: [{ fullName: 'A B', email: 'a@example.org', phone: '+1 212 555 0100', dietaryRequirements: 'None', isPurchaser: true }], privacyConsent: true });
    expect(legacy.body.error.code).toBe('HOSTED_BOOKING_REQUIRED');
  });

  it('hosted booking: reference only (no guests, no MEKI tickets), Zeffy-owned, idempotent, never paid by a redirect', async () => {
    const key = uid() + uid() + uid();
    const first = (await hosted(2, key).expect(201)).body.data;
    expect(first).toMatchObject({ ticketCount: 2, totalAmount: '1500.00', bookingStatus: 'PENDING', paymentStatus: 'UNPAID' });
    expect(first.reference).toMatch(/^EB-[0-9A-Z]{12}$/);
    expect(first.hosted.formUrl).toBe(SDI_GALA_FORM);
    const replay = (await hosted(2, key).expect(201)).body.data;
    expect(replay.reference).toBe(first.reference);
    expect((await hosted(3, key).expect(409)).body.error.code).toBe('IDEMPOTENCY_KEY_REUSED'); // same key, different data
    const b = await booking(first.reference);
    expect(b).toMatchObject({ ticketIssuer: 'ZEFFY', purchaserPhone: '', isTest: true });
    expect(b.tickets).toHaveLength(0);
    expect(await ctx.prisma.eventBookingGuest.count({ where: { bookingId: b.id } })).toBe(0);
    const checkout = await ctx.http().post(`${API}/public/bookings/${first.reference}/checkout`).set('X-Booking-Token', first.accessToken);
    expect(checkout.body.error.code).toBe('PAYMENT_ON_HOSTED_FORM');
    const status = (await ctx.http().get(`${API}/public/bookings/${first.reference}/status`).set('X-Booking-Token', first.accessToken).expect(200)).body.data;
    expect(status).toMatchObject({ confirmed: false, message: 'awaiting_sdi_report', ticketIssuer: 'ZEFFY', tickets: [] });
    // a client price / guest list is rejected (whitelist), quantity over the limit is refused
    await ctx.http().post(`${API}/public/events/${slug}/hosted-bookings`).set('Idempotency-Key', uid() + uid() + uid()).send({ purchaser: { fullName: 'A', email: 'a@example.org' }, ticketCount: 1, privacyConsent: true, totalAmount: '1.00' }).expect(400);
    expect((await hosted(11)).body.error.code).toBe('TOO_MANY_TICKETS');
  });

  it('upload security: permissions, file type, malformed CSV, formulas in XLSX, size limit, duplicate file', async () => {
    expect((await upload(staff, csv([]), 'SYNTHETIC-a.csv')).status).toBe(403);
    expect((await upload(finance, Buffer.from('x'), 'SYNTHETIC-a.txt')).body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
    expect((await upload(finance, Buffer.from(`${HEADERS}\r\n"unterminated,1`), 'SYNTHETIC-bad.csv')).body.error.code).toBe('CSV_UNTERMINATED_QUOTE');
    expect((await upload(finance, Buffer.from('A,a\r\n1,2'), 'SYNTHETIC-dup-header.csv')).body.error.code).toBe('HEADER_DUPLICATE');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Report');
    ws.addRow(['Order ID', 'Amount']);
    ws.addRow(['O-1', { formula: 'HYPERLINK("http://evil.example","x")' }]);
    const xlsx = Buffer.from(await wb.xlsx.writeBuffer());
    expect((await upload(finance, xlsx, 'SYNTHETIC-formula.xlsx')).body.error.code).toBe('XLSX_FORMULA');
    const big = Buffer.alloc(5 * 1024 * 1024 + 10, 'a');
    expect([413, 422]).toContain((await upload(finance, big, 'SYNTHETIC-big.csv')).status);
    const file = csv([`DUP-${tag},,General admission,1,750.00,0,USD,succeeded,2026-11-18`]);
    await upload(finance, file, 'SYNTHETIC-once.csv').expect(201);
    expect((await upload(finance, file, 'SYNTHETIC-again.csv').expect(409)).body.error.code).toBe('DUPLICATE_FILE');
  });

  it('valid XLSX is read as values (dates, numbers) and previewed', async () => {
    const b = await book(1);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Report');
    ws.addRow(HEADERS.split(','));
    ws.addRow([`XL-${tag}`, b.reference, 'General admission', 1, '750.00', '0', 'USD', 'succeeded', new Date(Date.UTC(2026, 10, 18))]);
    const up = await upload(finance, Buffer.from(await wb.xlsx.writeBuffer()), `SYNTHETIC-${tag}.xlsx`).expect(201);
    expect(up.body.data.fileType).toBe('xlsx');
    const pv = await finance.post(`/admin/sdi/reports/${up.body.data.id}/preview`, { mapping: MAPPING }).expect(200);
    expect(pv.body.data.summary).toEqual({ MATCHED: 1 });
  });

  it('preview classifies every row and changes NOTHING; apply needs a second administrator and confirms without MEKI tickets', async () => {
    const a = await book(2); // valid
    const q = await book(2); // paid quantity differs (3)
    const amb = await book(1); // two orders claim it
    const mis = await book(1); // amount mismatch
    const r = await importCsv([
      `ORD-A-${tag},${a.reference},General admission,2,1500.00,0,USD,succeeded,2026-11-18T10:00`,
      `ORD-B-${tag},EB-XXXX,General admission,1,750.00,0,USD,succeeded,2026-11-18`, // mistyped
      `ORD-C-${tag},EB-ABCDEFGHJKMN,General admission,1,750.00,0,USD,succeeded,2026-11-18`, // valid format, unknown
      `ORD-D-${tag},,General admission,1,750.00,0,USD,succeeded,2026-11-18`, // missing reference
      `ORD-E-${tag},${mis.reference},General admission,1,700.00,0,USD,succeeded,2026-11-18`, // amount mismatch
      `ORD-F-${tag},${q.reference},General admission,3,2250.00,0,USD,succeeded,2026-11-18`, // quantity differs
      `ORD-G1-${tag},${amb.reference},General admission,1,750.00,0,USD,succeeded,2026-11-18`,
      `ORD-G2-${tag},${amb.reference},General admission,1,750.00,0,USD,succeeded,2026-11-18`,
      `ORD-H-${tag},${a.reference},=HYPERLINK("x"),1,750.00,0,USD,succeeded,2026-11-18`, // formula-like text
      `ORD-I-${tag},${a.reference},General admission,1,750.00,0,USD,succeeded,2026-02-30`, // invalid date
      `ORD-J-${tag},${a.reference},General admission,1,750.00,0,EUR,succeeded,2026-11-18`, // wrong currency
      `ORD-K-${tag},${a.reference},General admission,1,750.00,0,USD,Mystery,2026-11-18`, // unknown status
      `ORD-L-${tag},${a.reference},Donation,,100.00,0,USD,succeeded,2026-11-18`, // gala donation line
      `ORD-M-${tag},${a.reference},General admission,1,"1,000.5x",0,USD,succeeded,2026-11-18`, // bad amount
      `ORD-A-${tag},${a.reference},General admission,2,1500.00,0,USD,succeeded,2026-11-18T10:00`, // identical duplicate
    ]);
    const s = (n: number) => statusOf(r.rows, n);
    // row 2 and row 16 are the same order in the same state: the earlier one is the duplicate, the last one is authoritative
    expect([s(2), s(3), s(4), s(5), s(6), s(7)]).toEqual(['DUPLICATE_ROW', 'INVALID_REFERENCE', 'UNMATCHED', 'UNMATCHED', 'AMOUNT_MISMATCH', 'MATCHED']);
    expect([s(8), s(9)]).toEqual(['AMBIGUOUS', 'AMBIGUOUS']);
    expect([s(10), s(11), s(12), s(13), s(14), s(15)]).toEqual(['INVALID', 'INVALID', 'INVALID', 'REQUIRES_REVIEW', 'REQUIRES_REVIEW', 'INVALID']);
    expect(s(16)).toBe('MATCHED');
    expect(r.rows.find((x) => x.rowNumber === 7)?.matchNote).toMatch(/Paid quantity 3 differs/);
    // preview changed nothing
    expect((await booking(a.reference)).bookingStatus).toBe('PENDING');
    // four eyes
    expect((await finance.post(`/admin/sdi/reports/${r.id}/apply`).expect(403)).body.error.code).toBeDefined();
    const donationsBefore = await ctx.prisma.donation.count();
    await admin.post(`/admin/sdi/reports/${r.id}/apply`).expect(200);
    const ba = await booking(a.reference);
    expect(ba).toMatchObject({ bookingStatus: 'CONFIRMED', paymentStatus: 'PAID', reportedTicketCount: 2 });
    expect(ba.tickets).toHaveLength(0); // Zeffy owns the tickets: no MEKI ticket, PDF or QR
    expect(ba.jobs).toHaveLength(0); // no MEKI e-mail / PDF jobs
    expect(ba.transactions.filter((t) => t.type === 'CAPTURE')).toHaveLength(1);
    expect(ba.transactions[0]).toMatchObject({ provider: 'sdi_report', classification: 'EVENT_TICKET_PAYMENT', isTest: true });
    const bq = await booking(q.reference);
    expect(bq).toMatchObject({ guestCount: 3, reportedTicketCount: 3, paymentStatus: 'PAID' });
    expect(bq.totalAmount.toFixed(2)).toBe('2250.00');
    for (const ref of [amb.reference, mis.reference]) expect((await booking(ref)).paymentStatus).toBe('UNPAID');
    expect(await ctx.prisma.donation.count()).toBe(donationsBefore); // ticket money never becomes a donation
    // MEKI ticket actions are refused for a Zeffy-owned booking
    expect((await admin.post(`/admin/events/${eventId}/bookings/${ba.id}/regenerate-tickets`).expect(409)).body.error.code).toBe('TICKETS_OWNED_BY_ZEFFY');
    expect((await admin.post(`/admin/events/${eventId}/bookings/${ba.id}/resend`)).body.error.code).toBe('TICKETS_OWNED_BY_ZEFFY');
    const detail = (await admin.get(`/admin/events/${eventId}/bookings/${ba.id}`).expect(200)).body.data;
    expect(detail.ticketIssuer).toBe('ZEFFY');
    expect(detail.sdi.orders[0]).toMatchObject({ orderId: `ORD-A-${tag}`, status: 'COMPLETED', linked: true });
    // public status: confirmed by SDI, no MEKI tickets offered
    const st = (await ctx.http().get(`${API}/public/bookings/${a.reference}/status`).set('X-Booking-Token', a.accessToken).expect(200)).body.data;
    expect(st).toMatchObject({ confirmed: true, message: 'confirmed_by_sdi', tickets: [] });
  });

  it('later reports: identical state is a no-op, partial then full refund are ledgered once, older rows are stale, cancellations close pending bookings', async () => {
    const b = await book(2);
    const c = await book(1);
    const order = `ORD-R-${tag}`;
    const first = await importCsv([`${order},${b.reference},General admission,2,1500.00,0,USD,succeeded,2026-11-18T09:00`]);
    await admin.post(`/admin/sdi/reports/${first.id}/apply`).expect(200);
    const same = await importCsv([`${order},${b.reference},General admission,2,1500.00,0,USD,succeeded,2026-11-18T09:00 `, `CANCEL-${tag},${c.reference},General admission,1,750.00,0,USD,cancelled,2026-11-18`]);
    expect(statusOf(same.rows, 2)).toBe('ALREADY_APPLIED');
    await admin.post(`/admin/sdi/reports/${same.id}/apply`).expect(200);
    expect((await booking(c.reference)).bookingStatus).toBe('CANCELLED');
    const partial = await importCsv([`${order},${b.reference},General admission,2,1500.00,750.00,USD,partially refunded,2026-11-19T09:00`]);
    await admin.post(`/admin/sdi/reports/${partial.id}/apply`).expect(200);
    let bb = await booking(b.reference);
    expect(bb).toMatchObject({ paymentStatus: 'PAID', bookingStatus: 'CONFIRMED' });
    expect(bb.refundedAmount.toFixed(2)).toBe('750.00');
    const stale = await importCsv([`${order},${b.reference},General admission,2,1500.00,0,USD,succeeded,2026-11-17T09:00`]);
    expect(statusOf(stale.rows, 2)).toBe('STALE');
    const full = await importCsv([`${order},${b.reference},General admission,2,1500.00,1500.00,USD,refunded,2026-11-20T09:00`]);
    await admin.post(`/admin/sdi/reports/${full.id}/apply`).expect(200);
    bb = await booking(b.reference);
    expect(bb).toMatchObject({ paymentStatus: 'REFUNDED', bookingStatus: 'REFUNDED' });
    const refunds = bb.transactions.filter((t) => t.type === 'REFUND').map((t) => t.amount.toFixed(2));
    expect(refunds).toEqual(['750.00', '750.00']); // only the new amount each time; history kept
    expect(bb.transactions.filter((t) => t.type === 'CAPTURE')).toHaveLength(1);
    expect(bb.jobs).toHaveLength(0);
    // a different order claiming an already-reconciled booking is ambiguous
    const other = await importCsv([`ORD-OTHER-${tag},${b.reference},General admission,2,1500.00,0,USD,succeeded,2026-11-21`]);
    expect(statusOf(other.rows, 2)).toBe('AMBIGUOUS');
  });

  it('apply is all-or-nothing: a failure in any row rolls back every row (the import stays PREVIEWED)', async () => {
    const x = await book(1);
    const y = await book(1);
    const r = await importCsv([`RB1-${tag},${x.reference},General admission,1,750.00,0,USD,succeeded,2026-11-18T01:00`, `RB2-${tag},${y.reference},General admission,1,750.00,0,USD,succeeded,2026-11-18T02:00`]);
    const svc = ctx.app.get(BookingPaymentsService);
    const real = svc.handle.bind(svc);
    let calls = 0;
    const spy = jest.spyOn(svc, 'handle').mockImplementation(async (tx, row, e) => (++calls === 2 ? { status: 'FAILED', note: 'simulated failure' } : real(tx, row, e)));
    const res = await admin.post(`/admin/sdi/reports/${r.id}/apply`);
    spy.mockRestore();
    expect(res.body.error.code).toBe('APPLY_ROLLED_BACK');
    expect((await booking(x.reference)).paymentStatus).toBe('UNPAID');
    expect((await ctx.prisma.providerReportImport.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('PREVIEWED');
    await admin.post(`/admin/sdi/reports/${r.id}/apply`).expect(200); // succeeds once the cause is gone
    expect((await booking(x.reference)).paymentStatus).toBe('PAID');
  });

  it('mapping profiles: real (non-synthetic) reports apply only with a profile verified by a second administrator', async () => {
    const b = await book(1);
    const up = await upload(finance, csv([`REAL-${tag},${b.reference},General admission,1,750.00,0,USD,succeeded,2026-11-18`]), `report-${tag}.csv`, 'RECONCILIATION', false).expect(201);
    const profile = (await finance.post('/admin/sdi/mappings', { kind: 'RECONCILIATION', name: `P12 ${tag}`, mapping: MAPPING, headers: HEADERS.split(',') }).expect(201)).body.data;
    expect(profile.verifiedAgainstSample).toBe(false);
    await finance.post(`/admin/sdi/reports/${up.body.data.id}/preview`, { mappingProfileId: profile.id }).expect(200);
    expect((await admin.post(`/admin/sdi/reports/${up.body.data.id}/apply`)).body.error.code).toBe('MAPPING_NOT_VERIFIED');
    expect((await finance.post(`/admin/sdi/mappings/${profile.id}/verify`, { note: 'Checked against SDI sample 2026-11-20' })).status).toBe(403); // no permission
    const verified = (await admin.post(`/admin/sdi/mappings/${profile.id}/verify`, { note: 'Checked against SDI sample 2026-11-20' }).expect(200)).body.data;
    expect(verified.verifiedAgainstSample).toBe(true);
    await admin.post(`/admin/sdi/reports/${up.body.data.id}/apply`).expect(200);
    expect((await booking(b.reference)).paymentStatus).toBe('PAID');
    const changed = (await finance.put(`/admin/sdi/mappings/${profile.id}`, { kind: 'RECONCILIATION', name: `P12 ${tag}`, mapping: { ...MAPPING, dateFormat: 'MDY' }, headers: HEADERS.split(',') }).expect(200)).body.data;
    expect(changed.verifiedAgainstSample).toBe(false); // any change requires re-verification
    // export is formula-safe and contains no personal data
    const exp = await finance.get(`/admin/sdi/reports/${up.body.data.id}/export`).expect(200);
    expect(exp.text).toContain(`REAL-${tag}`);
    expect(exp.text).not.toMatch(/@example\.org/);
  });

  it('attendee list: stored only after approval, restricted to gala.guests.read, never creates MEKI tickets', async () => {
    const b = await book(1);
    const file = Buffer.from(`Guest Name,Ticket Type,Table,MEKI Booking Reference,Dietary\r\nLayla Mansour ${tag},General admission,T4,${b.reference},Vegetarian\r\nمحمد عبد الرحمن,General admission,T4,,None\r\n=cmd(),General admission,,,\r\n`);
    const up = await upload(finance, file, `SYNTHETIC-attendees-${tag}.csv`, 'ATTENDEES').expect(201);
    const pv = await finance.post(`/admin/sdi/reports/${up.body.data.id}/preview`, { mapping: { guestName: 'Guest Name', ticketType: 'Ticket Type', tableLabel: 'Table', bookingReference: 'MEKI Booking Reference', answers: ['Dietary'] } }).expect(200);
    expect(pv.body.data).toMatchObject({ acceptedCount: 2, rejectedCount: 1 });
    const before = (await admin.get('/admin/sdi/attendees?pageSize=100').expect(200)).body.data;
    expect(JSON.stringify(before)).not.toContain(`Layla Mansour ${tag}`);
    await admin.post(`/admin/sdi/reports/${up.body.data.id}/apply`).expect(200);
    const list = (await admin.get(`/admin/sdi/attendees?bookingReference=${b.reference}`).expect(200)).body;
    expect(list.data.import.isSynthetic).toBe(true);
    expect(list.data.items[0]).toMatchObject({ guestName: `Layla Mansour ${tag}`, tableLabel: 'T4', answers: { Dietary: 'Vegetarian' } });
    expect((await staff.get('/admin/sdi/attendees')).status).toBe(403);
    expect(await ctx.prisma.eventTicket.count({ where: { booking: { publicReference: b.reference } } })).toBe(0);
  });

  it('status exposes switches and backlog but no secrets; public hosted-forms never invent URLs', async () => {
    const st = (await finance.get('/admin/sdi/status').expect(200)).body.data;
    expect(st).toMatchObject({ mode: 'zeffy_hosted', galaHostedSalesEnabled: true, galaFormConfigured: true, generalGivingEnabled: false, programmeGivingEnabled: false });
    expect(JSON.stringify(st)).not.toMatch(/zeffy\.com|whsec|zk_/);
    const pub = (await ctx.http().get(`${API}/public/hosted-forms`).expect(200)).body.data;
    expect(pub.general).toEqual({ available: false, url: null });
    expect(pub.programmes.length).toBeGreaterThanOrEqual(9);
    expect(pub.programmes.every((p: { available: boolean; url: string | null; code: string }) => !p.available && p.url === null && /^PRG-/.test(p.code))).toBe(true);
  });

  it('configuration guards and parsers (unit)', () => {
    const base = { NODE_ENV: 'production', ZEFFY_GALA_AUTO_CONFIRM: false, GALA_HOSTED_SALES_ENABLED: false, SDI_GENERAL_GIVING_ENABLED: false, SDI_PROGRAMME_GIVING_ENABLED: false, SDI_PROGRAMME_DESIGNATION_CONFIRMED: false, SDI_BOOKING_REFERENCE_QUESTION: 'MEKI Booking Reference' } as unknown as EnvironmentVariables;
    const v = { ...base } as EnvironmentVariables;
    validateSdiHostedConfig(v);
    expect(v.GALA_TICKETING_MODE).toBe('zeffy_hosted'); // production default
    expect(() => validateSdiHostedConfig({ ...base, GALA_TICKETING_MODE: 'meki' } as EnvironmentVariables)).toThrow(/zeffy_hosted/);
    expect(() => validateSdiHostedConfig({ ...base, NODE_ENV: 'development', GALA_TICKETING_MODE: 'zeffy_hosted', ZEFFY_GALA_AUTO_CONFIRM: true } as EnvironmentVariables)).toThrow(/conflicts/);
    expect(() => validateSdiHostedConfig({ ...base, GALA_HOSTED_SALES_ENABLED: true } as EnvironmentVariables)).toThrow(/ZEFFY_GALA_TICKET_FORM_URL/);
    expect(() => validateSdiHostedConfig({ ...base, SDI_PROGRAMME_GIVING_ENABLED: true } as EnvironmentVariables)).toThrow(/PROGRAMME_GIVING_AUTHORIZED/); // Phase 12B: separate agreement first
    expect(() => validateSdiHostedConfig({ ...base, SDI_PROGRAMME_GIVING_ENABLED: true, PROGRAMME_GIVING_AUTHORIZED: true } as EnvironmentVariables)).toThrow(/DESIGNATION_CONFIRMED/);
    expect(() => validateSdiHostedConfig({ ...base, SDI_PROGRAMME_FORM_URLS: '{"health":"https://evil.example/x"}' } as EnvironmentVariables)).toThrow(/zeffy/);
    expect(parseAmount('1,500.00')).toBe('1500.00');
    expect(parseAmount('$750')).toBe('750.00');
    for (const bad of ['-5', '1e3', '1.234', '1,50.00', '750,00', '']) expect(parseAmount(bad)).toBeNull();
    expect(parseDate('11/18/2026', 'MDY')?.toISOString()).toBe('2026-11-18T00:00:00.000Z');
    expect(parseDate('18/11/2026', 'DMY')?.toISOString()).toBe('2026-11-18T00:00:00.000Z');
    expect(parseDate('11/18/2026', 'ISO')).toBeNull();
    expect(normaliseReference(' eb-abcdefghjkmn ')).toBe('EB-ABCDEFGHJKMN');
    expect(normaliseReference('EBABCDEFGHJKMN')).toBe('EB-ABCDEFGHJKMN');
    expect(normaliseReference('EB-ABCDEFGHJKMO')).toBeNull(); // O is not in the alphabet — never "corrected"
    expect(parseCsv(Buffer.from('﻿A,B\r\n"x, ""y""",2\n')).rows).toEqual([['x, "y"', '2']]);
    expect(missingBusinessDays([{ from: new Date('2026-11-16'), to: new Date('2026-11-16') }, { from: new Date('2026-11-18'), to: new Date('2026-11-18') }], new Date('2026-11-20'))).toEqual(['2026-11-17', '2026-11-19']);
  });
});
