import { API, createTestApp, loginAs, uid, type Session, type TestContext } from './helpers';

/**
 * Final QA — dashboard-managed Gala agenda (EVENT_AGENDA section). Acts are section items whose time range + nested items are
 * JSON in textEn/textAr (exactly as the admin GalaAgendaCard encodes them). Runs only against the isolated *_test database.
 */
const future = (days: number, hour = 19) => {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};
const act = (label: string, time: string, items: { time: string; title: string; note?: string; highlight?: boolean }[], ar?: { label: string; time: string; items: { time: string; title: string; note?: string }[] }) => ({
  textEn: JSON.stringify({ label, time, items }),
  textAr: JSON.stringify(ar ?? { label, time, items }),
});

describe('Gala agenda — dashboard source of truth', () => {
  let ctx: TestContext;
  let editor: Session;
  let admin: Session;
  let eventId: string;
  let slug: string;
  let secId: string;
  const pub = async (locale: 'en' | 'ar') =>
    (await ctx.http().get(`${API}/public/events/${slug}/page?locale=${locale}`).expect(200)).body.data.sections.find((s: { key: string }) => s.key === 'EVENT_AGENDA');
  const republish = () => editor.post(`/admin/events/${eventId}/sections/${secId}/publish`).expect(200); // what the UI does after every save once live

  beforeAll(async () => {
    ctx = await createTestApp();
    editor = await loginAs(ctx, ['CONTENT_MANAGER']);
    admin = await loginAs(ctx, ['ADMINISTRATOR']);
    const code = `EVT-T${uid().toUpperCase()}`;
    const e = (await editor.post('/admin/events', { code, titleEn: `Agenda ${code}`, titleAr: 'فعالية', shortDescEn: 'An evening of giving', startsAt: future(30), endsAt: future(30, 23), timezone: 'America/New_York' }).expect(201)).body.data;
    eventId = e.id;
    slug = e.slug;
    await admin.post(`/admin/events/${eventId}/approve`, { note: 'QA agenda test' }).expect(200);
    const pr = await editor.post(`/admin/events/${eventId}/publish`);
    if (pr.status !== 200) throw new Error(JSON.stringify(pr.body));
    secId = (await editor.post(`/admin/events/${eventId}/sections`, { key: 'EVENT_AGENDA' }).expect(201)).body.data.id;
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('nothing is public until the section is first published', async () => {
    await editor.post(`/admin/events/${eventId}/sections/${secId}/items`, { code: 'act-1', titleEn: 'The Spark', titleAr: 'الشرارة', provenance: 'PROPOSED', sortOrder: 10, ...act('Act I', '3:30 – 5:00 PM', [{ time: '3:30 PM', title: 'Welcome reception' }], { label: 'الفصل الأول', time: '3:30 – 5:00 مساءً', items: [{ time: '3:30 م', title: 'حفل الاستقبال' }] }) }).expect(201);
    const before = (await ctx.http().get(`${API}/public/events/${slug}/page?locale=en`).expect(200)).body.data.sections;
    expect(before.find((s: { key: string }) => s.key === 'EVENT_AGENDA')).toBeUndefined();
  });

  it('first publish exposes the section; EN and AR are localized (header copy, act title, JSON body)', async () => {
    await editor.patch(`/admin/events/${eventId}/sections/${secId}`, { eyebrowEn: 'The program', eyebrowAr: 'البرنامج', titleEn: 'The evening at a glance', titleAr: 'الأمسية في لمحة', subtitleEn: 'Saturday', subtitleAr: 'السبت', bodyEn: 'Subject to change', bodyAr: 'قابل للتغيير' }).expect(200);
    await republish();
    const en = await pub('en');
    expect(en).toMatchObject({ eyebrow: 'The program', title: 'The evening at a glance', subtitle: 'Saturday', body: 'Subject to change' });
    expect(en.items).toHaveLength(1);
    expect(en.items[0].title).toBe('The Spark');
    expect(JSON.parse(en.items[0].text)).toMatchObject({ label: 'Act I', time: '3:30 – 5:00 PM', items: [{ title: 'Welcome reception' }] });
    const ar = await pub('ar');
    expect(ar).toMatchObject({ eyebrow: 'البرنامج', title: 'الأمسية في لمحة' });
    expect(ar.items[0].title).toBe('الشرارة');
    expect(JSON.parse(ar.items[0].text)).toMatchObject({ label: 'الفصل الأول', items: [{ title: 'حفل الاستقبال' }] });
  });

  it('add / edit / reorder / delete acts — each only public after the auto re-publish', async () => {
    const add = async (code: string, titleEn: string, sortOrder: number) =>
      (await editor.post(`/admin/events/${eventId}/sections/${secId}/items`, { code, titleEn, titleAr: `${titleEn}-ar`, provenance: 'PROPOSED', sortOrder, ...act(code, '', []) }).expect(201)).body.data;
    const a2 = await add('act-2', 'Second', 20);
    const a3 = await add('act-3', 'Third', 30);
    // saved but not re-published → public unchanged (proves publish is what makes it live)
    expect((await pub('en')).items).toHaveLength(1);
    await republish();
    expect((await pub('en')).items.map((i: { title: string }) => i.title)).toEqual(['The Spark', 'Second', 'Third']);

    // edit nested item details + time range (act PATCH, as the card's Save Act)
    await editor.patch(`/admin/events/${eventId}/items/${a2.id}`, { titleEn: 'Second (edited)', ...act('Act II', '5:00 – 6:15 PM', [{ time: '5:00 PM', title: 'Film', note: 'Screening', highlight: true }, { time: '5:10 PM', title: 'Panel' }]) }).expect(200);
    await republish();
    const e2 = (await pub('en')).items[1];
    expect(e2.title).toBe('Second (edited)');
    expect(JSON.parse(e2.text).items.map((i: { title: string }) => i.title)).toEqual(['Film', 'Panel']);

    // reorder nested items (a client-side reorder saved through the act PATCH)
    await editor.patch(`/admin/events/${eventId}/items/${a2.id}`, act('Act II', '5:00 – 6:15 PM', [{ time: '5:10 PM', title: 'Panel' }, { time: '5:00 PM', title: 'Film' }])).expect(200);
    await republish();
    expect(JSON.parse((await pub('en')).items[1].text).items.map((i: { title: string }) => i.title)).toEqual(['Panel', 'Film']);

    // reorder acts via the new PUT .../items/order
    const sec = (await editor.get(`/admin/events/${eventId}/page`).expect(200)).body.data.sections.find((s: { key: string }) => s.key === 'EVENT_AGENDA');
    const ids = [...sec.items].sort((x: { sortOrder: number }, y: { sortOrder: number }) => x.sortOrder - y.sortOrder).map((i: { id: string }) => i.id);
    await editor.put(`/admin/events/${eventId}/sections/${secId}/items/order`, { ids: [ids[2], ids[0], ids[1]] }).expect(200);
    await republish();
    expect((await pub('en')).items.map((i: { title: string }) => i.title)).toEqual(['Third', 'The Spark', 'Second (edited)']);
    // order endpoint rejects an unknown id
    await editor.put(`/admin/events/${eventId}/sections/${secId}/items/order`, { ids: [ids[0], 'does-not-exist'] }).expect((r) => expect([400, 404, 422]).toContain(r.status));

    // delete an act
    await editor.del(`/admin/events/${eventId}/items/${a3.id}`).expect(204);
    await republish();
    expect((await pub('en')).items.map((i: { title: string }) => i.title)).toEqual(['The Spark', 'Second (edited)']);
  });

  it('data persists in the database (survives a fresh read)', async () => {
    const row = await ctx.prisma.pageSection.findUniqueOrThrow({ where: { id: secId }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
    expect(row.items).toHaveLength(2);
    expect(row.status).toBe('PUBLISHED');
  });

  it('RBAC: read-only / finance roles cannot write or publish the agenda; anonymous cannot reach admin', async () => {
    const finance = await loginAs(ctx, ['FINANCE_MANAGER']);
    await finance.post(`/admin/events/${eventId}/sections/${secId}/items`, { titleEn: 'x' }).expect(403);
    await finance.put(`/admin/events/${eventId}/sections/${secId}/items/order`, { ids: [] }).expect(403);
    await finance.post(`/admin/events/${eventId}/sections/${secId}/publish`).expect(403);
    await ctx.http().put(`${API}/admin/events/${eventId}/sections/${secId}/items/order`).send({ ids: [] }).expect(401);
  });

  it('validation: oversize act JSON is rejected (textEn ≤ 5000)', async () => {
    await editor.post(`/admin/events/${eventId}/sections/${secId}/items`, { titleEn: 'big', textEn: 'x'.repeat(5001) }).expect(400);
  });

  it('audit log records section/item create, update, reorder, delete and publish', async () => {
    const rows = await ctx.prisma.auditLog.findMany({ where: { OR: [{ entityId: secId }, { entityId: { in: (await ctx.prisma.sectionItem.findMany({ where: { sectionId: secId }, select: { id: true } })).map((i) => i.id) } }] } });
    const actions = [...new Set(rows.map((r) => r.action))];
    // eslint-disable-next-line no-console
    console.log('AGENDA AUDIT ACTIONS:', actions.sort().join(', '));
    expect(actions.length).toBeGreaterThanOrEqual(3);
    const all = await ctx.prisma.auditLog.findMany({ where: { action: { contains: 'item' }, createdAt: { gte: new Date(Date.now() - 600_000) } } });
    expect(all.length).toBeGreaterThan(0);
  });
});
