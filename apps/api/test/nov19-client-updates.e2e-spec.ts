import { restoreSdiEnv } from './sdi-env';
import { API, createTestApp, loginAs, uid, type Session, type TestContext } from './helpers';
import { LegalCopyService } from '../src/modules/fundraising/legal-copy';
import { seedGalaNightDraft, seedGalaTicketConfig } from '../prisma/seed/gala-night';

/**
 * November 19 2026 MEKI update: USD 500 ticket (supersedes 750), capacity 350, 3:30–8:30 PM America/New_York, legal drafts
 * gated by SDI approval. Synthetic events and data only (meki_test). No sales, payments or receipts are enabled.
 */
describe('Nov 19 2026 client updates — price, capacity, timing and SDI-gated legal copy', () => {
  let ctx: TestContext;
  let editor: Session;
  let approver: Session;
  let content: Session;
  let finance: Session;
  let eventId: string;
  let slug: string;
  const tag = uid();

  beforeAll(async () => {
    ctx = await createTestApp();
    editor = await loginAs(ctx, ['ADMINISTRATOR']);
    approver = await loginAs(ctx, ['ADMINISTRATOR']);
    content = await loginAs(ctx, ['CONTENT_MANAGER']);
    finance = await loginAs(ctx, ['FINANCE_MANAGER']);
    const page = await ctx.prisma.page.create({ data: { slug: `event-n19-${tag}`, titleEn: 'N19', status: 'PUBLISHED' } });
    const ev = await ctx.prisma.event.create({ data: { code: `EVT-N19-${tag}`.toUpperCase(), slug: `n19-${tag}`, titleEn: `N19 ${tag}`, status: 'PUBLISHED', approvedAt: new Date(), pageId: page.id } });
    // Starts from the OLD price on purpose: the update path is an audited admin change, never a silent data rewrite.
    await ctx.prisma.eventTicketConfig.create({ data: { eventId: ev.id, ticketPrice: '750.00', currency: 'USD', salesEnabled: false, maxTicketsPerBooking: 10, displayNameEn: 'Every Light Counts', eventDateLabelEn: 'Saturday, December 12, 2026', venueLabelEn: '583 Park Avenue' } });
    eventId = ev.id;
    slug = ev.slug;
  });
  afterAll(async () => {
    await ctx.prisma.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } }).catch(() => undefined);
    await ctx.app.close();
    restoreSdiEnv();
  });

  describe('seed (create-only) carries the new confirmed values', () => {
    it('ticket config: USD 500, capacity 350, sales CLOSED', async () => {
      let data: Record<string, unknown> | undefined;
      const fake = { event: { findUnique: async () => ({ id: 'evt' }) }, eventTicketConfig: { findUnique: async () => null, create: async (a: { data: Record<string, unknown> }) => { data = a.data; } } };
      expect(await seedGalaTicketConfig(fake as never)).toBe(true);
      expect(data).toMatchObject({ ticketPrice: '500.00', currency: 'USD', capacity: 350, salesEnabled: false });
    });
    it('event: 12 Dec 2026, 3:30–8:30 PM America/New_York, still DRAFT', async () => {
      let event: Record<string, unknown> | undefined;
      const tx = { page: { create: async () => ({ id: 'pg' }) }, event: { create: async (a: { data: Record<string, unknown> }) => { event = a.data; } }, pageSection: { create: async () => ({}) } };
      const fake = { event: { findUnique: async () => null }, $transaction: async (fn: (t: unknown) => Promise<void>) => fn(tx) };
      expect(await seedGalaNightDraft(fake as never)).toBe(true);
      const fmt = (d: unknown) => (d as Date).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit' });
      expect(event).toMatchObject({ timezone: 'America/New_York', status: 'DRAFT' });
      expect(fmt(event!.startsAt)).toBe('12/12/2026, 3:30 PM');
      expect(fmt(event!.endsAt)).toBe('12/12/2026, 8:30 PM');
    });
    it('an existing ticket config / event is never modified by the seed', async () => {
      const fake = { event: { findUnique: async () => ({ id: 'evt' }) }, eventTicketConfig: { findUnique: async () => ({ id: 'existing' }), create: async () => { throw new Error('must not create'); } } };
      expect(await seedGalaTicketConfig(fake as never)).toBe(false);
      expect(await seedGalaNightDraft({ event: { findUnique: async () => ({ id: 'x' }) } } as never)).toBe(false);
    });
  });

  describe('admin update path for existing databases (audited)', () => {
    it('price 750 → 500 and capacity 350 through the ticketing endpoint; sales stay closed', async () => {
      const r = await editor.patch(`/admin/events/${eventId}/ticketing`, { ticketPrice: '500.00', capacity: 350 }).expect(200);
      expect(r.body.data).toMatchObject({ ticketPrice: '500.00', capacity: 350, salesEnabled: false });
      const t = (await ctx.http().get(`${API}/public/events/${slug}/ticketing`).expect(200)).body.data;
      expect(t.ticket.price).toBe('500.00');
      expect(t.salesOpen).toBe(false);
      expect(await ctx.prisma.auditLog.count({ where: { entityId: { in: [eventId, r.body.data.id] }, action: { contains: 'ticket' } } })).toBeGreaterThanOrEqual(1);
    });
    it('event schedule set in America/New_York through the event endpoint', async () => {
      const r = await editor.patch(`/admin/events/${eventId}`, { startsAt: '2026-12-12T15:30:00-05:00', endsAt: '2026-12-12T20:30:00-05:00', timezone: 'America/New_York' });
      expect([200, 201]).toContain(r.status);
      const e = await ctx.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
      expect(e.startsAt?.toISOString()).toBe('2026-12-12T20:30:00.000Z');
      expect(e.endsAt?.toISOString()).toBe('2026-12-13T01:30:00.000Z');
    });
  });

  describe('legal copy: SDI approval gate', () => {
    const base = (k: string) => `/admin/events/${eventId}/legal-copy/${k}`;
    it('nothing is public by default; amounts must be complete and add up', async () => {
      const pub = (await ctx.http().get(`${API}/public/events/${slug}/fundraising`).expect(200)).body.data;
      expect(pub.disclosures).toEqual({ ticketPurchase: null, website: null });
      expect((await editor.put(base('TICKET_PURCHASE_DISCLOSURE'), { textEn: 'TEST wording', ticketPrice: '500.00', fairMarketValue: '200.00' }).expect(422)).body.error.code).toBe('LEGAL_AMOUNTS_INCOMPLETE');
      expect((await editor.put(base('TICKET_PURCHASE_DISCLOSURE'), { textEn: 'TEST wording', ticketPrice: '500.00', fairMarketValue: '200.00', deductibleAmount: '250.00' }).expect(422)).body.error.code).toBe('LEGAL_AMOUNTS_INCONSISTENT');
      expect(() => LegalCopyService.checkAmounts('500.00', '200.00', '300.00')).not.toThrow();
      expect(() => LegalCopyService.checkAmounts(null, null, null)).not.toThrow();
    });
    it('four eyes, SDI approval before publication, receipt wording never publishable, permissions', async () => {
      await editor.put(base('TICKET_PURCHASE_DISCLOSURE'), { textEn: `TEST disclosure ${tag}`, textAr: `نص اختبار ${tag}`, ticketPrice: '500.00', fairMarketValue: '200.00', deductibleAmount: '300.00', sourceNote: 'synthetic test' }).expect(200);
      expect((await editor.post(base('TICKET_PURCHASE_DISCLOSURE') + '/publish').expect(422)).body.error.code).toBe('LEGAL_NOT_SDI_APPROVED');
      expect((await editor.post(base('TICKET_PURCHASE_DISCLOSURE') + '/sdi-approval', { note: 'SDI e-mail (synthetic test)' }).expect(403)).body.error.code).toBe('FOUR_EYES_REQUIRED');
      expect((await content.post(base('TICKET_PURCHASE_DISCLOSURE') + '/sdi-approval', { note: 'SDI e-mail (synthetic test)' })).status).toBe(403); // no events.approve
      expect((await finance.put(base('WEBSITE_DISCLOSURE'), { textEn: 'x' })).status).toBe(403); // no events.manage
      await approver.post(base('TICKET_PURCHASE_DISCLOSURE') + '/sdi-approval', { note: 'SDI e-mail (synthetic test)' }).expect(200);
      await editor.put(base('TICKET_RECEIPT'), { textEn: 'TEST receipt wording for SDI' }).expect(200);
      await approver.post(base('TICKET_RECEIPT') + '/sdi-approval', { note: 'synthetic' }).expect(200);
      expect((await approver.post(base('TICKET_RECEIPT') + '/publish').expect(409)).body.error.code).toBe('LEGAL_NOT_PUBLISHABLE');
    });
    it('wording that states a price other than the live price is never published (stale 750 wording)', async () => {
      await editor.put(base('WEBSITE_DISCLOSURE'), { textEn: 'TEST website disclosure', ticketPrice: '750.00', fairMarketValue: '200.00', deductibleAmount: '550.00' }).expect(200);
      await approver.post(base('WEBSITE_DISCLOSURE') + '/sdi-approval', { note: 'synthetic' }).expect(200);
      expect((await approver.post(base('WEBSITE_DISCLOSURE') + '/publish').expect(422)).body.error.code).toBe('LEGAL_PRICE_MISMATCH');
    });
    it('published disclosure is public (localized); any edit unpublishes; a later price change hides it', async () => {
      await approver.post(base('TICKET_PURCHASE_DISCLOSURE') + '/publish').expect(200);
      let pub = (await ctx.http().get(`${API}/public/events/${slug}/fundraising?locale=ar`).expect(200)).body.data;
      expect(pub.disclosures.ticketPurchase).toBe(`نص اختبار ${tag}`);
      expect(pub.disclosures.website).toBeNull();
      await editor.patch(`/admin/events/${eventId}/ticketing`, { ticketPrice: '550.00' }).expect(200);
      pub = (await ctx.http().get(`${API}/public/events/${slug}/fundraising`).expect(200)).body.data;
      expect(pub.disclosures.ticketPurchase).toBeNull(); // stated 500 ≠ live 550
      await editor.patch(`/admin/events/${eventId}/ticketing`, { ticketPrice: '500.00' }).expect(200);
      expect((await ctx.http().get(`${API}/public/events/${slug}/fundraising`).expect(200)).body.data.disclosures.ticketPurchase).toBe(`TEST disclosure ${tag}`);
      const edited = (await editor.put(base('TICKET_PURCHASE_DISCLOSURE'), { textEn: `TEST disclosure ${tag} v2` }).expect(200)).body.data;
      expect(edited).toMatchObject({ sdiApprovedAt: null, publishedAt: null });
      expect((await ctx.http().get(`${API}/public/events/${slug}/fundraising`).expect(200)).body.data.disclosures.ticketPurchase).toBeNull();
      expect(await ctx.prisma.auditLog.count({ where: { entityId: eventId, action: { startsWith: 'event.legal_copy.' } } })).toBeGreaterThanOrEqual(8);
    });
  });

  describe('SDI reconciliation at USD 500 (synthetic report)', () => {
    it('amounts are matched against the configured 500 price; an old 750-based amount is a mismatch', async () => {
      // hosted booking needs the sales gate; this suite's event keeps sales CLOSED, so bookings are created directly (synthetic).
      const mk = async (n: number) => {
        const ref = `EB-${uid().toUpperCase().replace(/[^0-9A-HJKMNP-TV-Z]/g, '0').padEnd(12, '0').slice(0, 12)}`;
        await ctx.prisma.eventBooking.create({ data: { publicReference: ref, accessTokenHash: '0'.repeat(64), eventId, purchaserName: 'Synthetic', purchaserEmail: `n19-${uid()}@example.org`, purchaserPhone: '', guestCount: n, unitPrice: '500.00', totalAmount: (500 * n).toFixed(2), currency: 'USD', ticketIssuer: 'ZEFFY', paymentProvider: 'sdi_hosted', isTest: true, locale: 'en' } });
        return ref;
      };
      const ok = await mk(2);
      const old = await mk(1);
      const csv = ['Order ID,MEKI Booking Reference,Ticket Type,Quantity,Amount,Currency,Status,Date', `N19-A-${tag},${ok},General admission,2,1000.00,USD,succeeded,2026-11-20`, `N19-B-${tag},${old},General admission,1,750.00,USD,succeeded,2026-11-20`].join('\r\n');
      const up = (await finance.post('/admin/sdi/reports').field('kind', 'RECONCILIATION').field('isSynthetic', 'true').attach('file', Buffer.from(csv), { filename: `SYNTHETIC-n19-${tag}.csv`, contentType: 'text/csv' }).expect(201)).body.data;
      await finance.post(`/admin/sdi/reports/${up.id}/preview`, { mapping: { orderId: 'Order ID', bookingReference: 'MEKI Booking Reference', ticketType: 'Ticket Type', quantity: 'Quantity', amount: 'Amount', currency: 'Currency', status: 'Status', date: 'Date', dateFormat: 'ISO', statusMap: { succeeded: 'COMPLETED' } } }).expect(200);
      const rows = (await finance.get(`/admin/sdi/reports/${up.id}/rows?pageSize=10`).expect(200)).body.data as { rowNumber: number; matchStatus: string; matchNote: string }[];
      expect(rows.find((r) => r.rowNumber === 2)?.matchStatus).toBe('MATCHED');
      const mismatch = rows.find((r) => r.rowNumber === 3)!;
      expect(mismatch.matchStatus).toBe('AMOUNT_MISMATCH');
      expect(mismatch.matchNote).toMatch(/500\.00/);
    });
  });
});
