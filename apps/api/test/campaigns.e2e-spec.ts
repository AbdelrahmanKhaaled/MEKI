import { API, createTestApp, loginAs, uid, type Session, type TestContext } from './helpers';

describe('Campaign publishing rules', () => {
  let ctx: TestContext;
  let manager: Session;
  let approver: Session;
  let programmeId: string;
  let draftProgrammeId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    manager = await loginAs(ctx, ['CAMPAIGN_MANAGER']);
    approver = await loginAs(ctx, ['ADMINISTRATOR']);
    programmeId = (await ctx.prisma.programme.findUniqueOrThrow({ where: { code: 'PRG-02' } })).id; // seeded, published
    const draft = await ctx.prisma.programme.create({ data: { code: `PRG-D${uid().toUpperCase()}`, slug: `draft-${uid()}`, nameEn: 'Draft programme', status: 'DRAFT' } });
    draftProgrammeId = draft.id;
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  const newCampaign = async (extra: object = {}) =>
    (
      await manager
        .post('/admin/campaigns', { code: `CMP-T${uid().toUpperCase()}`, titleEn: `Campaign ${uid()}`, summaryEn: 'Summary', programmeId, suggestedAmounts: [100, 25, 50], ...extra })
        .expect(201)
    ).body.data;

  it('new campaigns are DRAFT with donations closed and sorted presets', async () => {
    const c = await newCampaign();
    expect(c).toMatchObject({ status: 'DRAFT', donationsOpen: false, approvedAt: null, targetAmount: null, suggestedAmounts: [25, 50, 100] });
  });

  it('cannot be published without a recorded MEKI approval', async () => {
    const c = await newCampaign();
    const res = await manager.post(`/admin/campaigns/${c.id}/publish`).expect(422);
    expect(res.body.error.code).toBe('CAMPAIGN_NOT_PUBLISHABLE');
    expect(res.body.error.details.reasons).toContain('Campaign has no recorded MEKI approval');
  });

  it('requires a published programme', async () => {
    const c = await newCampaign({ programmeId: draftProgrammeId });
    await approver.post(`/admin/campaigns/${c.id}/approve`, { note: 'MEKI e-mail 2026-11-06' }).expect(200);
    const res = await manager.post(`/admin/campaigns/${c.id}/publish`).expect(422);
    expect(res.body.error.details.reasons).toContain('The related programme must be published');
  });

  it('full lifecycle: approve → publish → public → pause → resume → complete', async () => {
    const c = await newCampaign({ titleAr: 'حملة' });
    await manager.post(`/admin/campaigns/${c.id}/submit`).expect(200);
    await approver.post(`/admin/campaigns/${c.id}/approve`, { note: 'Approved by MEKI board, ref #1' }).expect(200);
    const pub = await manager.post(`/admin/campaigns/${c.id}/publish`).expect(200);
    expect(pub.body.data.status).toBe('PUBLISHED');

    let list = await ctx.http().get(`${API}/public/campaigns?locale=ar`).expect(200);
    const card = list.body.data.find((x: { id: string }) => x.id === c.id);
    expect(card).toMatchObject({ title: 'حملة', acceptingDonations: false });
    expect(card).not.toHaveProperty('approvalNote');
    expect(card).not.toHaveProperty('raisedAmount');

    await manager.post(`/admin/campaigns/${c.id}/pause`).expect(200);
    await ctx.http().get(`${API}/public/campaigns/${c.slug}`).expect(200);
    await manager.post(`/admin/campaigns/${c.id}/resume`).expect(200);
    await manager.post(`/admin/campaigns/${c.id}/complete`).expect(200);
    await manager.post(`/admin/campaigns/${c.id}/publish`).expect(422); // COMPLETED cannot be re-published

    const audit = await ctx.prisma.auditLog.findMany({ where: { entityId: c.id }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(['campaign.create', 'campaign.submit', 'campaign.approve', 'campaign.publish', 'campaign.pause', 'campaign.complete']),
    );
    list = await ctx.http().get(`${API}/public/campaigns`).expect(200);
    expect(list.body.data.find((x: { id: string }) => x.id === c.id).status).toBe('COMPLETED');
  });

  it('unpublishing removes a campaign from the public API and closes donations', async () => {
    const c = await newCampaign();
    await approver.post(`/admin/campaigns/${c.id}/approve`, { note: 'Approval reference' }).expect(200);
    await manager.post(`/admin/campaigns/${c.id}/publish`).expect(200);
    await manager.post(`/admin/campaigns/${c.id}/unpublish`).expect(200);
    await ctx.http().get(`${API}/public/campaigns/${c.slug}`).expect(404);
  });

  it('donations cannot be opened while payments are disabled', async () => {
    const c = await newCampaign();
    await approver.post(`/admin/campaigns/${c.id}/approve`, { note: 'Approval reference' }).expect(200);
    await manager.post(`/admin/campaigns/${c.id}/publish`).expect(200);
    const res = await manager.patch(`/admin/campaigns/${c.id}/donations`, { open: true }).expect(422);
    expect(res.body.error.code).toBe('PAYMENTS_DISABLED');
  });

  it('DEMO campaigns can never be approved or published', async () => {
    const c = await newCampaign({ provenance: 'DEMO' });
    const res = await approver.post(`/admin/campaigns/${c.id}/approve`, { note: 'should fail' }).expect(422);
    expect(res.body.error.code).toBe('DEMO_NOT_PUBLISHABLE');
  });

  it('financial terms of a live campaign are locked; changing them on a draft resets approval', async () => {
    const c = await newCampaign();
    await approver.post(`/admin/campaigns/${c.id}/approve`, { note: 'Approval reference' }).expect(200);
    await manager.post(`/admin/campaigns/${c.id}/publish`).expect(200);
    await manager.patch(`/admin/campaigns/${c.id}`, { targetAmount: 5000 }).expect(422);
    await manager.post(`/admin/campaigns/${c.id}/unpublish`).expect(200);
    const res = await manager.patch(`/admin/campaigns/${c.id}`, { targetAmount: 5000 }).expect(200);
    expect(res.body.data.approvedAt).toBeNull();
  });

  it('validates dates, amounts and unknown fields', async () => {
    await manager.post('/admin/campaigns', { code: `CMP-T${uid().toUpperCase()}`, titleEn: 'Bad dates', startsAt: '2027-01-02T00:00:00Z', endsAt: '2027-01-01T00:00:00Z' }).expect(422);
    await manager.post('/admin/campaigns', { code: `CMP-T${uid().toUpperCase()}`, titleEn: 'Bad', suggestedAmounts: [-5] }).expect(400);
    await manager.post('/admin/campaigns', { code: `CMP-T${uid().toUpperCase()}`, titleEn: 'Bad', raisedAmount: 100 }).expect(400);
  });

  it('seeded preview campaigns remain unpublished drafts', async () => {
    const seeded = await ctx.prisma.campaign.findMany({ where: { code: { startsWith: 'CMP-' }, sourceRef: { contains: 'NOT an approved fundraiser' } } });
    expect(seeded.length).toBe(8);
    seeded.forEach((c) => expect(c).toMatchObject({ status: 'DRAFT', approvedAt: null, targetAmount: null, donationsOpen: false, provenance: 'PROPOSED' }));
    const pub = await ctx.http().get(`${API}/public/campaigns`).expect(200);
    const slugs = pub.body.data.map((x: { slug: string }) => x.slug);
    seeded.forEach((c) => expect(slugs).not.toContain(c.slug));
  });
});
