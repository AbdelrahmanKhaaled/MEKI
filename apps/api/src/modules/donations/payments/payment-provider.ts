import type { IncomingHttpHeaders } from 'node:http';

/**
 * Provider-agnostic payment port. Donation business logic depends ONLY on this interface;
 * each gateway (Stripe, Checkout.com, Paymob, PayPal…) is an adapter registered in PaymentProviderRegistry.
 *
 * Rules every adapter must follow:
 *  - Card data never touches MEKI servers (hosted checkout / tokenized fields only).
 *  - Amounts are decimal strings in the original currency.
 *  - Credentials come from validated environment variables, never from the database or code.
 *  - Success is only ever established from a signature-verified webhook (or server-to-server status query).
 */
export interface PaymentProviderCapabilities {
  recurring: boolean;
  refunds: boolean;
  partialRefunds: boolean;
  pauseRecurring: boolean;
  /** ISO codes the provider can charge; undefined = any */
  currencies?: string[];
}

export interface CreatePaymentSessionInput {
  attemptReference: string;
  donationReference: string;
  amount: string;
  currency: string;
  description: string;
  locale: string;
  returnUrl: string;
  cancelUrl: string;
  /** Present for the first payment of a recurring donation */
  recurring?: { reference: string; interval: 'MONTHLY'; intervalCount: number };
}

export interface PaymentSession {
  sessionRef: string;
  /** Provider-hosted checkout page. Never a MEKI-hosted card form. */
  checkoutUrl: string;
  expiresAt?: Date;
  /** Provider subscription/agreement id when recurring was requested */
  agreementRef?: string;
}

export type NormalizedEventType =
  | 'payment.authorized'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.cancelled'
  | 'refund.succeeded'
  | 'refund.failed'
  | 'subscription.charge.succeeded'
  | 'subscription.charge.failed'
  | 'subscription.cancelled'
  | 'unknown';

/** Provider events translated to one shape. Only non-sensitive fields; no card data. */
export interface NormalizedWebhookEvent {
  eventId: string;
  type: NormalizedEventType;
  occurredAt: Date;
  /** Our attempt reference echoed back by the provider as metadata */
  attemptReference?: string;
  sessionRef?: string;
  paymentRef?: string;
  amount?: string;
  currency?: string;
  /** Our refund reference echoed back + provider refund id */
  refundReference?: string;
  providerRefundRef?: string;
  agreementRef?: string;
  failureCode?: string;
  failureReason?: string;
  settlement?: { amount?: string; currency?: string; exchangeRate?: string; fee?: string };
}

export interface ProviderRefundResult {
  providerRefundRef: string;
  /** Adapters must return PENDING unless the provider gives a verifiable synchronous final state. */
  status: 'PENDING';
}

export interface PaymentProviderAdapter {
  readonly code: string;
  readonly displayName: string;
  /** Test providers create only isTest records that are never real money. */
  readonly isTest: boolean;
  readonly capabilities: PaymentProviderCapabilities;

  createPaymentSession(input: CreatePaymentSessionInput): Promise<PaymentSession>;
  getPaymentStatus(providerPaymentRef: string): Promise<{ status: 'SUCCEEDED' | 'FAILED' | 'PENDING' | 'UNKNOWN' }>;
  /** Must use the RAW request body and constant-time comparison; reject stale timestamps. */
  verifyWebhookSignature(rawBody: Buffer, headers: IncomingHttpHeaders): boolean;
  parseWebhook(rawBody: Buffer): NormalizedWebhookEvent;
  refund(input: { providerPaymentRef: string; amount: string; currency: string; refundReference: string; reason: string }): Promise<ProviderRefundResult>;
  cancelRecurring?(agreementRef: string): Promise<void>;
  pauseRecurring?(agreementRef: string): Promise<void>;
  resumeRecurring?(agreementRef: string): Promise<void>;
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly code = 'PROVIDER_ERROR',
  ) {
    super(message);
  }
}
