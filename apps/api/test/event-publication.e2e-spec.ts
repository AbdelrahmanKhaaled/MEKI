import { API, createTestApp, loginAs, uid, type Session, type TestContext } from './helpers';

/**
 * Event publication lifecycle (event + page + agenda + revalidation + audit).
 * Incident: a published agenda SECTION never made the EVENT public (public API 404) and nothing in the admin could publish the event.
 * Policy (26 Nov 2026, MEKI): the Gala content is already client-approved, so NO additional approval reference/step may block publishing it.
 *   - Publishing needs only events.publish + the basic content rules (date/time/timezone, short description, not DEMO).
 *   - Nothing is ever recorded as "approved" automatically; an optional approval reference can still be recorded (events.approve, audited)
 *     and any existing approval record is preserved untouched through publish / unpublish / republish.
 * Runs only against the isolated *_test database.
 */
const future = (days: number, hour = 19) => {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};
const act = (label: string, time: string, items: { time: string; title: string; note?: string }[]) => JSON.stringify({ label, time, items });

describe('Event publication lifecycle — no approval step blocks publishing', () => {
  let ctx: TestContext;
  let editor: Session; // CONTENT_MANAGER: events.read/manage/publish (no events.approve)
  let admin: Session; // ADMINISTRATOR: + events.approve
  let id: string;
  let slug: string;
  let pageId: string;
  let secId: string;
  let actId: string;
  const pubPage = (s: string, locale: 'en' | 'ar') => ctx.http().get(`${API}/public/events/${s}/page?locale=${locale}`);
  const agenda = async (locale: 'en' | 'ar') => (await pubPage(slug, locale).expect(200)).body.data.sections.find((s: { key: string }) => s.key === 'EVENT_AGENDA');
  const counts = async () => ({
    donations: await ctx.prisma.donation.count(),
    attempts: await ctx.prisma.paymentAttempt.count(),
    bookings: await ctx.prisma.eventBooking.count(),
    sdi: await ctx.prisma.sdiAttendee.count(),
  });
  const state = async (eid = id) => {
    const e = await ctx.prisma.event.findUniqueOrThrow({ where: { id: eid }, include: { page: true } });
    return { status: e.status, page: e.page.status, approved: !!e.approvedAt, published: !!e.publishedAt };
  };
  const mkEvent = async () => {
    const code = `EVT-T${uid().toUpperCase()}`;
    return (await editor.post('/admin/events', { code, titleEn: `Pub ${code}`, titleAr: 'فعالية', shortDescEn: 'An evening of giving', startsAt: future(30), endsAt: future(30, 23), timezone: 'America/New_York' }).expect(201)).body.data;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    editor = await loginAs(ctx, ['CONTENT_MANAGER']);
    admin = await loginAs(ctx, ['ADMINISTRATOR']);
    const e = await mkEvent();
    id = e.id;
    slug = e.slug;
    pageId = e.page.id;
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('REPRODUCTION: a published agenda section on a DRAFT event is NOT public (404) — the production symptom', async () => {
    secId = (await editor.post(`/admin/events/${id}/sections`, { key: 'EVENT_AGENDA', titleEn: 'The evening', titleAr: 'الأمسية' }).expect(201)).body.data.id;
    actId = (await editor.post(`/admin/events/${id}/sections/${secId}/items`, { code: 'act-1', titleEn: 'The Spark', titleAr: 'الشرارة', textEn: act('Act I', '3:30 – 5:00 PM', [{ time: '3:30 PM', title: 'Welcome' }]), textAr: act('الفصل الأول', '3:30 – 5:00 مساءً', [{ time: '3:30 م', title: 'ترحيب' }]) }).expect(201)).body.data.id;
    expect((await editor.post(`/admin/events/${id}/sections/${secId}/publish`).expect(200)).body.data.status).toBe('PUBLISHED');
    expect(await state()).toMatchObject({ status: 'DRAFT', page: 'DRAFT', approved: false, published: false });
    await pubPage(slug, 'en').expect(404);
    await pubPage(slug, 'ar').expect(404);
  });

  it('NO APPROVAL REQUIRED: the admin detail reports no blockers for a complete event', async () => {
    const d = (await editor.get(`/admin/events/${id}`).expect(200)).body.data;
    expect(d.publishBlockers).toEqual([]);
    expect(d).toMatchObject({ status: 'DRAFT', approvedAt: null, publishedAt: null, page: { status: 'DRAFT' } });
  });

  it('the basic content rules still block publishing (date/time/timezone, description) — only the approval gate was removed', async () => {
    const e = await (async () => {
      const code = `EVT-T${uid().toUpperCase()}`;
      return (await editor.post('/admin/events', { code, titleEn: `Bare ${code}` }).expect(201)).body.data;
    })();
    const r = await editor.post(`/admin/events/${e.id}/publish`).expect(422);
    expect(r.body.error.code).toBe('EVENT_NOT_PUBLISHABLE');
    expect(r.body.error.details.reasons).toEqual(expect.arrayContaining(['shortDescEn is required', 'A confirmed start date and time (startsAt) is required']));
    expect(r.body.error.details.reasons.join(' ')).not.toMatch(/approval/i);
  });

  it('PUBLISH WITHOUT APPROVAL: event + page flip together, the public page is 200 in EN and AR with the exact saved agenda, the website refresh runs — and NO approval record is fabricated', async () => {
    const before = await counts();
    const res = await editor.post(`/admin/events/${id}/publish`).expect(200);
    expect(res.body.data).toMatchObject({ status: 'PUBLISHED', page: { status: 'PUBLISHED' }, approvedAt: null, approvedBy: null, approvalNote: null });
    expect(res.headers['x-meki-revalidation']).toMatch(/^(revalidated|pending|disabled)$/);
    expect(await state()).toMatchObject({ status: 'PUBLISHED', page: 'PUBLISHED', approved: false, published: true });
    const en = await agenda('en');
    expect(en.title).toBe('The evening');
    expect(JSON.parse(en.items[0].text)).toEqual({ label: 'Act I', time: '3:30 – 5:00 PM', items: [{ time: '3:30 PM', title: 'Welcome' }] });
    const ar = await agenda('ar');
    expect(ar.items[0].title).toBe('الشرارة');
    expect(JSON.parse(ar.items[0].text).items[0].title).toBe('ترحيب');
    await ctx.http().get(`${API}/public/events/${slug}?locale=en`).expect(200);
    expect(await counts()).toEqual(before); // bookings, donations, payments, SDI records untouched
    const approvals = await ctx.prisma.auditLog.count({ where: { entityId: id, action: { in: ['event.approve', 'event.approval_revoked'] } } });
    expect(approvals).toBe(0); // nothing was approved or un-approved behind anyone's back
  });

  it('every later save → section publish makes the exact latest text public (EN + AR); unpublished edits stay hidden until then', async () => {
    await editor.patch(`/admin/events/${id}/items/${actId}`, { titleEn: 'The Spark (v2)', titleAr: 'الشرارة (٢)', textEn: act('Act I', '3:45 – 5:00 PM', [{ time: '3:45 PM', title: 'Welcome v2', note: 'Host' }]), textAr: act('الفصل الأول', '3:45 – 5:00 مساءً', [{ time: '3:45 م', title: 'ترحيب ٢' }]) }).expect(200);
    expect((await agenda('en')).items[0].title).toBe('The Spark');
    const rep = await editor.post(`/admin/events/${id}/sections/${secId}/publish`).expect(200);
    expect(rep.headers['x-meki-revalidation']).toBeDefined();
    const en = await agenda('en');
    expect(en.items[0].title).toBe('The Spark (v2)');
    expect(JSON.parse(en.items[0].text)).toEqual({ label: 'Act I', time: '3:45 – 5:00 PM', items: [{ time: '3:45 PM', title: 'Welcome v2', note: 'Host' }] });
    const ar = await agenda('ar');
    expect(ar.items[0].title).toBe('الشرارة (٢)');
    expect(JSON.parse(ar.items[0].text).time).toBe('3:45 – 5:00 مساءً');
  });

  it('section copy, new act, item reorder and delete all publish through the same single call', async () => {
    await editor.patch(`/admin/events/${id}/sections/${secId}`, { titleEn: 'Programme v2', titleAr: 'البرنامج ٢' }).expect(200);
    const a2 = (await editor.post(`/admin/events/${id}/sections/${secId}/items`, { code: 'act-2', titleEn: 'Second', titleAr: 'الثاني', sortOrder: 20, textEn: act('Act II', '5:00 PM', []), textAr: act('الفصل الثاني', '5:00 م', []) }).expect(201)).body.data;
    await editor.post(`/admin/events/${id}/sections/${secId}/publish`).expect(200);
    expect(await agenda('en')).toMatchObject({ title: 'Programme v2' });
    expect((await agenda('ar')).title).toBe('البرنامج ٢');
    expect((await agenda('en')).items.map((i: { title: string }) => i.title)).toEqual(['The Spark (v2)', 'Second']);
    await editor.put(`/admin/events/${id}/sections/${secId}/items/order`, { ids: [a2.id, actId] }).expect(200);
    await editor.post(`/admin/events/${id}/sections/${secId}/publish`).expect(200);
    expect((await agenda('en')).items.map((i: { title: string }) => i.title)).toEqual(['Second', 'The Spark (v2)']);
    await editor.del(`/admin/events/${id}/items/${a2.id}`).expect(204);
    await editor.post(`/admin/events/${id}/sections/${secId}/publish`).expect(200);
    expect((await agenda('en')).items.map((i: { title: string }) => i.title)).toEqual(['The Spark (v2)']);
  });

  it('permissions are unchanged: finance cannot edit/publish/unpublish; anonymous is 401; approval stays an events.approve-only optional action', async () => {
    const finance = await loginAs(ctx, ['FINANCE_MANAGER']);
    await finance.post(`/admin/events/${id}/unpublish`).expect(403);
    await finance.post(`/admin/events/${id}/publish`).expect(403);
    await finance.post(`/admin/events/${id}/sections/${secId}/publish`).expect(403);
    await ctx.http().post(`${API}/admin/events/${id}/sections/${secId}/publish`).expect(401);
    await editor.post(`/admin/events/${id}/approve`, { note: 'Approved by MEKI comms 2026-11-26 (email)' }).expect(403);
    await admin.post(`/admin/events/${id}/approve`, { note: 'ok' }).expect(400); // a real reference is still required IF one is recorded
    expect(await state()).toMatchObject({ status: 'PUBLISHED', approved: false });
  });

  it('UNPUBLISH: event + page return to DRAFT together, public is 404, nothing financial changes; REPUBLISH needs no approval and restores the latest content', async () => {
    const before = await counts();
    expect((await editor.post(`/admin/events/${id}/unpublish`).expect(200)).headers['x-meki-revalidation']).toBeDefined();
    expect(await state()).toMatchObject({ status: 'DRAFT', page: 'DRAFT' });
    await pubPage(slug, 'en').expect(404);
    await pubPage(slug, 'ar').expect(404);
    await editor.post(`/admin/events/${id}/publish`).expect(200);
    expect(await state()).toMatchObject({ status: 'PUBLISHED', page: 'PUBLISHED', approved: false });
    expect((await agenda('en')).items[0].title).toBe('The Spark (v2)');
    expect(await counts()).toEqual(before);
  });

  it('EXISTING APPROVAL RECORDS ARE PRESERVED: an event approved earlier keeps approvedAt / approver / note byte-for-byte through publish → unpublish → republish', async () => {
    const e = await mkEvent();
    const note = 'Written approval from SDI, e-mail of 2026-11-25 (ref QA-1)';
    await admin.post(`/admin/events/${e.id}/approve`, { note }).expect(200);
    const rec = await ctx.prisma.event.findUniqueOrThrow({ where: { id: e.id } });
    await editor.post(`/admin/events/${e.id}/publish`).expect(200);
    await editor.post(`/admin/events/${e.id}/unpublish`).expect(200);
    await editor.post(`/admin/events/${e.id}/publish`).expect(200);
    const after = await ctx.prisma.event.findUniqueOrThrow({ where: { id: e.id } });
    expect(after.approvedAt?.getTime()).toBe(rec.approvedAt?.getTime());
    expect(after.approvedById).toBe(admin.userId);
    expect(after.approvalNote).toBe(note);
    await admin.post(`/admin/events/${e.id}/revoke-approval`).expect(422); // cannot revoke while live (unchanged)
    const log = await ctx.prisma.auditLog.findFirstOrThrow({ where: { entityId: e.id, action: 'event.approve' } });
    expect(log.actorId).toBe(admin.userId);
    expect(JSON.stringify(log.metadata)).toContain('QA-1');
  });

  it('audit trail: publish, unpublish, publish by the right actor; event and page never drift', async () => {
    const rows = await ctx.prisma.auditLog.findMany({ where: { entityId: id, action: { in: ['event.publish', 'event.unpublish'] } }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => r.action)).toEqual(['event.publish', 'event.unpublish', 'event.publish']);
    expect(rows.every((r) => r.actorId === editor.userId)).toBe(true);
    const ev = await ctx.prisma.event.findUniqueOrThrow({ where: { id }, include: { page: true } });
    expect(ev.pageId).toBe(pageId);
    expect(ev.page.status).toBe(ev.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT');
  });
});
