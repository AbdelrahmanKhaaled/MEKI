import { restoreAgreementEnv, SYNTHETIC_GALA_GIVING_FORM } from './agreement-env';
import { API, createTestApp, loginAs, uid, type Session, type TestContext } from './helpers';
import { validateSdiHostedConfig, type EnvironmentVariables } from '../src/config/env.validation';
import { DonationConfigService } from '../src/modules/donations/donation-config.service';
import { generateBookingReference } from '../src/modules/gala/gala.rules';
import { BOOKING_REF, isValidTimeZone, normaliseReference, parseDateTime, parseTime, zonedTimeToUtc } from '../src/modules/sdi/sdi-report.parser';

/**
 * Phase 12B — SDI agreement alignment: one approved Gala project, Gala-only giving scope, separated Gala donation category,
 * SDI sample-layout support (separate time column / time zone / fund / recurring). Every report here is a SYNTHETIC FIXTURE.
 * Runs against the *_test database; nothing is deleted. No live purchase, refund or provider call happens.
 */
describe('Phase 12B — SDI agreement: single Gala project, giving scope and Gala donation reconciliation', () => {
  let ctx: TestContext;
  let editor: Session; // ADMINISTRATOR (configures)
  let approver: Session; // second ADMINISTRATOR (records approvals)
  let content: Session; // CONTENT_MANAGER: events.manage but NOT events.approve
  let finance: Session; // FINANCE_MANAGER: report uploader
  let eventId: string;
  let slug: string;
  let projectId: string;
  let demoProjectId: string;
  const tag = uid();

  beforeAll(async () => {
    ctx = await createTestApp();
    editor = await loginAs(ctx, ['ADMINISTRATOR']);
    approver = await loginAs(ctx, ['ADMINISTRATOR']);
    content = await loginAs(ctx, ['CONTENT_MANAGER']);
    finance = await loginAs(ctx, ['FINANCE_MANAGER']);
    const page = await ctx.prisma.page.create({ data: { slug: `event-p12b-${tag}`, titleEn: 'P12B', status: 'PUBLISHED' } });
    const ev = await ctx.prisma.event.create({ data: { code: `EVT-P12B-${tag}`.toUpperCase(), slug: `p12b-${tag}`, titleEn: `P12B Gala ${tag}`, status: 'PUBLISHED', approvedAt: new Date(), pageId: page.id } });
    eventId = ev.id;
    slug = ev.slug;
    // Synthetic project records standing in for the one MEKI will enter after sign-off (never auto-selected by the system).
    projectId = (await ctx.prisma.project.create({ data: { code: `P12B-${tag}`.toUpperCase(), slug: `p12b-project-${tag}`, nameEn: `TEST Project ${tag}`, nameAr: `مشروع اختبار ${tag}`, locationEn: 'Egypt', provenance: 'PROPOSED' } })).id;
    demoProjectId = (await ctx.prisma.project.create({ data: { code: `P12B-DEMO-${tag}`.toUpperCase(), slug: `p12b-demo-${tag}`, nameEn: `DEMO ${tag}`, provenance: 'DEMO' } })).id;
  });
  afterAll(async () => {
    // Keep fixtures from leaking into other suites' public lists: archive (never delete) the synthetic projects/event.
    await ctx.prisma.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } }).catch(() => undefined);
    await ctx.prisma.project.updateMany({ where: { id: { in: [projectId, demoProjectId] } }, data: { deletedAt: new Date() } });
    await ctx.app.close();
    restoreAgreementEnv();
  });

  const fr = (s: Session) => ({
    get: () => s.get(`/admin/events/${eventId}/fundraising`),
    put: (body: object) => s.put(`/admin/events/${eventId}/fundraising`, body),
    approve: (step: string, note?: string) => s.post(`/admin/events/${eventId}/fundraising/approve`, { step, ...(note ? { note } : {}) }),
    revoke: (step: string) => s.post(`/admin/events/${eventId}/fundraising/revoke`, { step, reason: 'test revocation' }),
  });
  const pub = async (locale = 'en') => (await ctx.http().get(`${API}/public/events/${slug}/fundraising?locale=${locale}`).expect(200)).body.data;
  const future = () => new Date(Date.now() + 30 * 86_400_000).toISOString();

  describe('giving scope under the current agreement', () => {
    it('general and programme-restricted MEKI-native designations are refused; public config lists none', async () => {
      const svc = ctx.app.get(DonationConfigService);
      expect(svc.authorizedDesignations()).toEqual([]);
      for (const dto of [{ designation: 'PROGRAMME', programmeSlug: 'health' }, { designation: 'GENERAL_FUND' }, { designation: 'CAMPAIGN', campaignSlug: 'x' }] as const) {
        await expect(svc.resolveDesignation({ ...dto, currency: 'USD' } as never)).rejects.toMatchObject({ response: { code: 'DESIGNATION_NOT_AUTHORIZED' } });
      }
      const cfg = (await ctx.http().get(`${API}/public/donations/config`)).body.data;
      if (cfg) expect(cfg.designations).toEqual([]);
    });

    it('hosted-forms reports the Gala single-project scope and no general/programme channel', async () => {
      const d = (await ctx.http().get(`${API}/public/hosted-forms`).expect(200)).body.data;
      expect(d).toMatchObject({ scope: 'GALA_SINGLE_PROJECT', generalAuthorized: false, programmeAuthorized: false, general: { available: false, url: null } });
      expect(d.programmes.every((p: { available: boolean; url: string | null }) => !p.available && p.url === null)).toBe(true);
    });

    it('configuration guards (unit)', () => {
      const base = { NODE_ENV: 'development', GALA_TICKETING_MODE: 'zeffy_hosted', ZEFFY_GALA_AUTO_CONFIRM: false, GALA_HOSTED_SALES_ENABLED: false, SDI_GENERAL_GIVING_ENABLED: false, SDI_PROGRAMME_GIVING_ENABLED: false, SDI_PROGRAMME_DESIGNATION_CONFIRMED: false, SDI_BOOKING_REFERENCE_QUESTION: 'MEKI Booking Reference', SDI_GALA_GIVING_ENABLED: false, GENERAL_GIVING_AUTHORIZED: false, PROGRAMME_GIVING_AUTHORIZED: false, PAYMENTS_ENABLED: false } as unknown as EnvironmentVariables;
      const v = (o: object) => () => validateSdiHostedConfig({ ...base, ...o } as EnvironmentVariables);
      expect(v({ SDI_GALA_GIVING_ENABLED: true })).toThrow(/ZEFFY_GALA_GIVING_FORM_URL/);
      expect(v({ SDI_GALA_GIVING_ENABLED: true, ZEFFY_GALA_GIVING_FORM_URL: SYNTHETIC_GALA_GIVING_FORM, GALA_TICKETING_MODE: 'meki' })).toThrow(/zeffy_hosted/);
      expect(v({ SDI_GALA_GIVING_ENABLED: true, ZEFFY_GALA_GIVING_FORM_URL: SYNTHETIC_GALA_GIVING_FORM })).not.toThrow();
      expect(v({ SDI_GENERAL_GIVING_ENABLED: true, ZEFFY_DONATION_FORM_URL: SYNTHETIC_GALA_GIVING_FORM })).toThrow(/GENERAL_GIVING_AUTHORIZED/);
      expect(v({ SDI_PROGRAMME_GIVING_ENABLED: true, SDI_PROGRAMME_DESIGNATION_CONFIRMED: true, SDI_PROGRAMME_FORM_URLS: '{"health":"https://www.zeffy.com/x"}' })).toThrow(/PROGRAMME_GIVING_AUTHORIZED/);
      expect(v({ NODE_ENV: 'production', PAYMENTS_ENABLED: true })).toThrow(/MEKI-native checkout/);
      expect(v({ NODE_ENV: 'development', PAYMENTS_ENABLED: true })).not.toThrow(); // legacy mock pipeline stays available in dev/test
    });
  });

  describe('single approved Gala project', () => {
    it('nothing is selected or shown by default', async () => {
      expect((await fr(editor).get().expect(200)).body.data).toMatchObject({ config: null, project: null, state: { planApproved: false, authorized: false, givingAvailable: false } });
      expect(await pub()).toMatchObject({ scope: 'GALA_SINGLE_PROJECT', project: null, giving: { available: false, formUrl: null, closesAt: null }, donationRefundNotice: null, ticketRefundPolicy: null });
    });

    it('DEMO or unknown projects are refused; content managers cannot approve', async () => {
      expect((await fr(editor).put({ projectId: demoProjectId }).expect(422)).body.error.code).toBe('PROJECT_IS_DEMO');
      expect((await fr(editor).put({ projectId: 'cl0000000000000000nope' }).expect(422)).body.error.code).toBe('PROJECT_NOT_FOUND');
      expect((await fr(content).approve('PROJECT_PLAN')).status).toBe(403);
    });

    it('two separate approval steps by a second administrator; public fundraising needs both and a future closing date', async () => {
      await fr(editor).put({ projectId, projectPlanReference: `SDI Project Plan TEST-${tag}`, donationsCloseAt: future() }).expect(200);
      expect((await fr(editor).approve('PROJECT_PLAN').expect(403)).body.error.code).toBe('FOUR_EYES_REQUIRED');
      expect((await fr(approver).approve('PUBLIC_FUNDRAISING').expect(422)).body.error.code).toBe('PROJECT_PLAN_NOT_APPROVED');
      await fr(approver).approve('PROJECT_PLAN', 'synthetic test approval').expect(200);
      expect((await pub()).project).toBeNull(); // plan approval alone publishes nothing
      const after = (await fr(approver).approve('PUBLIC_FUNDRAISING').expect(200)).body.data;
      expect(after.state).toMatchObject({ planApproved: true, authorized: true, campaignOpen: true, givingAvailable: true });
      const en = await pub();
      expect(en.project).toMatchObject({ name: `TEST Project ${tag}`, location: 'Egypt' });
      expect(en.giving).toMatchObject({ available: true, formUrl: SYNTHETIC_GALA_GIVING_FORM, withTickets: 'ON_TICKET_FORM' });
      expect((await pub('ar')).project.name).toBe(`مشروع اختبار ${tag}`);
    });

    it('editing what an approval depends on clears it; a past closing date closes giving; revoking is immediate', async () => {
      await fr(editor).put({ projectPlanReference: `SDI Project Plan TEST-${tag} v2` }).expect(200);
      let s = (await fr(editor).get()).body.data.state;
      expect(s).toMatchObject({ planApproved: false, authorized: false, givingAvailable: false });
      expect((await pub()).project).toBeNull();
      await fr(approver).approve('PROJECT_PLAN').expect(200);
      await fr(editor).put({ donationsCloseAt: new Date(Date.now() - 86_400_000).toISOString() }).expect(200);
      expect((await fr(approver).approve('PUBLIC_FUNDRAISING').expect(422)).body.error.code).toBe('CLOSING_DATE_REQUIRED');
      await fr(editor).put({ donationsCloseAt: future() }).expect(200);
      await fr(approver).approve('PUBLIC_FUNDRAISING').expect(200);
      expect((await pub()).giving.available).toBe(true);
      await fr(approver).revoke('PROJECT_PLAN').expect(200);
      s = (await fr(editor).get()).body.data.state;
      expect(s).toMatchObject({ planApproved: false, authorized: false });
      expect((await pub()).giving).toMatchObject({ available: false, formUrl: null });
    });

    it('refund notices: donation notice and ticket policy are separate and published only after approval', async () => {
      expect((await pub()).donationRefundNotice).toBeNull();
      await fr(approver).approve('DONATION_REFUND_NOTICE').expect(200);
      expect((await pub()).donationRefundNotice).toBe('NON_REFUNDABLE');
      expect((await pub()).ticketRefundPolicy).toBeNull(); // the donation policy says nothing about tickets
      expect((await fr(approver).approve('TICKET_REFUND_POLICY').expect(422)).body.error.code).toBe('TICKET_POLICY_EMPTY');
      await fr(editor).put({ ticketRefundPolicyEn: 'TEST ticket policy text', ticketRefundPolicyAr: 'نص اختبار' }).expect(200);
      expect((await pub()).ticketRefundPolicy).toBeNull();
      await fr(approver).approve('TICKET_REFUND_POLICY').expect(200);
      expect((await pub('ar')).ticketRefundPolicy).toBe('نص اختبار');
      await fr(editor).put({ ticketRefundPolicyEn: 'TEST ticket policy text (edited)' }).expect(200);
      expect((await pub()).ticketRefundPolicy).toBeNull(); // edit clears the approval
      const audit = await ctx.prisma.auditLog.count({ where: { entityType: 'Event', entityId: eventId, action: { startsWith: 'event.fundraising.' } } });
      expect(audit).toBeGreaterThanOrEqual(10);
    });
  });

  describe('SDI Gala donation report (sample layout, synthetic data)', () => {
    const HEADERS = 'Payment Date (America/New_York),Payment Time (America/New_York),Total Amount,Payment Method,Payment Status,Refund Amount,Recurring Status,Fund,Order ID';
    const MAPPING = {
      reportType: 'GALA_DONATIONS', orderId: 'Order ID', amount: 'Total Amount', refundedAmount: 'Refund Amount', status: 'Payment Status',
      date: 'Payment Date (America/New_York)', time: 'Payment Time (America/New_York)', dateFormat: 'MDY', timeZone: 'America/New_York',
      fund: 'Fund', galaFunds: ['TEST Gala Project Fund'], recurring: 'Recurring Status',
      statusMap: { succeeded: 'COMPLETED', abandoned: 'FAILED', refunded: 'REFUNDED' },
    };
    const upload = async (rows: string[], kind = 'RECONCILIATION') => {
      const up = await finance.post('/admin/sdi/reports').field('kind', kind).field('isSynthetic', 'true').attach('file', Buffer.from([HEADERS, ...rows].join('\r\n')), { filename: `SYNTHETIC-gala-donations-${uid()}.csv`, contentType: 'text/csv' }).expect(201);
      return up.body.data;
    };
    const previewRows = async (id: string, mapping: object = MAPPING) => {
      await finance.post(`/admin/sdi/reports/${id}/preview`, { mapping }).expect(200);
      return (await finance.get(`/admin/sdi/reports/${id}/rows?pageSize=100`).expect(200)).body.data as { rowNumber: number; matchStatus: string; matchNote: string | null; occurredAt: string | null; lineKind: string; amount: string | null }[];
    };
    const o = (n: string) => `GD-${tag}-${n}`;

    it('upload suggests the sample layout (time column, zone from header, fund, recurring) — suggestions only', async () => {
      const up = await upload([`11/18/2026,7:05 PM,100,Card,Succeeded,,,TEST Gala Project Fund,${o('S')}`]);
      expect(up.suggestedMapping).toMatchObject({ date: 'Payment Date (America/New_York)', time: 'Payment Time (America/New_York)', timeZone: 'America/New_York', fund: 'Fund', recurring: 'Recurring Status', amount: 'Total Amount', status: 'Payment Status', reportType: 'GALA_TICKETS', galaFunds: [] });
    });

    it('classifies every donation row; nothing is guessed; preview changes nothing', async () => {
      const donationsBefore = await ctx.prisma.donation.count();
      const up = await upload([
        `11/18/2026,7:05 PM,100,Card,Succeeded,,,TEST Gala Project Fund,${o('1')}`, // ok
        `11/18/2026,7:06 PM,,Card,Abandoned,,,,${o('2')}`, // never paid → INFO
        `11/18/2026,7:07 PM,50,Card,Succeeded,,Monthly,TEST Gala Project Fund,${o('3')}`, // recurring → review
        `11/18/2026,7:08 PM,75,Card,Succeeded,,,General Fund,${o('4')}`, // other fund → review
        `11/18/2026,7:09 PM,200,Card,Succeeded,50,,TEST Gala Project Fund,${o('5')}`, // refund on donation → review
        `11/18/2026,7:10 PM,30,Card,Succeeded,,,=HYPERLINK("x"),${o('6')}`, // formula-like → invalid
        `11/18/2026,7:11 PM,30,Card,Succeeded,,,TEST Gala Project Fund,`, // no order id (as in SDI's sample) → invalid
        `11/18/2026,25:00 PM,30,Card,Succeeded,,,TEST Gala Project Fund,${o('8')}`, // bad time → invalid
        `07/01/2026,9:00 AM,40,Card,Succeeded,,One-time,TEST Gala Project Fund,${o('9')}`, // summer (EDT) → ok
      ]);
      const rows = await previewRows(up.id);
      const st = (n: number) => rows.find((r) => r.rowNumber === n)!;
      expect([2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => st(n).matchStatus)).toEqual(['MATCHED', 'INFO', 'REQUIRES_REVIEW', 'REQUIRES_REVIEW', 'REQUIRES_REVIEW', 'INVALID', 'INVALID', 'INVALID', 'MATCHED']);
      expect(st(4).matchNote).toMatch(/Recurring/);
      expect(st(5).matchNote).toMatch(/not the approved Gala project fund/);
      expect(st(6).matchNote).toMatch(/not refundable/);
      expect(st(8).matchNote).toMatch(/ORDER_ID_MISSING/);
      // America/New_York wall time → UTC (EST +5 in November, EDT +4 in July)
      expect(st(2).occurredAt).toBe('2026-11-19T00:05:00.000Z');
      expect(st(10).occurredAt).toBe('2026-07-01T13:00:00.000Z');
      expect(rows.every((r) => r.lineKind === 'DONATION')).toBe(true);
      expect(await ctx.prisma.providerPayment.count({ where: { providerPaymentId: { startsWith: `GD-${tag}` } } })).toBe(0);
      expect(await ctx.prisma.donation.count()).toBe(donationsBefore);
    });

    it('apply records Gala donations in their own category: no Donation rows, no booking effect, test data excluded from totals; idempotent', async () => {
      const totalsBefore = (await finance.get('/admin/sdi/status').expect(200)).body.data.galaTotals;
      const donationsBefore = await ctx.prisma.donation.count();
      const bookingsBefore = await ctx.prisma.eventBooking.count();
      const up = await upload([`11/18/2026,8:00 PM,"1,250.00",Card,Succeeded,,,TEST Gala Project Fund,${o('A')}`, `11/18/2026,8:01 PM,,Card,Abandoned,,,,${o('B')}`]);
      await previewRows(up.id);
      expect((await finance.post(`/admin/sdi/reports/${up.id}/apply`).expect(403)).body.error.code).toBeDefined(); // four eyes + permission
      const applied = (await approver.post(`/admin/sdi/reports/${up.id}/apply`).expect(200)).body.data;
      expect(applied.summary.applied).toMatchObject({ donations: 1, confirmed: 0 });
      const pp = await ctx.prisma.providerPayment.findUniqueOrThrow({ where: { provider_providerPaymentId: { provider: 'sdi_report', providerPaymentId: o('A') } } });
      expect(pp).toMatchObject({ classification: 'CHARITABLE_DONATION', campaignCategory: 'GALA_STANDALONE_DONATION', matchStatus: 'CONFIRMED', type: 'imported_test', matchedEntityType: null, correlationRef: null });
      expect(pp.amount.toFixed(2)).toBe('1250.00');
      expect(JSON.stringify(pp.items)).not.toMatch(/@|name/i); // no personal data copied
      expect(await ctx.prisma.providerPayment.count({ where: { providerPaymentId: o('B') } })).toBe(0); // abandoned: nothing recorded
      expect(await ctx.prisma.donation.count()).toBe(donationsBefore);
      expect(await ctx.prisma.eventBooking.count()).toBe(bookingsBefore);
      const totalsAfter = (await finance.get('/admin/sdi/status').expect(200)).body.data.galaTotals;
      expect(totalsAfter).toEqual(totalsBefore); // synthetic/test records never reach the totals
      // Phase 14 adds a separate category for Gala gifts verified against a MEKI intent (never mixed with tickets or standalone gifts)
      expect(Object.keys(totalsAfter)).toEqual(['currency', 'ticketRevenue', 'galaStandaloneDonations', 'galaDonationIntentsVerified', 'donationRowsAwaitingReview']);

      const again = await upload([`11/18/2026,8:00 PM,1250.00,Card,Succeeded,,,TEST Gala Project Fund,${o('A')}`]);
      expect((await previewRows(again.id))[0].matchStatus).toBe('ALREADY_APPLIED');
      const changed = await upload([`11/19/2026,8:00 PM,1300.00,Card,Succeeded,,,TEST Gala Project Fund,${o('A')}`]);
      expect((await previewRows(changed.id))[0].matchStatus).toBe('REQUIRES_REVIEW');
      const older = await upload([`11/17/2026,8:00 PM,1250.00,Card,Succeeded,,,TEST Gala Project Fund,${o('A')}`]);
      expect((await previewRows(older.id))[0].matchStatus).toBe('STALE');
    });

    it('an order already reconciled as a ticket payment is never re-classified as a donation', async () => {
      await ctx.prisma.providerPayment.create({
        data: { provider: 'sdi_report', providerPaymentId: o('T'), status: 'COMPLETED', type: 'imported_test', amount: '750.00', eligibleAmount: '750.00', refundStatus: 'none', currency: 'USD', classification: 'EVENT_TICKET_PAYMENT', items: [], matchStatus: 'MATCHED', providerCreatedAt: new Date('2026-11-18T12:00:00Z'), lastSyncedAt: new Date('2026-11-18T12:00:00Z') },
      });
      const up = await upload([`11/18/2026,9:00 PM,750,Card,Succeeded,,,TEST Gala Project Fund,${o('T')}`]);
      expect((await previewRows(up.id))[0].matchStatus).toBe('AMBIGUOUS');
    });

    it('ticket reports: additional donation lines stay separate (review), fund/recurring checks apply, unknown "Abandoned"-style statuses map only when configured', async () => {
      const TICKET_HEADERS = 'Order ID,MEKI Booking Reference,Ticket Type,Amount,Payment Status,Payment Date (America/New_York),Payment Time (America/New_York)';
      const file = Buffer.from([TICKET_HEADERS, `TK-${tag}-1,EB-ABCDEFGHJKMN,Donation,100,Succeeded,11/18/2026,7:00 PM`, `TK-${tag}-2,EB-ABCDEFGHJKMN,General admission,750,Mystery,11/18/2026,7:00 PM`].join('\r\n'));
      const up = (await finance.post('/admin/sdi/reports').field('kind', 'RECONCILIATION').field('isSynthetic', 'true').attach('file', file, { filename: `SYNTHETIC-tickets-${uid()}.csv`, contentType: 'text/csv' }).expect(201)).body.data;
      const rows = await previewRows(up.id, { reportType: 'GALA_TICKETS', orderId: 'Order ID', bookingReference: 'MEKI Booking Reference', ticketType: 'Ticket Type', amount: 'Amount', status: 'Payment Status', date: 'Payment Date (America/New_York)', time: 'Payment Time (America/New_York)', dateFormat: 'MDY', timeZone: 'America/New_York', statusMap: { succeeded: 'COMPLETED' }, donationTicketTypes: ['Donation'] });
      expect(rows[0]).toMatchObject({ matchStatus: 'REQUIRES_REVIEW', lineKind: 'DONATION' });
      expect(rows[0].matchNote).toMatch(/Additional Gala donation/);
      expect(rows[1].matchStatus).toBe('REQUIRES_REVIEW');
      expect((await finance.post(`/admin/sdi/reports/${up.id}/preview`, { mapping: { ...MAPPING, timeZone: 'Mars/Olympus' } }).expect(400)).body.error.code).toBe('MAPPING_TIME_ZONE');
      expect((await finance.post(`/admin/sdi/reports/${up.id}/preview`, { mapping: { ...MAPPING, reportType: 'GENERAL' } }).expect(400)).body.error.code).toBe('MAPPING_REPORT_TYPE');
    });
  });

  describe('booking reference and date/time parsing (unit)', () => {
    it('format EB- + 12 Crockford base-32 characters; unique; never contains I, L, O or U; normalised but never "corrected"', () => {
      const refs = new Set(Array.from({ length: 5000 }, () => generateBookingReference()));
      expect(refs.size).toBe(5000);
      for (const r of refs) expect(r).toMatch(BOOKING_REF);
      expect([...refs].join('')).not.toMatch(/[ILOU]/);
      expect(normaliseReference(' eb–8t0dkjrecqf3 ')).toBe('EB-8T0DKJRECQF3');
      expect(normaliseReference('EB-8T0DKJRECQFO')).toBeNull();
      expect(normaliseReference('EB-8T0DKJRECQF')).toBeNull();
    });
    it('times, zones and DST', () => {
      expect(parseTime('7:05 PM')).toEqual({ h: 19, m: 5, s: 0 });
      expect(parseTime('12:00 AM')).toEqual({ h: 0, m: 0, s: 0 });
      expect(parseTime('12:30 p.m.')).toEqual({ h: 12, m: 30, s: 0 });
      expect(parseTime('19:05:09')).toEqual({ h: 19, m: 5, s: 9 });
      for (const bad of ['13:00 PM', '7:60 AM', '24:00', 'noon', '']) expect(parseTime(bad)).toBeNull();
      expect(isValidTimeZone('America/New_York')).toBe(true);
      expect(isValidTimeZone('Mars/Olympus')).toBe(false);
      expect(zonedTimeToUtc(2026, 12, 1, 12, 0, 0, 'America/New_York').toISOString()).toBe('2026-12-01T17:00:00.000Z');
      expect(zonedTimeToUtc(2026, 7, 1, 12, 0, 0, 'America/New_York').toISOString()).toBe('2026-07-01T16:00:00.000Z');
      expect(parseDateTime('11/18/2026', '7:05 PM', 'MDY', 'America/New_York')?.toISOString()).toBe('2026-11-19T00:05:00.000Z');
      expect(parseDateTime('2026-11-18T19:05:00Z', undefined, 'MDY', 'America/New_York')?.toISOString()).toBe('2026-11-18T19:05:00.000Z'); // explicit offset wins
      expect(parseDateTime('11/18/2026 7:05 PM', '7:05 PM', 'MDY', 'America/New_York')).toBeNull(); // time given twice
      expect(parseDateTime('02/30/2026', '7:05 PM', 'MDY', 'America/New_York')).toBeNull();
      expect(parseDateTime('11/18/2026', undefined, 'MDY', 'UTC')?.toISOString()).toBe('2026-11-18T00:00:00.000Z');
    });
  });
});
