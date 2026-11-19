import { randomBytes } from 'node:crypto';
import { API, createTestApp, loginAs, uid, type Session, type TestContext } from './helpers';
import { DonationConfigService } from '../src/modules/donations/donation-config.service';

/**
 * Phase 11A — single programme page API, programme goal, cause publication and programme fundraising totals.
 * Fixtures are created in the *_test database only (isolated programmes with unique slugs); nothing is deleted.
 */
describe('Phase 11A — programme detail, causes and verified programme fundraising', () => {
  let ctx: TestContext;
  let admin: Session;
  let editor: Session;
  const tag = uid();
  const ids: Record<string, string> = {};

  const programme = (code: string, extra: object = {}) =>
    ctx.prisma.programme.create({
      data: { code: `PRG-${code}-${tag}`.toUpperCase(), slug: `p11a-${code}-${tag}`, nameEn: `P11A ${code}`, shortDescEn: 'Short', status: 'PUBLISHED', provenance: 'VERIFIED_SOURCE', ...extra },
    });
  const project = (code: string, programmeId: string, extra: object = {}) =>
    ctx.prisma.project.create({ data: { code: `PRJ-${code}-${tag}`.toUpperCase(), slug: `p11a-${code}-${tag}`, nameEn: `Cause ${code}`, programmeId, ...extra } });
  const campaign = (code: string, programmeId: string, projectId: string | null, extra: object = {}) =>
    ctx.prisma.campaign.create({
      data: {
        code: `CMP-${code}-${tag}`.toUpperCase(), slug: `p11a-${code}-${tag}`, titleEn: `Campaign ${code}`, programmeId, projectId,
        status: 'PUBLISHED', approvedAt: new Date(), provenance: 'VERIFIED_SOURCE', ...extra,
      },
    });
  /** A donation row with exactly one allocation (the production shape), created directly in the test database. */
  const donation = async (o: { amount: string; currency?: string; designation: 'PROGRAMME' | 'CAMPAIGN' | 'GENERAL_FUND'; programmeId?: string | null; campaignId?: string | null; paymentStatus?: string; isTest?: boolean; refunded?: string; confirmed?: boolean }) => {
    const donor = await ctx.prisma.donor.create({ data: { firstName: 'Test', lastName: 'Donor', email: `d-${uid()}@example.org`, privacyConsentAt: new Date() } });
    const currency = o.currency ?? 'USD';
    return ctx.prisma.donation.create({
      data: {
        reference: `DN-${randomBytes(6).toString('hex').toUpperCase()}`, accessTokenHash: '0'.repeat(64), donorId: donor.id, amount: o.amount, currency,
        status: o.confirmed === false ? 'PENDING' : 'COMPLETED', paymentStatus: (o.paymentStatus ?? 'PAID') as never, isTest: o.isTest ?? false,
        refundedAmount: o.refunded ?? '0', confirmedAt: o.confirmed === false ? null : new Date(), provider: 'mock',
        allocations: { create: { designation: o.designation, programmeId: o.programmeId ?? null, campaignId: o.campaignId ?? null, amount: o.amount, currency } },
      },
    });
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await loginAs(ctx, ['ADMINISTRATOR']);
    editor = await loginAs(ctx, ['FINANCE_MANAGER']); // has neither programmes.manage nor programmes.publish
    const main = await programme('main', { targetAmount: '1000.00', targetCurrency: 'USD' });
    const other = await programme('other');
    const nogoal = await programme('nogoal');
    await programme('draft', { status: 'DRAFT' });
    await programme('demo', { provenance: 'DEMO' });
    ids.main = main.id;
    ids.other = other.id;
    ids.nogoal = nogoal.id;
    const pub = await project('pub', main.id, { status: 'PUBLISHED', summaryEn: 'Published cause', provenance: 'VERIFIED_SOURCE', sortOrder: 1 });
    const draft = await project('draft', main.id, { status: 'DRAFT', summaryEn: 'Draft cause' });
    await project('demo', main.id, { status: 'PUBLISHED', summaryEn: 'Demo cause', provenance: 'DEMO' });
    await project('elsewhere', other.id, { status: 'PUBLISHED', summaryEn: 'Other programme cause', provenance: 'VERIFIED_SOURCE' });
    ids.pubCause = pub.id;
    ids.draftCause = draft.id;
    const c1 = await campaign('c1', main.id, pub.id, { targetAmount: '400.00' });
    const c2 = await campaign('c2', main.id, draft.id);
    await campaign('c3', main.id, pub.id, { status: 'DRAFT', approvedAt: null });
    ids.c1 = c1.id;
    ids.c2 = c2.id;

    // Verified money for "main": 300 (programme) + 200 − 50 refunded (campaign under main) = 450 USD; 100 EUR kept separate.
    await donation({ amount: '300.00', designation: 'PROGRAMME', programmeId: main.id });
    await donation({ amount: '200.00', designation: 'CAMPAIGN', programmeId: main.id, campaignId: c1.id, paymentStatus: 'PARTIALLY_REFUNDED', refunded: '50.00' });
    await donation({ amount: '100.00', currency: 'EUR', designation: 'PROGRAMME', programmeId: main.id });
    // Never counted: test, pending, failed, another programme, general fund.
    await donation({ amount: '1000.00', designation: 'PROGRAMME', programmeId: main.id, isTest: true });
    await donation({ amount: '500.00', designation: 'PROGRAMME', programmeId: main.id, paymentStatus: 'UNPAID', confirmed: false });
    await donation({ amount: '700.00', designation: 'PROGRAMME', programmeId: main.id, paymentStatus: 'FAILED', confirmed: false });
    await donation({ amount: '999.00', designation: 'PROGRAMME', programmeId: other.id });
    await donation({ amount: '77.00', designation: 'GENERAL_FUND' });
  });
  /**
   * Leave the shared *_test database as other suites expect it (nothing is deleted — donations are append-only):
   * fixture donations become test records (excluded from every report), fixture programmes/causes/campaigns are archived.
   * Rows left by earlier runs of this suite (same p11a- prefix / fixture donor) are repaired the same way.
   */
  afterAll(async () => {
    const programmes = await ctx.prisma.programme.findMany({ where: { slug: { startsWith: 'p11a-' } }, select: { id: true } });
    const pids = programmes.map((p) => p.id);
    await ctx.prisma.donation.updateMany({
      where: { isTest: false, OR: [{ allocations: { some: { programmeId: { in: pids } } } }, { donor: { firstName: 'Test', lastName: 'Donor', email: { startsWith: 'd-', endsWith: '@example.org' } }, provider: 'mock' }] },
      data: { isTest: true },
    });
    await ctx.prisma.campaign.updateMany({ where: { slug: { startsWith: 'p11a-' } }, data: { status: 'ARCHIVED' } });
    await ctx.prisma.project.updateMany({ where: { slug: { startsWith: 'p11a-' } }, data: { status: 'ARCHIVED' } });
    await ctx.prisma.programme.updateMany({ where: { slug: { startsWith: 'p11a-' } }, data: { status: 'ARCHIVED' } });
    await ctx.app.close();
  });

  const detail = (slug: string, locale = 'en') => ctx.http().get(`${API}/public/programmes/${slug}/detail?locale=${locale}`);

  it('verified programme totals: confirmed only, test/pending/failed/other programmes/general fund excluded, refunds netted, each donation once, per currency', async () => {
    const res = await detail(`p11a-main-${tag}`).expect(200);
    const f = res.body.data.fundraising;
    expect(f.goal).toEqual({ amount: '1000.00', currency: 'USD' });
    expect(f.progress).toEqual({ currency: 'USD', donations: 2, goal: '1000.00', collected: '450.00', remaining: '550.00', percent: '45.0' });
    expect(f.collected).toEqual([
      { currency: 'EUR', net: '100.00', donations: 1 },
      { currency: 'USD', net: '450.00', donations: 2 },
    ]);
  });

  it('no approved goal → no progress, no percentage (collected figures may still be reported)', async () => {
    const res = await detail(`p11a-nogoal-${tag}`).expect(200);
    expect(res.body.data.fundraising.goal).toBeNull();
    expect(res.body.data.fundraising.progress).toBeNull();
    expect(res.body.data.fundraising.collected).toEqual([]);
  });

  it('only published, non-DEMO causes of THIS programme; approved campaigns grouped under their cause; drafts never exposed', async () => {
    const d = (await detail(`p11a-main-${tag}`).expect(200)).body.data;
    expect(d.causes.map((c: { slug: string }) => c.slug)).toEqual([`p11a-pub-${tag}`]);
    expect(d.causes[0].summary).toBe('Published cause');
    expect(d.causes[0].campaigns.map((c: { slug: string }) => c.slug)).toEqual([`p11a-c1-${tag}`]);
    // campaign c1 progress against its own approved target: 200 − 50 = 150 of 400
    expect(d.causes[0].campaigns[0].fundraising.progress).toMatchObject({ currency: 'USD', goal: '400.00', collected: '150.00', remaining: '250.00', percent: '37.5' });
    // c2 is approved but its cause is a draft → listed with the programme, never under the draft cause
    expect(d.otherCampaigns.map((c: { slug: string }) => c.slug)).toEqual([`p11a-c2-${tag}`]);
    expect(d.otherCampaigns[0].fundraising.progress).toBeNull(); // no approved campaign target
    const json = JSON.stringify(d);
    for (const hidden of ['Draft cause', 'Demo cause', 'Other programme cause', `p11a-c3-${tag}`, 'approvalNote', 'internalNotes', 'sourceFolder']) expect(json).not.toContain(hidden);
  });

  it('unpublished, DEMO and unknown programmes return 404', async () => {
    for (const slug of [`p11a-draft-${tag}`, `p11a-demo-${tag}`, `does-not-exist-${tag}`]) {
      const res = await detail(slug);
      expect(res.status).toBe(404);
    }
  });

  it('admin: the programme goal is set and cleared as a pair, must be positive and in a known currency; audited; content managers without the permission are refused', async () => {
    const id = ids.nogoal;
    expect((await admin.patch(`/admin/programmes/${id}`, { targetAmount: '5000.00' }).expect(400)).body.error.code).toBe('TARGET_INCOMPLETE');
    expect((await admin.patch(`/admin/programmes/${id}`, { targetAmount: '0', targetCurrency: 'USD' }).expect(400)).body.error.code).toBe('TARGET_NOT_POSITIVE');
    expect((await admin.patch(`/admin/programmes/${id}`, { targetAmount: '10.00', targetCurrency: 'XYZ' }).expect(400)).body.error.code).toBe('TARGET_CURRENCY_UNKNOWN');
    await admin.patch(`/admin/programmes/${id}`, { targetAmount: '12.345', targetCurrency: 'USD' }).expect(400); // > 2 decimals
    const ok = await admin.patch(`/admin/programmes/${id}`, { targetAmount: '5000.00', targetCurrency: 'USD' }).expect(200);
    expect(ok.body.data).toMatchObject({ targetAmount: '5000', targetCurrency: 'USD' });
    const prog = (await detail(`p11a-nogoal-${tag}`).expect(200)).body.data.fundraising.progress;
    expect(prog).toMatchObject({ goal: '5000.00', collected: '0.00', remaining: '5000.00', percent: '0.0' });
    await admin.patch(`/admin/programmes/${id}`, { targetAmount: null, targetCurrency: null }).expect(200);
    expect((await detail(`p11a-nogoal-${tag}`).expect(200)).body.data.fundraising.progress).toBeNull();
    const audit = await ctx.prisma.auditLog.findMany({ where: { entityId: id, action: 'programme.update' } });
    expect(audit.length).toBeGreaterThanOrEqual(2);
    await editor.patch(`/admin/programmes/${id}`, { targetAmount: '1.00', targetCurrency: 'USD' }).expect(403);
  });

  it('admin: a cause is published only with its summary, never as DEMO, and only under a published programme; unpublish hides it again', async () => {
    const draft = ids.draftCause;
    await admin.patch(`/admin/projects/${draft}`, { summaryEn: '' }).expect(200);
    expect((await admin.post(`/admin/projects/${draft}/publish`).expect(422)).body.error.code).toBe('MISSING_FIELDS');
    await admin.patch(`/admin/projects/${draft}`, { summaryEn: 'Now ready', summaryAr: 'جاهز الآن' }).expect(200);
    await admin.post(`/admin/projects/${draft}/publish`).expect(200);
    let d = (await detail(`p11a-main-${tag}`, 'ar').expect(200)).body.data;
    expect(d.causes.map((c: { summary: string }) => c.summary)).toContain('جاهز الآن');
    // its approved campaign now appears under it, not under "other campaigns"
    expect(d.otherCampaigns).toEqual([]);
    await admin.post(`/admin/projects/${draft}/unpublish`).expect(200);
    d = (await detail(`p11a-main-${tag}`).expect(200)).body.data;
    expect(d.causes.map((c: { slug: string }) => c.slug)).not.toContain(`p11a-draft-${tag}`);
    // under an unpublished programme
    const draftProg = await ctx.prisma.programme.findFirstOrThrow({ where: { slug: `p11a-draft-${tag}` } });
    const orphan = await project('orphan', draftProg.id, { summaryEn: 'x' });
    expect((await admin.post(`/admin/projects/${orphan.id}/publish`).expect(409)).body.error.code).toBe('PROGRAMME_NOT_PUBLISHED');
    // DEMO
    const demo = await project('demo2', ids.main, { summaryEn: 'x', provenance: 'DEMO' });
    expect((await admin.post(`/admin/projects/${demo.id}/publish`).expect(422)).body.error.code).toBe('DEMO_NOT_PUBLISHABLE');
    expect((await editor.post(`/admin/projects/${draft}/publish`)).status).toBe(403);
  });

  it('programme donations: the server resolves the programme from its slug and refuses unpublished, DEMO and enabling-function programmes', async () => {
    // Payments are disabled in this environment (that check runs first), so the designation rule is exercised directly on the
    // exact server path used by POST /public/donations.
    const cfg = ctx.app.get(DonationConfigService);
    const resolved = await cfg.resolveDesignation({ designation: 'PROGRAMME', programmeSlug: `p11a-main-${tag}`, currency: 'USD' });
    expect(resolved).toMatchObject({ designation: 'PROGRAMME', campaign: null, programme: { id: ids.main } });
    const enabling = await ctx.prisma.programme.findFirstOrThrow({ where: { kind: 'ENABLING_FUNCTION', status: 'PUBLISHED' } });
    for (const slug of [`p11a-draft-${tag}`, `p11a-demo-${tag}`, enabling.slug]) {
      await expect(cfg.resolveDesignation({ designation: 'PROGRAMME', programmeSlug: slug, currency: 'USD' })).rejects.toMatchObject({ response: { code: 'PROGRAMME_NOT_ACCEPTING_DONATIONS' } });
    }
    await expect(cfg.resolveDesignation({ designation: 'PROGRAMME', currency: 'USD' })).rejects.toThrow(/programmeSlug/);
    const body = (programmeSlug: string) => ({ amount: '25', currency: 'USD', designation: 'PROGRAMME', programmeSlug, donor: { firstName: 'Ada', lastName: 'Test', email: 'ada@example.org' }, privacyConsent: true });
    // an arbitrary programme id cannot be supplied: the DTO only accepts a slug
    const raw = await ctx.http().post(`${API}/public/donations`).set('Idempotency-Key', uid() + uid()).send({ ...body(`p11a-main-${tag}`), programmeId: ids.other });
    expect(raw.status).toBe(400);
  });
});
