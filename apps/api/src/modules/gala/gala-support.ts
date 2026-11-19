import { BadGatewayException, ConflictException, Injectable, NotFoundException, type PipeTransform } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { MailTemplate } from './gala-email.templates';

/** Purchaser-facing access token: HMAC-derived (replays of the create call return the same token); only its SHA-256 is stored. */
@Injectable()
export class BookingAccess {
  constructor(private readonly config: AppConfigService) {}

  tokenFor(bookingId: string): string {
    const secret = this.config.get('EVENT_BOOKING_TOKEN_SECRET') ?? this.config.get('DONATION_TOKEN_SECRET');
    if (!secret) throw new BadGatewayException('Booking tokens are not configured');
    return createHmac('sha256', secret).update(`event-booking:${bookingId}`).digest('base64url');
  }

  hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Constant-time comparison; the same 404 is used for "unknown reference" and "wrong token". */
  verify(storedHash: string, token: string | undefined): boolean {
    if (!token || token.length > 100) return false;
    const given = Buffer.from(this.hash(token), 'hex');
    const stored = Buffer.from(storedHash, 'hex');
    return given.length === stored.length && timingSafeEqual(given, stored);
  }
}

export const GALA_NOTIFIER = Symbol('GALA_NOTIFIER');

export interface GalaNotificationInput {
  type: MailTemplate;
  bookingId: string;
  /** Booking reference — the only identifier a delivery adapter may log */
  bookingReference: string;
  /** For ticket.delivery: one message per guest ticket */
  ticketId?: string;
}

/**
 * Outbound booking notifications. The implementation (GalaJobsService) enqueues a retryable e-mail job; delivery goes through
 * the configured MailTransport and says so when no provider exists.
 */
export interface GalaNotifier {
  notify(input: GalaNotificationInput): Promise<void>;
}

/** Shared event/booking loaders used by several services. */
@Injectable()
export class GalaLookup {
  constructor(private readonly prisma: PrismaService) {}

  /** Event + ticket config scoped lookup for admin routes; same 404 for "no such event" and "event has no ticketing". */
  async adminEvent(eventId: string) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, deletedAt: null }, include: { ticketConfig: true } });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }
}

/** Never lets an e-mail address, QR token or long provider message reach the database or the logs. */
export function sanitizeError(message: string): string {
  return message
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/mkt_[A-Za-z0-9_-]+/g, '[token]')
    .replace(/\s+/g, ' ')
    .slice(0, 300);
}

/** Strict identifier shape for route parameters (cuid / reference style). Anything else is a plain 404 — no NUL bytes, traversal or odd encodings reach a query. */
export class SafeIdPipe implements PipeTransform<string, string> {
  transform(value: string) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{6,40}$/.test(value)) throw new NotFoundException();
    return value;
  }
}

/**
 * Phase 12 — SDI decision: for a booking sold through SDI's Zeffy-hosted form, Zeffy issues the official tickets, PDFs, QR codes
 * and check-in. MEKI must never issue, regenerate, re-send or e-mail a second set.
 */
export class ZeffyOwnedTickets extends ConflictException {
  constructor() {
    super({ message: 'Tickets for this booking are issued and delivered by Zeffy (SDI). MEKI does not issue, regenerate or send tickets for it.', code: 'TICKETS_OWNED_BY_ZEFFY' });
  }
}

export async function assertMekiIssued(prisma: Pick<PrismaService, 'eventBooking'>, bookingId: string) {
  const b = await prisma.eventBooking.findUnique({ where: { id: bookingId }, select: { ticketIssuer: true } });
  if (b?.ticketIssuer === 'ZEFFY') throw new ZeffyOwnedTickets();
}
