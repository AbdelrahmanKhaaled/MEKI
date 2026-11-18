import { API, createTestApp, loginAs, uid, type Session, type TestContext } from './helpers';

/**
 * Phase 6C additive API: project ("Cause") detail + filters + counts, the Programme → Cause → Campaign hierarchy guards,
 * and the new list filters (programme/media provenance, campaign projectId/startsFrom/startsTo). Existing behaviour is
 * covered by the campaigns/platform/media specs.
 */
describe('Phase 6C content API additions', () => {
  let ctx: TestContext;
  let content: Session; // CONTENT_MANAGER: programmes.* + media
  let campaigns: Session; // CAMPAIGN_MANAGER: campaigns.manage/publish
  let viewer: Session; // EVENT_CHECKIN_STAFF: no programme permission
  let prgA: string;
  let prgB: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    content = await loginAs(ctx, ['CONTENT_MANAGER']);
    campaigns = await loginAs(ctx, ['CAMPAIGN_MANAGER']);
    viewer = await loginAs(ctx, ['EVENT_CHECKIN_STAFF']);
    prgA = (await ctx.prisma.programme.findUniqueOrThrow({ where: { code: 'PRG-02' } })).id;
    prgB = (await ctx.prisma.programme.findUniqueOrThrow({ where: { code: 'PRG-03' } })).id;
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  const newProject = async (programmeId: string | null, extra: object = {}) =>
    (await content.post('/admin/projects', { code: `PRJ-T${uid().toUpperCase()}`, nameEn: `Cause ${uid()}`, programmeId, ...extra }).expect(201)).body.data;
  const newCampaign = async (extra: object) =>
    (await campaigns.post('/admin/campaigns', { code: `CMP-T${uid().toUpperCase()}`, titleEn: `Campaign ${uid()}`, summaryEn: 'Summary', ...extra }).expect(201)).body.data;

  it('project detail returns its programme and campaigns; list carries a campaign count and filters', async () => {
    const tag = uid();
    const p = await newProject(prgA, { nameEn: `Water ${tag}`, provenance: 'DEMO' });
    const c = await newCampaign({ programmeId: prgA, projectId: p.id, targetAmount: 1234.5 });
    const detail = (await content.get(`/admin/projects/${p.id}`).expect(200)).body.data;
    expect(detail.programme).toMatchObject({ id: prgA, status: 'PUBLISHED' });
    expect(detail.campaigns).toHaveLength(1);
    expect(detail.campaigns[0]).toMatchObject({ id: c.id, targetAmount: '1234.5' }); // decimal as a string
    const list = (await content.get(`/admin/projects?search=${tag}`).expect(200)).body.data;
    expect(list).toHaveLength(1);
    expect(list[0]._count.campaigns).toBe(1);
    expect(list[0].programme).toMatchObject({ id: prgA, status: 'PUBLISHED', kind: 'PROGRAMME' });
    expect((await content.get(`/admin/projects?search=${tag}&provenance=PROPOSED`).expect(200)).body.data).toHaveLength(0);
    expect((await content.get(`/admin/projects?search=${tag}&provenance=DEMO&programmeId=${prgA}`).expect(200)).body.data).toHaveLength(1);
    await content.get('/admin/projects?unknown=1').expect(400); // whitelist validation stays strict
    await content.get('/admin/projects/does-not-exist').expect(404);
    await viewer.get(`/admin/projects/${p.id}`).expect(403);
  });

  it('a campaign cannot be linked to a project of another programme (create and update)', async () => {
    const p = await newProject(prgA);
    const res = await campaigns.post('/admin/campaigns', { code: `CMP-T${uid().toUpperCase()}`, titleEn: 'Mismatch', programmeId: prgB, projectId: p.id }).expect(422);
    expect(res.body.error.code).toBe('PROJECT_PROGRAMME_MISMATCH');
    const ok = await newCampaign({ programmeId: prgA, projectId: p.id });
    expect((await campaigns.patch(`/admin/campaigns/${ok.id}`, { programmeId: prgB }).expect(422)).body.error.code).toBe('PROJECT_PROGRAMME_MISMATCH');
    // moving both together to a consistent pair is allowed; unrelated edits never re-check
    const p2 = await newProject(prgB);
    await campaigns.patch(`/admin/campaigns/${ok.id}`, { programmeId: prgB, projectId: p2.id }).expect(200);
    await campaigns.patch(`/admin/campaigns/${ok.id}`, { titleAr: 'عنوان' }).expect(200);
    // a project without a programme does not constrain (legacy data)
    const orphan = await newProject(null);
    await newCampaign({ programmeId: prgA, projectId: orphan.id });
  });

  it('a project with campaigns cannot move to another programme; without campaigns it can', async () => {
    const p = await newProject(prgA);
    await content.patch(`/admin/projects/${p.id}`, { programmeId: prgB }).expect(200);
    await newCampaign({ programmeId: prgB, projectId: p.id });
    const res = await content.patch(`/admin/projects/${p.id}`, { programmeId: prgA }).expect(409);
    expect(res.body.error.code).toBe('PROJECT_HAS_CAMPAIGNS');
    await content.patch(`/admin/projects/${p.id}`, { programmeId: null }).expect(409);
    await content.patch(`/admin/projects/${p.id}`, { programmeId: prgB, nameAr: 'قضية' }).expect(200); // same programme: fine
  });

  it('campaign list filters by projectId and start-date range', async () => {
    const p = await newProject(prgA);
    await newCampaign({ programmeId: prgA, projectId: p.id, startsAt: '2027-03-10T00:00:00Z', endsAt: '2027-04-10T00:00:00Z' });
    await newCampaign({ programmeId: prgA, projectId: p.id, startsAt: '2027-06-10T00:00:00Z' });
    expect((await campaigns.get(`/admin/campaigns?projectId=${p.id}`).expect(200)).body.data).toHaveLength(2);
    const ranged = (await campaigns.get(`/admin/campaigns?projectId=${p.id}&startsFrom=2027-03-01T00:00:00Z&startsTo=2027-03-31T23:59:59Z`).expect(200)).body.data;
    expect(ranged).toHaveLength(1);
    await campaigns.get('/admin/campaigns?startsFrom=not-a-date').expect(400);
  });

  it('programme and media lists filter by provenance', async () => {
    const tag = uid();
    await ctx.prisma.programme.create({ data: { code: `PRG-X${tag.toUpperCase()}`, slug: `x-${tag}`, nameEn: `Demo programme ${tag}`, provenance: 'DEMO' } });
    expect((await content.get(`/admin/programmes?search=${tag}&provenance=DEMO`).expect(200)).body.data).toHaveLength(1);
    expect((await content.get(`/admin/programmes?search=${tag}&provenance=VERIFIED_SOURCE`).expect(200)).body.data).toHaveLength(0);
    const verified = (await content.get('/admin/programmes?provenance=VERIFIED_SOURCE&kind=PROGRAMME&pageSize=50').expect(200)).body;
    expect(verified.meta.total).toBeGreaterThanOrEqual(9); // the nine official programmes (seeded, verified)
    const media = (await content.get('/admin/media?provenance=DEMO&pageSize=5').expect(200)).body;
    for (const m of media.data) expect(m.provenance).toBe('DEMO');
    await content.get('/admin/media?provenance=NOPE').expect(400);
  });

  it('public programme/campaign endpoints are unchanged', async () => {
    const list = (await ctx.http().get(`${API}/public/programmes`).expect(200)).body.data;
    expect(list.length).toBeGreaterThanOrEqual(9);
    expect(list.every((p: { provenance?: string }) => p.provenance === undefined)).toBe(true);
  });
});
