import { P14B_EVENT, P14B_PROGRAMME, restoreGalaOnlyEnv, SYNTH_GALA_GIVING, SYNTH_PROGRAMME_FORM } from './gala-only-env';
import { API, createTestApp, loginAs, uid, type Session, type TestContext } from './helpers';
import { AppConfigService } from '../src/config/app-config.service';
import { SdiReportsService } from '../src/modules/sdi/sdi-reports.service';

/**
 * Phase 14B — temporary Gala-only launch mode and independent Gala switches. Program / general "Give" may be fulfilled as a Gala
 * gift ONLY with the donor's explicit acceptance; the source interest is stored apart from the actual destination and is immutable.
 * Gala ticket sales and Gala donations are enabled independently. Synthetic data on *_test only; nothing is paid.
 */
describe('Phase 14B — Gala-only launch mode', () => {
  let ctx: TestContext;
  let approver: Session;
  let finance: Session;
  let programmeId: string;
  let projectId: string;
  const tag = uid();

  const post = (body: object, key = `p14b-${uid()}-${uid()}`) =>
    ctx.http().post(`${API}/public/donation-intents`).set('Idempotency-Key', key).send({ currency: 'USD', classification: 'SADAQAH', amount: '100.00', donor: { fullName: 'Test Donor', email: `d-${uid()}@example.org` }, acceptTerms: true, ...body });
  const redirected = (body: object = {}) => post({ intentType: 'GALA_DONATION', eventSlug: P14B_EVENT, sourceInterest: P14B_PROGRAMME, acknowledgeGalaDestination: true, ...body });
  const withConfig = async (over: Record<string, unknown>, fn: () => Promise<void>) => {
    const cfg = ctx.app.get(AppConfigService);
    const orig = cfg.get.bind(cfg);
    const spy = jest.spyOn(cfg, 'get').mockImplementation(((k: string) => (k in over ? over[k] : orig(k as never))) as never);
    try {
      await fn();
    } finally {
      spy.mockRestore();
    }
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    approver = await loginAs(ctx, ['ADMINISTRATOR']);
    finance = await loginAs(ctx, ['FINANCE_MANAGER']);
    programmeId = (await ctx.prisma.programme.create({ data: { code: `PRG-P14B-${tag}`.toUpperCase(), slug: P14B_PROGRAMME, nameEn: `P14B Health ${tag}`, nameAr: `صحة ${tag}`, status: 'PUBLISHED', provenance: 'VERIFIED_SOURCE' } })).id;
    const page = await ctx.prisma.page.create({ data: { slug: `event-p14b-${tag}`, titleEn: 'P14B', status: 'PUBLISHED' } });
    const ev = await ctx.prisma.event.create({ data: { code: `EVT-P14B-${tag}`.toUpperCase(), slug: P14B_EVENT, titleEn: `P14B Gala ${tag}`, status: 'PUBLISHED', approvedAt: new Date(), pageId: page.id } });
    projectId = (await ctx.prisma.project.create({ data: { code: `P14B-${tag}`.toUpperCase(), slug: `p14b-project-${tag}`, nameEn: `TEST Gala Project ${tag}`, provenance: 'PROPOSED' } })).id;
    await ctx.prisma.eventFundraisingConfig.create({
      data: { eventId: ev.id, projectId, projectPlanReference: 'SYNTHETIC Project Plan', projectPlanApprovedAt: new Date(), projectPlanApprovedById: approver.userId, fundraisingAuthorizedAt: new Date(), fundraisingAuthorizedById: approver.userId, donationsCloseAt: new Date(Date.now() + 30 * 86_400_000), updatedById: finance.userId },
    });
    await ctx.prisma.eventTicketConfig.create({ data: { eventId: ev.id, ticketPrice: '500.000', currency: 'USD', salesEnabled: true, capacity: 350, displayNameEn: 'Every Light Counts', eventDateLabelEn: 'Saturday, December 12, 2026', venueLabelEn: '583 Park Avenue, New York' } });
  });
  afterAll(async () => {
    await ctx.prisma.event.updateMany({ where: { slug: P14B_EVENT }, data: { status: 'ARCHIVED' } }).catch(() => undefined);
    await ctx.prisma.programme.updateMany({ where: { id: programmeId }, data: { deletedAt: new Date() } });
    await ctx.prisma.project.updateMany({ where: { id: projectId }, data: { deletedAt: new Date() } });
    await ctx.app.close();
    restoreGalaOnlyEnv();
  });

  it('options: program and general giving closed; Gala-only active with the approved project and disclosure version', async () => {
    const o = (await ctx.http().get(`${API}/public/giving/options`).expect(200)).body.data;
    expect(o.channels.general).toMatchObject({ available: false, reason: 'NOT_AUTHORIZED_BY_SDI' });
    expect(o.programmes.find((p: { slug: string }) => p.slug === P14B_PROGRAMME)).toMatchObject({ payable: false, reason: 'NOT_AUTHORIZED_BY_SDI' });
    expect(o.galaOnly).toMatchObject({ active: true, reason: null, eventSlug: P14B_EVENT, project: { name: `TEST Gala Project ${tag}` }, disclosureVersion: expect.stringMatching(/^gala-only-/), zakat: { allowed: false, reason: 'NOT_ZAKAT_ELIGIBLE' } });
  });

  it('never silent: a program gift is refused, and a redirect needs explicit acceptance; nothing is written', async () => {
    const before = await ctx.prisma.donation.count({ where: { intentType: { not: null } } });
    expect((await post({ intentType: 'PROGRAM_DONATION', programmeSlug: P14B_PROGRAMME }).expect(409)).body.error.details.reason).toBe('NOT_AUTHORIZED_BY_SDI');
    expect((await redirected({ acknowledgeGalaDestination: undefined }).expect(400)).body.error.code).toBe('GALA_DESTINATION_NOT_ACKNOWLEDGED');
    expect((await redirected({ acknowledgeGalaDestination: false }).expect(400)).body.error.code).toBe('GALA_DESTINATION_NOT_ACKNOWLEDGED');
    expect((await post({ intentType: 'PROGRAM_DONATION', programmeSlug: P14B_PROGRAMME, sourceInterest: P14B_PROGRAMME, acknowledgeGalaDestination: true }).expect(400)).body.error.code).toBe('INTEREST_ONLY_FOR_GALA');
    expect((await redirected({ eventSlug: 'gala-night' }).expect(400)).body.error.code).toBe('GALA_ONLY_WRONG_EVENT');
    expect((await redirected({ sourceInterest: 'no-such-programme' }).expect(422)).body.error.code).toBe('PROGRAMME_NOT_FOUND');
    expect(await ctx.prisma.donation.count({ where: { intentType: { not: null } } })).toBe(before);
  });

  it('accepted redirect: destination = Gala project; source interest kept separately with the acceptance, audited', async () => {
    const r = (await redirected({ amount: '75' }).expect(201)).body.data;
    expect(r).toMatchObject({ intentType: 'GALA_DONATION', designation: { type: 'PROJECT', name: `TEST Gala Project ${tag}` }, interest: { kind: 'PROGRAMME', slug: P14B_PROGRAMME, name: `P14B Health ${tag}` } });
    expect(r.handoff.formUrl).toBe(SYNTH_GALA_GIVING);
    const d = await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: r.reference }, include: { allocations: true } });
    expect(d).toMatchObject({ interestKind: 'PROGRAMME', interestProgrammeId: programmeId, destinationDisclosureVersion: expect.stringMatching(/^gala-only-/) });
    expect(d.destinationDisclosureAcceptedAt).toBeInstanceOf(Date);
    expect(d.allocations).toMatchObject([{ designation: 'PROJECT', projectId, programmeId: null }]); // the programme is NOT the destination
    const audit = await ctx.prisma.auditLog.findFirstOrThrow({ where: { entityType: 'Donation', entityId: d.id, action: 'giving.intent.create' } });
    expect(audit.metadata).toMatchObject({ sourceInterest: P14B_PROGRAMME, destinationDisclosureAccepted: true });
    const g = (await redirected({ sourceInterest: 'general' }).expect(201)).body.data;
    expect(g.interest).toMatchObject({ kind: 'GENERAL', slug: null });
    // the donor's status page shows both, without personal data
    const s = (await ctx.http().get(`${API}/public/donation-intents/${r.reference}/status?token=${encodeURIComponent(r.accessToken)}`).expect(200)).body.data;
    expect(s).toMatchObject({ designation: { type: 'PROJECT' }, interest: { kind: 'PROGRAMME', slug: P14B_PROGRAMME } });
  });

  it('source interest and acceptance are immutable (new trigger); the Phase 14 trigger still protects the classification', async () => {
    const r = (await redirected().expect(201)).body.data;
    for (const data of [{ interestProgrammeId: null }, { interestKind: 'GENERAL' }, { destinationDisclosureVersion: 'other' }, { destinationDisclosureAcceptedAt: new Date(0) }, { charitableClassification: 'ZAKAT' as const }]) {
      await expect(ctx.prisma.donation.update({ where: { reference: r.reference }, data })).rejects.toThrow(/immutable/);
    }
    await ctx.prisma.donation.update({ where: { reference: r.reference }, data: { locale: 'ar' } });
  });

  it('the mode is a separate switch; an open program channel is never bypassed', async () => {
    await withConfig({ GIVING_GALA_ONLY_MODE: false }, async () => {
      expect((await ctx.http().get(`${API}/public/giving/options`).expect(200)).body.data.galaOnly).toMatchObject({ active: false, reason: 'GALA_ONLY_MODE_OFF', project: null });
      expect((await redirected().expect(409)).body.error.details.reason).toBe('GALA_ONLY_MODE_OFF');
      // a direct Gala donation (no redirect) is unaffected by this switch
      await post({ intentType: 'GALA_DONATION', eventSlug: P14B_EVENT }).expect(201);
    });
    await withConfig({ SDI_DONATION_REFERENCE_CONFIRMED: false }, async () => {
      expect((await ctx.http().get(`${API}/public/giving/options`).expect(200)).body.data.galaOnly).toMatchObject({ active: false, reason: 'REFERENCE_QUESTION_NOT_CONFIRMED' });
    });
    await withConfig({ PROGRAMME_GIVING_AUTHORIZED: true, SDI_PROGRAMME_GIVING_ENABLED: true, SDI_PROGRAMME_DESIGNATION_CONFIRMED: true, SDI_PROGRAMME_FORM_URLS: JSON.stringify({ [P14B_PROGRAMME]: SYNTH_PROGRAMME_FORM }) }, async () => {
      expect((await redirected().expect(409)).body.error.code).toBe('INTEREST_CHANNEL_OPEN');
      expect((await post({ intentType: 'PROGRAM_DONATION', programmeSlug: P14B_PROGRAMME }).expect(201)).body.data.handoff.formUrl).toBe(SYNTH_PROGRAMME_FORM);
    });
  });

  it('Zakat on a redirected gift follows the Gala project (not eligible by default)', async () => {
    expect((await redirected({ classification: 'ZAKAT' }).expect(422)).body.error).toMatchObject({ code: 'ZAKAT_NOT_ALLOWED', details: { reason: 'NOT_ZAKAT_ELIGIBLE' } });
  });

  it('Gala ticket sales and Gala donations are enabled independently', async () => {
    const ticketing = async () => (await ctx.http().get(`${API}/public/events/${P14B_EVENT}/ticketing`).expect(200)).body.data;
    const giving = async () => (await ctx.http().get(`${API}/public/events/${P14B_EVENT}/giving-options`).expect(200)).body.data;
    const book = (key = `p14b-bk-${uid()}-${uid()}`) => ctx.http().post(`${API}/public/events/${P14B_EVENT}/hosted-bookings`).set('Idempotency-Key', key).send({ purchaser: { fullName: 'Amira Hassan', email: `b-${uid()}@example.org` }, ticketCount: 2, privacyConsent: true });
    expect((await ticketing()).hosted).toMatchObject({ available: true });
    expect((await giving()).available).toBe(true);
    await withConfig({ SDI_GALA_GIVING_ENABLED: false }, async () => {
      expect((await giving()).available).toBe(false);
      expect((await ticketing()).hosted.available).toBe(true);
      const b = (await book().expect(201)).body.data;
      expect(b.reference).toMatch(/^EB-[0-9A-Z]{12}$/);
      expect(b).toMatchObject({ bookingStatus: 'PENDING' });
      expect((await post({ intentType: 'GALA_DONATION', eventSlug: P14B_EVENT }).expect(409)).body.error.details.reason).toBe('GALA_GIVING_NOT_AUTHORIZED');
    });
    await withConfig({ GALA_HOSTED_SALES_ENABLED: false }, async () => {
      expect((await ticketing()).hosted.available).toBe(false);
      expect((await book().expect(422)).body.error.code).toBe('TICKET_SALES_CLOSED');
      expect((await giving()).available).toBe(true);
      await post({ intentType: 'GALA_DONATION', eventSlug: P14B_EVENT }).expect(201);
    });
  });

  it('reconciliation: a redirected gift is verified as a Gala gift; a report naming the source programme goes to review', async () => {
    const ok = (await redirected({ amount: '120' }).expect(201)).body.data.reference;
    const wrong = (await redirected({ amount: '80' }).expect(201)).body.data.reference;
    const HEADERS = 'Payment Date,Total Amount,Payment Status,MEKI Donation Reference,Donation Type,Program,Order ID';
    const MAP = { reportType: 'GALA_DONATIONS', orderId: 'Order ID', amount: 'Total Amount', status: 'Payment Status', date: 'Payment Date', dateFormat: 'ISO', donationReference: 'MEKI Donation Reference', donationType: 'Donation Type', designation: 'Program', designationMap: { gala: 'GALA_PROJECT', health: `programme:${P14B_PROGRAMME}` }, statusMap: { succeeded: 'COMPLETED' } };
    const csv = [HEADERS, `2026-11-22,120,Succeeded,${ok},Sadaqah,Gala,P14B-${tag}-1`, `2026-11-22,80,Succeeded,${wrong},Sadaqah,Health,P14B-${tag}-2`].join('\r\n');
    const up = (await finance.post('/admin/sdi/reports').field('kind', 'RECONCILIATION').field('isSynthetic', 'true').attach('file', Buffer.from(csv), { filename: `SYNTHETIC-p14b-${uid()}.csv`, contentType: 'text/csv' }).expect(201)).body.data;
    await finance.post(`/admin/sdi/reports/${up.id}/preview`, { mapping: MAP }).expect(200);
    const rows = (await finance.get(`/admin/sdi/reports/${up.id}/rows?pageSize=10`).expect(200)).body.data as { rowNumber: number; matchStatus: string; matchNote: string }[];
    expect(rows[0].matchStatus).toBe('MATCHED');
    expect(rows[1]).toMatchObject({ matchStatus: 'REQUIRES_REVIEW' });
    expect(rows[1].matchNote).toMatch(/GALA_PROJECT/);
    await finance.post(`/admin/sdi/reports/${up.id}/apply`).expect(403); // second administrator only
    await approver.post(`/admin/sdi/reports/${up.id}/apply`).expect(200);
    expect(await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: ok } })).toMatchObject({ reconciliationStatus: 'VERIFIED', paymentStatus: 'PAID', interestKind: 'PROGRAMME' });
    expect((await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: wrong } })).reconciliationStatus).toBe('NEEDS_REVIEW');
    const list = (await approver.get(`/admin/donation-intents?includeTest=true&search=${ok}`).expect(200)).body.data;
    expect(list[0]).toMatchObject({ interest: { kind: 'PROGRAMME', slug: P14B_PROGRAMME }, designation: { type: 'PROJECT' } });
  });

  const evidencePath = '/admin/sdi/payment-evidence';
  const fullEvidence = (reference: string, amount = '100.00') => ({ reference, evidenceReference: reference, externalPaymentId: `SYNTH-MANUAL-${uid()}`, amount, currency: 'USD', occurredAt: new Date().toISOString(), formUrl: SYNTH_GALA_GIVING, classification: 'SADAQAH', emailMessageId: `<synthetic-${uid()}@example.invalid>`, emailFrom: 'sdi@example.invalid', emailTo: 'finance@example.invalid', emailReceivedAt: new Date().toISOString(), protectedReference: `sdi-evidence:SYNTHETIC-${uid()}`, originalSdiEmail: true, note: 'SYNTHETIC integration fixture, no real email or payment' });

  it('manual evidence stays pending without authoritative details; approval is disabled by default and restricted by RBAC', async () => {
    const ref = (await redirected().expect(201)).body.data.reference;
    const e = (await finance.post(evidencePath, { reference: ref, note: 'Original SDI email not yet available' }).expect(201)).body.data;
    expect(e.status).toBe('PENDING_REVIEW');
    await approver.post(`${evidencePath}/${e.id}/decision`, { decision: 'APPROVE', note: 'Cannot approve without authentic evidence' }).expect(503);
    const editor = await loginAs(ctx, ['CONTENT_EDITOR']);
    await editor.get(evidencePath).expect(403);
    await editor.post(evidencePath, { reference: ref, note: 'Unauthorized evidence attempt' }).expect(403);
    expect(await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: ref } })).toMatchObject({ paymentStatus: 'UNPAID', reconciliationStatus: 'AWAITING_REPORT' });
    await withConfig({ SDI_MANUAL_CONFIRMATION_ENABLED: true }, async () => {
      await approver.post(`${evidencePath}/${e.id}/decision`, { decision: 'APPROVE', note: 'Insufficient evidence must stay pending' }).expect(422);
      await finance.post(`${evidencePath}/${e.id}/decision`, { decision: 'REJECT', note: 'Self review must always be refused' }).expect(403);
      await approver.post(`${evidencePath}/${e.id}/decision`, { decision: 'REJECT', note: 'Request stronger original SDI evidence' }).expect(200);
    });
  });

  it('manual evidence rejects mismatched money, reference, source and classification; screenshots cannot qualify', async () => {
    const ref = (await redirected().expect(201)).body.data.reference;
    for (const patch of [{ amount: '101.00' }, { currency: 'EUR' }, { evidenceReference: 'DN-AAAAAAAAAAAA' }, { formUrl: 'https://www.zeffy.com/wrong-form' }, { classification: 'ZAKAT' }]) {
      await finance.post(evidencePath, { ...fullEvidence(ref), ...patch }).expect(422);
    }
    const e = (await finance.post(evidencePath, { ...fullEvidence(ref), originalSdiEmail: false }).expect(201)).body.data;
    expect(e.status).toBe('PENDING_REVIEW');
    await expect(ctx.prisma.manualPaymentEvidence.update({ where: { id: e.id }, data: { amount: '1' } })).rejects.toThrow(/immutable/);
    await expect(ctx.prisma.manualPaymentEvidence.delete({ where: { id: e.id } })).rejects.toThrow(/cannot be deleted/);
  });

  it('second-admin manual approval is atomic and idempotent; the external order cannot pay two intents', async () => {
    const ref = (await redirected().expect(201)).body.data.reference;
    const other = (await redirected().expect(201)).body.data.reference;
    const input = fullEvidence(ref);
    const e = (await finance.post(evidencePath, input).expect(201)).body.data;
    expect(e.status).toBe('AWAITING_APPROVAL');
    await withConfig({ SDI_MANUAL_CONFIRMATION_ENABLED: true }, async () => {
      await finance.post(`${evidencePath}/${e.id}/decision`, { decision: 'APPROVE', note: 'Self approval is always forbidden' }).expect(403);
      const decision = { decision: 'APPROVE', note: 'SYNTHETIC second administrator review only' };
      await approver.post(`${evidencePath}/${e.id}/decision`, decision).expect(200);
      await approver.post(`${evidencePath}/${e.id}/decision`, decision).expect(200);
      await finance.post(evidencePath, { ...input, reference: other, evidenceReference: other }).expect(409);
    });
    expect(await ctx.prisma.providerPayment.count({ where: { provider: 'sdi_report', providerPaymentId: input.externalPaymentId } })).toBe(1);
    const d = await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: ref } });
    expect(d).toMatchObject({ paymentStatus: 'PAID', reconciliationStatus: 'VERIFIED', reconciledReportId: null, payoutStatus: 'NOT_REPORTED', allocationStatus: 'PENDING_AUTHORIZATION' });
    await approver.post(`/admin/donation-intents/${d.id}/allocation`, { decision: 'AUTHORIZE', fund: 'Gala', note: 'Payment approver cannot allocate' }).expect(403);

    const mapping = { reportType: 'GALA_DONATIONS', orderId: 'Order ID', amount: 'Amount', currency: 'Currency', status: 'Status', date: 'Date', dateFormat: 'ISO', donationReference: 'Reference', donationType: 'Type', designation: 'Fund', designationMap: { gala: 'GALA_PROJECT', wrong: 'GENERAL' }, statusMap: { succeeded: 'COMPLETED', failed: 'FAILED' } };
    const report = async (patch: { amount?: string; reference?: string; type?: string; fund?: string; status?: string } = {}) => {
      const csv = `Order ID,Amount,Currency,Status,Date,Reference,Type,Fund\r\n${input.externalPaymentId},${patch.amount ?? '100.00'},USD,${patch.status ?? 'Succeeded'},${input.occurredAt},${patch.reference ?? ref},${patch.type ?? 'Sadaqah'},${patch.fund ?? 'Gala'}\r\n`;
      const up = (await finance.post('/admin/sdi/reports').field('kind', 'RECONCILIATION').field('isSynthetic', 'true').attach('file', Buffer.from(csv), { filename: `SYNTHETIC-manual-${uid()}.csv`, contentType: 'text/csv' }).expect(201)).body.data;
      await finance.post(`/admin/sdi/reports/${up.id}/preview`, { mapping }).expect(200);
      const rows = (await finance.get(`/admin/sdi/reports/${up.id}/rows`).expect(200)).body.data;
      return { id: up.id, row: rows[0] };
    };
    for (const patch of [{ amount: '99.00' }, { reference: other }, { type: 'Zakat' }, { fund: 'Wrong' }, { status: 'Failed' }]) {
      const r = await report(patch);
      expect(r.row.matchStatus).not.toBe('ALREADY_APPLIED');
      await approver.post(`/admin/sdi/reports/${r.id}/apply`).expect(200);
    }
    const r = await report();
    expect(r.row.matchStatus).toBe('ALREADY_APPLIED');
    await approver.post(`/admin/sdi/reports/${r.id}/apply`).expect(200);
    expect(await ctx.prisma.manualPaymentEvidence.findUniqueOrThrow({ where: { id: e.id } })).toMatchObject({ status: 'APPROVED', reportImportId: r.id, reportReconciledAt: expect.any(Date) });
    expect(await ctx.prisma.providerPayment.count({ where: { providerPaymentId: input.externalPaymentId } })).toBe(1);
    expect(await ctx.prisma.donation.findUniqueOrThrow({ where: { id: d.id } })).toMatchObject({ paymentStatus: 'PAID', reconciledReportId: null });
    // Isolated *_test fixture: simulate the non-test provider category only while testing
    // the report-derived aggregate, then restore the fixture's explicit test category.
    const totals = ctx.app.get(SdiReportsService);
    const before = await totals.galaTotals();
    const payment = await ctx.prisma.providerPayment.findFirstOrThrow({ where: { providerPaymentId: input.externalPaymentId } });
    try {
      await ctx.prisma.providerPayment.update({ where: { id: payment.id }, data: { type: 'manual' } });
      const after = await totals.galaTotals();
      expect(Number(after.galaDonationIntentsVerified.amount) - Number(before.galaDonationIntentsVerified.amount)).toBe(100);
      expect(after.galaDonationIntentsVerified.gifts - before.galaDonationIntentsVerified.gifts).toBe(1);
      expect((await ctx.prisma.providerPayment.findUniqueOrThrow({ where: { id: payment.id } })).lastEventId).toBe(`manual-evidence:${e.id}`);
    } finally {
      await ctx.prisma.providerPayment.update({ where: { id: payment.id }, data: { type: 'manual_test' } });
    }
  });

  it('concurrent approvals for the same external order confirm only one intent', async () => {
    const ref1 = (await redirected().expect(201)).body.data.reference;
    const ref2 = (await redirected().expect(201)).body.data.reference;
    const input = fullEvidence(ref1);
    const e1 = (await finance.post(evidencePath, input).expect(201)).body.data;
    // Layer 1: a second live claim on the same external order is refused at submission.
    expect((await finance.post(evidencePath, { ...input, reference: ref2, evidenceReference: ref2 }).expect(409)).body.error.code).toBe('EXTERNAL_ID_ALREADY_CLAIMED');
    // Layer 2: two submissions arriving at the same instant can both pass that check — simulate the racing row directly.
    const d2 = await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: ref2 } });
    const e2 = await ctx.prisma.manualPaymentEvidence.create({
      data: { ...input, reference: ref2, evidenceReference: ref2, amount: input.amount, occurredAt: new Date(input.occurredAt), emailReceivedAt: new Date(input.emailReceivedAt), targetType: 'Donation', targetId: d2.id, submittedById: finance.userId, status: 'AWAITING_APPROVAL' },
    });
    await withConfig({ SDI_MANUAL_CONFIRMATION_ENABLED: true }, async () => {
      const results = await Promise.all([e1, e2].map((e) => approver.post(`${evidencePath}/${e.id}/decision`, { decision: 'APPROVE', note: 'SYNTHETIC concurrent second-admin review' })));
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    });
    expect(await ctx.prisma.donation.count({ where: { reference: { in: [ref1, ref2] }, paymentStatus: 'PAID' } })).toBe(1);
    expect(await ctx.prisma.providerPayment.count({ where: { providerPaymentId: input.externalPaymentId } })).toBe(1);
  });

  it('hosted ticket evidence uses the existing booking pipeline and issues no official tickets or receipts', async () => {
    const book = (await ctx.http().post(`${API}/public/events/${P14B_EVENT}/hosted-bookings`).set('Idempotency-Key', `manual-bk-${uid()}-${uid()}`).send({ purchaser: { fullName: 'Synthetic Purchaser', email: `b-${uid()}@example.invalid` }, ticketCount: 2, privacyConsent: true }).expect(201)).body.data;
    const ticketing = (await ctx.http().get(`${API}/public/events/${P14B_EVENT}/ticketing`).expect(200)).body.data;
    const input = { ...fullEvidence(book.reference, '1000.00'), classification: undefined, formUrl: ticketing.hosted.formUrl };
    const e = (await approver.post(evidencePath, input).expect(201)).body.data;
    const second = await loginAs(ctx, ['ADMINISTRATOR']);
    await withConfig({ SDI_MANUAL_CONFIRMATION_ENABLED: true }, async () => {
      await approver.post(`${evidencePath}/${e.id}/decision`, { decision: 'APPROVE', note: 'Same administrator must not approve' }).expect(403);
      await second.post(`${evidencePath}/${e.id}/decision`, { decision: 'APPROVE', note: 'SYNTHETIC ticket evidence second review' }).expect(200);
    });
    const b = await ctx.prisma.eventBooking.findUniqueOrThrow({ where: { publicReference: book.reference } });
    expect(b).toMatchObject({ bookingStatus: 'CONFIRMED', paymentStatus: 'PAID', reportedTicketCount: 2, ticketIssuer: 'ZEFFY' });
    expect(await ctx.prisma.eventTicket.count({ where: { bookingId: b.id } })).toBe(0);
    expect(await ctx.prisma.eventBookingTransaction.count({ where: { bookingId: b.id, type: 'CAPTURE' } })).toBe(1);
  });
});
