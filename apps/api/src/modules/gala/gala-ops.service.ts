import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Paginated } from '../../common/utils';
import type { CheckInHistoryQueryDto, JobQueryDto } from './gala.dto';
import { MAIL_TRANSPORT, type MailTransport } from './mail-transport';

/** Audit actions written by CheckInService; the history view reads them back (no separate check-in table exists). */
export const CHECKIN_ACTIONS = {
  checked_in: 'gala.checkin.checked_in',
  manual: 'gala.checkin.manual',
  rejected: 'gala.checkin.rejected',
  undo: 'gala.checkin.undo',
} as const;

/**
 * Phase 6E read models for the admin operations screens. READ-ONLY: no booking, ticket, job or payment state is changed here —
 * every write still goes through the existing Phase 5B services (atomic check-in, requeue, cancel, re-issue).
 */
@Injectable()
export class GalaOpsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAIL_TRANSPORT) private readonly mail: MailTransport,
  ) {}

  /** Events that have ticketing configured (id + labels only) — lets every gala role find "its" event without events.read. */
  async ticketedEvents() {
    const events = await this.prisma.event.findMany({
      where: { deletedAt: null, ticketConfig: { isNot: null } },
      select: { id: true, code: true, slug: true, titleEn: true, titleAr: true, status: true, startsAt: true, timezone: true },
      orderBy: { createdAt: 'asc' },
    });
    return events;
  }

  /**
   * Communication / background jobs of one event (ticket PDFs + e-mails), newest first, with the booking reference and
   * ticket number. `lastError` is already sanitised by the job runner (no e-mail addresses / tokens). The mail transport
   * name says whether e-mails can be delivered at all (`none` = no provider configured: jobs are parked as SKIPPED).
   */
  async jobs(eventId: string, q: JobQueryDto) {
    const where: Prisma.EventBookingJobWhereInput = {
      booking: { eventId, ...(q.search ? { publicReference: { contains: q.search } } : {}) },
      ...(q.status ? { status: q.status } : {}),
      ...(q.type ? { type: q.type } : {}),
    };
    const [rows, total, byStatus] = await this.prisma.$transaction([
      this.prisma.eventBookingJob.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true, type: true, template: true, status: true, attempts: true, nextRunAt: true, lastError: true, completedAt: true, createdAt: true, updatedAt: true, ticketId: true,
          booking: { select: { id: true, publicReference: true, bookingStatus: true, paymentStatus: true, isTest: true } },
        },
      }),
      this.prisma.eventBookingJob.count({ where }),
      this.prisma.eventBookingJob.groupBy({ by: ['status'], where: { booking: { eventId } }, orderBy: { status: 'asc' }, _count: { _all: true } }),
    ]);
    const ticketIds = rows.map((r) => r.ticketId).filter((x): x is string => !!x);
    const numbers = new Map((ticketIds.length ? await this.prisma.eventTicket.findMany({ where: { id: { in: ticketIds } }, select: { id: true, ticketNumber: true } }) : []).map((t) => [t.id, t.ticketNumber]));
    const items = rows.map(({ ticketId, ...r }) => ({ ...r, ticketId, ticketNumber: ticketId ? (numbers.get(ticketId) ?? null) : null }));
    const page = Paginated.of(items, total, q.page, q.pageSize);
    return {
      items: page.items,
      meta: page.meta,
      summary: Object.fromEntries(byStatus.map((s) => [s.status, (s._count as { _all: number })._all])),
      transport: { name: this.mail.name, delivers: this.mail.delivers },
    };
  }

  /**
   * Door lookup (lost phone / unreadable QR): minimal fields only — no e-mail, phone, dietary data or amounts. At most 10 rows.
   * Recording the check-in still needs the existing manual check-in endpoint (gala.checkin.manage).
   */
  async lookup(eventId: string, q: string) {
    const term = q.trim();
    const rows = await this.prisma.eventTicket.findMany({
      where: { eventId, OR: [{ ticketNumber: { contains: term.toUpperCase() } }, { guest: { fullName: { contains: term } } }] },
      take: 10,
      orderBy: [{ ticketNumber: 'asc' }],
      select: { id: true, ticketNumber: true, status: true, checkedInAt: true, guest: { select: { fullName: true } }, booking: { select: { bookingStatus: true, paymentStatus: true } } },
    });
    return rows.map((t) => ({
      ticketId: t.id,
      ticketNumber: t.ticketNumber,
      guestName: t.guest.fullName,
      status: t.status,
      checkedInAt: t.checkedInAt,
      bookingConfirmed: t.booking.bookingStatus === 'CONFIRMED' && t.booking.paymentStatus === 'PAID',
    }));
  }

  /** Check-in history of one event from the audit trail (scans, manual check-ins, rejections, undos), newest first. */
  async history(eventId: string, q: CheckInHistoryQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      action: q.kind ? CHECKIN_ACTIONS[q.kind] : { in: Object.values(CHECKIN_ACTIONS) },
      metadata: { path: '$.eventId', equals: eventId },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: { id: true, action: true, actorId: true, metadata: true, createdAt: true } }),
      this.prisma.auditLog.count({ where }),
    ]);
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
    const names = new Map((actorIds.length ? await this.prisma.adminUser.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
    const kindOf = Object.fromEntries(Object.entries(CHECKIN_ACTIONS).map(([k, v]) => [v, k]));
    const items = rows.map((r) => {
      const m = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        at: r.createdAt,
        kind: kindOf[r.action] ?? r.action,
        result: typeof m.result === 'string' ? m.result : r.action === CHECKIN_ACTIONS.rejected ? 'INVALID' : r.action === CHECKIN_ACTIONS.undo ? 'UNDONE' : 'VALID',
        ticketNumber: typeof m.ticketNumber === 'string' ? m.ticketNumber : null,
        actorName: r.actorId ? (names.get(r.actorId) ?? null) : null,
      };
    });
    return Paginated.of(items, total, q.page, q.pageSize);
  }
}
