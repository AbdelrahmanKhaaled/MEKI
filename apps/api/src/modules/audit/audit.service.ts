import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ActorContext } from '../../common/types/auth-request';
import { Paginated, parseSort } from '../../common/utils';
import type { AuditQueryDto } from './audit.dto';

type Tx = Prisma.TransactionClient | PrismaService;

const SENSITIVE = /password|hash|token|secret/i;

/** Append-only audit trail. There is intentionally no update/delete method (DB triggers also block them). */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(private readonly prisma: PrismaService) {}

  async record(
    actor: Partial<ActorContext> | null,
    action: string,
    entityType: string,
    entityId: string | null,
    metadata?: Record<string, unknown>,
    tx: Tx = this.prisma,
  ) {
    try {
      await tx.auditLog.create({
        data: {
          actorId: actor?.userId ?? null,
          actorEmail: actor?.email ?? null,
          action,
          entityType,
          entityId,
          metadata: metadata ? (AuditService.scrub(metadata) as Prisma.InputJsonValue) : undefined,
          ip: actor?.ip?.slice(0, 64),
          userAgent: actor?.userAgent?.slice(0, 255),
          requestId: actor?.requestId,
        },
      });
    } catch (e) {
      // Inside a transaction we must fail the whole operation; outside, never lose the main action silently.
      if (tx !== this.prisma) throw e;
      this.logger.error(`Failed to write audit log ${action}: ${(e as Error).message}`);
    }
  }

  /** Summarises a change as the list of changed field names (values of sensitive fields never stored). */
  static changedFields(input: object): string[] {
    return Object.entries(input)
      .filter(([, v]) => v !== undefined)
      .map(([k]) => k);
  }

  private static scrub(obj: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, SENSITIVE.test(k) ? '[redacted]' : v]));
  }

  async list(q: AuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.action ? { action: q.action } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
      ...(q.search ? { OR: [{ action: { contains: q.search } }, { actorEmail: { contains: q.search } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: parseSort(q.sort, ['createdAt', 'action', 'entityType'], { createdAt: 'desc' }),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return Paginated.of(items, total, q.page, q.pageSize);
  }
}
