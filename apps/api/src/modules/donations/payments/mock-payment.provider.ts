import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type {
  CreatePaymentSessionInput,
  NormalizedWebhookEvent,
  PaymentProviderAdapter,
  PaymentSession,
  ProviderRefundResult,
} from './payment-provider';
import { PaymentProviderError } from './payment-provider';

const SIGNATURE_HEADER = 'x-mock-signature';
const TOLERANCE_SECONDS = 300;

/**
 * DEVELOPMENT/TEST-ONLY provider. It never moves money. Its "hosted checkout" is the dev-only
 * MockCheckoutController page (clearly labelled TEST), which completes payments ONLY by sending a correctly
 * signed webhook through the normal pipeline — exactly like a real provider. Without a checkout base URL the
 * checkoutUrl uses the non-navigable mock:// scheme.
 * Env validation forbids PAYMENT_PROVIDER=mock in staging/production; everything it touches is isTest=true.
 */
export class MockPaymentProvider implements PaymentProviderAdapter {
  readonly code = 'mock';
  readonly displayName = 'Mock provider (test only)';
  readonly isTest = true;
  readonly capabilities = { recurring: true, refunds: true, partialRefunds: true, pauseRecurring: true };

  constructor(
    private readonly secret: string,
    private readonly checkoutBaseUrl?: string,
  ) {
    if (!secret || secret.length < 16) throw new Error('Mock provider requires a webhook secret');
  }

  private id(prefix: string) {
    return `${prefix}_${randomBytes(9).toString('hex')}`;
  }

  async createPaymentSession(input: CreatePaymentSessionInput): Promise<PaymentSession> {
    if (!input.amount || !input.currency) throw new PaymentProviderError('amount and currency required');
    const sessionRef = this.id('mock_sess');
    return {
      sessionRef,
      checkoutUrl: this.checkoutBaseUrl ? `${this.checkoutBaseUrl}/${sessionRef}` : `mock://checkout/${sessionRef}`,
      expiresAt: new Date(Date.now() + 30 * 60_000),
      ...(input.recurring ? { agreementRef: this.id('mock_sub') } : {}),
    };
  }

  async getPaymentStatus(): Promise<{ status: 'UNKNOWN' }> {
    return { status: 'UNKNOWN' }; // the mock keeps no server-side state
  }

  verifyWebhookSignature(rawBody: Buffer, headers: IncomingHttpHeaders): boolean {
    const header = headers[SIGNATURE_HEADER];
    if (typeof header !== 'string') return false;
    const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=', 2) as [string, string]));
    const ts = Number(parts.t);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS || !parts.v1) return false;
    const expected = createHmac('sha256', this.secret).update(`${ts}.`).update(rawBody).digest();
    let given: Buffer;
    try {
      given = Buffer.from(parts.v1, 'hex');
    } catch {
      return false;
    }
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  parseWebhook(rawBody: Buffer): NormalizedWebhookEvent {
    const body = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v.length <= 191 ? v : undefined);
    const known = [
      'payment.authorized', 'payment.succeeded', 'payment.failed', 'payment.cancelled', 'refund.succeeded',
      'refund.failed', 'subscription.charge.succeeded', 'subscription.charge.failed', 'subscription.cancelled',
    ];
    const id = str(body.id);
    if (!id) throw new PaymentProviderError('event id missing', 'INVALID_EVENT');
    const settlement = body.settlement as Record<string, unknown> | undefined;
    return {
      eventId: id,
      type: (known.includes(String(body.type)) ? body.type : 'unknown') as NormalizedWebhookEvent['type'],
      occurredAt: body.created ? new Date(Number(body.created) * 1000) : new Date(),
      attemptReference: str(body.attemptReference),
      sessionRef: str(body.sessionRef),
      paymentRef: str(body.paymentRef),
      amount: str(body.amount),
      currency: str(body.currency),
      refundReference: str(body.refundReference),
      providerRefundRef: str(body.providerRefundRef),
      agreementRef: str(body.agreementRef),
      failureCode: str(body.failureCode),
      failureReason: str(body.failureReason),
      settlement: settlement
        ? { amount: str(settlement.amount), currency: str(settlement.currency), exchangeRate: str(settlement.exchangeRate), fee: str(settlement.fee) }
        : undefined,
    };
  }

  async refund(): Promise<ProviderRefundResult> {
    return { providerRefundRef: this.id('mock_re'), status: 'PENDING' };
  }
  async cancelRecurring(): Promise<void> {}
  async pauseRecurring(): Promise<void> {}
  async resumeRecurring(): Promise<void> {}

  /** Builds a body + signature header exactly as the mock "provider" sends them (tests + dev mock checkout). */
  static sign(secret: string, payload: object, timestamp = Math.floor(Date.now() / 1000)) {
    const body = JSON.stringify(payload);
    const v1 = createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex');
    return { body, header: SIGNATURE_HEADER, signature: `t=${timestamp},v1=${v1}` };
  }
}
