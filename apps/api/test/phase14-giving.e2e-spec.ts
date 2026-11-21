import { P14_PROGRAMME, P14_PROGRAMME_NO_FORM, restoreGivingEnv, SYNTH } from './giving-env';
import { API, createTestApp, loginAs, uid, type Session, type TestContext } from './helpers';
import { AppConfigService } from '../src/config/app-config.service';

/**
 * Phase 14 — hosted donation intents (Gala / programme / general), Zakat & Sadaqah, Zakat eligibility (four eyes), SDI report
 * matching against MEKI donation references, and fund-allocation authorization. Every report is a SYNTHETIC FIXTURE; the
 * agreement switches are a TEST-ONLY hypothetical (giving-env.ts). Runs against *_test; nothing is deleted; nothing is paid.
 */
describe('Phase 14 — giving intents, Zakat/Sadaqah and SDI reconciliation', () => {
  let ctx: TestContext;
  let editor: Session; // ADMINISTRATOR — requests Zakat eligibility, authorizes allocations
  let approver: Session; // second ADMINISTRATOR — approves Zakat requests and applies SDI reports
  let finance: Session; // FINANCE_MANAGER — uploads reports
  let content: Session; // CONTENT_MANAGER — no finance access
  let programmeId: string;
  let projectId: string;
  let eventSlug: string;
  const tag = uid();

  const intent = (body: object, key = `p14-${uid()}-${uid()}`) =>
    ctx.http().post(`${API}/public/donation-intents`).set('Idempotency-Key', key).send({ currency: 'USD', classification: 'SADAQAH', amount: '100.00', donor: { fullName: 'Test Donor', email: `donor-${uid()}@example.org` }, acceptTerms: true, ...body });
  const gala = (body: object = {}) => intent({ intentType: 'GALA_DONATION', eventSlug, ...body });
  const prog = (body: object = {}) => intent({ intentType: 'PROGRAM_DONATION', programmeSlug: P14_PROGRAMME, ...body });
  const general = (body: object = {}) => intent({ intentType: 'GENERAL_DONATION', ...body });

  /** Temporarily overrides configuration values for one test (the running app reads them through AppConfigService). */
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
    editor = await loginAs(ctx, ['ADMINISTRATOR']);
    approver = await loginAs(ctx, ['ADMINISTRATOR']);
    finance = await loginAs(ctx, ['FINANCE_MANAGER']);
    content = await loginAs(ctx, ['CONTENT_MANAGER']);
    programmeId = (await ctx.prisma.programme.create({ data: { code: `PRG-P14-${tag}`.toUpperCase(), slug: P14_PROGRAMME, nameEn: `P14 Programme ${tag}`, nameAr: `برنامج ${tag}`, status: 'PUBLISHED', provenance: 'VERIFIED_SOURCE' } })).id;
    await ctx.prisma.programme.create({ data: { code: `PRG-P14N-${tag}`.toUpperCase(), slug: P14_PROGRAMME_NO_FORM, nameEn: `P14 No form ${tag}`, status: 'PUBLISHED', provenance: 'VERIFIED_SOURCE' } });
    // Gala: published event with its single approved project (approvals recorded directly — Phase 12B tests cover that workflow)
    const page = await ctx.prisma.page.create({ data: { slug: `event-p14-${tag}`, titleEn: 'P14', status: 'PUBLISHED' } });
    const ev = await ctx.prisma.event.create({ data: { code: `EVT-P14-${tag}`.toUpperCase(), slug: `p14-${tag}`, titleEn: `P14 Gala ${tag}`, status: 'PUBLISHED', approvedAt: new Date(), pageId: page.id } });
    eventSlug = ev.slug;
    projectId = (await ctx.prisma.project.create({ data: { code: `P14-${tag}`.toUpperCase(), slug: `p14-project-${tag}`, nameEn: `TEST Gala Project ${tag}`, provenance: 'PROPOSED' } })).id;
    await ctx.prisma.eventFundraisingConfig.create({
      data: { eventId: ev.id, projectId, projectPlanReference: 'SYNTHETIC Project Plan v1', projectPlanApprovedAt: new Date(), projectPlanApprovedById: approver.userId, fundraisingAuthorizedAt: new Date(), fundraisingAuthorizedById: approver.userId, donationsCloseAt: new Date(Date.now() + 30 * 86_400_000), updatedById: editor.userId },
    });
  });
  afterAll(async () => {
    await ctx.prisma.event.updateMany({ where: { slug: eventSlug }, data: { status: 'ARCHIVED' } }).catch(() => undefined);
    await ctx.prisma.programme.updateMany({ where: { slug: { in: [P14_PROGRAMME, P14_PROGRAMME_NO_FORM] } }, data: { deletedAt: new Date() } });
    await ctx.prisma.project.updateMany({ where: { id: projectId }, data: { deletedAt: new Date() } });
    await ctx.app.close();
    restoreGivingEnv();
  });

  describe('options and disabled channels', () => {
    it('lists programmes for information, payable only with an SDI form; Zakat NOT eligible by default', async () => {
      const o = (await ctx.http().get(`${API}/public/giving/options`).expect(200)).body.data;
      expect(o.currency).toBe('USD');
      expect(o.channels.general).toMatchObject({ available: true, zakat: { allowed: false, reason: 'NO_ZAKAT_TARGET' } });
      const p = o.programmes.find((x: { slug: string }) => x.slug === P14_PROGRAMME);
      expect(p).toMatchObject({ payable: true, zakat: { allowed: false, reason: 'NOT_ZAKAT_ELIGIBLE' } });
      expect(o.programmes.find((x: { slug: string }) => x.slug === P14_PROGRAMME_NO_FORM)).toMatchObject({ payable: false, reason: 'NO_FORM_FOR_PROGRAMME' });
      expect(o.programmes.every((x: { zakat: { allowed: boolean } }) => !x.zakat.allowed)).toBe(true);
      const g = (await ctx.http().get(`${API}/public/events/${eventSlug}/giving-options`).expect(200)).body.data;
      expect(g).toMatchObject({ available: true, project: { name: `TEST Gala Project ${tag}` }, zakat: { allowed: false, reason: 'NOT_ZAKAT_ELIGIBLE' }, directLinkOnly: false });
    });

    it('each channel is refused on its own switch (409 GIVING_CHANNEL_DISABLED); nothing is written', async () => {
      const before = await ctx.prisma.donation.count({ where: { intentType: { not: null } } });
      await withConfig({ GENERAL_GIVING_AUTHORIZED: false }, async () => {
        expect((await general().expect(409)).body.error).toMatchObject({ code: 'GIVING_CHANNEL_DISABLED', details: { reason: 'NOT_AUTHORIZED_BY_SDI' } });
        await prog().expect(201); // programme channel unaffected
      });
      await withConfig({ PROGRAMME_GIVING_AUTHORIZED: false }, async () => {
        expect((await prog().expect(409)).body.error.details.reason).toBe('NOT_AUTHORIZED_BY_SDI');
      });
      await withConfig({ SDI_PROGRAMME_DESIGNATION_CONFIRMED: false }, async () => {
        expect((await prog().expect(409)).body.error.details.reason).toBe('DESIGNATION_NOT_CONFIRMED');
      });
      await withConfig({ SDI_DONATION_REFERENCE_CONFIRMED: false }, async () => {
        for (const r of [await gala().expect(409), await general().expect(409)]) expect(r.body.error.details.reason).toBe('REFERENCE_QUESTION_NOT_CONFIRMED');
        // the Phase 12B direct Gala link stays the only Gala path
        expect((await ctx.http().get(`${API}/public/events/${eventSlug}/giving-options`).expect(200)).body.data).toMatchObject({ available: false, directLinkOnly: true });
      });
      await withConfig({ SDI_GALA_GIVING_ENABLED: false }, async () => {
        expect((await gala().expect(409)).body.error.details.reason).toBe('GALA_GIVING_NOT_AUTHORIZED');
      });
      expect((await intent({ intentType: 'PROGRAM_DONATION', programmeSlug: P14_PROGRAMME_NO_FORM }).expect(409)).body.error.details.reason).toBe('NO_FORM_FOR_PROGRAMME');
      expect(await ctx.prisma.donation.count({ where: { intentType: { not: null } } })).toBe(before + 1); // only the one allowed programme intent
    });

    it('rejects malformed intents (wrong combinations, currency, terms, amount)', async () => {
      expect((await gala({ programmeSlug: P14_PROGRAMME }).expect(400)).body.error.code).toBe('GALA_DONATION_NO_PROGRAMME');
      expect((await intent({ intentType: 'PROGRAM_DONATION' }).expect(400)).body.error.code).toBe('PROGRAMME_REQUIRED');
      expect((await general({ programmeSlug: P14_PROGRAMME }).expect(400)).body.error.code).toBe('GENERAL_DONATION_NO_PROGRAMME');
      await general({ currency: 'EUR' }).expect(400);
      await general({ acceptTerms: false }).expect(400);
      await general({ amount: '0' }).expect(422);
      expect((await general({ amount: '10.001' }).expect(422)).body.error.code).toBe('INVALID_AMOUNT_PRECISION');
      await ctx.http().post(`${API}/public/donation-intents`).send({ intentType: 'GENERAL_DONATION', currency: 'USD', classification: 'SADAQAH', amount: '5', donor: { fullName: 'X Y', email: 'x@example.org' }, acceptTerms: true }).expect(400); // no Idempotency-Key
    });
  });

  describe('creating intents', () => {
    it('Gala donation: DN reference before hand-off, Gala form only, project designation, pending; audited original choice', async () => {
      const r = (await gala({ amount: '250' }).expect(201)).body.data;
      expect(r.reference).toMatch(/^DN-[0-9A-Z]{12}$/);
      expect(r).toMatchObject({ intentType: 'GALA_DONATION', classification: 'SADAQAH', amount: '250.00', currency: 'USD', stage: 'PENDING_EXTERNAL', designation: { type: 'PROJECT', name: `TEST Gala Project ${tag}` } });
      expect(r.handoff).toMatchObject({ formUrl: SYNTH.galaGiving, referenceQuestion: 'MEKI Donation Reference', donationTypeQuestion: 'Donation Type', donationTypeAnswer: 'Sadaqah', prefill: false });
      const d = await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: r.reference }, include: { allocations: true } });
      expect(d).toMatchObject({ status: 'PENDING', paymentStatus: 'UNPAID', provider: 'sdi_hosted', intentType: 'GALA_DONATION', charitableClassification: 'SADAQAH', reconciliationStatus: 'AWAITING_REPORT', allocationStatus: 'PENDING_AUTHORIZATION', payoutStatus: 'NOT_REPORTED', externalPaymentId: null });
      expect(d.allocations).toMatchObject([{ designation: 'PROJECT', projectId, programmeId: null }]);
      const audit = await ctx.prisma.auditLog.findFirstOrThrow({ where: { entityType: 'Donation', entityId: d.id, action: 'giving.intent.create' } });
      expect(audit.metadata).toMatchObject({ classification: 'SADAQAH', intentType: 'GALA_DONATION', amount: '250.00' });
    });

    it('programme preselection: the programme form (never the Gala form), programme designation', async () => {
      const r = (await prog().expect(201)).body.data;
      expect(r).toMatchObject({ intentType: 'PROGRAM_DONATION', designation: { type: 'PROGRAMME', slug: P14_PROGRAMME } });
      expect(r.handoff.formUrl).toBe(SYNTH.programme);
      expect(r.handoff.formUrl).not.toBe(SYNTH.galaGiving);
      const g = (await general().expect(201)).body.data;
      expect(g).toMatchObject({ designation: { type: 'GENERAL_FUND' } });
      expect(g.handoff.formUrl).toBe(SYNTH.general);
    });

    it('idempotency and duplicate-reference protection', async () => {
      const key = `p14-idem-${uid()}-${uid()}`;
      const body = { intentType: 'GENERAL_DONATION', amount: '40', donor: { fullName: 'Same Donor', email: 'same@example.org' } };
      const a = (await intent(body, key).expect(201)).body.data;
      const b = (await intent(body, key).expect(201)).body.data;
      expect(b.reference).toBe(a.reference);
      expect(b.accessToken).toBe(a.accessToken);
      expect((await intent({ ...body, amount: '41' }, key).expect(409)).body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      const existing = await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: a.reference } });
      await expect(ctx.prisma.donation.create({ data: { reference: a.reference, accessTokenHash: '0'.repeat(64), donorId: existing.donorId, amount: 1, currency: 'USD' } })).rejects.toMatchObject({ code: 'P2002' });
    });

    it('the intent type and Zakat/Sadaqah choice are immutable (database trigger); other fields can change', async () => {
      const r = (await general().expect(201)).body.data;
      await expect(ctx.prisma.donation.update({ where: { reference: r.reference }, data: { charitableClassification: 'ZAKAT' } })).rejects.toThrow(/immutable/);
      await expect(ctx.prisma.donation.update({ where: { reference: r.reference }, data: { intentType: 'PROGRAM_DONATION' } })).rejects.toThrow(/immutable/);
      await ctx.prisma.donation.update({ where: { reference: r.reference }, data: { locale: 'ar' } });
      expect((await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: r.reference } })).charitableClassification).toBe('SADAQAH');
    });

    it('abandoned checkout / return from Zeffy: the status stays pending — a redirect never confirms', async () => {
      const r = (await gala().expect(201)).body.data;
      const s1 = (await ctx.http().get(`${API}/public/donation-intents/${r.reference}/status?token=${encodeURIComponent(r.accessToken)}`).expect(200)).body.data;
      expect(s1).toMatchObject({ stage: 'PENDING_EXTERNAL', verifiedAt: null, receiptsIssuedBy: 'SDI_ZEFFY', intendedAmount: '100.00' });
      expect(JSON.stringify(s1)).not.toMatch(/example\.org|Test Donor/); // no personal data
      await ctx.http().get(`${API}/public/donation-intents/${r.reference}/status?token=${encodeURIComponent(r.accessToken)}&locale=ar`).expect(200);
      await ctx.http().post(`${API}/public/donation-intents/${r.reference}/confirm`).expect(404); // no confirmation endpoint exists
      await ctx.http().get(`${API}/public/donation-intents/${r.reference}/status?token=wrong`).expect(404);
      expect(await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: r.reference } })).toMatchObject({ paymentStatus: 'UNPAID', reconciliationStatus: 'AWAITING_REPORT' });
    });
  });

  describe('Zakat eligibility (default not eligible; two administrators; audited)', () => {
    it('ineligible Zakat is refused; the workflow needs both references and a second administrator', async () => {
      expect((await prog({ classification: 'ZAKAT' }).expect(422)).body.error).toMatchObject({ code: 'ZAKAT_NOT_ALLOWED', details: { reason: 'NOT_ZAKAT_ELIGIBLE' } });
      expect((await general({ classification: 'ZAKAT' }).expect(422)).body.error.details.reason).toBe('NO_ZAKAT_TARGET');
      await content.post('/admin/zakat-eligibility', { targetType: 'PROGRAMME', targetId: programmeId, eligible: true }).expect(403);
      expect((await editor.post('/admin/zakat-eligibility', { targetType: 'PROGRAMME', targetId: programmeId, eligible: true, authorityReference: 'SYNTHETIC board decision' }).expect(422)).body.error.code).toBe('ZAKAT_REFERENCES_REQUIRED');
      const req = (await editor.post('/admin/zakat-eligibility', { targetType: 'PROGRAMME', targetId: programmeId, eligible: true, authorityReference: 'SYNTHETIC MEKI board decision 2026-11-21', sdiAcceptanceReference: 'SYNTHETIC SDI acceptance 2026-11-21' }).expect(201)).body.data;
      expect((await editor.post('/admin/zakat-eligibility', { targetType: 'PROGRAMME', targetId: programmeId, eligible: false }).expect(409)).body.error.code).toBe('ZAKAT_REQUEST_PENDING');
      expect((await prog({ classification: 'ZAKAT' }).expect(422)).body.error.code).toBe('ZAKAT_NOT_ALLOWED'); // pending ≠ approved
      expect((await editor.post(`/admin/zakat-eligibility/${req.id}/approve`, {}).expect(403)).body.error.code).toBe('FOUR_EYES_REQUIRED');
      await approver.post(`/admin/zakat-eligibility/${req.id}/approve`, { note: 'checked' }).expect(200);
      const o = (await ctx.http().get(`${API}/public/giving/options`).expect(200)).body.data;
      expect(o.programmes.find((x: { slug: string }) => x.slug === P14_PROGRAMME).zakat).toEqual({ allowed: true, reason: null });
      const z = (await prog({ classification: 'ZAKAT' }).expect(201)).body.data;
      expect(z.handoff.donationTypeAnswer).toBe('Zakat');
      // Zakat stays unavailable on every other target
      expect((await gala({ classification: 'ZAKAT' }).expect(422)).body.error.details.reason).toBe('NOT_ZAKAT_ELIGIBLE');
      // the global switch still overrides
      await withConfig({ ZAKAT_GIVING_ENABLED: false }, async () => {
        expect((await prog({ classification: 'ZAKAT' }).expect(422)).body.error.details.reason).toBe('ZAKAT_NOT_ENABLED');
      });
      const ov = (await editor.get('/admin/zakat-eligibility').expect(200)).body.data;
      expect(ov.defaultEligible).toBe(false);
      expect(ov.targets.find((t: { id: string }) => t.id === programmeId)).toMatchObject({ eligible: true });
      expect(await ctx.prisma.auditLog.count({ where: { entityType: 'ZakatEligibilityDecision', action: { startsWith: 'zakat.eligibility.' } } })).toBeGreaterThanOrEqual(2);
    });

    it('revoking takes effect immediately; previously recorded choices are not changed', async () => {
      const before = (await prog({ classification: 'ZAKAT' }).expect(201)).body.data;
      await approver.post('/admin/zakat-eligibility/revoke', { targetType: 'PROGRAMME', targetId: programmeId, reason: 'test revocation' }).expect(200);
      expect((await prog({ classification: 'ZAKAT' }).expect(422)).body.error.details.reason).toBe('NOT_ZAKAT_ELIGIBLE');
      expect((await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: before.reference } })).charitableClassification).toBe('ZAKAT');
      // re-approve for the reconciliation tests below
      const req = (await editor.post('/admin/zakat-eligibility', { targetType: 'PROGRAMME', targetId: programmeId, eligible: true, authorityReference: 'SYNTHETIC MEKI board decision v2', sdiAcceptanceReference: 'SYNTHETIC SDI acceptance v2' }).expect(201)).body.data;
      await approver.post(`/admin/zakat-eligibility/${req.id}/approve`, {}).expect(200);
    });
  });

  describe('SDI reconciliation against donation references (synthetic reports)', () => {
    const HEADERS = 'Payment Date,Total Amount,Payment Status,Refund Amount,MEKI Donation Reference,Donation Type,Program,Order ID';
    const GALA_MAP = { reportType: 'GALA_DONATIONS', orderId: 'Order ID', amount: 'Total Amount', refundedAmount: 'Refund Amount', status: 'Payment Status', date: 'Payment Date', dateFormat: 'ISO', donationReference: 'MEKI Donation Reference', donationType: 'Donation Type', statusMap: { succeeded: 'COMPLETED', abandoned: 'FAILED' } };
    const PROG_MAP = { ...GALA_MAP, reportType: 'PROGRAMME_DONATIONS', designation: 'Program', designationMap: { [`p14 programme ${tag}`.toLowerCase()]: `programme:${P14_PROGRAMME}`, 'other programme': 'programme:education' } };
    const upload = async (rows: string[]) => (await finance.post('/admin/sdi/reports').field('kind', 'RECONCILIATION').field('isSynthetic', 'true').attach('file', Buffer.from([HEADERS, ...rows].join('\r\n')), { filename: `SYNTHETIC-p14-${uid()}.csv`, contentType: 'text/csv' }).expect(201)).body.data;
    const preview = async (id: string, mapping: object) => {
      await finance.post(`/admin/sdi/reports/${id}/preview`, { mapping }).expect(200);
      return (await finance.get(`/admin/sdi/reports/${id}/rows?pageSize=100`).expect(200)).body.data as { rowNumber: number; matchStatus: string; matchNote: string | null; donationReference: string | null; donationId: string | null }[];
    };
    const o = (n: string) => `P14-${tag}-${n}`;
    let galaOk: string;
    let galaAmount: string;
    let galaType: string;
    let galaUnpaid: string;
    let galaUnknown: string;
    let galaDup: string;
    let programmeOk: string;
    let programmeZakatWrong: string;

    beforeAll(async () => {
      galaOk = (await gala({ amount: '300' }).expect(201)).body.data.reference;
      galaAmount = (await gala({ amount: '300' }).expect(201)).body.data.reference;
      galaType = (await gala({ amount: '75' }).expect(201)).body.data.reference;
      galaUnpaid = (await gala({ amount: '20' }).expect(201)).body.data.reference;
      galaUnknown = (await gala({ amount: '10' }).expect(201)).body.data.reference;
      galaDup = (await gala({ amount: '15' }).expect(201)).body.data.reference;
      programmeOk = (await prog({ amount: '120', classification: 'ZAKAT' }).expect(201)).body.data.reference;
      programmeZakatWrong = (await prog({ amount: '60', classification: 'ZAKAT' }).expect(201)).body.data.reference;
    });

    it('a programme report must map the reference and designation columns', async () => {
      const up = await upload([`2026-11-20,120,Succeeded,,${programmeOk},Zakat,P14 Programme ${tag},${o('X')}`]);
      expect((await finance.post(`/admin/sdi/reports/${up.id}/preview`, { mapping: { ...PROG_MAP, designation: undefined } }).expect(400)).body.error.details.field).toBe('designation');
      expect((await finance.post(`/admin/sdi/reports/${up.id}/preview`, { mapping: { ...PROG_MAP, donationReference: undefined } }).expect(400)).body.error.details.field).toBe('donationReference');
    });

    it('Gala donation report: every conflict with the intention goes to review; nothing is guessed', async () => {
      const progRef = (await prog({ amount: '10' }).expect(201)).body.data.reference;
      const up = await upload([
        `2026-11-20,300,Succeeded,,${galaOk.toLowerCase()},Sadaqah,,${o('1')}`, // matched (reference typed in lower case)
        `2026-11-20,350,Succeeded,,${galaAmount},Sadaqah,,${o('2')}`, // amount differs from the intention
        `2026-11-20,75,Succeeded,,${galaType},Zakat,,${o('3')}`, // Zakat reported for a Sadaqah intent
        `2026-11-20,10,Succeeded,,DN-ZZZZZZZZZZZZ,Sadaqah,,${o('4')}`, // no such intent
        `2026-11-20,10,Succeeded,,EB-ABCDEFGHJKMN,Sadaqah,,${o('5')}`, // a booking reference is not a donation reference
        `2026-11-20,10,Succeeded,,,Sadaqah,,${o('6')}`, // no reference
        `2026-11-20,10,Succeeded,,${progRef},Sadaqah,,${o('7')}`, // a programme intent paid on the Gala form
        `2026-11-20,,Abandoned,,${galaUnpaid},Sadaqah,,${o('8')}`, // abandoned checkout
        `2026-11-20,10,Succeeded,,${galaUnknown},Charity,,${o('9')}`, // unknown donation type
        `2026-11-20,15,Succeeded,,${galaDup},Sadaqah,,${o('10')}`, // two different orders for one intent
        `2026-11-20,15,Succeeded,,${galaDup},Sadaqah,,${o('11')}`,
      ]);
      const rows = await preview(up.id, GALA_MAP);
      const by = (n: number) => rows.find((r) => r.rowNumber === n)!;
      expect(by(2).matchStatus).toBe('MATCHED');
      expect(by(2).donationReference).toBe(galaOk);
      expect(by(3).matchStatus).toBe('AMOUNT_MISMATCH');
      expect(by(4)).toMatchObject({ matchStatus: 'REQUIRES_REVIEW' });
      expect(by(4).matchNote).toMatch(/never converted/);
      expect(by(5).matchStatus).toBe('UNMATCHED');
      expect(by(6).matchStatus).toBe('INVALID_REFERENCE');
      expect(by(7).matchStatus).toBe('UNMATCHED');
      expect(by(8).matchNote).toMatch(/Wrong form/);
      expect(by(9).matchStatus).toBe('INFO');
      expect(by(10).matchStatus).toBe('REQUIRES_REVIEW'); // unknown type
      expect(by(10).matchNote).toMatch(/Unknown Donation Type/);
      expect([by(11).matchStatus, by(12).matchStatus]).toEqual(['AMBIGUOUS', 'AMBIGUOUS']);
      // preview changes nothing
      expect(await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: galaOk } })).toMatchObject({ paymentStatus: 'UNPAID', reconciliationStatus: 'AWAITING_REPORT' });

      // four eyes: the uploader cannot apply
      await finance.post(`/admin/sdi/reports/${up.id}/apply`).expect(403);
      const applied = (await approver.post(`/admin/sdi/reports/${up.id}/apply`).expect(200)).body.data;
      expect(applied.summary.applied).toMatchObject({ intentsVerified: 1 });
      const ok = await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: galaOk } });
      expect(ok).toMatchObject({ status: 'COMPLETED', paymentStatus: 'PAID', reconciliationStatus: 'VERIFIED', externalPaymentId: o('1'), reconciledReportId: up.id, reconciledReportRow: 2, allocationStatus: 'PENDING_AUTHORIZATION', payoutStatus: 'NOT_REPORTED', charitableClassification: 'SADAQAH' });
      expect(await ctx.prisma.providerPayment.findFirstOrThrow({ where: { providerPaymentId: o('1') } })).toMatchObject({ classification: 'CHARITABLE_DONATION', campaignCategory: 'GALA_DONATION', matchedEntityType: 'Donation', matchedEntityId: ok.id });
      expect((await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: galaAmount } })).reconciliationStatus).toBe('NEEDS_REVIEW');
      expect(await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: galaType } })).toMatchObject({ reconciliationStatus: 'NEEDS_REVIEW', charitableClassification: 'SADAQAH', paymentStatus: 'UNPAID' });
      expect((await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: galaUnpaid } })).reconciliationStatus).toBe('REPORTED_UNPAID');
      expect((await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: progRef } })).reconciliationStatus).toBe('NEEDS_REVIEW');
      // no MEKI receipt is ever issued
      expect(await ctx.prisma.donationReceipt.count({ where: { donationId: ok.id } })).toBe(0);
      // the donor-facing status needs the access token; without it nothing is revealed
      await ctx.http().get(`${API}/public/donation-intents/${galaOk}/status`).expect(404);
    });

    it('repeated import is idempotent; an identical file is refused', async () => {
      const up = await upload([`2026-11-21,300,Succeeded,,${galaOk},Sadaqah,,${o('1')}`]);
      expect((await preview(up.id, GALA_MAP))[0].matchStatus).toBe('ALREADY_APPLIED');
      await approver.post(`/admin/sdi/reports/${up.id}/apply`).expect(200);
      expect(await ctx.prisma.providerPayment.count({ where: { providerPaymentId: o('1') } })).toBe(1);
      const dup = Buffer.from([HEADERS, `2026-11-21,300,Succeeded,,${galaOk},Sadaqah,,${o('1')}`].join('\r\n'));
      expect((await finance.post('/admin/sdi/reports').field('kind', 'RECONCILIATION').field('isSynthetic', 'true').attach('file', dup, { filename: 'SYNTHETIC-dup-b.csv', contentType: 'text/csv' }).expect(409)).body.error.code).toBe('DUPLICATE_FILE');
    });

    it('programme report: Zakat + designation verified; wrong programme and missing type go to review', async () => {
      const up = await upload([
        `2026-11-20,120,Succeeded,,${programmeOk},Zakat,P14 Programme ${tag},${o('P1')}`,
        `2026-11-20,60,Succeeded,,${programmeZakatWrong},Zakat,Other programme,${o('P2')}`,
      ]);
      const rows = await preview(up.id, PROG_MAP);
      expect(rows[0].matchStatus).toBe('MATCHED');
      expect(rows[1].matchNote).toMatch(/Designation programme:education/);
      const noType = await upload([`2026-11-20,60,Succeeded,,${programmeZakatWrong},,P14 Programme ${tag},${o('P3')}`]);
      expect((await preview(noType.id, PROG_MAP))[0].matchNote).toMatch(/Zakat intent but the report carries no Donation Type/);
      await approver.post(`/admin/sdi/reports/${up.id}/apply`).expect(200);
      expect(await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: programmeOk } })).toMatchObject({ reconciliationStatus: 'VERIFIED', charitableClassification: 'ZAKAT' });
    });
  });

  describe('admin reporting and fund allocation', () => {
    it('lists intents with references, classification, designation and status; finance permissions enforced', async () => {
      await content.get('/admin/donation-intents').expect(403);
      const list = (await editor.get('/admin/donation-intents?includeTest=true&classification=ZAKAT&pageSize=50').expect(200)).body;
      expect(list.data.length).toBeGreaterThan(0);
      expect(list.data.every((d: { classification: string }) => d.classification === 'ZAKAT')).toBe(true);
      const verified = (await editor.get('/admin/donation-intents?includeTest=true&reconciliationStatus=VERIFIED&pageSize=50').expect(200)).body.data;
      expect(verified[0]).toMatchObject({ paymentStatus: 'PAID', stage: 'VERIFIED', allocationStatus: 'PENDING_AUTHORIZATION' });
      expect((await editor.get('/admin/donation-intents/summary').expect(200)).body.data.currency).toBe('USD');
      const review = (await editor.get('/admin/donation-intents?includeTest=true&reconciliationStatus=NEEDS_REVIEW&pageSize=50').expect(200)).body.data;
      expect(review.length).toBeGreaterThanOrEqual(3);
    });

    it('allocation: only a verified gift, never by the report approver, decided once, audited', async () => {
      const d = await ctx.prisma.donation.findFirstOrThrow({ where: { reconciliationStatus: 'VERIFIED', intentType: 'GALA_DONATION', allocationStatus: 'PENDING_AUTHORIZATION', charitableClassification: 'SADAQAH' }, orderBy: { reconciledAt: 'desc' } });
      const pending = await ctx.prisma.donation.findFirstOrThrow({ where: { reconciliationStatus: 'AWAITING_REPORT', intentType: { not: null } } });
      expect((await editor.post(`/admin/donation-intents/${pending.id}/allocation`, { decision: 'AUTHORIZE', fund: 'Gala project fund', note: 'x'.repeat(5) }).expect(422)).body.error.code).toBe('ALLOCATION_NOT_VERIFIED');
      expect((await approver.post(`/admin/donation-intents/${d.id}/allocation`, { decision: 'AUTHORIZE', fund: 'Gala project fund', note: 'approver tries' }).expect(403)).body.error.code).toBe('FOUR_EYES_REQUIRED');
      expect((await editor.post(`/admin/donation-intents/${d.id}/allocation`, { decision: 'AUTHORIZE', note: 'no fund' }).expect(400)).body.error.code).toBe('FUND_REQUIRED');
      await finance.post(`/admin/donation-intents/${d.id}/allocation`, { decision: 'AUTHORIZE', fund: 'x', note: 'no permission' }).expect(403);
      const out = (await editor.post(`/admin/donation-intents/${d.id}/allocation`, { decision: 'AUTHORIZE', fund: 'SYNTHETIC approved Gala project fund', note: 'matches SDI fund' }).expect(200)).body.data;
      expect(out).toMatchObject({ allocationStatus: 'AUTHORIZED', authorizedFund: 'SYNTHETIC approved Gala project fund', stage: 'ALLOCATED' });
      expect(out.evidence.reportRows.length).toBeGreaterThan(0);
      expect(out.history.map((h: { action: string }) => h.action)).toEqual(expect.arrayContaining(['giving.intent.create', 'giving.intent.verified', 'giving.allocation.authorize']));
      expect((await editor.post(`/admin/donation-intents/${d.id}/allocation`, { decision: 'REJECT', note: 'again' }).expect(409)).body.error.code).toBe('ALLOCATION_DECIDED');
    });
  });
});
