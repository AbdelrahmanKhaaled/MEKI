import { Controller, Get, Inject, Module, ServiceUnavailableException } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Public, RequirePermissions } from '../../common/decorators';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GalaModule } from '../gala/gala.module';
import { MAIL_TRANSPORT, type MailTransport } from '../gala/mail-transport';

/** Phase 9A: probes must fail fast — a hung database must not hang the load balancer's health check for 10 s. */
const DB_PROBE_TIMEOUT_MS = 3000;

async function pingDb(prisma: PrismaService): Promise<number> {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), DB_PROBE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  return Date.now() - started;
}

@ApiTags('Health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Readiness: the process is up AND the database answers within 3 s (503 otherwise)' })
  async check() {
    try {
      await pingDb(this.prisma);
    } catch {
      throw new ServiceUnavailableException({ message: 'Database unavailable', code: 'DB_UNAVAILABLE' });
    }
    return { status: 'ok', database: 'up', time: new Date().toISOString() };
  }

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness only (no database call) — for process managers; use /health for load-balancer readiness' })
  live() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()), time: new Date().toISOString() };
  }
}

/**
 * Operations view for administrators (audit.read): queue backlogs, webhook failures, storage, mail transport, DB latency.
 * Counts and flags only — never secrets, payloads or personal data.
 */
@ApiTags('Admin · System')
@ApiCookieAuth()
@Controller('admin/system')
export class AdminSystemController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    @Inject(MAIL_TRANSPORT) private readonly mail: MailTransport,
  ) {}

  private async writable(dir: string) {
    const path = resolve(dir);
    try {
      await mkdir(path, { recursive: true });
      await access(path, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  @Get('status') @RequirePermissions('audit.read')
  @ApiOperation({ summary: 'Operational status: DB latency, background jobs, webhook failures, storage, transports (no secrets)' })
  async status() {
    const stale = new Date(Date.now() - 5 * 60_000);
    let dbMs: number | null = null;
    try {
      dbMs = await pingDb(this.prisma);
    } catch {
      dbMs = null;
    }
    const [jobs, overdue, webhooks, stuckWebhooks, lastReconcile] = await Promise.all([
      this.prisma.eventBookingJob.groupBy({ by: ['status'], orderBy: { status: 'asc' }, _count: { _all: true } }),
      this.prisma.eventBookingJob.findFirst({ where: { status: 'PENDING', nextRunAt: { lt: stale } }, orderBy: { nextRunAt: 'asc' }, select: { nextRunAt: true } }),
      this.prisma.paymentWebhookEvent.groupBy({ by: ['provider', 'status'], orderBy: [{ provider: 'asc' }, { status: 'asc' }], _count: { _all: true } }),
      this.prisma.paymentWebhookEvent.count({ where: { status: 'RECEIVED', receivedAt: { lt: stale } } }),
      this.prisma.auditLog.findFirst({ where: { action: 'zeffy.reconcile.run' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);
    const count = (x: { _count: unknown }) => (x._count as { _all: number })._all;
    const jobCounts = Object.fromEntries(jobs.map((j) => [j.status, count(j)]));
    const webhookCounts: Record<string, Record<string, number>> = {};
    for (const w of webhooks) (webhookCounts[w.provider] ??= {})[w.status] = count(w);
    const [mediaOk, privateOk] = await Promise.all([this.writable(this.config.get('LOCAL_STORAGE_DIR')), this.writable(this.config.get('PRIVATE_STORAGE_DIR'))]);
    const alerts: string[] = [];
    if (dbMs === null) alerts.push('database unavailable');
    if ((jobCounts.FAILED ?? 0) > 0) alerts.push(`${jobCounts.FAILED} failed background job(s)`);
    if (overdue) alerts.push('background jobs overdue by more than 5 minutes (is the poller running?)');
    if (stuckWebhooks > 0) alerts.push(`${stuckWebhooks} webhook event(s) received but not processed for more than 5 minutes`);
    const failedWebhooks = webhooks.filter((w) => w.status === 'FAILED').reduce((a, w) => a + count(w), 0);
    if (failedWebhooks > 0) alerts.push(`${failedWebhooks} failed webhook event(s)`);
    if (!mediaOk || !privateOk) alerts.push('storage directory not writable');
    return {
      status: alerts.length ? 'attention' : 'ok',
      alerts,
      time: new Date().toISOString(),
      process: { uptimeSeconds: Math.round(process.uptime()), node: process.version, env: this.config.get('NODE_ENV') },
      database: { up: dbMs !== null, latencyMs: dbMs },
      jobs: { counts: jobCounts, pollerIntervalSeconds: this.config.get('GALA_JOBS_INTERVAL_SECONDS'), oldestOverdueSince: overdue?.nextRunAt ?? null },
      webhooks: { byProvider: webhookCounts, stuckReceived: stuckWebhooks },
      storage: { mediaWritable: mediaOk, privateWritable: privateOk, driver: this.config.get('STORAGE_DRIVER') },
      mail: { transport: this.mail.name, delivers: this.mail.delivers },
      payments: { enabled: this.config.get('PAYMENTS_ENABLED'), provider: this.config.get('PAYMENT_PROVIDER') ?? null },
      zeffy: { lastReconciliation: lastReconcile?.createdAt ?? null },
    };
  }
}

@Module({ imports: [GalaModule], controllers: [HealthController, AdminSystemController] })
export class HealthModule {}
