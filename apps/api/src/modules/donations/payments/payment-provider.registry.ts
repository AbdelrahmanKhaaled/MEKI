import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';
import { MockPaymentProvider } from './mock-payment.provider';
import type { PaymentProviderAdapter } from './payment-provider';

/**
 * Resolves adapters from validated server configuration. Only the provider named in PAYMENT_PROVIDER is
 * instantiated; adding a real gateway = implement PaymentProviderAdapter + register it here + env vars.
 * The mock adapter can only exist in development/test (env validation rejects it elsewhere, and this
 * registry double-checks).
 */
@Injectable()
export class PaymentProviderRegistry {
  private readonly logger = new Logger(PaymentProviderRegistry.name);
  private readonly adapters = new Map<string, PaymentProviderAdapter>();

  constructor(private readonly config: AppConfigService) {
    const code = config.get('PAYMENT_PROVIDER');
    if (code === 'mock') {
      const env = config.get('NODE_ENV');
      if (env !== 'development' && env !== 'test') throw new Error('Mock payment provider refused outside development/test');
      this.adapters.set(
        'mock',
        new MockPaymentProvider(config.get('MOCK_PAYMENT_WEBHOOK_SECRET') ?? '', `${config.get('API_PUBLIC_URL').replace(/\/$/, '')}/api/v1/dev/mock-checkout`),
      );
      this.logger.warn('Mock payment provider active — test transactions only, no real money');
    }
  }

  /** The adapter that new payments use, or undefined when none is configured. */
  active(): PaymentProviderAdapter | undefined {
    const code = this.config.get('PAYMENT_PROVIDER');
    return code ? this.adapters.get(code) : undefined;
  }

  /** Any configured adapter (webhooks/refunds for payments made earlier). 404 for unknown codes. */
  get(code: string): PaymentProviderAdapter {
    const adapter = this.adapters.get(code);
    if (!adapter) throw new NotFoundException('Unknown payment provider');
    return adapter;
  }

  has(code: string) {
    return this.adapters.has(code);
  }
}
