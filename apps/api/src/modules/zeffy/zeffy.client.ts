import { Logger } from '@nestjs/common';
import { parseZeffyPayment, parseZeffyPaymentList, ZeffyResponseError, type ZeffyPayment } from './zeffy.types';

/**
 * Read-only server-side client for SDI's Zeffy organization (https://api.zeffy.com, documented endpoints only):
 *   GET /api/v1/payments        list (cursor pagination: limit ≤ 100, starting_after = next_cursor; created[gte]/[lte] filters)
 *   GET /api/v1/payments/:id    detail (404 resource_not_found = deleted / unknown)
 *   GET /api/v1/campaigns/:id   detail (diagnostics: does the configured campaign exist?)
 * Deliberately NOT implemented: POST /api/v1/payments (records an OFFLINE payment — never a checkout, never a confirmation),
 * DELETE /api/v1/payments/:id and all contact writes. Only GET requests are ever retried.
 *
 * Rate limits (documented): 100/min and 20/s per organization; 429 carries Retry-After (seconds). The API key is sent only in
 * the Authorization header and never logged; responses are never logged (they contain donor personal data).
 */
export class ZeffyApiError extends Error {
  constructor(
    message: string,
    readonly status: number, // 0 = network/timeout
    readonly code: string, // Zeffy error.code or a local code
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface ZeffyClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ZeffyClient {
  private readonly logger = new Logger('ZeffyClient');
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: ZeffyClientOptions) {
    this.base = opts.baseUrl.replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.maxRetries = opts.maxRetries ?? 3;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private async get(path: string, query: Record<string, string | number | undefined> = {}): Promise<unknown> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') qs.set(k, String(v));
    const url = `${this.base}${path}${qs.size ? `?${qs}` : ''}`;
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(url, { method: 'GET', headers: { Authorization: `Bearer ${this.opts.apiKey}`, Accept: 'application/json' }, signal: AbortSignal.timeout(this.timeoutMs) });
      } catch (e) {
        const timeout = (e as Error).name === 'TimeoutError';
        if (attempt < this.maxRetries) {
          await this.sleep(this.backoff(attempt));
          continue;
        }
        throw new ZeffyApiError(timeout ? 'Zeffy API timed out' : 'Zeffy API unreachable', 0, timeout ? 'timeout' : 'network_error', true);
      }
      if (res.ok) {
        try {
          return await res.json();
        } catch {
          throw new ZeffyApiError('Zeffy API returned malformed JSON', res.status, 'invalid_response', false);
        }
      }
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      const code = typeof body?.error?.code === 'string' ? body.error.code : `http_${res.status}`;
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < this.maxRetries) {
        const after = Number(res.headers.get('retry-after'));
        const wait = res.status === 429 && Number.isFinite(after) && after > 0 ? Math.min(after, 60) * 1000 : this.backoff(attempt);
        this.logger.warn(`GET ${path} → ${res.status} ${code}; retry ${attempt + 1}/${this.maxRetries} in ${wait} ms`);
        await this.sleep(wait);
        continue;
      }
      // provider messages are short and PII-free by documentation, but are still truncated
      throw new ZeffyApiError((body?.error?.message ?? `Zeffy API error ${res.status}`).slice(0, 200), res.status, code, retryable);
    }
  }

  private backoff(attempt: number) {
    return Math.min(500 * 2 ** attempt, 8000) + Math.floor(Math.random() * 250);
  }

  async listPayments(q: { limit?: number; startingAfter?: string; createdGte?: number; createdLte?: number; campaign?: string; status?: string; currency?: string } = {}) {
    const raw = await this.get('/api/v1/payments', {
      limit: Math.min(Math.max(q.limit ?? 100, 1), 100),
      starting_after: q.startingAfter,
      'created[gte]': q.createdGte,
      'created[lte]': q.createdLte,
      campaign: q.campaign,
      status: q.status,
      currency: q.currency,
    });
    try {
      return parseZeffyPaymentList(raw);
    } catch (e) {
      throw new ZeffyApiError(`Unexpected payment list shape: ${(e as ZeffyResponseError).message}`, 200, 'invalid_response', false);
    }
  }

  /** Every page (cursor pagination), bounded by maxPages so a runaway loop can never exhaust the rate limit. */
  async *iteratePayments(q: { createdGte?: number; createdLte?: number; campaign?: string } = {}, maxPages = 50): AsyncGenerator<ZeffyPayment> {
    let cursor: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const r = await this.listPayments({ ...q, limit: 100, startingAfter: cursor });
      for (const p of r.data) yield p;
      if (!r.hasMore || !r.nextCursor) return;
      cursor = r.nextCursor;
    }
    throw new ZeffyApiError(`Stopped after ${maxPages} pages; narrow the date range`, 0, 'too_many_pages', false);
  }

  /** null when Zeffy answers 404 (deleted or not in this organization). */
  async getPayment(id: string): Promise<ZeffyPayment | null> {
    if (!UUID.test(id)) throw new ZeffyApiError('payment id is not a UUID', 400, 'invalid_parameters', false);
    try {
      const raw = await this.get(`/api/v1/payments/${id}`);
      return parseZeffyPayment(raw);
    } catch (e) {
      if (e instanceof ZeffyApiError && e.status === 404) return null;
      if (e instanceof ZeffyResponseError) throw new ZeffyApiError(`Unexpected payment shape: ${e.message}`, 200, 'invalid_response', false);
      throw e;
    }
  }

  /** Diagnostics only: whether the configured campaign exists in the organization (title for display). */
  async getCampaignTitle(id: string): Promise<string | null> {
    if (!UUID.test(id)) throw new ZeffyApiError('campaign id is not a UUID', 400, 'invalid_parameters', false);
    try {
      const raw = (await this.get(`/api/v1/campaigns/${id}`)) as { title?: unknown };
      return typeof raw?.title === 'string' ? raw.title : '';
    } catch (e) {
      if (e instanceof ZeffyApiError && e.status === 404) return null;
      throw e;
    }
  }

  /** Cheapest authenticated call (one payment) — proves key + connectivity. */
  async ping(): Promise<void> {
    await this.listPayments({ limit: 1 });
  }
}
