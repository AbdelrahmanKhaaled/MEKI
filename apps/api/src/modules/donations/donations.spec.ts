import { addMonths, AMOUNT_PATTERN, D, decimalPlaces, formatAmount, generateReference, sumByCurrency } from './money';
import { MockPaymentProvider } from './payments/mock-payment.provider';
import { renderReceiptHtml, type ReceiptSnapshot } from './receipt-template';
import { parseTrustProxy, validateEnv } from '../../config/env.validation';
import { isPubliclyServable } from '../media/media.service';
import { createThrottlerStorage } from '../../common/rate-limit';
import type { AppConfigService } from '../../config/app-config.service';

const SECRET = 'unit-test-secret-0123456789';
const baseEnv = { NODE_ENV: 'development', DATABASE_URL: 'mysql://x' };

describe('money (no floating point)', () => {
  it('validates decimal-string amounts', () => {
    ['1', '25', '25.5', '25.50', '0.001', '999999999999.999'].forEach((a) => expect(AMOUNT_PATTERN.test(a)).toBe(true));
    ['', '-5', '01', '1e3', '25.', '.5', '25.1234', '1,000', ' 5', 'NaN'].forEach((a) => expect(AMOUNT_PATTERN.test(a)).toBe(false));
    expect(decimalPlaces('25.50')).toBe(2);
    expect(decimalPlaces('25')).toBe(0);
  });

  it('adds exactly where floats would not', () => {
    expect(0.1 + 0.2).not.toBe(0.3); // why floats are banned
    expect(D('0.1').plus('0.2').eq('0.3')).toBe(true);
    expect(formatAmount(D('100').minus('33.33').minus('33.33'), 2)).toBe('33.34');
    expect(formatAmount('2500', 0)).toBe('2500');
    expect(formatAmount('1.5', 3)).toBe('1.500');
  });

  it('never sums across currencies', () => {
    const totals = sumByCurrency(
      [
        { currency: 'USD', amount: '10.10' },
        { currency: 'EGP', amount: '500' },
        { currency: 'USD', amount: '0.20' },
      ],
      () => 2,
    );
    expect(totals).toEqual({ EGP: '500.00', USD: '10.30' });
  });

  it('generates unguessable references', () => {
    const refs = new Set(Array.from({ length: 2000 }, () => generateReference('DN')));
    expect(refs.size).toBe(2000);
    [...refs].slice(0, 20).forEach((r) => expect(r).toMatch(/^DN-[0-9A-HJKMNP-TV-Z]{12}$/));
  });

  it('adds months safely at month ends', () => {
    expect(addMonths(new Date('2027-01-31T10:00:00Z'), 1).toISOString()).toBe('2027-02-28T10:00:00.000Z');
    expect(addMonths(new Date('2028-01-31T10:00:00Z'), 1).toISOString()).toBe('2028-02-29T10:00:00.000Z');
    expect(addMonths(new Date('2027-12-15T00:00:00Z'), 1).toISOString()).toBe('2028-01-15T00:00:00.000Z');
  });
});

describe('mock payment provider', () => {
  const mock = new MockPaymentProvider(SECRET);
  const headers = (sig: string) => ({ 'x-mock-signature': sig });

  it('accepts only correctly signed, fresh payloads', () => {
    const s = MockPaymentProvider.sign(SECRET, { id: 'evt_1', type: 'payment.succeeded' });
    expect(mock.verifyWebhookSignature(Buffer.from(s.body), headers(s.signature))).toBe(true);
    expect(mock.verifyWebhookSignature(Buffer.from(s.body.replace('succeeded', 'failed')), headers(s.signature))).toBe(false);
    const forged = MockPaymentProvider.sign('another-secret-entirely-xx', { id: 'evt_1' });
    expect(mock.verifyWebhookSignature(Buffer.from(forged.body), headers(forged.signature))).toBe(false);
    const stale = MockPaymentProvider.sign(SECRET, { id: 'evt_1' }, Math.floor(Date.now() / 1000) - 3600);
    expect(mock.verifyWebhookSignature(Buffer.from(stale.body), headers(stale.signature))).toBe(false);
    expect(mock.verifyWebhookSignature(Buffer.from(s.body), {})).toBe(false);
    expect(mock.verifyWebhookSignature(Buffer.from(s.body), headers('t=1,v1=zz'))).toBe(false);
  });

  it('without a checkout base URL produces no navigable checkout; always flagged as test', async () => {
    const session = await mock.createPaymentSession({ attemptReference: 'PA-1', donationReference: 'DN-1', amount: '10.00', currency: 'USD', description: 'x', locale: 'en', returnUrl: 'r', cancelUrl: 'c' });
    expect(session.checkoutUrl.startsWith('mock://')).toBe(true);
    expect(mock.isTest).toBe(true);
    expect((await mock.refund()).status).toBe('PENDING');
    const hosted = new MockPaymentProvider(SECRET, 'http://localhost:4000/api/v1/dev/mock-checkout');
    const s2 = await hosted.createPaymentSession({ attemptReference: 'PA-1', donationReference: 'DN-1', amount: '1', currency: 'USD', description: 'x', locale: 'en', returnUrl: 'r', cancelUrl: 'c' });
    expect(s2.checkoutUrl).toBe('http://localhost:4000/api/v1/dev/mock-checkout/' + s2.sessionRef);
  });

  it('maps unknown event types to "unknown" and requires an id', () => {
    expect(mock.parseWebhook(Buffer.from(JSON.stringify({ id: 'e', type: 'charge.weird' }))).type).toBe('unknown');
    expect(() => mock.parseWebhook(Buffer.from('{}'))).toThrow();
  });
});

describe('environment validation (payments & security)', () => {
  it('forbids the mock provider in staging/production', () => {
    for (const NODE_ENV of ['production', 'staging']) {
      expect(() => validateEnv({ ...baseEnv, NODE_ENV, PAYMENT_PROVIDER: 'mock', MOCK_PAYMENT_WEBHOOK_SECRET: SECRET })).toThrow(/forbidden/);
    }
    expect(() => validateEnv({ ...baseEnv, PAYMENT_PROVIDER: 'mock' })).toThrow(/MOCK_PAYMENT_WEBHOOK_SECRET/);
    expect(() => validateEnv({ ...baseEnv, PAYMENT_PROVIDER: 'stripe' })).toThrow(/not implemented/);
  });

  it('requires a token secret when payments are enabled', () => {
    expect(() => validateEnv({ ...baseEnv, PAYMENTS_ENABLED: 'true', PAYMENT_PROVIDER: 'mock', MOCK_PAYMENT_WEBHOOK_SECRET: SECRET })).toThrow(/DONATION_TOKEN_SECRET/);
    expect(() =>
      validateEnv({ ...baseEnv, PAYMENTS_ENABLED: 'true', PAYMENT_PROVIDER: 'mock', MOCK_PAYMENT_WEBHOOK_SECRET: SECRET, DONATION_TOKEN_SECRET: 'x'.repeat(32) }),
    ).not.toThrow();
  });

  it('reads LOGIN_RATE_LIMIT_PER_MINUTE and MEDIA_MAX_UPLOAD_MB as validated numbers', () => {
    const env = validateEnv({ ...baseEnv, LOGIN_RATE_LIMIT_PER_MINUTE: '9', MEDIA_MAX_UPLOAD_MB: '4' });
    expect(env.LOGIN_RATE_LIMIT_PER_MINUTE).toBe(9);
    expect(env.MEDIA_MAX_UPLOAD_MB).toBe(4);
    expect(() => validateEnv({ ...baseEnv, MEDIA_MAX_UPLOAD_MB: '500' })).toThrow();
    expect(() => validateEnv({ ...baseEnv, LOGIN_RATE_LIMIT_PER_MINUTE: '0' })).toThrow();
  });

  it('parses TRUST_PROXY safely', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('loopback, 10.0.0.0/8')).toBe('loopback, 10.0.0.0/8');
    expect(() => parseTrustProxy('true')).toThrow(/spoofing/);
    expect(() => parseTrustProxy('evil; rm')).toThrow();
    expect(() => validateEnv({ ...baseEnv, TRUST_PROXY: 'true' })).toThrow();
  });

  it('rate limit store: memory works, redis fails fast instead of silently using memory', () => {
    expect(() => validateEnv({ ...baseEnv, RATE_LIMIT_STORE: 'redis' })).toThrow(/REDIS_URL/);
    const cfg = (store: string) => ({ get: () => store }) as unknown as AppConfigService;
    expect(createThrottlerStorage(cfg('memory'))).toBeDefined();
    expect(() => createThrottlerStorage(cfg('redis'))).toThrow(/Redis/);
  });
});

describe('media public serving policy', () => {
  it('never serves deleted media; consent mode is configurable', () => {
    const live = { deletedAt: null };
    expect(isPubliclyServable({ ...live, consentStatus: 'UNKNOWN' }, 'not_denied')).toBe(true);
    expect(isPubliclyServable({ ...live, consentStatus: 'NOT_GRANTED' }, 'not_denied')).toBe(false);
    expect(isPubliclyServable({ ...live, consentStatus: 'UNKNOWN' }, 'confirmed_only')).toBe(false);
    expect(isPubliclyServable({ ...live, consentStatus: 'CONFIRMED' }, 'confirmed_only')).toBe(true);
    expect(isPubliclyServable({ deletedAt: new Date(), consentStatus: 'CONFIRMED' }, 'not_denied')).toBe(false);
  });
});

describe('receipt template', () => {
  const snap: ReceiptSnapshot = {
    receiptNumber: 'MEKI-2026-000001',
    issuedAt: new Date().toISOString(),
    isTest: false,
    donation: { reference: 'DN-X', amount: '50.00', currency: 'USD', frequency: 'ONE_TIME', confirmedAt: '2026-11-06T10:00:00.000Z' },
    donor: { name: '<script>alert(1)</script>', organizationName: null, countryCode: 'US' },
    purpose: { designation: 'CAMPAIGN', titleEn: 'Water', titleAr: 'المياه' },
    issuer: { nameEn: 'MEKI', nameAr: null, addressEn: null, addressAr: null, taxIdLabel: null, taxId: null },
    footerEn: null,
    footerAr: null,
  };
  it('escapes content, renders RTL Arabic and makes no tax claims by default', () => {
    const en = renderReceiptHtml(snap, 'en', 'ISSUED');
    expect(en).not.toContain('<script>alert');
    expect(en).toContain('&lt;script&gt;');
    expect(en).toMatch(/MEKI-2026-000001/);
    expect(en.toLowerCase()).not.toMatch(/tax[- ]deductible|tax exempt/);
    const ar = renderReceiptHtml(snap, 'ar', 'VOID');
    expect(ar).toContain('dir="rtl"');
    expect(ar).toContain('المياه');
    expect(ar).toContain('ملغى');
    expect(renderReceiptHtml({ ...snap, isTest: true }, 'en', 'ISSUED')).toContain('NOT A REAL DONATION');
  });
});
