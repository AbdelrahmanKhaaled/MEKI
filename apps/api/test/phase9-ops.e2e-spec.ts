import { PrismaService } from '../src/prisma/prisma.service';
import { API, createTestApp, loginAs, uid, type Session, type TestContext } from './helpers';

jest.setTimeout(60_000);

/** Phase 9A — health probes and the administrators' operations view. */
describe('Phase 9A — health probes and system status', () => {
  let ctx: TestContext;
  let admin: Session;
  let content: Session;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await loginAs(ctx, ['ADMINISTRATOR']);
    content = await loginAs(ctx, ['CONTENT_MANAGER']);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('readiness checks the database; liveness never touches it', async () => {
    expect((await ctx.http().get(`${API}/health`).expect(200)).body.data).toMatchObject({ status: 'ok', database: 'up' });
    const prisma = ctx.app.get(PrismaService);
    const spy = jest.spyOn(prisma, '$queryRaw').mockImplementation((() => new Promise(() => undefined)) as never); // a hung database
    try {
      const started = Date.now();
      const r = await ctx.http().get(`${API}/health`);
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('DB_UNAVAILABLE');
      expect(Date.now() - started).toBeLessThan(6000); // fails fast (3 s probe timeout), not after the 10 s pool timeout
      expect((await ctx.http().get(`${API}/health/live`).expect(200)).body.data.status).toBe('ok');
    } finally {
      spy.mockRestore();
    }
  });

  it('system status: audit.read only, counts and flags without secrets, alerts for failures', async () => {
    await ctx.http().get(`${API}/admin/system/status`).expect(401);
    await content.get('/admin/system/status').expect(403);
    const ev = await ctx.prisma.paymentWebhookEvent.create({
      data: { provider: 'mock', providerEventId: `ops-${uid()}`, eventType: 'payment.succeeded', signatureVerified: true, payloadHash: 'x'.repeat(64), payload: {}, status: 'FAILED', lastError: 'REJECTED: test' },
    });
    const s = (await admin.get('/admin/system/status').expect(200)).body.data;
    expect(s).toMatchObject({ database: { up: true }, storage: { mediaWritable: true, privateWritable: true }, mail: { transport: 'memory' }, payments: expect.any(Object) });
    expect(s.webhooks.byProvider.mock.FAILED).toBeGreaterThan(0);
    expect(s.alerts.join(' ')).toMatch(/failed webhook/);
    expect(s.status).toBe('attention');
    const text = JSON.stringify(s);
    for (const k of ['DATABASE_URL', 'MOCK_PAYMENT_WEBHOOK_SECRET', 'DONATION_TOKEN_SECRET', 'EVENT_BOOKING_TOKEN_SECRET', 'ZEFFY_API_KEY', 'ZEFFY_WEBHOOK_SECRET']) {
      const v = process.env[k];
      if (v && v.length > 8) expect(text).not.toContain(v);
    }
    expect(text).not.toMatch(/mysql:\/\//);
    // the test row is a webhook-store record of this test only (never a financial record); it stays as history
    expect(ev.id).toBeTruthy();
  });
});
