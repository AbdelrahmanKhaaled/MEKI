import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables, parseTrustProxy } from './env.validation';

/** Typed accessor around validated environment variables. */
@Injectable()
export class AppConfigService {
  /**
   * The validated config of the running app, for the few places evaluated outside DI
   * (decorator-level throttle resolvers). Business code must inject AppConfigService instead.
   */
  static current?: AppConfigService;

  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {
    AppConfigService.current = this;
  }

  get trustProxy() {
    return parseTrustProxy(this.get('TRUST_PROXY'));
  }

  get<K extends keyof EnvironmentVariables>(key: K): EnvironmentVariables[K] {
    return this.config.get(key, { infer: true });
  }
  get isProduction() {
    return this.get('NODE_ENV') === 'production';
  }
  /** Secure cookies everywhere except local development/test over http. */
  get secureCookies() {
    return this.get('NODE_ENV') === 'production' || this.get('NODE_ENV') === 'staging';
  }
  get sessionCookieName() {
    return this.secureCookies ? '__Host-meki_admin_sid' : 'meki_admin_sid';
  }
  get corsOrigins(): string[] {
    return this.get('CORS_ORIGINS').split(',').map((s) => s.trim()).filter(Boolean);
  }
  get paymentsEnvEnabled() {
    return this.get('PAYMENTS_ENABLED') === true && !!this.get('PAYMENT_PROVIDER');
  }
}
