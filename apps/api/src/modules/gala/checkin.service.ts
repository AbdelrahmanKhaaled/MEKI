import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { ActorContext } from '../../common/types/auth-request';
import { bookingIsConfirmedAndPaid, evaluateTicketForCheckIn, hashQrToken, QR_TOKEN_PATTERN, type CheckInResult } from './gala.rules';

export interface CheckInResponse {
  result: CheckInResult;
  /** Present only for a located ticket in this event; INVALID reveals nothing */
  ticket?: { ticketNumber: string; guestName: string; bookingReference: string; status: string; checkedInAt: Date | null };
}

@Injectable()
export class CheckInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Validates a scanned QR token for ONE event and (unless verifyOnly) checks the guest in.
   * The write is a single conditional UPDATE (… WHERE status = 'ISSUED' AND qrTokenHash = ?): of two simultaneous scans
   * exactly one sees count = 1 (VALID); the other gets ALREADY_CHECKED_IN. Tokens of other events are INVALID here.
   */
  async validate(eventId: string, token: string, actor: ActorContext, verifyOnly = false): Promise<CheckInResponse> {
    if (!QR_TOKEN_PATTERN.test(token)) {
      if (!verifyOnly) await this.audit.record(actor, 'gala.checkin.rejected', 'EventTicket', null, { result: 'INVALID', reason: 'malformed-token', eventId });
      return { result: 'INVALID' };
    }
    const hash = hashQrToken(token);
    const ticket = await this.prisma.eventTicket.findUnique({
      where: { qrTokenHash: hash },
      include: { guest: { select: { fullName: true } }, booking: { select: { publicReference: true, bookingStatus: true, paymentStatus: true } } },
    });
    if (!ticket || ticket.eventId !== eventId) {
      if (!verifyOnly) await this.audit.record(actor, 'gala.checkin.rejected', 'EventTicket', null, { result: 'INVALID', reason: ticket ? 'wrong-event' : 'unknown-token', tokenHashPrefix: hash.slice(0, 8), eventId });
      return { result: 'INVALID' };
    }
    const view = (t: { ticketNumber: string; status: string; checkedInAt: Date | null }): CheckInResponse['ticket'] => ({
      ticketNumber: t.ticketNumber,
      guestName: ticket.guest.fullName,
      bookingReference: ticket.booking.publicReference,
      status: t.status,
      checkedInAt: t.checkedInAt,
    });

    let result = evaluateTicketForCheckIn(ticket, ticket.booking);
    if (result === 'VALID' && !verifyOnly) {
      const now = new Date();
      const moved = await this.prisma.eventTicket.updateMany({
        where: { id: ticket.id, status: 'ISSUED', qrTokenHash: hash, booking: { bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' } },
        data: { status: 'CHECKED_IN', checkedInAt: now, checkedInById: actor.userId },
      });
      if (moved.count === 1) {
        await this.audit.record(actor, 'gala.checkin.checked_in', 'EventTicket', ticket.id, { ticketNumber: ticket.ticketNumber, eventId });
        return { result: 'VALID', ticket: view({ ticketNumber: ticket.ticketNumber, status: 'CHECKED_IN', checkedInAt: now }) };
      }
      // Lost the race (or the state changed between read and write): report the real current state.
      const fresh = await this.prisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id }, include: { booking: { select: { bookingStatus: true, paymentStatus: true } } } });
      result = evaluateTicketForCheckIn(fresh, fresh.booking);
      if (result === 'VALID') result = 'PAYMENT_NOT_CONFIRMED';
      await this.audit.record(actor, 'gala.checkin.rejected', 'EventTicket', ticket.id, { result, ticketNumber: ticket.ticketNumber, eventId });
      return { result, ticket: view({ ticketNumber: fresh.ticketNumber, status: fresh.status, checkedInAt: fresh.checkedInAt }) };
    }
    if (result !== 'VALID' && !verifyOnly) {
      await this.audit.record(actor, 'gala.checkin.rejected', 'EventTicket', ticket.id, { result, ticketNumber: ticket.ticketNumber, eventId });
    }
    return { result, ticket: view(ticket) };
  }

  /** Manual check-in by ticket (lost phone, damaged QR). Same atomic guard and payment requirement. */
  async manualCheckIn(eventId: string, ticketId: string, actor: ActorContext) {
    const ticket = await this.prisma.eventTicket.findFirst({ where: { id: ticketId, eventId }, include: { booking: { select: { bookingStatus: true, paymentStatus: true } } } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const decision = evaluateTicketForCheckIn(ticket, ticket.booking);
    if (decision !== 'VALID') throw new UnprocessableEntityException({ message: `Ticket cannot be checked in: ${decision}`, code: decision });
    const moved = await this.prisma.eventTicket.updateMany({
      where: { id: ticket.id, status: 'ISSUED', booking: { bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' } },
      data: { status: 'CHECKED_IN', checkedInAt: new Date(), checkedInById: actor.userId },
    });
    if (moved.count !== 1) throw new ConflictException({ message: 'Ticket was already checked in or changed', code: 'ALREADY_CHECKED_IN' });
    await this.audit.record(actor, 'gala.checkin.manual', 'EventTicket', ticket.id, { ticketNumber: ticket.ticketNumber, eventId });
    return { ticketNumber: ticket.ticketNumber, status: 'CHECKED_IN' };
  }

  /** Audited undo of an erroneous check-in. The ticket must still belong to a confirmed, paid booking. */
  async undo(eventId: string, ticketId: string, reason: string, actor: ActorContext) {
    const ticket = await this.prisma.eventTicket.findFirst({ where: { id: ticketId, eventId }, include: { booking: true } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status !== 'CHECKED_IN') throw new ConflictException({ message: 'Ticket is not checked in', code: 'NOT_CHECKED_IN' });
    if (!bookingIsConfirmedAndPaid(ticket.booking)) throw new UnprocessableEntityException({ message: 'The booking is no longer confirmed', code: 'PAYMENT_NOT_CONFIRMED' });
    const moved = await this.prisma.eventTicket.updateMany({ where: { id: ticket.id, status: 'CHECKED_IN' }, data: { status: 'ISSUED', checkedInAt: null, checkedInById: null } });
    if (moved.count !== 1) throw new ConflictException({ message: 'Ticket changed concurrently', code: 'TICKET_CONFLICT' });
    await this.audit.record(actor, 'gala.checkin.undo', 'EventTicket', ticket.id, { ticketNumber: ticket.ticketNumber, reason, previousCheckedInAt: ticket.checkedInAt?.toISOString(), eventId });
    return { ticketNumber: ticket.ticketNumber, status: 'ISSUED' };
  }

  async statistics(eventId: string) {
    const grouped = await this.prisma.eventTicket.groupBy({ by: ['status'], where: { eventId }, _count: true });
    const c = Object.fromEntries(grouped.map((x) => [x.status, x._count])) as Record<string, number>;
    const admitted = c.CHECKED_IN ?? 0;
    const valid = (c.ISSUED ?? 0) + admitted;
    return {
      eventId,
      validTickets: valid,
      checkedIn: admitted,
      remaining: c.ISSUED ?? 0,
      percentCheckedIn: valid ? Math.round((admitted / valid) * 1000) / 10 : 0,
      byStatus: { PENDING: c.PENDING ?? 0, ISSUED: c.ISSUED ?? 0, CHECKED_IN: admitted, REVOKED: c.REVOKED ?? 0, REFUNDED: c.REFUNDED ?? 0 },
    };
  }
}
