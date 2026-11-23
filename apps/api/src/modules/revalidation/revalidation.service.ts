import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ALL_PUBLIC_TAG, normalizeTags, SCOPE_TAGS, tagForPage, type PublicScope } from './revalidation.tags';

/**
 * Outcome reported to the admin (response header X-Meki-Revalidation):
 *  - revalidated: the website confirmed it expired the affected caches; its next request renders the new content
 *  - pending:     the change is committed, but the website could not be reached yet; retried automatically (and on demand)
 *  - disabled:    on-demand refresh is not configured; the website picks the change up within its 300 s ISR window
 */
export type RevalidationOutcome = 'revalidated' | 'pending' | 'disabled';

export interface RevalidationStatus {
  enabled: boolean;
  state: 'ok' | 'pending' | 'disabled';
  pendingTags: string[];
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  /** stable code only (TIMEOUT, NETWORK, HTTP_401, BAD_RESPONSE…) — never a URL, header or secret */
  lastError: string | null;
  nextRetryAt: string | null;
}

const ATTEMPT_TIMEOUT_MS = 4000;
const RETRY_STEPS_MS = [5_000, 15_000, 60_000, 300_000];

/**
 * CMS live publishing — server-to-server cache invalidation of the public website (Next.js on-demand revalidation).
 *
 * Called AFTER a mutation has been committed. A website outage never turns a committed publish into an error: the affected tags
 * stay in a pending set and are retried with backoff (5 s → 15 s → 1 min → every 5 min) or immediately via POST
 * /admin/cms/revalidation/retry. The pending set is in memory (single API instance — see ecosystem.config.cjs); after an API
 * restart a full refresh is queued, so nothing that was pending before the restart can stay stale.
 */
@Injectable()
export class RevalidationService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Revalidation');
  private readonly pending = new Set<string>();
  private chain: Promise<unknown> = Promise.resolve();
  private timer: NodeJS.Timeout | null = null;
  private nextRetryAt: Date | null = null;
  private failures = 0;
  private lastSuccessAt: Date | null = null;
  private lastFailureAt: Date | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  get enabled() {
    return !!this.config.get('WEB_REVALIDATE_URL') && !!this.config.get('MEKI_REVALIDATE_SECRET');
  }

  onApplicationBootstrap() {
    const env = this.config.get('NODE_ENV');
    if (!this.enabled) {
      if (env === 'production' || env === 'staging') {
        this.logger.warn('WEB_REVALIDATE_URL / MEKI_REVALIDATE_SECRET are not set: published CMS changes reach the website only after its 300 s cache window');
      }
      return;
    }
    // Close the restart gap: anything pending before a restart (or published while the API was down) is refreshed once.
    if (env === 'production' || env === 'staging') {
      this.pending.add(ALL_PUBLIC_TAG);
      this.schedule(15_000);
    }
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Resolves the tags an admin route affects. Unknown/removed records fall back to a full refresh (never to nothing). */
  async tagsFor(scopes: PublicScope[], params: Record<string, string | undefined>): Promise<string[]> {
    const tags: string[] = [];
    for (const scope of scopes) {
      try {
        if (scope === 'cms-page') {
          const page = await this.prisma.page.findUnique({ where: { slug: params.slug ?? '' }, select: { slug: true, event: { select: { id: true } } } });
          tags.push(page ? tagForPage(page.slug, !!page.event) : ALL_PUBLIC_TAG);
        } else if (scope === 'cms-section') {
          const section = await this.prisma.pageSection.findUnique({
            where: { id: params.id ?? '' },
            select: { page: { select: { slug: true, event: { select: { id: true } } } } },
          });
          tags.push(section ? tagForPage(section.page.slug, !!section.page.event) : ALL_PUBLIC_TAG);
        } else {
          tags.push(...SCOPE_TAGS[scope]);
        }
      } catch {
        tags.push(ALL_PUBLIC_TAG);
      }
    }
    return normalizeTags(tags);
  }

  /** Queues the tags and tries to deliver them now (bounded: at most 2 × 4 s). Never throws. */
  async revalidate(tags: string[]): Promise<RevalidationOutcome> {
    if (!this.enabled) return 'disabled';
    const wanted = normalizeTags(tags);
    if (!wanted.length) return 'revalidated';
    wanted.forEach((t) => this.pending.add(t));
    const delivered = await this.enqueue();
    return delivered && wanted.every((t) => !this.pending.has(t)) ? 'revalidated' : 'pending';
  }

  /** Admin "retry now": delivers everything pending (or, with `all`, a full refresh). */
  async retry(all = false): Promise<RevalidationStatus> {
    if (this.enabled) {
      if (all) this.pending.add(ALL_PUBLIC_TAG);
      if (this.pending.size) await this.enqueue();
    }
    return this.status();
  }

  status(): RevalidationStatus {
    const enabled = this.enabled;
    return {
      enabled,
      state: !enabled ? 'disabled' : this.pending.size ? 'pending' : 'ok',
      pendingTags: normalizeTags(this.pending),
      consecutiveFailures: this.failures,
      lastSuccessAt: this.lastSuccessAt?.toISOString() ?? null,
      lastFailureAt: this.lastFailureAt?.toISOString() ?? null,
      lastError: this.lastError,
      nextRetryAt: this.pending.size && this.nextRetryAt ? this.nextRetryAt.toISOString() : null,
    };
  }

  // ── delivery ──

  /** Deliveries run one at a time; every caller's tags are in `pending` before its turn, so they ride the next send. */
  private enqueue(): Promise<boolean> {
    const run = this.chain.then(() => this.deliver());
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async deliver(): Promise<boolean> {
    if (!this.pending.size) return true;
    const snapshot = [...this.pending];
    const batch = normalizeTags(snapshot);
    let error: string | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      error = await this.send(batch);
      if (!error) break;
      if (attempt === 1) await new Promise((r) => setTimeout(r, 300));
    }
    if (!error) {
      // Only what was pending when the request left is done; tags added during the request (a later commit) stay queued.
      snapshot.forEach((t) => this.pending.delete(t));
      this.failures = 0;
      this.lastSuccessAt = new Date();
      if (this.pending.size) this.schedule(1_000);
      else this.clearTimer();
      return true;
    }
    this.failures++;
    this.lastFailureAt = new Date();
    this.lastError = error;
    const delay = RETRY_STEPS_MS[Math.min(this.failures - 1, RETRY_STEPS_MS.length - 1)];
    this.logger.warn(`Website cache refresh failed (${error}); ${this.pending.size} tag(s) pending, retrying in ${Math.round(delay / 1000)} s`);
    this.schedule(delay);
    return false;
  }

  /** One POST to the website. Returns an error code, or null on a confirmed success. The secret is sent in a header only. */
  private async send(tags: string[]): Promise<string | null> {
    try {
      const res = await fetch(this.config.get('WEB_REVALIDATE_URL')!, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.config.get('MEKI_REVALIDATE_SECRET')}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ tags }),
        redirect: 'error',
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
      if (!res.ok) return `HTTP_${res.status}`;
      const body = (await res.json().catch(() => null)) as { revalidated?: unknown } | null;
      return body?.revalidated === true ? null : 'BAD_RESPONSE';
    } catch (e) {
      return e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'TIMEOUT' : 'NETWORK';
    }
  }

  private schedule(ms: number) {
    this.clearTimer();
    this.nextRetryAt = new Date(Date.now() + ms);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.enqueue();
    }, ms);
    this.timer.unref?.();
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.nextRetryAt = null;
  }
}
