import { ThrottlerStorageService, type ThrottlerStorage } from '@nestjs/throttler';
import { AppConfigService } from '../config/app-config.service';
import type { EnvironmentVariables } from '../config/env.validation';

type NumericKey = 'LOGIN_RATE_LIMIT_PER_MINUTE' | 'DONATION_RATE_LIMIT_PER_MINUTE';

/**
 * Throttle limits resolved per request from the VALIDATED config (decorators are evaluated at import time,
 * before .env is loaded, so reading process.env there silently ignored .env values).
 */
const fromConfig =
  (key: NumericKey, fallback: number) =>
  (): number =>
    (AppConfigService.current?.get(key) as EnvironmentVariables[NumericKey] | undefined) ?? fallback;

export const LOGIN_THROTTLE = { default: { limit: fromConfig('LOGIN_RATE_LIMIT_PER_MINUTE', 5), ttl: 60_000 } };
export const DONATION_THROTTLE = { default: { limit: fromConfig('DONATION_RATE_LIMIT_PER_MINUTE', 10), ttl: 60_000 } };
export const STATUS_THROTTLE = { default: { limit: 60, ttl: 60_000 } };

/**
 * Throttler storage is the only coupling point to where counters live. `memory` is per-process;
 * `redis` must be backed by a shared store before running more than one API instance. The adapter
 * (e.g. @nest-lab/throttler-storage-redis) is not installed yet — choosing it fails fast instead of
 * silently falling back to per-instance memory.
 */
export function createThrottlerStorage(config: AppConfigService): ThrottlerStorage {
  if (config.get('RATE_LIMIT_STORE') === 'redis') {
    throw new Error('RATE_LIMIT_STORE=redis: install and wire a Redis ThrottlerStorage adapter (see docs/10-donations-and-payments.md)');
  }
  return new ThrottlerStorageService();
}
