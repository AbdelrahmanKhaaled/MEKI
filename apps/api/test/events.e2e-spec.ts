import { API, createTestApp, loginAs, uid, type Session, type TestContext } from './helpers';

const future = (days: number, hour = 19) => {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

describe('Events & Gala Night foundation', () => {
  let ctx: TestContext;
  let editor: Session; // CONTENT_MANAGER: events.read/manage/publish
  let admin: Session; // ADMINISTRATOR: + events.approve

  beforeAll(async () => {
    ctx = await createTestApp();
    editor = await loginAs(ctx, ['CONTENT_MANAGER']);
    admin = await loginAs(ctx, ['ADMINISTRATOR']);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  const newEvent = async (extra: object = {}) => {
    const code = `EVT-T${uid().toUpperCase()}`;
    return (
      await editor
        .post('/admin/events', {
          code,
          titleEn: `Test Event ${code}`,
          titleAr: 'فعالية',
          shortDescEn: 'An evening of giving',
          startsAt: future(30),
          endsAt: future(30, 23),
          timezone: 'Africa/Cairo',
          ...extra,
        })
        .expect(201)
    ).body.data;
  };

  const publishable = async (extra: object = {}) => {
    const e = await newEvent(extra);
    await admin.post(`/admin/events/${e.id}/approve`, { note: 'Approved by MEKI comms, e-mail 2026-11-06' }).expect(200);
    return e;
  };

  describe('creation & validation', () => {
    it('creates a DRAFT event with its own CMS page', async () => {
      const e = await newEvent();
      expect(e).toMatchObject({ status: 'DRAFT', approvedAt: null, registrationMode: 'NONE', visibility: 'PUBLIC' });
      expect(e.page.slug).toBe(`event-${e.code.toLowerCase()}`);
      const page = await editor.get(`/admin/events/${e.id}/page`).expect(200);
      expect(page.body.data.sections).toEqual([]);
    });

    it.each([
      [{ startsAt: '2027-12-12T19:00:00+02:00', endsAt: '2027-12-12T18:00:00+02:00' }, 422],
      [{ startsAt: '2027-12-12T19:00:00+02:00', timezone: null }, 422],
      [{ timezone: 'Mars/Olympus' }, 422],
      [{ timezone: '+02:00' }, 422],
      [{ startsAt: null, endsAt: '2027-12-12T23:00:00Z' }, 422],
      [{ startsAt: 'December 12' }, 400],
      [{ externalRegistrationUrl: 'http://insecure.example' }, 400],
      [{ ctaPrimaryHref: 'javascript:alert(1)' }, 400],
      [{ ticketPrice: 100 }, 400],
    ])('rejects invalid input %o → %d', async (patch, status) => {
      await editor.post('/admin/events', { code: `EVT-T${uid().toUpperCase()}`, titleEn: `Bad ${uid()}`, ...patch }).expect(status);
    });

    it('allows a pending schedule while in draft and keeps unique slugs', async () => {
      const e = await newEvent({ startsAt: null, endsAt: null, timezone: null, scheduleNoteEn: 'Date to be confirmed' });
      expect(e.startsAt).toBeNull();
      await editor.post('/admin/events', { code: `EVT-T${uid().toUpperCase()}`, slug: e.slug, titleEn: 'Dup' }).expect(409);
    });

    it('edits bilingual content and media references', async () => {
      const e = await newEvent();
      const media = await ctx.prisma.mediaAsset.findUniqueOrThrow({ where: { code: 'web:hero-field' } });
      const res = await editor
        .patch(`/admin/events/${e.id}`, { descriptionAr: 'وصف', highlightsEn: ['Dinner', 'Auction'], heroMediaId: media.id, venueNameEn: 'Venue TBC' })
        .expect(200);
      expect(res.body.data).toMatchObject({ descriptionAr: 'وصف', highlightsEn: ['Dinner', 'Auction'] });
      expect(res.body.data.heroMedia.url).toMatch(/hero-field\.webp$/);
      await editor.patch(`/admin/events/${e.id}`, { coverMediaId: 'nope' }).expect(400);
    });
  });

  describe('publication workflow & public visibility', () => {
    it('drafts are private; publishing needs approval and is public afterwards', async () => {
      const e = await newEvent();
      await ctx.http().get(`${API}/public/events/${e.slug}`).expect(404);
      const blocked = await editor.post(`/admin/events/${e.id}/publish`).expect(422);
      expect(blocked.body.error.details.reasons).toContain('Event content has no recorded client approval');

      await editor.post(`/admin/events/${e.id}/approve`, { note: 'self approval attempt' }).expect(403);
      await admin.post(`/admin/events/${e.id}/approve`, { note: 'Approved by MEKI' }).expect(200);
      await editor.post(`/admin/events/${e.id}/submit`).expect(200);
      await editor.post(`/admin/events/${e.id}/publish`).expect(200);

      const pub = await ctx.http().get(`${API}/public/events/${e.slug}?locale=ar`).expect(200);
      expect(pub.body.data).toMatchObject({ title: 'فعالية', shortDesc: 'An evening of giving', status: 'PUBLISHED' });
      expect(pub.body.data.translationFallback).toContain('shortDesc');
      for (const k of ['internalNotes', 'approvalNote', 'approvedBy', 'sourceRef', 'provenance', 'createdById']) expect(pub.body.data).not.toHaveProperty(k);
      const list = await ctx.http().get(`${API}/public/events?when=upcoming`).expect(200);
      expect(list.body.data.map((x: { slug: string }) => x.slug)).toContain(e.slug);

      await editor.post(`/admin/events/${e.id}/unpublish`).expect(200);
      await ctx.http().get(`${API}/public/events/${e.slug}`).expect(404);
    });

    it('cannot publish without a confirmed date/time/timezone', async () => {
      const e = await publishable({ startsAt: null, endsAt: null, timezone: null });
      const res = await editor.post(`/admin/events/${e.id}/publish`).expect(422);
      expect(res.body.error.details.reasons).toEqual(
        expect.arrayContaining(['A confirmed start date and time (startsAt) is required', 'A confirmed timezone is required']),
      );
    });

    it('live events cannot drop their confirmed schedule', async () => {
      const e = await publishable();
      await editor.post(`/admin/events/${e.id}/publish`).expect(200);
      await editor.patch(`/admin/events/${e.id}`, { startsAt: null, endsAt: null }).expect(422);
      await editor.patch(`/admin/events/${e.id}`, { venueNameEn: 'Confirmed venue' }).expect(200);
    });

    it('UNLISTED events are reachable by slug but not listed', async () => {
      const e = await publishable({ visibility: 'UNLISTED' });
      await editor.post(`/admin/events/${e.id}/publish`).expect(200);
      await ctx.http().get(`${API}/public/events/${e.slug}`).expect(200);
      const list = await ctx.http().get(`${API}/public/events`).expect(200);
      expect(list.body.data.map((x: { slug: string }) => x.slug)).not.toContain(e.slug);
    });

    it('cancelled: published event stays visible as CANCELLED; never-published stays private', async () => {
      const live = await publishable();
      await editor.post(`/admin/events/${live.id}/publish`).expect(200);
      await editor.post(`/admin/events/${live.id}/cancel`).expect(200);
      const pub = await ctx.http().get(`${API}/public/events/${live.slug}`).expect(200);
      expect(pub.body.data.status).toBe('CANCELLED');

      const draft = await publishable();
      await editor.post(`/admin/events/${draft.id}/cancel`).expect(200);
      await ctx.http().get(`${API}/public/events/${draft.slug}`).expect(404);
    });

    it('external registration link is exposed only in EXTERNAL_LINK mode', async () => {
      const e = await publishable({ externalRegistrationUrl: 'https://tickets.example.org/gala' });
      await editor.post(`/admin/events/${e.id}/publish`).expect(200);
      let pub = await ctx.http().get(`${API}/public/events/${e.slug}`).expect(200);
      expect(pub.body.data.externalRegistrationUrl).toBeNull();
      await editor.patch(`/admin/events/${e.id}`, { registrationMode: 'EXTERNAL_LINK' }).expect(200);
      pub = await ctx.http().get(`${API}/public/events/${e.slug}`).expect(200);
      expect(pub.body.data.externalRegistrationUrl).toBe('https://tickets.example.org/gala');
      await editor.patch(`/admin/events/${e.id}`, { registrationMode: 'RSVP' }).expect(400); // not an approved mode
    });

    it('DEMO events can never be approved', async () => {
      const e = await newEvent({ provenance: 'DEMO' });
      const res = await admin.post(`/admin/events/${e.id}/approve`, { note: 'attempted approval of DEMO' }).expect(422);
      expect(res.body.error.code).toBe('DEMO_NOT_PUBLISHABLE');
    });
  });

  describe('event landing page (reused CMS)', () => {
    it('sections are snapshotted and only served while the event is public', async () => {
      const e = await publishable();
      const s = (await editor.post(`/admin/events/${e.id}/sections`, { key: 'EVENT_AGENDA', titleEn: 'Agenda', titleAr: 'البرنامج' }).expect(201)).body.data;
      await editor.post(`/admin/events/${e.id}/sections/${s.id}/items`, { titleEn: '19:00 Reception' }).expect(201);
      await editor.post(`/admin/events/${e.id}/sections/${s.id}/publish`).expect(200);
      // Section published, event still draft → nothing public.
      await ctx.http().get(`${API}/public/events/${e.slug}/page`).expect(404);
      await ctx.http().get(`${API}/public/pages/${e.page.slug}`).expect(404);

      await editor.post(`/admin/events/${e.id}/publish`).expect(200);
      const page = await ctx.http().get(`${API}/public/events/${e.slug}/page?locale=ar`).expect(200);
      expect(page.body.data.sections[0]).toMatchObject({ key: 'EVENT_AGENDA', title: 'البرنامج' });
      expect(page.body.data.sections[0].items[0].title).toBe('19:00 Reception');
      // Event pages are never exposed through the generic site pages endpoint.
      await ctx.http().get(`${API}/public/pages/${e.page.slug}`).expect(404);
    });

    it('enforces section families and page scoping', async () => {
      const e = await newEvent();
      await editor.post(`/admin/events/${e.id}/sections`, { key: 'HERO' }).expect(400);
      const s = (await editor.post(`/admin/events/${e.id}/sections`, { key: 'EVENT_HERO' }).expect(201)).body.data;
      // Site CMS endpoints refuse event pages (they would bypass event approval).
      const viaCms = await editor.patch(`/admin/cms/sections/${s.id}`, { titleEn: 'x' }).expect(403);
      expect(viaCms.body.error.code).toBe('EVENT_PAGE_SCOPE');
      await editor.post(`/admin/cms/pages/${e.page.slug}/publish`).expect(403);
      await editor.post(`/admin/cms/pages/home/sections`, { key: 'EVENT_HERO' }).expect(400);
      // A section of event A cannot be edited through event B.
      const other = await newEvent();
      await editor.patch(`/admin/events/${other.id}/sections/${s.id}`, { titleEn: 'hijack' }).expect(404);
    });
  });

  describe('media & campaign associations', () => {
    it('ordered gallery from the Media Library; in-use media cannot be deleted', async () => {
      const e = await newEvent();
      const [a, b] = await ctx.prisma.mediaAsset.findMany({ where: { code: { in: ['web:greenhouse', 'web:weaver'] } }, orderBy: { code: 'asc' } });
      const res = await editor.put(`/admin/events/${e.id}/gallery`, { items: [{ mediaId: b.id }, { mediaId: a.id, role: 'SUPPORTING' }] }).expect(200);
      expect(res.body.data.gallery.map((g: { media: { id: string }; role: string }) => [g.media.id, g.role])).toEqual([
        [b.id, 'GALLERY'],
        [a.id, 'SUPPORTING'],
      ]);
      await editor.put(`/admin/events/${e.id}/gallery`, { items: [{ mediaId: a.id }, { mediaId: a.id }] }).expect(400);
      const usage = await admin.get(`/admin/media/${a.id}`).expect(200);
      expect(usage.body.data.usage.eventGallery).toBeGreaterThan(0);
    });

    it('linking campaigns never activates them; only eligible campaigns appear publicly', async () => {
      const programmeId = (await ctx.prisma.programme.findUniqueOrThrow({ where: { code: 'PRG-02' } })).id;
      const draft = (await admin.post('/admin/campaigns', { code: `CMP-E${uid().toUpperCase()}`, titleEn: `Draft ${uid()}`, summaryEn: 'S', programmeId }).expect(201)).body.data;
      const live = (await admin.post('/admin/campaigns', { code: `CMP-E${uid().toUpperCase()}`, titleEn: `Live ${uid()}`, summaryEn: 'S', programmeId }).expect(201)).body.data;
      await admin.post(`/admin/campaigns/${live.id}/approve`, { note: 'Approved by MEKI' }).expect(200);
      await admin.post(`/admin/campaigns/${live.id}/publish`).expect(200);

      const e = await publishable();
      await editor.put(`/admin/events/${e.id}/campaigns`, { campaignIds: [draft.id, live.id] }).expect(200);
      await editor.post(`/admin/events/${e.id}/publish`).expect(200);

      const after = await admin.get(`/admin/campaigns/${draft.id}`).expect(200);
      expect(after.body.data).toMatchObject({ status: 'DRAFT', donationsOpen: false, approvedAt: null });
      const pub = await ctx.http().get(`${API}/public/events/${e.slug}/campaigns`).expect(200);
      expect(pub.body.data.map((c: { id: string }) => c.id)).toEqual([live.id]);
      expect(pub.body.data[0].acceptingDonations).toBe(false);

      await editor.put(`/admin/events/${e.id}/campaigns`, { campaignIds: ['missing'] }).expect(400);
    });
  });

  describe('RBAC, deletion & audit', () => {
    it('enforces event permissions server-side', async () => {
      const cm = await loginAs(ctx, ['CAMPAIGN_MANAGER']);
      await cm.get('/admin/events').expect(200);
      await cm.post('/admin/events', { code: `EVT-T${uid().toUpperCase()}`, titleEn: 'Nope' }).expect(403);
      const finance = await loginAs(ctx, ['FINANCE_MANAGER']);
      await finance.get('/admin/events').expect(200);
      const e = await newEvent();
      await finance.post(`/admin/events/${e.id}/publish`).expect(403);
      await ctx.http().get(`${API}/admin/events`).expect(401);
    });

    it('live events cannot be deleted; drafts are soft-deleted; actions are audited', async () => {
      const e = await publishable();
      await editor.post(`/admin/events/${e.id}/publish`).expect(200);
      const blocked = await editor.del(`/admin/events/${e.id}`).expect(409);
      expect(blocked.body.error.code).toBe('EVENT_IS_LIVE');
      await editor.post(`/admin/events/${e.id}/unpublish`).expect(200);
      await editor.del(`/admin/events/${e.id}`).expect(204);
      await editor.get(`/admin/events/${e.id}`).expect(404);
      const row = await ctx.prisma.event.findUnique({ where: { id: e.id } });
      expect(row!.deletedAt).not.toBeNull();
      const actions = (await ctx.prisma.auditLog.findMany({ where: { entityId: e.id } })).map((a) => a.action);
      expect(actions).toEqual(expect.arrayContaining(['event.create', 'event.approve', 'event.publish', 'event.unpublish', 'event.delete']));
    });

    it('lists with filters, search, sort and pagination', async () => {
      const res = await editor.get('/admin/events?status=DRAFT&search=Test%20Event&sort=startsAt:asc&pageSize=5').expect(200);
      expect(res.body.meta.pageSize).toBe(5);
      expect(res.body.data.every((x: { status: string }) => x.status === 'DRAFT')).toBe(true);
      await editor.get('/admin/events?from=not-a-date').expect(400);
    });
  });

  describe('Gala Night draft (seed)', () => {
    it('exists as a private draft with only confirmed information', async () => {
      const gala = await ctx.prisma.event.findUniqueOrThrow({ where: { code: 'EVT-GALA-NIGHT' }, include: { page: { include: { sections: true } }, campaigns: true } });
      expect(gala).toMatchObject({
        titleEn: 'MEKI Gala Night',
        status: 'DRAFT',
        approvedAt: null,
        startsAt: null,
        endsAt: null,
        timezone: null,
        venueNameEn: null,
        descriptionEn: null,
        titleAr: null,
        registrationMode: 'NONE',
        provenance: 'PROPOSED',
      });
      expect(gala.scheduleNoteEn).toMatch(/12 December/);
      expect(gala.campaigns).toHaveLength(0);
      expect(gala.page.status).toBe('DRAFT');
      expect(gala.page.sections.every((s) => s.status === 'DRAFT' && s.key.startsWith('EVENT_'))).toBe(true);
      await ctx.http().get(`${API}/public/events/gala-night`).expect(404);
    });
  });
});
