import { existsSync } from 'node:fs';
import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsIP, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

const toBool = ({ value }: { value: unknown }) =>
  typeof value === 'boolean' ? value : String(value ?? '').toLowerCase() === 'true';

export class EnvironmentVariables {
  @IsIn(['development', 'test', 'production', 'staging'])
  NODE_ENV: 'development' | 'test' | 'production' | 'staging' = 'development';

  @Transform(({ value }) => parseInt(value ?? '4000', 10))
  @IsInt()
  PORT = 4000;

  /** Containers use all interfaces; the native VPS template explicitly selects loopback. */
  @IsIP()
  API_BIND_HOST = '0.0.0.0';

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

  /** text (default) or json — one JSON object per log line for production log collectors (read in main.ts). */
  @IsOptional() @IsIn(['text', 'json'])
  LOG_FORMAT?: 'text' | 'json';

  /** Public origin of this API (used for provider-hosted pages such as the dev-only mock checkout). */
  @IsOptional() @IsString()
  API_PUBLIC_URL = 'http://localhost:4000';

  // ── Zeffy / SDI (Phase 8A). Everything optional and OFF by default: the API starts normally without any of it. ──
  /** Documented base URL (https://api.zeffy.com/api/docs). Overridable only for tests; production requires the official host. */
  @IsOptional() @IsString()
  ZEFFY_API_BASE_URL = 'https://api.zeffy.com';

  /** SDI's organization API key (server-side only; never NEXT_PUBLIC_*). Absent = no API calls. */
  @IsOptional() @IsString()
  ZEFFY_API_KEY?: string;

  /** Webhook signing secret(s) from Zeffy → Settings → Integrations → Webhook. Comma-separated to allow rotation. Absent = webhook refused. */
  @IsOptional() @IsString()
  ZEFFY_WEBHOOK_SECRET?: string;

  /** Signature timestamp tolerance in seconds (Zeffy recommends 5 minutes). */
  @Transform(({ value }) => parseInt(value ?? '300', 10))
  @IsInt() @Min(30) @Max(900)
  ZEFFY_WEBHOOK_TOLERANCE_SECONDS = 300;

  /** Periodic read-only reconciliation (GET /api/v1/payments). Off until SDI supplies the key. */
  @Transform(toBool) @IsBoolean()
  ZEFFY_RECONCILIATION_ENABLED = false;

  /** Minutes between scheduled reconciliation runs (when enabled). */
  @Transform(({ value }) => parseInt(value ?? '30', 10))
  @IsInt() @Min(5) @Max(1440)
  ZEFFY_RECONCILIATION_INTERVAL_MINUTES = 30;

  /** SDI's Zeffy campaign (form) id used for Gala tickets — payments from any other campaign never touch a booking. */
  @IsOptional() @IsString()
  ZEFFY_GALA_TICKET_CAMPAIGN_ID?: string;

  /** MEKI event whose bookings that campaign pays for (seed code of the Gala Night event). */
  @IsOptional() @IsString()
  ZEFFY_GALA_EVENT_CODE = 'EVT-GALA-NIGHT';

  /** Comma-separated Zeffy campaign ids that SDI uses for MEKI donations (classification only). */
  @IsOptional() @IsString()
  ZEFFY_DONATION_CAMPAIGN_IDS?: string;

  /**
   * Automatic Gala booking confirmation from a verified Zeffy payment. MUST stay false until SDI confirms how the MEKI booking
   * reference reaches the payment (Zeffy's `metadata` is "reserved for future" — see docs/31). Refused in production for now.
   */
  @Transform(toBool) @IsBoolean()
  ZEFFY_GALA_AUTO_CONFIRM = false;

  /** Approved hosted form URLs (https, Zeffy hosts only). Stored for Phase 8B; not exposed to the public site in Phase 8A. */
  @IsOptional() @IsString()
  ZEFFY_DONATION_FORM_URL?: string;

  @IsOptional() @IsString()
  ZEFFY_GALA_TICKET_FORM_URL?: string;

  @IsOptional() @IsString()
  ZEFFY_GALA_GIVING_FORM_URL?: string;

  // ── Phase 12: SDI hosted-form model (SDI decision, 2026-11) ──
  // Payments are collected ONLY on SDI's Zeffy-hosted forms. MEKI receives no API key and no webhooks; SDI sends a daily
  // reconciliation report. Every availability switch below is separate and OFF by default.

  /**
   * Who issues the official Gala tickets. 'zeffy_hosted' = Zeffy issues tickets, PDFs, QR codes, receipts and check-in; MEKI
   * only prepares a booking reference and reconciles SDI's reports. 'meki' = legacy/development flow (MEKI-issued tickets).
   * Unset → 'zeffy_hosted' in staging/production, 'meki' in development/test. 'meki' is refused in staging/production.
   */
  @IsOptional() @IsIn(['meki', 'zeffy_hosted'])
  GALA_TICKETING_MODE?: 'meki' | 'zeffy_hosted';

  /** Gala: public booking-reference creation + link to SDI's ticket form (also needs the admin sales switch and ZEFFY_GALA_TICKET_FORM_URL). */
  @Transform(toBool) @IsBoolean()
  GALA_HOSTED_SALES_ENABLED = false;

  /** Label of SDI's custom question that captures the MEKI booking reference on the hosted form. */
  @IsOptional() @IsString()
  SDI_BOOKING_REFERENCE_QUESTION = 'MEKI Booking Reference';

  /**
   * Phase 12B — Gala standalone donations on SDI's Gala donation form (ZEFFY_GALA_GIVING_FORM_URL). The form is for the Gala
   * campaign only (SDI, 2026-11). The public link additionally needs the approved Gala project to be authorized for public
   * fundraising and an approved closing date (admin → Gala settings → Fundraising project).
   */
  @Transform(toBool) @IsBoolean()
  SDI_GALA_GIVING_ENABLED = false;

  /**
   * Phase 12B — general (unrestricted, non-Gala) giving is NOT covered by the current SDI Gala agreement. Set only when a separate
   * written agreement exists. Gates MEKI-native GENERAL_FUND / CAMPAIGN donations and SDI_GENERAL_GIVING_ENABLED.
   */
  @Transform(toBool) @IsBoolean()
  GENERAL_GIVING_AUTHORIZED = false;

  /**
   * Phase 12B — donor-directed giving to an individual programme is NOT authorized under the current SDI Gala agreement (it needs
   * separate legal, financial, reporting and due-diligence arrangements). Gates MEKI-native PROGRAMME donations and
   * SDI_PROGRAMME_GIVING_ENABLED.
   */
  @Transform(toBool) @IsBoolean()
  PROGRAMME_GIVING_AUTHORIZED = false;

  /** General giving through SDI's hosted donation form (needs ZEFFY_DONATION_FORM_URL and GENERAL_GIVING_AUTHORIZED). */
  @Transform(toBool) @IsBoolean()
  SDI_GENERAL_GIVING_ENABLED = false;

  /** Programme-designated giving through SDI hosted forms (needs SDI_PROGRAMME_FORM_URLS and SDI_PROGRAMME_DESIGNATION_CONFIRMED). */
  @Transform(toBool) @IsBoolean()
  SDI_PROGRAMME_GIVING_ENABLED = false;

  /** JSON object { "<programme slug>": "<SDI-approved https Zeffy form URL>" }. Never invented: only URLs SDI supplied. */
  @IsOptional() @IsString()
  SDI_PROGRAMME_FORM_URLS?: string;

  /** Set only after SDI confirms in writing how the hosted form captures and reports the programme designation. */
  @Transform(toBool) @IsBoolean()
  SDI_PROGRAMME_DESIGNATION_CONFIRMED = false;

  /**
   * Phase 14 — label of SDI's custom question that captures the MEKI DONATION reference (DN-…) on a hosted donation form.
   * Donation intents (a MEKI reference issued BEFORE the hand-off) need SDI_DONATION_REFERENCE_CONFIRMED.
   */
  @IsOptional() @IsString()
  SDI_DONATION_REFERENCE_QUESTION = 'MEKI Donation Reference';

  /**
   * Phase 14 — set only after SDI confirms in writing that the question above exists (required, once per gift) on the relevant
   * donation form(s) AND appears in SDI's exported report. Without it no donation intent/reference is issued (the Gala page keeps
   * its Phase 12B direct link, reconciled as a standalone Gala donation).
   */
  @Transform(toBool) @IsBoolean()
  SDI_DONATION_REFERENCE_CONFIRMED = false;

  /** Phase 14 — label of SDI's "Donation Type" question (Zakat / Sadaqah). */
  @IsOptional() @IsString()
  SDI_DONATION_TYPE_QUESTION = 'Donation Type';

  /** Phase 14 — set only after SDI confirms the Donation Type question exists on the form(s) and is exported in its report. */
  @Transform(toBool) @IsBoolean()
  SDI_DONATION_TYPE_CONFIRMED = false;

  /**
   * Phase 14 — Zakat-classified giving. Needs SDI_DONATION_TYPE_CONFIRMED + SDI_DONATION_REFERENCE_CONFIRMED, and is offered
   * ONLY for a programme / project / campaign whose Zakat eligibility was approved (two administrators, MEKI authority reference
   * + SDI acceptance reference). Default OFF: nothing is Zakat-eligible by default.
   */
  @Transform(toBool) @IsBoolean()
  ZAKAT_GIVING_ENABLED = false;

  /**
   * Phase 14B — temporary Gala-only launch mode. While program / general giving is not authorized, a donor who clicks "Give" on a
   * program (or the general Give page) may CHOOSE to support the approved Gala project instead — only after an explicit
   * disclosure they accept. Their source interest is recorded separately from the actual (Gala) destination. Needs the Gala
   * donation-intent gate to be open (approved project, campaign open, SDI form, reference question confirmed). Default OFF.
   */
  @Transform(toBool) @IsBoolean()
  GIVING_GALA_ONLY_MODE = false;

  /** Phase 14B — the Gala event whose approved project receives Gala-only gifts. */
  @IsOptional() @IsString()
  GIVING_GALA_EVENT_SLUG = 'gala-night';

  /**
   * Applying an approved SDI reconciliation report (booking confirmations, refunds, ledger entries). Upload, mapping and preview
   * work without it. Turn on only after a mapping has been verified against a REAL SDI sample report.
   */
  @Transform(toBool) @IsBoolean()
  SDI_REPORT_APPLY_ENABLED = false;

  /** Enable only after MEKI/SDI validate the original email template and protected evidence archive. */
  @Transform(toBool) @IsBoolean()
  SDI_MANUAL_CONFIRMATION_ENABLED = false;

  /**
   * Phase 13A — ONLY for a local, on-machine staging rehearsal (NODE_ENV=staging on localhost, plain http). Relaxes the
   * "no localhost / https only" rule for public URLs. Refused in production. Never set it on a hosted staging server.
   */
  @Transform(toBool) @IsBoolean()
  STAGING_LOCAL_REHEARSAL = false;
}

/** Hosts a configured Zeffy hosted-form URL may use (extended only after SDI confirms other hosts). */
export const ZEFFY_FORM_HOSTS = ['www.zeffy.com', 'zeffy.com'] as const;
export const ZEFFY_OFFICIAL_API = 'https://api.zeffy.com';

/** Validates the Zeffy settings; returns nothing, throws on unsafe values. Exported for unit tests. */
export function validateZeffyConfig(v: Pick<EnvironmentVariables, 'NODE_ENV' | 'ZEFFY_API_BASE_URL' | 'ZEFFY_API_KEY' | 'ZEFFY_WEBHOOK_SECRET' | 'ZEFFY_RECONCILIATION_ENABLED' | 'ZEFFY_GALA_AUTO_CONFIRM' | 'ZEFFY_GALA_TICKET_CAMPAIGN_ID' | 'ZEFFY_DONATION_FORM_URL' | 'ZEFFY_GALA_TICKET_FORM_URL' | 'ZEFFY_GALA_GIVING_FORM_URL'>) {
  const strict = v.NODE_ENV === 'production' || v.NODE_ENV === 'staging';
  let base: URL;
  try {
    base = new URL(v.ZEFFY_API_BASE_URL);
  } catch {
    throw new Error('ZEFFY_API_BASE_URL must be a URL');
  }
  if (strict && base.origin !== ZEFFY_OFFICIAL_API) throw new Error(`ZEFFY_API_BASE_URL must be ${ZEFFY_OFFICIAL_API} in staging/production`);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname) && !strict)) {
    throw new Error('ZEFFY_API_BASE_URL must use https');
  }
  if (v.ZEFFY_API_KEY !== undefined && v.ZEFFY_API_KEY.trim().length < 16) throw new Error('ZEFFY_API_KEY looks invalid (too short)');
  for (const s of (v.ZEFFY_WEBHOOK_SECRET ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
    if (s.length < 16) throw new Error('ZEFFY_WEBHOOK_SECRET values must be at least 16 characters');
  }
  if (v.ZEFFY_RECONCILIATION_ENABLED && !v.ZEFFY_API_KEY) throw new Error('ZEFFY_RECONCILIATION_ENABLED requires ZEFFY_API_KEY');
  if (v.ZEFFY_GALA_AUTO_CONFIRM) {
    if (strict) throw new Error('ZEFFY_GALA_AUTO_CONFIRM is not allowed until SDI confirms the booking-reference mapping (docs/32)');
    if (!v.ZEFFY_GALA_TICKET_CAMPAIGN_ID) throw new Error('ZEFFY_GALA_AUTO_CONFIRM requires ZEFFY_GALA_TICKET_CAMPAIGN_ID');
  }
  for (const k of ['ZEFFY_DONATION_FORM_URL', 'ZEFFY_GALA_TICKET_FORM_URL', 'ZEFFY_GALA_GIVING_FORM_URL'] as const) {
    const raw = v[k];
    if (!raw) continue;
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      throw new Error(`${k} must be a URL`);
    }
    if (u.protocol !== 'https:' || u.username || u.password || !(ZEFFY_FORM_HOSTS as readonly string[]).includes(u.hostname)) {
      throw new Error(`${k} must be an https URL on ${ZEFFY_FORM_HOSTS.join(' / ')}`);
    }
  }
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
  validateZeffyConfig(validated);
  validateSdiHostedConfig(validated);
  validateDeploymentUrls(validated);
  return validated;
}

/** Settings whose development defaults point at localhost. */
export const DEPLOYMENT_URL_KEYS = ['WEB_URL', 'API_PUBLIC_URL', 'PUBLIC_MEDIA_BASE_URL', 'DONATION_RETURN_URL', 'EVENT_BOOKING_RETURN_URL'] as const;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1']);

/**
 * Phase 13A — staging/production must never run on the localhost defaults (silent fallbacks produced broken links, CORS
 * failures and e-mails pointing at a developer machine). Each public URL and every CORS origin must be https and not local.
 * The single exception is an explicit local rehearsal (STAGING_LOCAL_REHEARSAL=true, staging only).
 */
export function validateDeploymentUrls(v: Pick<EnvironmentVariables, 'NODE_ENV' | 'CORS_ORIGINS' | 'STAGING_LOCAL_REHEARSAL' | (typeof DEPLOYMENT_URL_KEYS)[number]>) {
  const strict = v.NODE_ENV === 'production' || v.NODE_ENV === 'staging';
  if (v.STAGING_LOCAL_REHEARSAL && v.NODE_ENV !== 'staging') throw new Error('STAGING_LOCAL_REHEARSAL is only allowed with NODE_ENV=staging');
  if (!strict || v.STAGING_LOCAL_REHEARSAL) return;
  const check = (name: string, raw: string) => {
    let url: URL;
    try {
      url = new URL(raw.replace('{locale}', 'en').replace('{slug}', 'x'));
    } catch {
      throw new Error(`${name} must be an absolute URL`);
    }
    if (url.protocol !== 'https:' || LOCAL_HOSTS.has(url.hostname)) throw new Error(`${name} must be an https URL that is not localhost in ${v.NODE_ENV} (set it explicitly)`);
  };
  for (const k of DEPLOYMENT_URL_KEYS) check(k, v[k]);
  const origins = v.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  if (origins.length === 0) throw new Error(`CORS_ORIGINS must list the website and admin origins in ${v.NODE_ENV}`);
  for (const o of origins) check('CORS_ORIGINS', o);
}

const zeffyHostedUrl = (u: string, name: string) => {
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    throw new Error(`${name} must be a URL`);
  }
  if (url.protocol !== 'https:' || !(ZEFFY_FORM_HOSTS as readonly string[]).includes(url.hostname)) throw new Error(`${name} must be an https URL on ${ZEFFY_FORM_HOSTS.join(' / ')}`);
};

/** Phase 12: resolves GALA_TICKETING_MODE and refuses unsafe combinations (exported for unit tests). */
export function validateSdiHostedConfig(v: EnvironmentVariables) {
  const strict = v.NODE_ENV === 'production' || v.NODE_ENV === 'staging';
  v.GALA_TICKETING_MODE ??= strict ? 'zeffy_hosted' : 'meki';
  if (strict && v.GALA_TICKETING_MODE !== 'zeffy_hosted') {
    throw new Error("GALA_TICKETING_MODE must be 'zeffy_hosted' in staging/production: SDI's Zeffy form is the only ticket issuer");
  }
  if (v.GALA_TICKETING_MODE === 'zeffy_hosted' && v.ZEFFY_GALA_AUTO_CONFIRM) {
    throw new Error('ZEFFY_GALA_AUTO_CONFIRM conflicts with zeffy_hosted mode: SDI reports are the only payment-confirmation path');
  }
  if (v.GALA_HOSTED_SALES_ENABLED) {
    if (v.GALA_TICKETING_MODE !== 'zeffy_hosted') throw new Error('GALA_HOSTED_SALES_ENABLED requires GALA_TICKETING_MODE=zeffy_hosted');
    if (!v.ZEFFY_GALA_TICKET_FORM_URL) throw new Error('GALA_HOSTED_SALES_ENABLED requires ZEFFY_GALA_TICKET_FORM_URL (the SDI-approved Gala form)');
  }
  if (v.SDI_GENERAL_GIVING_ENABLED) {
    if (!v.GENERAL_GIVING_AUTHORIZED) throw new Error('SDI_GENERAL_GIVING_ENABLED requires GENERAL_GIVING_AUTHORIZED (general giving is outside the current SDI Gala agreement)');
    if (!v.ZEFFY_DONATION_FORM_URL) throw new Error('SDI_GENERAL_GIVING_ENABLED requires ZEFFY_DONATION_FORM_URL');
  }
  if (v.SDI_GALA_GIVING_ENABLED) {
    if (v.GALA_TICKETING_MODE !== 'zeffy_hosted') throw new Error('SDI_GALA_GIVING_ENABLED requires GALA_TICKETING_MODE=zeffy_hosted');
    if (!v.ZEFFY_GALA_GIVING_FORM_URL) throw new Error('SDI_GALA_GIVING_ENABLED requires ZEFFY_GALA_GIVING_FORM_URL (the SDI Gala donation form)');
  }
  // SDI (2026-11): every payment happens on SDI's hosted Zeffy forms. MEKI's own checkout would be a second payment channel.
  if (strict && v.PAYMENTS_ENABLED) throw new Error('PAYMENTS_ENABLED (MEKI-native checkout) is refused in staging/production: payments happen only on SDI hosted forms');
  if (!/^[\p{L}\p{N} ._-]{3,80}$/u.test(v.SDI_BOOKING_REFERENCE_QUESTION)) throw new Error('SDI_BOOKING_REFERENCE_QUESTION must be 3-80 letters, digits, spaces or ._-');
  // Phase 14 — donation intents, donation type and Zakat
  for (const k of ['SDI_DONATION_REFERENCE_QUESTION', 'SDI_DONATION_TYPE_QUESTION'] as const) {
    if (v[k] !== undefined && !/^[\p{L}\p{N} ._/-]{3,80}$/u.test(v[k])) throw new Error(`${k} must be 3-80 letters, digits, spaces or ._/-`);
  }
  if (v.SDI_DONATION_TYPE_CONFIRMED && !v.SDI_DONATION_REFERENCE_CONFIRMED) throw new Error('SDI_DONATION_TYPE_CONFIRMED requires SDI_DONATION_REFERENCE_CONFIRMED (a donation type is only reconcilable against a MEKI donation reference)');
  if (v.ZAKAT_GIVING_ENABLED && !v.SDI_DONATION_TYPE_CONFIRMED) throw new Error('ZAKAT_GIVING_ENABLED requires SDI_DONATION_TYPE_CONFIRMED (SDI must capture and export the Zakat/Sadaqah choice)');
  const map = parseProgrammeFormUrls(v.SDI_PROGRAMME_FORM_URLS);
  if (v.SDI_PROGRAMME_GIVING_ENABLED) {
    if (!v.PROGRAMME_GIVING_AUTHORIZED) throw new Error('SDI_PROGRAMME_GIVING_ENABLED requires PROGRAMME_GIVING_AUTHORIZED (programme-restricted giving needs a separate agreement)');
    if (!v.SDI_PROGRAMME_DESIGNATION_CONFIRMED) throw new Error('SDI_PROGRAMME_GIVING_ENABLED requires SDI_PROGRAMME_DESIGNATION_CONFIRMED (SDI must confirm how the designation is captured)');
    if (Object.keys(map).length === 0) throw new Error('SDI_PROGRAMME_GIVING_ENABLED requires SDI_PROGRAMME_FORM_URLS');
  }
}

/** Parses SDI_PROGRAMME_FORM_URLS strictly: { slug: https Zeffy URL }. Throws on anything else. */
export function parseProgrammeFormUrls(raw: string | undefined): Record<string, string> {
  if (!raw || !raw.trim()) return {};
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error('SDI_PROGRAMME_FORM_URLS must be a JSON object { "slug": "https://www.zeffy.com/..." }');
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('SDI_PROGRAMME_FORM_URLS must be a JSON object');
  const out: Record<string, string> = {};
  for (const [slug, url] of Object.entries(obj as Record<string, unknown>)) {
    if (!/^[a-z0-9-]{2,100}$/.test(slug) || typeof url !== 'string') throw new Error('SDI_PROGRAMME_FORM_URLS: invalid entry');
    zeffyHostedUrl(url, `SDI_PROGRAMME_FORM_URLS[${slug}]`);
    out[slug] = url;
  }
  return out;
}
