import { existsSync } from 'node:fs';
import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

const toBool = ({ value }: { value: unknown }) =>
  typeof value === 'boolean' ? value : String(value ?? '').toLowerCase() === 'true';

export class EnvironmentVariables {
  @IsIn(['development', 'test', 'production', 'staging'])
  NODE_ENV: 'development' | 'test' | 'production' | 'staging' = 'development';

  @Transform(({ value }) => parseInt(value ?? '4000', 10))
  @IsInt()
  PORT = 4000;

  @IsString()
  DATABASE_URL!: string;

  @IsOptional() @IsString()
  WEB_URL = 'http://localhost:3000';

  @IsOptional() @IsString()
  TRUST_PROXY?: string;

  @IsOptional() @IsString()
  CORS_ORIGINS = 'http://localhost:3000,http://localhost:3001';

  @Transform(({ value }) => parseInt(value ?? '30', 10))
  @IsInt() @Min(5) @Max(240)
  SESSION_IDLE_MINUTES = 30;

  @Transform(({ value }) => parseInt(value ?? '12', 10))
  @IsInt() @Min(1) @Max(72)
  SESSION_ABSOLUTE_HOURS = 12;

  @IsIn(['local', 's3'])
  STORAGE_DRIVER: 'local' | 's3' = 'local';

  @IsOptional() @IsString()
  LOCAL_STORAGE_DIR = './storage/uploads';

  @IsOptional() @IsString()
  PUBLIC_MEDIA_BASE_URL = 'http://localhost:4000/media';

  @Transform(({ value }) => parseInt(value ?? '10', 10))
  @IsInt() @Min(1) @Max(50)
  MEDIA_MAX_UPLOAD_MB = 10;

  @Transform(toBool) @IsBoolean()
  PAYMENTS_ENABLED = false;

  @IsOptional() @IsString()
  PAYMENT_PROVIDER?: string;

  @Transform(toBool) @IsBoolean()
  ALLOW_DEMO_PUBLISH = false;

  @Transform(toBool) @IsBoolean()
  SWAGGER_ENABLED = true;

  @IsOptional() @IsIn(['error', 'warn', 'log', 'debug', 'verbose'])
  LOG_LEVEL?: 'error' | 'warn' | 'log' | 'debug' | 'verbose';

  @Transform(({ value }) => parseInt(value ?? '5', 10))
  @IsInt() @Min(1) @Max(1000)
  LOGIN_RATE_LIMIT_PER_MINUTE = 5;

  /** memory (single instance) | redis (shared; requires a Redis storage adapter, see docs/10) */
  @IsIn(['memory', 'redis'])
  RATE_LIMIT_STORE: 'memory' | 'redis' = 'memory';

  @IsOptional() @IsString()
  REDIS_URL?: string;

  /**
   * Which uploaded images the public /media route serves (client decision, docs/10):
   *  not_denied     — everything except consent NOT_GRANTED (current behaviour)
   *  confirmed_only — only consent CONFIRMED
   * Deleted media is never served. Admin sessions can preview any non-deleted asset.
   */
  @IsIn(['not_denied', 'confirmed_only'])
  MEDIA_PUBLIC_CONSENT_MODE: 'not_denied' | 'confirmed_only' = 'not_denied';

  // ── donations & payments (Phase 3) ──
  @IsOptional() @IsString()
  MOCK_PAYMENT_WEBHOOK_SECRET?: string;

  /** HMAC key for donor-facing donation access tokens (status/return/receipt links). */
  @IsOptional() @IsString()
  DONATION_TOKEN_SECRET?: string;

  @Transform(({ value }) => parseInt(value ?? '10', 10))
  @IsInt() @Min(1) @Max(1000)
  DONATION_RATE_LIMIT_PER_MINUTE = 10;

  @Transform(({ value }) => parseInt(value ?? '30', 10))
  @IsInt() @Min(5) @Max(1440)
  PAYMENT_SESSION_TTL_MINUTES = 30;

  @Transform(({ value }) => parseInt(value ?? '3', 10))
  @IsInt() @Min(0) @Max(10)
  RECURRING_MAX_RETRY_ATTEMPTS = 3;

  @Transform(({ value }) => parseInt(value ?? '3', 10))
  @IsInt() @Min(1) @Max(30)
  RECURRING_RETRY_INTERVAL_DAYS = 3;

  @Transform(toBool) @IsBoolean()
  RECEIPTS_AUTO_ISSUE = true;

  /** Web page the provider redirects to after checkout ("processing" until a verified webhook). {locale} → en|ar. */
  @IsOptional() @IsString()
  DONATION_RETURN_URL = 'http://localhost:3000/{locale}/donation/return';

  // ── event ticketing (Phase 5B) ──
  /** HMAC key for purchaser-facing booking access tokens. Falls back to DONATION_TOKEN_SECRET when unset. */
  @IsOptional() @IsString()
  EVENT_BOOKING_TOKEN_SECRET?: string;

  /** Web page the provider redirects to after ticket checkout ("processing" until a verified webhook). {locale} → en|ar, {slug} → event slug. */
  @IsOptional() @IsString()
  EVENT_BOOKING_RETURN_URL = 'http://localhost:3000/{locale}/events/{slug}/booking';

  /** Unpaid bookings hold their seats for this long when the event has a capacity limit. */
  @Transform(({ value }) => parseInt(value ?? '60', 10))
  @IsInt() @Min(5) @Max(1440)
  EVENT_BOOKING_HOLD_MINUTES = 60;

  /** Private (never web-served) storage for ticket PDFs; keys are generated server-side. */
  @IsOptional() @IsString()
  PRIVATE_STORAGE_DIR = './storage/private';

  /**
   * Ticket PDF fonts. Defaults are the bundled, OFL-licensed Noto Sans / Noto Sans Arabic files in assets/fonts.
   * UNICODE = Arabic-capable (shaped), LATIN = Latin text inside mixed names. Each override must exist and be a TTF/OTF;
   * a bad path stops the API at startup instead of producing broken tickets.
   */
  @IsOptional() @IsString()
  TICKET_PDF_UNICODE_FONT_PATH?: string;

  @IsOptional() @IsString()
  TICKET_PDF_UNICODE_FONT_BOLD_PATH?: string;

  @IsOptional() @IsString()
  TICKET_PDF_LATIN_FONT_PATH?: string;

  @IsOptional() @IsString()
  TICKET_PDF_LATIN_FONT_BOLD_PATH?: string;

  /** Directory holding brand/ and fonts/ runtime assets. Default: apps/api/assets (or dist/assets). */
  @IsOptional() @IsString()
  ASSETS_DIR?: string;

  // ── booking e-mail / background jobs (Phase 5B.1) ──
  /** none = no delivery provider (jobs are parked, nothing is sent) | dev-file = write .json messages to MAIL_DEV_OUTBOX_DIR (dev only) | memory = in-process capture (tests only) */
  @IsIn(['none', 'dev-file', 'memory'])
  MAIL_TRANSPORT: 'none' | 'dev-file' | 'memory' = 'none';

  @IsOptional() @IsString()
  MAIL_DEV_OUTBOX_DIR = './storage/mail-outbox';

  /** Seconds between background-job polls (ticket PDF retries, e-mail delivery). 0 disables the poller (tests call it directly). */
  @Transform(({ value }) => parseInt(value ?? '30', 10))
  @IsInt() @Min(0) @Max(3600)
  GALA_JOBS_INTERVAL_SECONDS = 30;

  @Transform(({ value }) => parseInt(value ?? '5', 10))
  @IsInt() @Min(1) @Max(20)
  GALA_JOB_MAX_ATTEMPTS = 5;

  /** Arabic e-mail copy is a PROPOSED translation until MEKI approves it; false = Arabic bookings receive the English templates. */
  @Transform(toBool) @IsBoolean()
  GALA_EMAIL_ARABIC_APPROVED = false;

  /** Public origin of this API (used for provider-hosted pages such as the dev-only mock checkout). */
  @IsOptional() @IsString()
  API_PUBLIC_URL = 'http://localhost:4000';
}

/** Providers implemented in code. `mock` is test/development-only. */
export const KNOWN_PAYMENT_PROVIDERS = ['mock'] as const;

/** Parses TRUST_PROXY into an Express "trust proxy" value (false when unset). */
export function parseTrustProxy(raw: string | undefined): boolean | number | string {
  const v = (raw ?? '').trim();
  if (v === '' || v === 'false' || v === '0') return false;
  if (/^\d+$/.test(v)) return Number(v); // number of hops (e.g. 1 behind one load balancer)
  if (v === 'true') throw new Error('TRUST_PROXY=true trusts every hop and allows IP spoofing; use a hop count or subnet list');
  if (/^(loopback|linklocal|uniquelocal|[\d.:/a-f]+)(\s*,\s*(loopback|linklocal|uniquelocal|[\d.:/a-f]+))*$/i.test(v)) return v;
  throw new Error(`Invalid TRUST_PROXY value "${v}"`);
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: false });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const msg = errors.map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`).join('; ');
    throw new Error(`Invalid environment configuration: ${msg}`);
  }
  const isProd = validated.NODE_ENV === 'production';
  if (isProd && validated.ALLOW_DEMO_PUBLISH) {
    throw new Error('ALLOW_DEMO_PUBLISH must be false in production');
  }
  if (validated.PAYMENTS_ENABLED && !validated.PAYMENT_PROVIDER) {
    throw new Error('PAYMENTS_ENABLED requires an approved PAYMENT_PROVIDER');
  }
  if (validated.PAYMENT_PROVIDER && !(KNOWN_PAYMENT_PROVIDERS as readonly string[]).includes(validated.PAYMENT_PROVIDER)) {
    throw new Error(`PAYMENT_PROVIDER "${validated.PAYMENT_PROVIDER}" is not implemented`);
  }
  if (validated.PAYMENT_PROVIDER === 'mock') {
    if (isProd || validated.NODE_ENV === 'staging') throw new Error('The mock payment provider is forbidden in staging/production');
    if (!validated.MOCK_PAYMENT_WEBHOOK_SECRET || validated.MOCK_PAYMENT_WEBHOOK_SECRET.length < 16) {
      throw new Error('PAYMENT_PROVIDER=mock requires MOCK_PAYMENT_WEBHOOK_SECRET (min 16 chars)');
    }
  }
  if (validated.PAYMENTS_ENABLED && (!validated.DONATION_TOKEN_SECRET || validated.DONATION_TOKEN_SECRET.length < 32)) {
    throw new Error('PAYMENTS_ENABLED requires DONATION_TOKEN_SECRET (min 32 chars)');
  }
  if (validated.EVENT_BOOKING_TOKEN_SECRET !== undefined && validated.EVENT_BOOKING_TOKEN_SECRET.length < 32) {
    throw new Error('EVENT_BOOKING_TOKEN_SECRET must be at least 32 characters');
  }
  for (const k of ['TICKET_PDF_UNICODE_FONT_PATH', 'TICKET_PDF_UNICODE_FONT_BOLD_PATH', 'TICKET_PDF_LATIN_FONT_PATH', 'TICKET_PDF_LATIN_FONT_BOLD_PATH'] as const) {
    const v = validated[k];
    if (v && (!/.(ttf|otf)$/i.test(v) || !existsSync(v))) throw new Error(`${k} must point to an existing .ttf/.otf file`);
  }
  if (validated.ASSETS_DIR && !existsSync(validated.ASSETS_DIR)) throw new Error('ASSETS_DIR does not exist');
  if (validated.MAIL_TRANSPORT !== 'none' && (isProd || validated.NODE_ENV === 'staging')) {
    throw new Error(`MAIL_TRANSPORT=${validated.MAIL_TRANSPORT} is for development/test only; production needs an approved e-mail provider adapter`);
  }
  if (validated.RATE_LIMIT_STORE === 'redis' && !validated.REDIS_URL) {
    throw new Error('RATE_LIMIT_STORE=redis requires REDIS_URL');
  }
  parseTrustProxy(validated.TRUST_PROXY); // fail fast on unsafe values
  return validated;
}
