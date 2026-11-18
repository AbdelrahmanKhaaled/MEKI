import { Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import { MockPaymentProvider } from '../src/modules/donations/payments/mock-payment.provider';
import { GalaJobsService } from '../src/modules/gala/gala-jobs.service';
import { MAIL_TRANSPORT, MemoryMailTransport, NoMailTransport, type MailTransport } from '../src/modules/gala/mail-transport';
import { GUEST_EXPORT_HEADER } from '../src/modules/gala/guests.service';
import { PRIVATE_STORAGE, type PrivateStoragePort } from '../src/modules/gala/ticket-storage';
import { TicketPdfService } from '../src/modules/gala/ticket-pdf.service';
import { API, createTestApp, loginAs, uid, type Session, type TestContext } from './helpers';

jest.setTimeout(90_000);

const SECRET = () => process.env.MOCK_PAYMENT_WEBHOOK_SECRET!;
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const binary = (res: NodeJS.ReadableStream & { on(event: string, fn: (...a: never[]) => void): unknown }, cb: (err: Error | null, body: Buffer) => void): void => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('Phase 5B.1 — Arabic tickets, XLSX, retryable jobs, storage, security regressions', () => {
  let ctx: TestContext;
  let admin: Session;
  let finance: Session;
  let staff: Session;
  let mail: MemoryMailTransport;
  let jobs: GalaJobsService;
  let storage: PrivateStoragePort;
  const tokens = new Map<string, string>();

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await loginAs(ctx, ['ADMINISTRATOR']);
    finance = await loginAs(ctx, ['FINANCE_MANAGER']);
    staff = await loginAs(ctx, ['EVENT_CHECKIN_STAFF']);
    mail = ctx.app.get(MAIL_TRANSPORT) as MemoryMailTransport;
    jobs = ctx.app.get(GalaJobsService);
    storage = ctx.app.get(PRIVATE_STORAGE);
    expect(mail.name).toBe('memory'); // MAIL_TRANSPORT=memory in the test environment (load-test-env)
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
  afterEach(() => {
    mail.failNext = 0;
    jest.restoreAllMocks();
    // restoreAllMocks also removed the render spy; re-install it for subsequent tests
    const pdf = ctx.app.get(TicketPdfService);
    const real = pdf.render.bind(pdf);
    jest.spyOn(pdf, 'render').mockImplementation(async (i) => {
      tokens.set(i.ticketNumber, i.qrToken);
      return real(i);
    });
  });

  // ───────── fixtures ─────────

  async function makeEvent(o: { startsAt?: Date | null; timezone?: string | null } = {}) {
    const id = uid();
    const page = await ctx.prisma.page.create({ data: { slug: `event-t51-${id}`, titleEn: 'T51', status: 'PUBLISHED' } });
    const event = await ctx.prisma.event.create({
      data: { code: `EVT-T51-${id}`, slug: `t51-${id}`, titleEn: `QA Gala ${id}`, status: 'PUBLISHED', approvedAt: new Date(), pageId: page.id, startsAt: o.startsAt ?? null, timezone: o.timezone ?? null },
    });
    await ctx.prisma.eventTicketConfig.create({
      data: { eventId: event.id, ticketPrice: '750.00', currency: 'USD', salesEnabled: true, displayNameEn: 'Every Light Counts', eventDateLabelEn: 'Saturday, December 12, 2026', venueLabelEn: '583 Park Avenue, New York, USA' },
    });
    return event;
  }
  type Ev = Awaited<ReturnType<typeof makeEvent>>;
  const guest = (n: string, extra: object = {}) => ({ fullName: `Guest ${n}`, email: `g-${n}-${uid()}@example.org`, phone: '+1 212 555 0100', dietaryRequirements: 'None', ...extra });
  const body = (guests = [guest('One')], extra: object = {}) => ({ purchaser: { fullName: 'Amira Hassan', email: `buyer-${uid()}@example.org`, phone: '+1 212 555 0199' }, guests, privacyConsent: true, ...extra });
  const create = (ev: Ev, b: object) => ctx.http().post(`${API}/public/events/${ev.slug}/bookings`).set('X-Forwarded-For', ip()).set('Idempotency-Key', `k-${randomUUID()}`).send(b);
  const book = async (ev: Ev, guests = [guest('One')]) => {
    const b = body(guests);
    const data = (await create(ev, b).expect(201)).body.data as { reference: string; accessToken: string };
    return { ...data, purchaserEmail: b.purchaser.email, guests };
  };
  const dbBooking = (b: { reference: string }) => ctx.prisma.eventBooking.findUniqueOrThrow({ where: { publicReference: b.reference }, include: { tickets: { orderBy: { createdAt: 'asc' } }, jobs: { orderBy: { createdAt: 'asc' } } } });
  const hook = (payload: Record<string, unknown>) => {
    const s = MockPaymentProvider.sign(SECRET(), { id: `evt_${uid()}${uid()}`, created: Math.floor(Date.now() / 1000), ...payload });
    return { body: s.body, sig: s.signature, header: s.header, send: () => ctx.http().post(`${API}/webhooks/mock`).set('Content-Type', 'application/json').set(s.header, s.signature).send(s.body) };
  };
  const resend = (h: { body: string; sig: string; header: string }) => ctx.http().post(`${API}/webhooks/mock`).set('Content-Type', 'application/json').set(h.header, h.sig).send(h.body);
  async function pay(b: { reference: string; accessToken: string }) {
    const s = (await ctx.http().post(`${API}/public/bookings/${b.reference}/checkout`).set('X-Forwarded-For', ip()).set('X-Booking-Token', b.accessToken).expect(200)).body.data;
    const attempt = await ctx.prisma.eventBookingPaymentAttempt.findUniqueOrThrow({ where: { reference: s.attemptReference } });
    const h = hook({ type: 'payment.succeeded', attemptReference: attempt.reference, sessionRef: attempt.providerSessionRef, paymentRef: `mock_pay_${uid()}`, amount: attempt.amount.toString(), currency: attempt.currency });
    const res = await h.send().expect(200);
    return { attempt, hook: h, res };
  }
  const scan = (s: Session, ev: Ev, token: string) => s.post(`/admin/events/${ev.id}/check-in/validate`, { token });
  const makeDue = (bookingId: string) => ctx.prisma.eventBookingJob.updateMany({ where: { bookingId, status: 'PENDING' }, data: { nextRunAt: new Date() } });
  const sentTo = (email: string) => mail.sent.filter((m) => m.to === email.toLowerCase());
  const audit = (action: string, entityId?: string) => ctx.prisma.auditLog.findMany({ where: { action, ...(entityId ? { entityId } : {}) } });

  // ═══════════════ Arabic / mixed guest names end to end ═══════════════

  it('Arabic, mixed and English guests get tickets with embedded Arabic fonts; unsupported scripts are refused up front', async () => {
    const ev = await makeEvent();
    const ar = guest('ar', { fullName: 'محمد عبد الرحمن' });
    const mixed = guest('mx', { fullName: 'أميرة Hassan السيد' });
    const en = guest('en', { fullName: 'Amira Hassan El-Sayed' });
    const b = await book(ev, [ar, mixed, en]);
    await pay(b);
    const row = await dbBooking(b);
    expect(row.tickets.every((t) => t.status === 'ISSUED' && t.pdfStorageKey)).toBe(true);
    const pdfs: string[] = [];
    for (const t of row.tickets) {
      const res = await admin.get(`/admin/events/${ev.id}/tickets/${t.id}/pdf`).buffer(true).parse(binary as never).expect(200);
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      pdfs.push((res.body as Buffer).toString('latin1'));
    }
    expect(pdfs[0]).toMatch(/NotoSansArabic/);
    expect(pdfs[1]).toMatch(/NotoSansArabic/);
    expect(pdfs[2]).not.toMatch(/NotoSans/);
    const list = (await admin.get(`/admin/events/${ev.id}/guests?includeTest=true&pageSize=100`).expect(200)).body.data as { fullName: string }[];
    expect(list.map((g) => g.fullName).sort()).toEqual(['Amira Hassan El-Sayed', 'أميرة Hassan السيد', 'محمد عبد الرحمن'].sort());

    // CJK / emoji / bidi-control names cannot be printed → rejected at booking (422), nothing created
    for (const name of ['李小龍', 'Alex 😀', 'Evil‮name']) {
      const r = await create(ev, body([guest('x', { fullName: name })]));
      expect([400, 422]).toContain(r.status);
      if (r.status === 422) expect(r.body.error.code).toBe('UNSUPPORTED_NAME_CHARACTERS');
    }
    const ok = await book(ev, [guest('rn')]);
    const bk = await dbBooking(ok);
    const g = await ctx.prisma.eventBookingGuest.findFirstOrThrow({ where: { bookingId: bk.id } });
    const bad = await admin.patch(`/admin/events/${ev.id}/bookings/${bk.id}`, { guests: [{ id: g.id, fullName: '李小龍' }] });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('UNSUPPORTED_NAME_CHARACTERS');
    // ticket labels that the template cannot print are refused when configured
    await admin.patch(`/admin/events/${ev.id}/ticketing`, { venueLabelEn: 'مكان' }).expect(400);
  });

  // ═══════════════ XLSX ═══════════════

  describe('guest list export: XLSX + CSV', () => {
    let ev: Ev;
    beforeAll(async () => {
      ev = await makeEvent();
      const paid = await book(ev, [
        guest('Ar', { fullName: 'سارة الأحمد', dietaryRequirements: '=HYPERLINK("http://evil.example","x")' }),
        guest('Plus', { dietaryRequirements: '+1+1', phone: '+1 212 555 0123' }),
        guest('At', { dietaryRequirements: '@SUM(1,1)' }),
        guest('Neg', { dietaryRequirements: '-2+3' }),
      ]);
      await pay(paid);
      await book(ev, [guest('Unpaid', { fullName: 'Unpaid Person' })]);
    });
    const xlsx = async (q = '', s: Session = admin) => {
      const res = await s.get(`/admin/events/${ev.id}/guests/export?includeTest=true&format=xlsx${q}`).buffer(true).parse(binary as never);
      return res;
    };
    const load = async (buf: Buffer) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
      return wb;
    };

    it('returns a native workbook with the required headers, widths, frozen header, readable dates and correct Arabic text', async () => {
      const res = await xlsx();
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="guests-t51-.*\.xlsx"/);
      expect(res.headers['cache-control']).toMatch(/no-store/);
      expect((res.body as Buffer).subarray(0, 2).toString()).toBe('PK'); // zip container
      const ws = (await load(res.body as Buffer)).getWorksheet('Guests')!;
      expect((ws.getRow(1).values as string[]).slice(1)).toEqual(GUEST_EXPORT_HEADER);
      expect(ws.rowCount).toBe(1 + 5);
      expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
      for (let c = 1; c <= GUEST_EXPORT_HEADER.length; c++) expect(ws.getColumn(c).width).toBeGreaterThanOrEqual(14);
      const names: string[] = [];
      ws.eachRow((row, n) => n > 1 && names.push(String(row.getCell(2).value)));
      expect(names).toContain('سارة الأحمد');
      const dateCell = ws.getRow(2).getCell(10);
      expect(dateCell.value).toBeInstanceOf(Date);
      expect(dateCell.numFmt).toBe('yyyy-mm-dd hh:mm');
    });

    it('neutralises formula injection: no cell is a formula and dangerous strings are stored as text with a leading quote', async () => {
      const ws = (await load((await xlsx()).body as Buffer)).getWorksheet('Guests')!;
      const dietary: string[] = [];
      ws.eachRow((row, n) => {
        if (n === 1) return;
        row.eachCell((cell) => {
          expect(cell.type).not.toBe(ExcelJS.ValueType.Formula);
          expect((cell as unknown as { formula?: string }).formula).toBeUndefined();
        });
        dietary.push(String(row.getCell(5).value));
      });
      expect(dietary).toEqual(expect.arrayContaining(['\'=HYPERLINK("http://evil.example","x")', "'+1+1", "'@SUM(1,1)", "'-2+3"]));
      const phones: string[] = [];
      ws.eachRow((row, n) => n > 1 && phones.push(String(row.getCell(4).value)));
      expect(phones).toContain('+1 212 555 0123'); // plain phone numbers stay intact
    });

    it('applies the same filters as CSV and both formats stay consistent', async () => {
      for (const [q, expected] of [['&paymentStatus=PAID', 4], ['&paymentStatus=UNPAID', 1], ['&ticketStatus=PENDING', 1], ['&search=Unpaid', 1], ['&checkInStatus=CHECKED_IN', 0]] as const) {
        const ws = (await load((await xlsx(q)).body as Buffer)).getWorksheet('Guests')!;
        expect([q, ws.rowCount - 1]).toEqual([q, expected]);
        const csv = (await admin.get(`/admin/events/${ev.id}/guests/export?includeTest=true${q}`).expect(200)).text;
        expect([q, csv.trim().split('\r\n').length - 1]).toEqual([q, expected]);
      }
      const csv = (await admin.get(`/admin/events/${ev.id}/guests/export?includeTest=true`).expect(200)).text;
      expect(csv.charCodeAt(0)).toBe(0xfeff); // CSV unchanged: BOM, header, quoting
      expect(csv.split('\r\n')[0].slice(1)).toBe(GUEST_EXPORT_HEADER.join(','));
      expect(csv).toContain('سارة الأحمد');
    });

    it('enforces export permission, scope and validation for XLSX; audits it', async () => {
      expect((await xlsx('', finance)).status).toBe(403);
      expect((await xlsx('', staff)).status).toBe(403);
      expect((await ctx.http().get(`${API}/admin/events/${ev.id}/guests/export?format=xlsx`)).status).toBe(401);
      expect((await admin.get(`/admin/events/${ev.id}/guests/export?format=pdf`)).status).toBe(400);
      expect((await admin.get(`/admin/events/missing-event/guests/export?format=xlsx`)).status).toBe(404);
      const other = await makeEvent();
      const ws = (await load((await admin.get(`/admin/events/${other.id}/guests/export?includeTest=true&format=xlsx`).buffer(true).parse(binary as never)).body as Buffer)).getWorksheet('Guests')!;
      expect(ws.rowCount).toBe(1); // another event's workbook never contains this event's guests
      const logs = await audit('gala.guests.export', ev.id);
      expect(logs.some((l) => (l.metadata as { format?: string })?.format === 'xlsx')).toBe(true);
      expect(logs.some((l) => (l.metadata as { format?: string })?.format === 'csv')).toBe(true);
    });
  });

  // ═══════════════ lifecycle failures: payment is never rolled back ═══════════════

  it('PDF generation fails after a verified payment: booking stays confirmed, the job is retried, then the ticket e-mail goes out with the PDF', async () => {
    const ev = await makeEvent();
    const g = guest('PdfFail');
    const b = await book(ev, [g]);
    jest.spyOn(storage, 'put').mockRejectedValueOnce(new Error('disk full'));
    const { res } = await pay(b);
    expect(res.body.data.status).toBe('PROCESSED'); // the webhook itself succeeded
    let row = await dbBooking(b);
    expect(row).toMatchObject({ bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' });
    expect(row.tickets[0]).toMatchObject({ status: 'ISSUED', pdfStorageKey: null });
    const pdfJob = row.jobs.find((j) => j.type === 'TICKET_PDF')!;
    expect(pdfJob).toMatchObject({ status: 'PENDING', attempts: 1, lastError: 'PDF_GENERATION_FAILED' });
    expect(pdfJob.nextRunAt.getTime()).toBeGreaterThan(Date.now());
    // the purchaser sees a confirmed booking whose PDF is not ready yet (no broken download link claims)
    const st = (await ctx.http().get(`${API}/public/bookings/${b.reference}/status`).set('X-Forwarded-For', ip()).set('X-Booking-Token', b.accessToken).expect(200)).body.data;
    expect(st).toMatchObject({ confirmed: true });
    expect(st.tickets[0].pdfReady).toBe(false);
    await ctx.http().get(`${API}${st.tickets[0].downloadPath}`).set('X-Booking-Token', b.accessToken).set('X-Forwarded-For', ip()).expect(404);
    // confirmation e-mail does not need the PDF → sent; ticket e-mail is deferred, not failed
    expect(sentTo(b.purchaserEmail).map((m) => m.subject).join('|')).toMatch(/confirmed/);
    expect(sentTo(g.email)).toHaveLength(0);
    const tdJob = row.jobs.find((j) => j.template === 'ticket.delivery')!;
    expect(tdJob).toMatchObject({ status: 'PENDING', lastError: 'PDF_NOT_READY' });

    // retry: storage works again
    await makeDue(row.id);
    const run = await jobs.runDue({ bookingId: row.id });
    expect(run.done).toBeGreaterThanOrEqual(1);
    row = await dbBooking(b);
    expect(row.tickets[0].pdfStorageKey).toMatch(/^tickets\//);
    expect(row.jobs.every((j) => j.status === 'DONE')).toBe(true);
    const delivered = sentTo(g.email);
    expect(delivered).toHaveLength(1);
    expect(delivered[0].attachments[0].content.subarray(0, 5).toString()).toBe('%PDF-');
    // the QR in the delivered PDF is the live one (rotated by the retry); the lost first token is dead
    expect((await scan(staff, ev, tokens.get(row.tickets[0].ticketNumber)!).expect(200)).body.data.result).toBe('VALID');
  });

  it('e-mail provider fails after payment: nothing changes in the booking, errors are sanitised, retries back off, then FAILED; admin re-queue delivers', async () => {
    const ev = await makeEvent();
    const g = guest('MailFail');
    const b = await book(ev, [g]);
    mail.failNext = 1000;
    mail.failMessage = `550 mailbox ${b.purchaserEmail} and ${g.email} rejected; token mkt_${'A'.repeat(43)}`;
    await pay(b);
    let row = await dbBooking(b);
    expect(row).toMatchObject({ bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' });
    expect(row.tickets[0]).toMatchObject({ status: 'ISSUED' });
    expect(row.tickets[0].pdfStorageKey).toBeTruthy(); // PDF unaffected by the mail outage
    for (const j of row.jobs.filter((x) => x.type === 'EMAIL')) {
      expect(j.status).toBe('PENDING');
      expect(j.attempts).toBe(1);
      expect(j.nextRunAt.getTime()).toBeGreaterThan(Date.now() + 20_000); // back-off
      expect(j.lastError).toContain('[email]');
      expect(j.lastError).not.toMatch(/@|mkt_/);
    }
    expect(sentTo(b.purchaserEmail).filter((m) => /confirmed/i.test(m.subject))).toHaveLength(0); // (the earlier "request received" mail was sent before the outage)

    for (let i = 0; i < 6; i++) {
      await makeDue(row.id);
      await jobs.runDue({ bookingId: row.id });
    }
    row = await dbBooking(b);
    expect(row.jobs.filter((x) => x.type === 'EMAIL').every((j) => j.status === 'FAILED' && j.attempts === 5)).toBe(true);
    expect(row).toMatchObject({ bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' });

    const view = (await admin.get(`/admin/events/${ev.id}/bookings/${row.id}`).expect(200)).body.data;
    expect(view.jobs.map((j: { status: string }) => j.status)).toContain('FAILED');
    expect(JSON.stringify(view.jobs)).not.toMatch(/@/);
    await finance.post(`/admin/events/${ev.id}/bookings/${row.id}/resend`).expect(403);

    mail.failNext = 0;
    const r = await admin.post(`/admin/events/${ev.id}/bookings/${row.id}/resend`).expect(200);
    expect(r.body.data.requeued).toBeGreaterThanOrEqual(2);
    expect((await dbBooking(b)).jobs.every((j) => j.status === 'DONE')).toBe(true);
    expect(sentTo(b.purchaserEmail).filter((m) => /confirmed/i.test(m.subject))).toHaveLength(1);
    expect(sentTo(g.email)).toHaveLength(1);
    expect((await audit('gala.booking.requeue_jobs', row.id)).length).toBe(1);
  });

  it('without an e-mail provider jobs are parked as SKIPPED (nothing "sent"), and delivered once a transport exists', async () => {
    const ev = await makeEvent();
    const g = guest('NoMail');
    const b = await book(ev, [g]);
    const holder = jobs as unknown as { mail: MailTransport };
    const original = holder.mail;
    holder.mail = new NoMailTransport();
    try {
      await pay(b);
      const row = await dbBooking(b);
      expect(row).toMatchObject({ bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' });
      const emails = row.jobs.filter((j) => j.type === 'EMAIL');
      expect(emails.length).toBeGreaterThanOrEqual(2);
      expect(emails.every((j) => j.status === 'SKIPPED' && j.lastError === 'NO_MAIL_TRANSPORT')).toBe(true);
      expect(mail.sent.some((m) => m.to === b.purchaserEmail.toLowerCase())).toBe(false);
    } finally {
      holder.mail = original;
    }
    await admin.post(`/admin/events/${ev.id}/bookings/${(await dbBooking(b)).id}/resend`).expect(200);
    expect(sentTo(g.email)).toHaveLength(1);
  });

  it('duplicate webhook delivery creates no extra jobs, e-mails or tickets; stale messages are never sent after a refund', async () => {
    const ev = await makeEvent();
    const g = guest('Dup');
    const b = await book(ev, [g]);
    const { hook: h, attempt } = await pay(b);
    const before = await dbBooking(b);
    const sentBefore = mail.sent.length;
    await resend(h).expect(200);
    await resend(h).expect(200);
    const after = await dbBooking(b);
    expect(after.jobs.map((j) => j.dedupeKey).sort()).toEqual(before.jobs.map((j) => j.dedupeKey).sort());
    expect(new Set(after.jobs.map((j) => j.dedupeKey)).size).toBe(after.jobs.length);
    expect(after.tickets.map((t) => t.qrTokenHash)).toEqual(before.tickets.map((t) => t.qrTokenHash));
    expect(mail.sent.length).toBe(sentBefore);

    // refund after issuance: tickets refunded, refund notice sent, history kept
    await hook({ type: 'refund.succeeded', attemptReference: attempt.reference, providerRefundRef: `mock_re_${uid()}`, amount: '750.00', currency: 'USD' }).send().expect(200);
    const refunded = await dbBooking(b);
    expect(refunded).toMatchObject({ bookingStatus: 'REFUNDED', paymentStatus: 'REFUNDED' });
    expect(refunded.tickets[0].status).toBe('REFUNDED');
    expect((await scan(staff, ev, tokens.get(refunded.tickets[0].ticketNumber)!)).body.data.result).toBe('REFUNDED');
    expect(sentTo(b.purchaserEmail).some((m) => /Refund recorded/.test(m.subject))).toBe(true);
    // a confirmation job executed AFTER the refund is parked as not applicable instead of sending a stale "confirmed" mail
    await ctx.prisma.eventBookingJob.create({ data: { bookingId: refunded.id, type: 'EMAIL', template: 'booking.confirmed', dedupeKey: `email:booking.confirmed:${refunded.id}:late` } });
    const n = mail.sent.length;
    await jobs.runDue({ bookingId: refunded.id });
    expect(mail.sent.length).toBe(n);
    expect((await ctx.prisma.eventBookingJob.findUniqueOrThrow({ where: { dedupeKey: `email:booking.confirmed:${refunded.id}:late` } })).lastError).toBe('NOT_APPLICABLE');
  });

  it('Arabic bookings get the English e-mails until MEKI approves the Arabic copy (flag off by default)', async () => {
    const ev = await makeEvent();
    const g = guest('Loc');
    const data = (await create(ev, body([g], { locale: 'ar' })).expect(201)).body.data as { reference: string; accessToken: string };
    const b = { ...data, purchaserEmail: (await dbBooking(data)).purchaserEmail, guests: [g] };
    await pay(b);
    const msg = sentTo(b.purchaserEmail).find((m) => /confirmed/i.test(m.subject) || m.subject.includes('تم تأكيد'));
    expect(msg?.locale).toBe('en');
  });

  // ═══════════════ storage ═══════════════

  it('storage: missing file → 404 without leaking paths; traversal attempts → 404; nothing in any response reveals a storage path', async () => {
    const ev = await makeEvent();
    const b = await book(ev, [guest('Store')]);
    await pay(b);
    const bk = await dbBooking(b);
    const t = bk.tickets[0];
    const seen: string[] = [];
    const record = (r: { text: string }) => seen.push(r.text);
    jest.spyOn(storage, 'get').mockResolvedValueOnce(null);
    const missing = await admin.get(`/admin/events/${ev.id}/tickets/${t.id}/pdf`).expect(404);
    expect(missing.body.error.code).toBe('TICKET_PDF_UNAVAILABLE');
    record(missing);
    for (const evil of ['..%2F..%2Fetc%2Fpasswd', '%2e%2e%2f%2e%2e%2fsecret', 'TK-0000000000', `${t.ticketNumber}%00`, 'C%3A%5CWindows%5Cwin.ini']) {
      record(await ctx.http().get(`${API}/public/bookings/${b.reference}/tickets/${evil}/pdf`).query({ token: b.accessToken }).set('X-Forwarded-For', ip()).expect(404));
      record(await admin.get(`/admin/events/${ev.id}/tickets/${evil}/pdf`).expect(404));
    }
    record(await admin.get(`/admin/events/${ev.id}/tickets/${t.id}`).expect(200));
    record(await admin.get(`/admin/events/${ev.id}/tickets`).expect(200));
    record(await admin.get(`/admin/events/${ev.id}/bookings/${bk.id}`).expect(200));
    record(await ctx.http().get(`${API}/public/bookings/${b.reference}/status`).set('X-Booking-Token', b.accessToken).set('X-Forwarded-For', ip()).expect(200));
    const all = seen.join('\n');
    expect(all).not.toContain(t.pdfStorageKey!);
    expect(all).not.toMatch(/pdfStorageKey|storageKey|test-private|\/storage\//);
    expect(all).not.toContain(b.accessToken); // error bodies must not echo ?token= back (query strings are stripped from `path`)
  });

  // ═══════════════ concurrency ═══════════════

  it('25 simultaneous scans from two staff sessions of one QR: exactly one VALID, one audit row', async () => {
    const ev = await makeEvent();
    const b = await book(ev, [guest('Conc')]);
    await pay(b);
    const t = (await dbBooking(b)).tickets[0];
    const tok = tokens.get(t.ticketNumber)!;
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) => scan(i % 2 ? staff : admin, ev, tok)));
    const verdicts = results.map((r) => r.body.data.result);
    expect(verdicts.filter((v) => v === 'VALID')).toHaveLength(1);
    expect(verdicts.filter((v) => v === 'ALREADY_CHECKED_IN')).toHaveLength(24);
    expect(await audit('gala.checkin.checked_in', t.id)).toHaveLength(1);
    expect((await ctx.prisma.eventTicket.findUniqueOrThrow({ where: { id: t.id } })).checkedInById).toBeTruthy();
  });

  // ═══════════════ security regressions ═══════════════

  it('rate limit cannot be bypassed by spoofing the leftmost X-Forwarded-For value', async () => {
    const ev = await makeEvent();
    const b = await book(ev);
    const proxyHop = '203.0.113.77'; // the address the (single) trusted proxy appends
    const codes: number[] = [];
    for (let i = 0; i < 70; i++) codes.push((await ctx.http().get(`${API}/public/bookings/${b.reference}/status`).set('X-Forwarded-For', `${ip()}, ${proxyHop}`).set('X-Booking-Token', b.accessToken)).status);
    expect(codes).toContain(429);
  });

  it('unknown reference and wrong token are indistinguishable (no enumeration); references and tokens are unguessable shapes', async () => {
    const ev = await makeEvent();
    const b = await book(ev);
    const wrongToken = await ctx.http().get(`${API}/public/bookings/${b.reference}/status`).set('X-Forwarded-For', ip()).set('X-Booking-Token', 'x'.repeat(43));
    const unknownRef = await ctx.http().get(`${API}/public/bookings/EB-ZZZZZZZZZZZZ/status`).set('X-Forwarded-For', ip()).set('X-Booking-Token', b.accessToken);
    expect([wrongToken.status, wrongToken.body.error.code, wrongToken.body.error.message]).toEqual([unknownRef.status, unknownRef.body.error.code, unknownRef.body.error.message]);
    expect(b.reference).toMatch(/^EB-[0-9A-HJKMNP-TV-Z]{12}$/);
    const refs = new Set<string>();
    for (let i = 0; i < 5; i++) refs.add((await book(ev)).reference);
    expect(refs.size).toBe(5);
  });

  it('no personal data, QR token or hash reaches application logs or any API response', async () => {
    const logged: string[] = [];
    for (const level of ['log', 'warn', 'error', 'debug', 'verbose'] as const) jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    });
    const ev = await makeEvent();
    const g = guest('Logs', { fullName: 'Zzqx Qwerty Lognamed' });
    const b = await book(ev, [g]);
    mail.failNext = 2;
    mail.failMessage = `550 ${g.email} ${b.purchaserEmail} refused`;
    jest.spyOn(storage, 'put').mockRejectedValueOnce(new Error(`cannot write for ${g.email}`));
    await pay(b);
    await makeDue((await dbBooking(b)).id);
    await jobs.runDue();
    const row = await dbBooking(b);
    const secrets = [g.email, g.phone, 'Zzqx Qwerty Lognamed', b.purchaserEmail, b.accessToken, tokens.get(row.tickets[0].ticketNumber) ?? 'no-token', row.tickets[0].qrTokenHash ?? 'no-hash', 'Amira Hassan'];
    const logText = logged.join('\n');
    for (const s of secrets) expect([s, logText.includes(s)]).toEqual([s, false]);
    expect(logText).not.toMatch(/mkt_/);
    // API responses (public + admin) never contain a QR token or its hash
    const responses: string[] = [];
    const t = row.tickets[0];
    responses.push((await ctx.http().get(`${API}/public/bookings/${b.reference}/confirmation`).query({ token: b.accessToken }).set('X-Forwarded-For', ip())).text);
    for (const u of [`/bookings/${row.id}`, `/tickets/${t.id}`, '/tickets', '/guests?includeTest=true', '/bookings?includeTest=true', '/check-in/statistics', '/financials?includeTest=true']) responses.push((await admin.get(`/admin/events/${ev.id}${u}`)).text);
    responses.push((await admin.get(`/admin/events/${ev.id}/guests/export?includeTest=true`)).text);
    const all = responses.join('\n');
    expect(all).not.toMatch(/mkt_[A-Za-z0-9_-]{20}/);
    if (t.qrTokenHash) expect(all).not.toContain(t.qrTokenHash);
  });

  // ═══════════════ calendar ═══════════════

  it('calendar stays pending for incomplete or non-IANA schedules and becomes available only with start + IANA timezone', async () => {
    const cases: [string, { startsAt?: Date | null; timezone?: string | null }, boolean][] = [
      ['nothing', {}, false],
      ['start only', { startsAt: new Date('2026-12-13T00:00:00Z') }, false],
      ['zone only', { timezone: 'America/New_York' }, false],
      ['offset instead of zone', { startsAt: new Date('2026-12-13T00:00:00Z'), timezone: '-05:00' }, false],
      ['abbreviation', { startsAt: new Date('2026-12-13T00:00:00Z'), timezone: 'EST' }, false],
      ['approved', { startsAt: new Date('2026-12-13T00:00:00Z'), timezone: 'America/New_York' }, true],
    ];
    for (const [label, o, available] of cases) {
      const ev = await makeEvent(o);
      const info = (await ctx.http().get(`${API}/public/events/${ev.slug}/ticketing`).set('X-Forwarded-For', ip()).expect(200)).body.data;
      expect([label, info.calendar.available]).toEqual([label, available]);
      const ics = await ctx.http().get(`${API}/public/events/${ev.slug}/calendar.ics`).set('X-Forwarded-For', ip());
      expect([label, ics.status]).toEqual([label, available ? 200 : 409]);
      if (!available) expect(ics.body.error.code).toBe('CALENDAR_PENDING');
    }
  });

  it('jobs endpoint needs gala.tickets.manage and is event-scoped', async () => {
    const ev = await makeEvent();
    await finance.post(`/admin/events/${ev.id}/jobs/run`).expect(403);
    await staff.post(`/admin/events/${ev.id}/jobs/run`).expect(403);
    const r = await admin.post(`/admin/events/${ev.id}/jobs/run`).expect(200);
    expect(r.body.data).toEqual(expect.objectContaining({ claimed: expect.any(Number), done: expect.any(Number) }));
    await admin.post(`/admin/events/nonexistent/jobs/run`).expect(404);
  });
});
