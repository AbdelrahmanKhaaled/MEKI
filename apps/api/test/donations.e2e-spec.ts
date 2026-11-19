import { randomUUID } from 'node:crypto';
import { MockPaymentProvider } from '../src/modules/donations/payments/mock-payment.provider';
import { API, createAdmin, createTestApp, login, loginAs, uid, type Session, type TestContext } from './helpers';

const SECRET = () => process.env.MOCK_PAYMENT_WEBHOOK_SECRET!;

describe('Donations, payments, webhooks, recurring, refunds, receipts, reports', () => {
  let ctx: TestContext;
  let admin: Session; // ADMINISTRATOR
  let admin2: Session; // second approver (four-eyes)
  let finance: Session;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await loginAs(ctx, ['ADMINISTRATOR']);
    admin2 = await loginAs(ctx, ['ADMINISTRATOR']);
    finance = await loginAs(ctx, ['FINANCE_MANAGER']);
    // Activation for this suite only (restored in afterAll so other suites keep payments disabled).
    await admin.patch('/admin/payments/providers/mock', { isEnabled: true }).expect(200);
    await admin.patch('/admin/settings/donation', { paymentsEnabled: true, allowRecurring: true }).expect(200);
  });
  afterAll(async () => {
    await admin.patch('/admin/settings/donation', { paymentsEnabled: false, allowRecurring: false }).expect(200);
    await admin.patch('/admin/payments/providers/mock', { isEnabled: false }).expect(200);
    await ctx.app.close();
  });

  const donor = () => ({ firstName: 'Test', lastName: `Donor`, email: `donor-${uid()}@example.org`, countryCode: 'US' });
  const body = (extra: object = {}) => ({ amount: '50', currency: 'USD', designation: 'GENERAL_FUND', donor: donor(), privacyConsent: true, ...extra });
  const create = (b: object, key = `k-${randomUUID()}`) => ctx.http().post(`${API}/public/donations`).set('Idempotency-Key', key).send(b);
  const session = (ref: string, token: string) => ctx.http().post(`${API}/public/donations/${ref}/payment-session`).set('X-Donation-Token', token);
  const status = (ref: string, token: string) => ctx.http().get(`${API}/public/donations/${ref}/status`).set('X-Donation-Token', token);
  const hook = (payload: Record<string, unknown>, secret = SECRET()) => {
    const s = MockPaymentProvider.sign(secret, { id: `evt_${uid()}${uid()}`, created: Math.floor(Date.now() / 1000), ...payload });
    return { send: () => ctx.http().post(`${API}/webhooks/mock`).set('Content-Type', 'application/json').set(s.header, s.signature).send(s.body), body: s.body, sig: s.signature, header: s.header };
  };
  const resend = (h: { body: string; sig: string; header: string }) => ctx.http().post(`${API}/webhooks/mock`).set('Content-Type', 'application/json').set(h.header, h.sig).send(h.body);

  /** Creates a donation + checkout session; returns what a provider would know (attempt ref + session ref). */
  const startPayment = async (b: object = body()) => {
    const created = (await create(b).expect(201)).body.data;
    const s = (await session(created.reference, created.accessToken).expect(200)).body.data;
    const attempt = await ctx.prisma.paymentAttempt.findUniqueOrThrow({ where: { reference: s.attemptReference } });
    return { ...created, attempt, session: s };
  };
  const succeed = (p: Awaited<ReturnType<typeof startPayment>>, extra: object = {}) =>
    hook({ type: 'payment.succeeded', attemptReference: p.attempt.reference, sessionRef: p.attempt.providerSessionRef, paymentRef: `mock_pay_${uid()}`, amount: p.amount, currency: p.currency, ...extra });

  // ───────── configuration ─────────

  it('public config exposes enabled currencies and amounts as decimal strings', async () => {
    const res = await ctx.http().get(`${API}/public/donations/config`).expect(200);
    const usd = res.body.data.currencies.find((c: { code: string }) => c.code === 'USD');
    expect(res.body.data).toMatchObject({ paymentsEnabled: true, amountFormat: 'decimal-string' });
    expect(res.body.data.frequencies).toEqual(['ONE_TIME', 'MONTHLY']);
    expect(usd.suggestedAmounts).toEqual(['25.00', '50.00', '100.00', '250.00']);
    expect(res.body.data.currencies.map((c: { code: string }) => c.code)).not.toContain('EGP'); // seeded disabled
  });

  // ───────── one-time lifecycle ─────────

  it('guest general-fund donation: pending → verified webhook → completed + receipt', async () => {
    const p = await startPayment();
    expect(p).toMatchObject({ status: 'PENDING', paymentStatus: 'UNPAID', amount: '50.00', isTest: true });
    expect(p.session.checkoutUrl).toMatch(/\/api\/v1\/dev\/mock-checkout\/mock_sess_[a-f0-9]{18}$/);

    let st = (await status(p.reference, p.accessToken).expect(200)).body.data;
    expect(st).toMatchObject({ confirmed: false, message: 'processing' });

    const res = await succeed(p).send().expect(200);
    expect(res.body.data.status).toBe('PROCESSED');
    st = (await status(p.reference, p.accessToken).expect(200)).body.data;
    expect(st).toMatchObject({ confirmed: true, status: 'COMPLETED', paymentStatus: 'PAID' });
    expect(st.receiptNumber).toMatch(/^TEST-MEKI-\d{4}-\d{6}$/);
    const ledger = await ctx.prisma.paymentTransaction.findMany({ where: { donation: { reference: p.reference } } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ type: 'CAPTURE', status: 'SUCCEEDED', isTest: true });
  });

  it('dev mock checkout page: TEST-labelled, completes only via the signed webhook pipeline, then redirects', async () => {
    const path = (url: string) => new URL(url).pathname;
    const ok = await startPayment(body({ locale: 'ar' }));
    const page = await ctx.http().get(path(ok.session.checkoutUrl)).expect(200);
    expect(page.text).toContain('TEST MODE');
    expect(page.text).toContain(ok.reference);
    expect(page.text).not.toMatch(/card number|cvv/i);
    expect(page.headers['content-security-policy']).toContain("form-action 'self'");
    const done = await ctx.http().post(path(ok.session.checkoutUrl)).type('form').send({ outcome: 'succeed' }).expect(303);
    expect(done.headers.location).toBe(`http://localhost:3000/ar/donation/return?reference=${ok.reference}`);
    expect(done.headers.location).not.toContain(ok.accessToken);
    expect((await status(ok.reference, ok.accessToken)).body.data).toMatchObject({ confirmed: true, paymentStatus: 'PAID', isTest: true });
    expect(await ctx.prisma.paymentWebhookEvent.count({ where: { providerEventId: `evt_mockcheckout_${ok.attempt.reference}_succeed`, signatureVerified: true } })).toBe(1);
    // Session no longer active → no buttons; a replayed POST does not double-charge.
    expect((await ctx.http().get(path(ok.session.checkoutUrl)).expect(200)).text).toContain('no longer active');
    await ctx.http().post(path(ok.session.checkoutUrl)).type('form').send({ outcome: 'succeed' }).expect(303);
    expect(await ctx.prisma.paymentTransaction.count({ where: { paymentAttemptId: ok.attempt.id, type: 'CAPTURE' } })).toBe(1);

    const declined = await startPayment();
    await ctx.http().post(path(declined.session.checkoutUrl)).type('form').send({ outcome: 'fail' }).expect(303);
    expect((await status(declined.reference, declined.accessToken)).body.data).toMatchObject({ status: 'FAILED', confirmed: false });

    const cancelled = await startPayment();
    const c = await ctx.http().post(path(cancelled.session.checkoutUrl)).type('form').send({ outcome: 'cancel' }).expect(303);
    expect(c.headers.location).toContain('cancelled=1');
    expect((await status(cancelled.reference, cancelled.accessToken)).body.data).toMatchObject({ status: 'PENDING', confirmed: false });

    await ctx.http().post(path(cancelled.session.checkoutUrl)).type('form').send({ outcome: 'steal' }).expect(400);
    await ctx.http().get('/api/v1/dev/mock-checkout/mock_sess_000000000000000000').expect(404);
    await ctx.http().get('/api/v1/dev/mock-checkout/not-a-session').expect(404);
  });

  it('public config reports test mode for the mock provider', async () => {
    expect((await ctx.http().get(`${API}/public/donations/config`)).body.data.testMode).toBe(true);
  });

  it('the frontend redirect / status call never confirms a payment by itself', async () => {
    const p = await startPayment();
    await ctx.http().get(`${API}/public/donations/${p.reference}/confirmation?token=${p.accessToken}`).expect(200);
    const d = await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: p.reference } });
    expect(d).toMatchObject({ status: 'PENDING', paymentStatus: 'UNPAID', confirmedAt: null });
  });

  it('status requires the access token; responses never contain donor PII or internals', async () => {
    const b = body();
    const p = await startPayment(b);
    await ctx.http().get(`${API}/public/donations/${p.reference}/status`).expect(404);
    await status(p.reference, 'x'.repeat(43)).expect(404);
    await status('DN-000000000000', p.accessToken).expect(404);
    const res = await status(p.reference, p.accessToken).expect(200);
    const json = JSON.stringify(res.body);
    expect(json).not.toContain(b.donor.email);
    for (const k of ['donor', 'donorId', 'accessTokenHash', 'idempotencyKey', 'provider', 'attempts', 'providerPaymentRef']) expect(res.body.data).not.toHaveProperty(k);
  });

  it('webhooks: bad signature rejected; wrong amount/currency/session recorded as FAILED and change nothing', async () => {
    const q = await startPayment();
    const forged = hook({ type: 'payment.succeeded', attemptReference: q.attempt.reference, sessionRef: q.attempt.providerSessionRef, paymentRef: 'x', amount: q.amount, currency: 'USD' }, 'wrong-secret-0123456789abc');
    await forged.send().expect(400);

    for (const bad of [{ amount: '5.00' }, { currency: 'EUR' }, { sessionRef: 'mock_sess_other' }]) {
      const r = await succeed(q, bad).send().expect(200);
      expect(r.body.data.status).toBe('FAILED');
    }
    const d = await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: q.reference } });
    expect(d.paymentStatus).toBe('UNPAID');
    expect(await ctx.prisma.paymentTransaction.count({ where: { donationId: d.id } })).toBe(0);
    const failed = await ctx.prisma.paymentWebhookEvent.findMany({ where: { status: 'FAILED', payload: { path: '$.attemptReference', equals: q.attempt.reference } } });
    expect(failed.every((f) => f.lastError?.startsWith('REJECTED'))).toBe(true);
    await ctx.http().post(`${API}/webhooks/unknown-provider`).send({}).expect(404);
  });

  it('duplicate webhook delivery never double-counts', async () => {
    const p = await startPayment();
    const h = succeed(p);
    await h.send().expect(200);
    const again = await resend(h).expect(200);
    expect(again.body.data).toMatchObject({ duplicate: true, status: 'PROCESSED' });
    // Same payment reported again under a NEW event id → ignored, still one capture.
    const paymentRef = (await ctx.prisma.paymentAttempt.findUniqueOrThrow({ where: { id: p.attempt.id } })).providerPaymentRef!;
    const other = await succeed(p, { paymentRef }).send().expect(200);
    expect(other.body.data.status).toBe('IGNORED');
    expect(await ctx.prisma.paymentTransaction.count({ where: { donation: { reference: p.reference }, type: 'CAPTURE' } })).toBe(1);
    expect(await ctx.prisma.donationReceipt.count({ where: { donation: { reference: p.reference } } })).toBe(1);
  });

  it('failed payment → FAILED; donor can retry with a new attempt', async () => {
    const p = await startPayment();
    await hook({ type: 'payment.failed', attemptReference: p.attempt.reference, sessionRef: p.attempt.providerSessionRef, failureCode: 'card_declined' }).send().expect(200);
    let st = (await status(p.reference, p.accessToken)).body.data;
    expect(st).toMatchObject({ status: 'FAILED', paymentStatus: 'FAILED', confirmed: false, message: 'failed' });
    const retry = (await session(p.reference, p.accessToken).expect(200)).body.data;
    expect(retry.attemptReference).not.toBe(p.attempt.reference);
    st = (await status(p.reference, p.accessToken)).body.data;
    expect(st.status).toBe('PENDING');
    await session(p.reference, p.accessToken).expect(200); // reuses the open attempt
    expect(await ctx.prisma.paymentAttempt.count({ where: { donation: { reference: p.reference } } })).toBe(2);
  });

  it('paid donations cannot start another payment session', async () => {
    const p = await startPayment();
    await succeed(p).send().expect(200);
    const r = await session(p.reference, p.accessToken).expect(409);
    expect(r.body.error.code).toBe('DONATION_ALREADY_PAID');
  });

  // ───────── idempotency & validation ─────────

  it('Idempotency-Key: same request replays, different data conflicts, missing key rejected', async () => {
    const key = `k-${randomUUID()}`;
    const b = body();
    const first = (await create(b, key).expect(201)).body.data;
    const second = (await create(b, key).expect(201)).body.data;
    expect(second).toMatchObject({ reference: first.reference, accessToken: first.accessToken, replayed: true });
    expect((await create({ ...b, amount: '51' }, key).expect(409)).body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    await ctx.http().post(`${API}/public/donations`).send(b).expect(400);
    expect(await ctx.prisma.donation.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it.each([
    [{ amount: 50 }, 400],
    [{ amount: '-5' }, 400],
    [{ amount: '0' }, 422],
    [{ amount: '10.123' }, 422],
    [{ currency: 'EGP' }, 422],
    [{ currency: 'XXX' }, 422],
    [{ privacyConsent: false }, 400],
    [{ campaignSlug: 'hospitals' }, 400],
    [{ designation: 'CAMPAIGN' }, 400],
    [{ donor: { firstName: 'A', lastName: 'B', email: 'not-an-email' } }, 400],
    [{ raisedAmount: '1' }, 400],
    [{ frequency: 'WEEKLY' }, 400],
  ])('rejects %o → %d', async (patch, code) => {
    await create(body(patch)).expect(code);
  });

  it('minimum/maximum amounts are enforced per currency', async () => {
    await admin.patch('/admin/payments/currencies/USD', { minAmount: '5', maxAmount: '10000' }).expect(200);
    try {
      expect((await create(body({ amount: '4.99' })).expect(422)).body.error.code).toBe('AMOUNT_BELOW_MINIMUM');
      expect((await create(body({ amount: '10000.01' })).expect(422)).body.error.code).toBe('AMOUNT_ABOVE_MAXIMUM');
      await create(body({ amount: '5' })).expect(201);
    } finally {
      await ctx.prisma.currency.update({ where: { code: 'USD' }, data: { minAmount: null, maxAmount: null } });
    }
  });

  // ───────── campaigns & programmes ─────────

  it('campaign eligibility: drafts refused; approved+published+open accepted; campaign never modified', async () => {
    expect((await create(body({ designation: 'CAMPAIGN', campaignSlug: 'hospitals' })).expect(422)).body.error.code).toBe('CAMPAIGN_NOT_ACCEPTING_DONATIONS');
    const programmeId = (await ctx.prisma.programme.findUniqueOrThrow({ where: { code: 'PRG-06' } })).id;
    const c = (await admin.post('/admin/campaigns', { code: `CMP-D${uid().toUpperCase()}`, titleEn: `Water ${uid()}`, summaryEn: 'S', programmeId, currency: 'USD' }).expect(201)).body.data;
    await admin.post(`/admin/campaigns/${c.id}/approve`, { note: 'Approved by MEKI finance' }).expect(200);
    await admin.post(`/admin/campaigns/${c.id}/publish`).expect(200);
    // Published but donations closed → refused.
    await create(body({ designation: 'CAMPAIGN', campaignSlug: c.slug })).expect(422);
    await admin.patch(`/admin/campaigns/${c.id}/donations`, { open: true }).expect(200);
    const before = await ctx.prisma.campaign.findUniqueOrThrow({ where: { id: c.id } });

    const p = await startPayment(body({ designation: 'CAMPAIGN', campaignSlug: c.slug, amount: '100' }));
    await succeed(p).send().expect(200);
    const pending = await startPayment(body({ designation: 'CAMPAIGN', campaignSlug: c.slug, amount: '30' })); // never paid
    expect(pending.status).toBe('PENDING');
    expect((await create(body({ designation: 'CAMPAIGN', campaignSlug: c.slug, currency: 'EUR' })).expect(422)).body.error.code).toMatch(/CURRENCY/);

    const after = await ctx.prisma.campaign.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.approvedAt).toEqual(before.approvedAt);
    expect(after.status).toBe(before.status);

    const totals = (await finance.get(`/admin/reports/campaigns/${c.id}?includeTest=true`).expect(200)).body.data.totals;
    expect(totals).toEqual([{ currency: 'USD', count: 1, gross: '100.00', net: '100.00' }]); // pending 30 excluded

    // Unpublishing closes donations for the campaign.
    await admin.post(`/admin/campaigns/${c.id}/unpublish`).expect(200);
    await create(body({ designation: 'CAMPAIGN', campaignSlug: c.slug })).expect(422);
  });

  it('programme designation accepts published programmes only', async () => {
    await create(body({ designation: 'PROGRAMME', programmeSlug: 'health' })).expect(201);
    await create(body({ designation: 'PROGRAMME', programmeSlug: 'ngo-development' })).expect(422); // enabling function
    await create(body({ designation: 'PROGRAMME', programmeSlug: 'does-not-exist' })).expect(422);
  });

  // ───────── refunds ─────────

  it('refunds: request → four-eyes approval → execute → verified completion; balance protected', async () => {
    const p = await startPayment(body({ amount: '80' }));
    await succeed(p).send().expect(200);
    const donation = await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: p.reference } });

    await finance.post(`/admin/donations/${donation.id}/refunds`, { amount: '80.01', reason: 'Too much' }).expect(422);
    await finance.post(`/admin/donations/${donation.id}/refunds`, { amount: '30.001', reason: 'Precision' }).expect(422);
    const r = (await finance.post(`/admin/donations/${donation.id}/refunds`, { amount: '30', reason: 'Donor request by e-mail' }).expect(201)).body.data;
    expect(r.status).toBe('REQUESTED');
    // Phase 6B: the admin refund list carries the donation reference and test flag (additive fields only).
    const listed = (await finance.get(`/admin/refunds?donationId=${donation.id}`).expect(200)).body.data;
    expect(listed[0]).toMatchObject({ id: r.id, amount: '30', donation: { reference: p.reference, isTest: true } });
    // Only 50 remains refundable while 30 is pending.
    await finance.post(`/admin/donations/${donation.id}/refunds`, { amount: '50.01', reason: 'Over pending balance' }).expect(422);

    await finance.post(`/admin/refunds/${r.id}/approve`, {}).expect(403); // no permission
    const own = (await admin.post(`/admin/donations/${donation.id}/refunds`, { amount: '10', reason: 'Admin self request' }).expect(201)).body.data;
    expect((await admin.post(`/admin/refunds/${own.id}/approve`, {}).expect(403)).body.error.code).toBe('FOUR_EYES_REQUIRED');
    await admin2.post(`/admin/refunds/${own.id}/reject`, { note: 'Not needed' }).expect(200);

    await finance.post(`/admin/refunds/${r.id}/execute`).expect(422); // not approved yet
    await admin.post(`/admin/refunds/${r.id}/approve`, { note: 'OK' }).expect(200);
    const executing = (await finance.post(`/admin/refunds/${r.id}/execute`).expect(200)).body.data;
    expect(executing.status).toBe('PROCESSING'); // never completed before provider confirmation
    let d = await ctx.prisma.donation.findUniqueOrThrow({ where: { id: donation.id } });
    expect(d.paymentStatus).toBe('PAID');

    const refundRow = await ctx.prisma.refund.findUniqueOrThrow({ where: { id: r.id } });
    await hook({ type: 'refund.succeeded', refundReference: refundRow.reference, providerRefundRef: 'mock_re_wrong', amount: '30.00', currency: 'USD' }).send().expect(200);
    expect((await ctx.prisma.refund.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('PROCESSING');
    const ok = hook({ type: 'refund.succeeded', refundReference: refundRow.reference, providerRefundRef: refundRow.providerRefundRef, amount: '30.00', currency: 'USD' });
    await ok.send().expect(200);
    await resend(ok).expect(200);

    d = await ctx.prisma.donation.findUniqueOrThrow({ where: { id: donation.id } });
    expect(d.paymentStatus).toBe('PARTIALLY_REFUNDED');
    expect(d.refundedAmount.toString()).toBe('30');
    expect(d.amount.toString()).toBe('80'); // original never rewritten
    const ledger = await ctx.prisma.paymentTransaction.findMany({ where: { donationId: d.id }, orderBy: { createdAt: 'asc' } });
    expect(ledger.map((t) => `${t.type}:${t.status}`)).toEqual(['CAPTURE:SUCCEEDED', 'REFUND:SUCCEEDED']);
    const detail = (await finance.get(`/admin/donations/${d.id}`).expect(200)).body.data;
    expect(detail).toMatchObject({ amount: '80.00', refundedAmount: '30.00', netAmount: '50.00' });
  });

  it('the payment ledger and financial records are immutable at the database level', async () => {
    const t = await ctx.prisma.paymentTransaction.findFirstOrThrow();
    await expect(ctx.prisma.paymentTransaction.update({ where: { id: t.id }, data: { amount: '1' } })).rejects.toThrow(/append-only/);
    await expect(ctx.prisma.paymentTransaction.delete({ where: { id: t.id } })).rejects.toThrow(/append-only/);
    await expect(ctx.prisma.donation.delete({ where: { id: t.donationId } })).rejects.toThrow(/cannot be deleted/);
  });

  // ───────── recurring ─────────

  it('monthly donation: activation, renewals, duplicate renewal, failed retries, admin pause/resume/cancel', async () => {
    const p = await startPayment(body({ frequency: 'MONTHLY', amount: '20' }));
    const d0 = await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: p.reference } });
    let rec = await ctx.prisma.recurringDonation.findUniqueOrThrow({ where: { id: d0.recurringDonationId! } });
    expect(rec).toMatchObject({ status: 'PENDING_ACTIVATION', isTest: true });
    expect(rec.providerAgreementRef).toMatch(/^mock_sub_/);

    await succeed(p, { agreementRef: 'mock_sub_wrong' }).send().expect(200); // rejected: agreement mismatch
    expect((await ctx.prisma.recurringDonation.findUniqueOrThrow({ where: { id: rec.id } })).status).toBe('PENDING_ACTIVATION');
    await succeed(p, { agreementRef: rec.providerAgreementRef }).send().expect(200);
    rec = await ctx.prisma.recurringDonation.findUniqueOrThrow({ where: { id: rec.id } });
    expect(rec.status).toBe('ACTIVE');
    expect(rec.nextBillingDate!.getTime()).toBeGreaterThan(Date.now() + 27 * 86_400_000);

    const charge = hook({ type: 'subscription.charge.succeeded', agreementRef: rec.providerAgreementRef, paymentRef: `mock_ch_${uid()}`, amount: '20.00', currency: 'USD' });
    await charge.send().expect(200);
    const chargeAgain = JSON.parse(charge.body);
    const dup = await hook({ ...chargeAgain, id: `evt_dup_${uid()}` }).send().expect(200); // same charge id, new event id
    expect(dup.body.data.status).toBe('IGNORED');
    await hook({ type: 'subscription.charge.succeeded', agreementRef: rec.providerAgreementRef, paymentRef: `mock_ch_${uid()}`, amount: '25.00', currency: 'USD' }).send().expect(200); // wrong amount → rejected

    let history = (await finance.get(`/admin/recurring-donations/${rec.id}`).expect(200)).body.data.paymentHistory;
    expect(history.filter((h: { paymentStatus: string }) => h.paymentStatus === 'PAID')).toHaveLength(2); // initial + 1 renewal

    // Failures: PAST_DUE until retries are exhausted (max 3 in config) → FAILED.
    for (let i = 1; i <= 4; i++) {
      await hook({ type: 'subscription.charge.failed', agreementRef: rec.providerAgreementRef, paymentRef: `mock_ch_${uid()}`, failureCode: 'insufficient_funds' }).send().expect(200);
      rec = await ctx.prisma.recurringDonation.findUniqueOrThrow({ where: { id: rec.id } });
      expect(rec.status).toBe(i <= 3 ? 'PAST_DUE' : 'FAILED');
    }
    history = (await finance.get(`/admin/recurring-donations/${rec.id}`).expect(200)).body.data.paymentHistory;
    expect(history.filter((h: { status: string }) => h.status === 'FAILED')).toHaveLength(4);

    // Admin lifecycle on a fresh agreement.
    const q = await startPayment(body({ frequency: 'MONTHLY', amount: '15' }));
    const r2 = (await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: q.reference }, include: { recurringDonation: true } })).recurringDonation!;
    await succeed(q, { agreementRef: r2.providerAgreementRef }).send().expect(200);
    await finance.post(`/admin/recurring-donations/${r2.id}/pause`).expect(403); // finance: read-only on recurring
    await admin.post(`/admin/recurring-donations/${r2.id}/pause`).expect(200);
    await admin.post(`/admin/recurring-donations/${r2.id}/pause`).expect(422);
    await admin.post(`/admin/recurring-donations/${r2.id}/resume`).expect(200);
    const cancelled = (await admin.post(`/admin/recurring-donations/${r2.id}/cancel`, { reason: 'Donor asked by phone' }).expect(200)).body.data;
    expect(cancelled).toMatchObject({ status: 'CANCELLED', nextBillingDate: null });
    const late = await hook({ type: 'subscription.charge.succeeded', agreementRef: r2.providerAgreementRef, paymentRef: `mock_ch_${uid()}`, amount: '15.00', currency: 'USD' }).send().expect(200);
    expect(late.body.data.status).toBe('FAILED'); // flagged for review, not counted
  });

  it('monthly donations are refused when recurring is not enabled', async () => {
    await admin.patch('/admin/settings/donation', { allowRecurring: false }).expect(200);
    try {
      expect((await create(body({ frequency: 'MONTHLY' })).expect(422)).body.error.code).toBe('RECURRING_NOT_AVAILABLE');
    } finally {
      await admin.patch('/admin/settings/donation', { allowRecurring: true }).expect(200);
    }
  });

  // ───────── receipts ─────────

  it('receipts: bilingual documents, one issued at a time, regenerate voids, PDF not configured, donor access', async () => {
    const p = await startPayment(body({ amount: '42.5', locale: 'ar' }));
    await succeed(p).send().expect(200);
    const donation = await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: p.reference }, include: { receipts: true } });
    const receipt = donation.receipts[0];
    await finance.post(`/admin/donations/${donation.id}/receipts`, {}).expect(409);
    // Phase 6B: the receipts list carries the donation reference and test flag, never the snapshot (PII).
    const listedReceipts = (await finance.get(`/admin/receipts?donationId=${donation.id}`).expect(200)).body.data;
    expect(listedReceipts[0]).toMatchObject({ id: receipt.id, donation: { reference: p.reference, isTest: true } });
    expect(listedReceipts[0].snapshot).toBeUndefined();

    const en = await finance.get(`/admin/receipts/${receipt.id}/document?locale=en`).expect(200);
    expect(en.headers['content-type']).toMatch(/text\/html/);
    expect(en.text).toContain(receipt.receiptNumber);
    expect(en.text).toContain('42.50 USD');
    expect(en.text).toContain('NOT A REAL DONATION');
    expect(en.text.toLowerCase()).not.toMatch(/tax[- ]deductible/);
    const ar = await finance.get(`/admin/receipts/${receipt.id}/document`).expect(200); // donation locale ar
    expect(ar.text).toContain('dir="rtl"');
    expect((await finance.get(`/admin/receipts/${receipt.id}/document?format=pdf`).expect(501)).body.error.code).toBe('PDF_NOT_CONFIGURED');

    await finance.post(`/admin/receipts/${receipt.id}/regenerate`, { reason: 'Name correction' }).expect(403);
    const next = (await admin.post(`/admin/receipts/${receipt.id}/regenerate`, { reason: 'Name correction' }).expect(200)).body.data;
    expect(next.receiptNumber).not.toBe(receipt.receiptNumber);
    expect(next.replacesReceiptId).toBe(receipt.id);
    expect((await ctx.prisma.donationReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).status).toBe('VOID');

    const pub = await ctx.http().get(`${API}/public/donations/${p.reference}/receipt?token=${p.accessToken}`).expect(200);
    expect(pub.text).toContain(next.receiptNumber);
    await ctx.http().get(`${API}/public/donations/${p.reference}/receipt?token=wrong-token-value`).expect(404);

    const pending = await startPayment();
    const pd = await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: pending.reference } });
    expect((await finance.post(`/admin/donations/${pd.id}/receipts`, {}).expect(422)).body.error.code).toBe('DONATION_NOT_CONFIRMED');
  });

  // ───────── admin RBAC, privacy, reports ─────────

  it('RBAC: donation data is restricted; donor PII requires donors.read', async () => {
    const content = await loginAs(ctx, ['CONTENT_MANAGER']);
    await content.get('/admin/donations').expect(403);
    await content.get('/admin/donors').expect(403);
    await content.get('/admin/reports/donations/summary').expect(403);
    const campaignMgr = await loginAs(ctx, ['CAMPAIGN_MANAGER']);
    await campaignMgr.get('/admin/reports/donations/summary').expect(200);
    await campaignMgr.get('/admin/donors').expect(403);
    await ctx.http().get(`${API}/admin/donations`).expect(401);

    // A role with donations.read but NOT donors.read sees donations without personal data.
    const roleKey = `T_VIEW_${uid().toUpperCase()}`;
    const perm = await ctx.prisma.permission.findUniqueOrThrow({ where: { key: 'donations.read' } });
    await ctx.prisma.role.create({ data: { key: roleKey, name: 'Test viewer', permissions: { create: { permissionId: perm.id } } } });
    const viewer = await createAdmin(ctx, [roleKey]);
    const v = await login(ctx, viewer.email, viewer.password);
    const list = (await v.get('/admin/donations?includeTest=true&pageSize=5').expect(200)).body;
    expect(list.data.length).toBeGreaterThan(0);
    expect(list.data.every((d: Record<string, unknown>) => d.donor === undefined)).toBe(true);
    const withPii = (await finance.get('/admin/donations?includeTest=true&pageSize=5').expect(200)).body.data;
    expect(withPii[0].donor.email).toMatch(/@/);
  });

  it('admin donation filters, test isolation and donor history', async () => {
    const real = (await finance.get('/admin/donations').expect(200)).body;
    expect(real.data.every((d: { isTest: boolean }) => !d.isTest)).toBe(true);
    const tests = (await finance.get('/admin/donations?includeTest=true&currency=USD&paymentStatus=PAID&sort=createdAt:desc').expect(200)).body;
    expect(tests.data.every((d: { currency: string; paymentStatus: string }) => d.currency === 'USD' && d.paymentStatus === 'PAID')).toBe(true);
    const donorId = tests.data[0].donorId;
    const donorView = (await finance.get(`/admin/donors/${donorId}`).expect(200)).body.data;
    expect(donorView.donations.length).toBeGreaterThan(0);
    await finance.patch(`/admin/donors/${donorId}`, { firstName: 'Changed' }).expect(403); // finance lacks donors.manage
    await admin.patch(`/admin/donors/${donorId}`, { email: 'new@example.org' }).expect(400); // e-mail not editable
    await admin.patch(`/admin/donors/${donorId}`, { marketingConsent: true }).expect(400); // cannot grant consent for a donor
  });

  it('donor anonymization erases PII and keeps financial records', async () => {
    const b = body();
    const p = await startPayment(b);
    await succeed(p).send().expect(200);
    const d = await ctx.prisma.donation.findUniqueOrThrow({ where: { reference: p.reference } });
    await finance.post(`/admin/donors/${d.donorId}/anonymize`, { reason: 'Erasure request' }).expect(403);
    const res = (await admin.post(`/admin/donors/${d.donorId}/anonymize`, { reason: 'Erasure request #12' }).expect(200)).body.data;
    expect(res).toMatchObject({ firstName: 'Anonymized', phone: null });
    expect(res.email).not.toBe(b.donor.email);
    expect(await ctx.prisma.donation.count({ where: { id: d.id } })).toBe(1);
    expect(await ctx.prisma.paymentTransaction.count({ where: { donationId: d.id } })).toBe(1);
  });

  it('reports: per-currency confirmed totals only; test data excluded by default; never mixed currencies', async () => {
    const live = (await finance.get('/admin/reports/donations/summary').expect(200)).body.data;
    expect(live.confirmed).toEqual([]); // no real (non-test) donations exist
    const withTest = (await finance.get('/admin/reports/donations/summary?includeTest=true').expect(200)).body.data;
    // Per currency, never combined: every currency appears exactly once. (Other suites' test fixtures — e.g. Phase 11A's EUR
    // programme gift — may add currencies to the *test* data set, so assert USD is present rather than that it is alone.)
    const currencies = withTest.confirmed.map((c: { currency: string }) => c.currency);
    expect(currencies).toContain('USD');
    expect(new Set(currencies).size).toBe(currencies.length);
    const usd = withTest.confirmed.find((c: { currency: string }) => c.currency === 'USD');
    const sum = await ctx.prisma.donation.aggregate({ where: { isTest: true, currency: 'USD', paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } }, _sum: { amount: true, refundedAmount: true } });
    expect(usd.gross).toBe(sum._sum.amount!.toFixed(2));
    expect(usd.net).toBe(sum._sum.amount!.minus(sum._sum.refundedAmount!).toFixed(2));
    // rows are per (frequency, currency): compare the set of frequencies
    expect([...new Set(withTest.byFrequency.map((f: { frequency: string }) => f.frequency))].sort()).toEqual(['MONTHLY', 'ONE_TIME']);
    for (const path of ['by-campaign', 'by-date']) {
      const rows = (await finance.get(`/admin/reports/donations/${path}?includeTest=true`).expect(200)).body.data;
      expect(rows.every((r: { currency: string; gross: string }) => /^[A-Z]{3}$/.test(r.currency) && /^\d+\.\d{2}$/.test(r.gross))).toBe(true);
    }
    const payments = (await finance.get('/admin/reports/payments?includeTest=true').expect(200)).body.data;
    expect(payments.some((p: { status: string }) => p.status === 'SUCCEEDED')).toBe(true);
    expect(payments.some((p: { status: string }) => p.status === 'FAILED')).toBe(true);
    const refunds = (await finance.get('/admin/reports/refunds?includeTest=true').expect(200)).body.data;
    expect(refunds.find((r: { status: string }) => r.status === 'SUCCEEDED')).toBeDefined();
    const recurring = (await finance.get('/admin/reports/recurring?includeTest=true').expect(200)).body.data;
    expect(recurring.map((r: { status: string }) => r.status)).toEqual(expect.arrayContaining(['FAILED', 'CANCELLED']));
  });

  it('webhook events are visible to finance and FAILED ones can be retried idempotently', async () => {
    const p = await startPayment();
    await succeed(p, { amount: '1.00' }).send().expect(200); // rejected: amount mismatch
    const events = (await finance.get('/admin/payments/webhook-events?status=FAILED&pageSize=100').expect(200)).body.data;
    expect(events[0]).not.toHaveProperty('payload');
    const row = await ctx.prisma.paymentWebhookEvent.findFirstOrThrow({ where: { status: 'FAILED', payload: { path: '$.attemptReference', equals: p.attempt.reference } } });
    await finance.post(`/admin/payments/webhook-events/${row.id}/retry`).expect(403);
    const retried = (await admin.post(`/admin/payments/webhook-events/${row.id}/retry`).expect(200)).body.data;
    expect(retried.status).toBe('FAILED'); // still mismatching → still rejected, nothing applied
    expect(await ctx.prisma.paymentTransaction.count({ where: { paymentAttemptId: p.attempt.id } })).toBe(0);
    // After the genuine event arrives, the old mismatching event is still rejected and applies nothing.
    await succeed(p).send().expect(200);
    expect((await admin.post(`/admin/payments/webhook-events/${row.id}/retry`).expect(200)).body.data.status).toBe('FAILED');
    expect(await ctx.prisma.paymentTransaction.count({ where: { paymentAttemptId: p.attempt.id } })).toBe(1);
    const tx = (await finance.get('/admin/payments/transactions?includeTest=true&type=CAPTURE&pageSize=2').expect(200)).body.data;
    expect(tx[0]).toMatchObject({ type: 'CAPTURE', provider: 'mock' });
  });

  it('payments switched off → donations unavailable; enabling an unconfigured provider is refused', async () => {
    await admin.patch('/admin/settings/donation', { paymentsEnabled: false }).expect(200);
    try {
      expect((await create(body()).expect(503)).body.error.code).toBe('PAYMENTS_UNAVAILABLE');
      expect((await ctx.http().get(`${API}/public/donations/config`)).body.data.paymentsEnabled).toBe(false);
    } finally {
      await admin.patch('/admin/settings/donation', { paymentsEnabled: true }).expect(200);
    }
    await ctx.prisma.paymentProvider.upsert({ where: { code: 'unconfigured' }, create: { code: 'unconfigured', displayName: 'X' }, update: {} });
    expect((await admin.patch('/admin/payments/providers/unconfigured', { isEnabled: true }).expect(422)).body.error.code).toBe('PROVIDER_NOT_CONFIGURED');
  });
});
