import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { AuditService } from '../audit/audit.service';
import type { ActorContext } from '../../common/types/auth-request';
import { Paginated, parseSort } from '../../common/utils';
import { DonationConfigService } from '../donations/donation-config.service';
import { D, formatAmount } from '../donations/money';
import { PaymentProviderRegistry } from '../donations/payments/payment-provider.registry';
import { calendarAvailability } from './calendar';
import { GalaEmailComposer } from './gala-email.composer';
import { BookingAccess, GALA_NOTIFIER, sanitizeError, type GalaNotifier } from './gala-support';
import {
  calculateTotal,
  canTransitionBooking,
  canonical,
  findDuplicateGuests,
  generateBookingAttemptReference,
  generateBookingReference,
  generateTicketNumber,
  normalizeEmail,
  normalizeName,
  phoneIsValid,
} from './gala.rules';
import type { BookingQueryDto, CreateBookingDto, FinancialQueryDto, UpdateBookingDto } from './gala.dto';
import { GalaJobsService } from './gala-jobs.service';
import { TicketsService } from './tickets.service';
import { isPrintableGuestName } from './ticket-text';

const OPEN_ATTEMPT = ['CREATED', 'REQUIRES_ACTION', 'AUTHORIZED'] as const;
const KEY_PATTERN = /^[A-Za-z0-9_-]{16,80}$/;

export class GalaRuleViolation extends UnprocessableEntityException {
  constructor(message: string, code: string, details?: unknown) {
    super({ message, code, details });
  }
}

const adminBookingSelect = {
  id: true,
  publicReference: true,
  eventId: true,
  purchaserName: true,
  purchaserEmail: true,
  purchaserPhone: true,
  guestCount: true,
  unitPrice: true,
  totalAmount: true,
  currency: true,
  classification: true,
  bookingStatus: true,
  paymentStatus: true,
  paymentProvider: true,
  providerReference: true,
  refundedAmount: true,
  isTest: true,
  locale: true,
  paidAt: true,
  cancelledAt: true,
  cancelReason: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EventBookingSelect;

type AdminBooking = Prisma.EventBookingGetPayload<{ select: typeof adminBookingSelect }>;

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly access: BookingAccess,
    private readonly donationConfig: DonationConfigService,
    private readonly registry: PaymentProviderRegistry,
    private readonly tickets: TicketsService,
    private readonly composer: GalaEmailComposer,
    private readonly jobs: GalaJobsService,
    @Inject(GALA_NOTIFIER) private readonly notifier: GalaNotifier,
  ) {}

  // ───────────────────────── public: ticketing info ─────────────────────────

  private async publicEvent(slug: string) {
    const event = await this.prisma.event.findFirst({ where: { slug, deletedAt: null, status: 'PUBLISHED' }, include: { ticketConfig: true } });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  /** Seats counted against capacity: sold tickets + unpaid holds that are still within the hold window. */
  private async seatsTaken(tx: Pick<Prisma.TransactionClient, 'eventTicket'>, eventId: string) {
    const holdCutoff = new Date(Date.now() - this.config.get('EVENT_BOOKING_HOLD_MINUTES') * 60_000);
    return tx.eventTicket.count({
      where: {
        eventId,
        OR: [{ status: { in: ['ISSUED', 'CHECKED_IN'] } }, { status: 'PENDING', booking: { bookingStatus: 'PENDING', createdAt: { gt: holdCutoff } } }],
      },
    });
  }

  async ticketingInfo(slug: string) {
    const event = await this.publicEvent(slug);
    const cfg = event.ticketConfig;
    if (!cfg) throw new NotFoundException('Tickets are not available for this event');
    const [taken, { available }] = await Promise.all([cfg.capacity ? this.seatsTaken(this.prisma, event.id) : Promise.resolve(0), this.donationConfig.availability()]);
    const soldOut = cfg.capacity !== null && taken >= cfg.capacity;
    const cal = calendarAvailability(event);
    return {
      event: { slug: event.slug, name: cfg.displayNameEn, dateLabel: cfg.eventDateLabelEn, venue: cfg.venueLabelEn },
      ticket: { name: cfg.ticketNameEn, type: 'INDIVIDUAL', price: D(cfg.ticketPrice).toFixed(2), currency: cfg.currency, tablesAvailable: false, perGuest: true },
      classification: 'EVENT_TICKET_PAYMENT',
      salesOpen: cfg.salesEnabled && !soldOut,
      soldOut,
      maxTicketsPerBooking: cfg.maxTicketsPerBooking,
      checkoutAvailable: available,
      calendar: cal.available ? { available: true, url: this.composer.calendarUrl(event.slug) } : { available: false, reason: cal.reason },
    };
  }

  // ───────────────────────── public: create ─────────────────────────

  async create(slug: string, dto: CreateBookingDto, idempotencyKey: string | undefined) {
    if (!idempotencyKey || !KEY_PATTERN.test(idempotencyKey)) {
      throw new BadRequestException({ message: 'An Idempotency-Key header (16-80 chars, [A-Za-z0-9_-]) is required', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    }
    const requestHash = createHash('sha256').update(canonical({ slug, ...dto })).digest('hex');
    const existing = await this.prisma.eventBooking.findUnique({ where: { idempotencyKey } });
    if (existing) return this.replay(existing, requestHash);

    const event = await this.publicEvent(slug);
    const cfg = event.ticketConfig;
    if (!cfg || !cfg.salesEnabled) throw new GalaRuleViolation('Ticket sales are not open for this event', 'TICKET_SALES_CLOSED');

    const n = dto.guests.length;
    if (dto.ticketCount !== undefined && dto.ticketCount !== n) throw new GalaRuleViolation('ticketCount must equal the number of guests', 'TICKET_COUNT_MISMATCH');
    if (n > cfg.maxTicketsPerBooking) throw new GalaRuleViolation(`At most ${cfg.maxTicketsPerBooking} tickets can be booked at once`, 'TOO_MANY_TICKETS', { max: cfg.maxTicketsPerBooking });
    // DTO checks the phone shape; here we additionally require at least 7 digits.
    if ([dto.purchaser.phone, ...dto.guests.map((g) => g.phone)].some((p) => !phoneIsValid(p))) {
      throw new BadRequestException({ message: 'Phone numbers must contain at least 7 digits', code: 'INVALID_PHONE' });
    }
    const dup = findDuplicateGuests(dto.guests);
    if (dup.length) throw new GalaRuleViolation('Each guest needs a distinct e-mail address (one ticket per guest)', 'DUPLICATE_GUEST', { indexes: dup });

    const unprintable = dto.guests.flatMap((g, i) => (isPrintableGuestName(normalizeName(g.fullName)) ? [] : [i]));
    if (unprintable.length) {
      throw new GalaRuleViolation('Guest names must use Latin or Arabic letters so they can be printed correctly on the ticket', 'UNSUPPORTED_NAME_CHARACTERS', { indexes: unprintable });
    }

    const unitPrice = D(cfg.ticketPrice);
    const total = calculateTotal(unitPrice, n); // server-controlled; there is no client price field
    const locale = dto.locale ?? 'en';
    const isTest = this.registry.active()?.isTest ?? false;

    try {
      const booking = await this.prisma.$transaction(async (tx) => {
        // Serialise capacity decisions per event: lock the ticket config row for the rest of the transaction.
        await tx.$queryRaw`SELECT id FROM EventTicketConfig WHERE id = ${cfg.id} FOR UPDATE`;
        if (cfg.capacity !== null) {
          const taken = await this.seatsTaken(tx, event.id);
          if (taken + n > cfg.capacity) throw new GalaRuleViolation('Not enough tickets are left for this booking', 'INSUFFICIENT_CAPACITY');
        }
        const created = await tx.eventBooking.create({
          data: {
            publicReference: generateBookingReference(),
            accessTokenHash: '0'.repeat(64), // replaced below once the id exists
            idempotencyKey,
            idempotencyRequestHash: requestHash,
            eventId: event.id,
            purchaserName: normalizeName(dto.purchaser.fullName),
            purchaserEmail: normalizeEmail(dto.purchaser.email),
            purchaserPhone: dto.purchaser.phone.trim(),
            guestCount: n,
            unitPrice,
            totalAmount: total,
            currency: cfg.currency,
            isTest,
            locale,
          },
        });
        for (const [i, g] of dto.guests.entries()) {
          const guest = await tx.eventBookingGuest.create({
            data: {
              bookingId: created.id,
              position: i + 1,
              fullName: normalizeName(g.fullName),
              email: normalizeEmail(g.email),
              phone: g.phone.trim(),
              dietaryRequirements: g.dietaryRequirements.trim(),
              isPurchaser: g.isPurchaser === true,
            },
          });
          await tx.eventTicket.create({ data: { ticketNumber: generateTicketNumber(), bookingId: created.id, guestId: guest.id, eventId: event.id, status: 'PENDING' } });
        }
        return tx.eventBooking.update({ where: { id: created.id }, data: { accessTokenHash: this.access.hash(this.access.tokenFor(created.id)) } });
      });
      this.logger.log(`booking.created ref=${booking.publicReference} tickets=${n} test=${booking.isTest}`);
      void this.notifier.notify({ type: 'booking.pending', bookingId: booking.id, bookingReference: booking.publicReference }).catch(() => undefined);
      return this.createdView(booking);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const raced = await this.prisma.eventBooking.findUnique({ where: { idempotencyKey } });
        if (raced) return this.replay(raced, requestHash);
      }
      throw e;
    }
  }

  private replay(existing: Parameters<BookingsService['createdView']>[0] & { idempotencyRequestHash: string | null }, requestHash: string) {
    if (existing.idempotencyRequestHash !== requestHash) {
      throw new ConflictException({ message: 'Idempotency-Key was already used with different data', code: 'IDEMPOTENCY_KEY_REUSED' });
    }
    return { ...this.createdView(existing), replayed: true };
  }

  private createdView(b: { id: string; publicReference: string; bookingStatus: string; paymentStatus: string; guestCount: number; unitPrice: Prisma.Decimal; totalAmount: Prisma.Decimal; currency: string; isTest: boolean }) {
    return {
      reference: b.publicReference,
      /** Shown on creation (and on idempotent replay); required for status, checkout and ticket downloads. Store client-side only. */
      accessToken: this.access.tokenFor(b.id),
      bookingStatus: b.bookingStatus,
      paymentStatus: b.paymentStatus,
      ticketCount: b.guestCount,
      unitPrice: D(b.unitPrice).toFixed(2),
      totalAmount: D(b.totalAmount).toFixed(2),
      currency: b.currency,
      classification: 'EVENT_TICKET_PAYMENT' as const,
      isTest: b.isTest,
    };
  }

  // ───────────────────────── public: status / checkout ─────────────────────────

  /** Same 404 for an unknown reference and a wrong token (no enumeration). */
  async findForPurchaser(reference: string, token: string | undefined) {
    const notFound = new NotFoundException('Booking not found');
    if (!/^EB-[0-9A-Z]{12}$/.test(reference)) throw notFound;
    const booking = await this.prisma.eventBooking.findUnique({
      where: { publicReference: reference },
      include: { tickets: { orderBy: { createdAt: 'asc' }, select: { id: true, ticketNumber: true, status: true, pdfStorageKey: true } }, event: { include: { ticketConfig: true } } },
    });
    if (!booking || !this.access.verify(booking.accessTokenHash, token)) throw notFound;
    return booking;
  }

  /** Purchaser-safe view: no guest/purchaser personal data, provider ids or internals. */
  async publicStatus(reference: string, token: string | undefined) {
    const b = await this.findForPurchaser(reference, token);
    const confirmed = b.bookingStatus === 'CONFIRMED' && b.paymentStatus === 'PAID';
    const cfg = b.event.ticketConfig;
    const cal = calendarAvailability(b.event);
    let message: string;
    if (confirmed) message = 'confirmed';
    else if (b.bookingStatus === 'CANCELLED') message = 'cancelled';
    else if (b.bookingStatus === 'REFUNDED') message = 'refunded';
    else if (b.bookingStatus === 'REFUND_PENDING') message = 'refund_pending';
    else if (b.paymentStatus === 'FAILED') message = 'payment_failed';
    else if (b.paymentStatus === 'PENDING') message = 'processing';
    else message = 'awaiting_payment';
    return {
      reference: b.publicReference,
      bookingStatus: b.bookingStatus,
      paymentStatus: b.paymentStatus,
      /** true only after a verified provider event — never from the browser return URL */
      confirmed,
      message,
      ticketCount: b.guestCount,
      totalAmount: D(b.totalAmount).toFixed(2),
      currency: b.currency,
      classification: b.classification,
      event: cfg ? { slug: b.event.slug, name: cfg.displayNameEn, dateLabel: cfg.eventDateLabelEn, venue: cfg.venueLabelEn } : null,
      calendar: cal.available ? { available: true, url: this.composer.calendarUrl(b.event.slug) } : { available: false, reason: cal.reason },
      tickets: confirmed
        ? b.tickets.map((t) => ({ ticketNumber: t.ticketNumber, status: t.status, pdfReady: t.pdfStorageKey !== null, downloadPath: `/api/v1/public/bookings/${b.publicReference}/tickets/${t.ticketNumber}/pdf` }))
        : [],
    };
  }

  private returnUrls(slug: string, reference: string, locale: string) {
    const base = this.config.get('EVENT_BOOKING_RETURN_URL').replace('{locale}', locale === 'ar' ? 'ar' : 'en').replace('{slug}', slug);
    return { returnUrl: `${base}?reference=${reference}`, cancelUrl: `${base}?reference=${reference}&cancelled=1` };
  }

  /**
   * Provider-independent hosted-checkout initiation. Works only when every payment gate is open (env + provider record +
   * settings + adapter) AND ticket sales are open. The checkout page never confirms anything: only a verified webhook does.
   */
  async createCheckout(reference: string, token: string | undefined) {
    const b = await this.findForPurchaser(reference, token);
    if (b.paymentStatus === 'PAID' || b.bookingStatus === 'CONFIRMED') throw new ConflictException({ message: 'This booking is already paid', code: 'BOOKING_ALREADY_PAID' });
    if (b.bookingStatus !== 'PENDING') throw new GalaRuleViolation('This booking can no longer be paid', 'BOOKING_NOT_PAYABLE');
    const cfg = b.event.ticketConfig;
    if (!cfg?.salesEnabled || b.event.status !== 'PUBLISHED') throw new GalaRuleViolation('Ticket sales are not open for this event', 'TICKET_SALES_CLOSED');

    const adapter = await this.donationConfig.requireAdapter();
    if (adapter.capabilities.currencies && !adapter.capabilities.currencies.includes(b.currency)) {
      throw new GalaRuleViolation('Currency is not supported by the payment provider', 'CURRENCY_NOT_SUPPORTED');
    }

    const open = await this.prisma.eventBookingPaymentAttempt.findFirst({
      where: { bookingId: b.id, provider: adapter.code, status: { in: [...OPEN_ATTEMPT] }, expiresAt: { gt: new Date() }, checkoutUrl: { not: null } },
      orderBy: { initiatedAt: 'desc' },
    });
    if (open) return this.sessionView(open);

    const minor = await this.donationConfig.minorUnitsFn();
    const amount = D(b.totalAmount).toFixed(minor(b.currency));
    const attempt = await this.prisma.eventBookingPaymentAttempt.create({
      data: {
        reference: generateBookingAttemptReference(),
        bookingId: b.id,
        provider: adapter.code,
        amount: b.totalAmount,
        currency: b.currency,
        isTest: adapter.isTest,
        expiresAt: new Date(Date.now() + this.config.get('PAYMENT_SESSION_TTL_MINUTES') * 60_000),
      },
    });
    const urls = this.returnUrls(b.event.slug, b.publicReference, b.locale);
    try {
      const session = await adapter.createPaymentSession({
        attemptReference: attempt.reference,
        donationReference: b.publicReference,
        classification: 'EVENT_TICKET_PAYMENT',
        amount,
        currency: b.currency,
        description: `${cfg.displayNameEn} — ${b.guestCount} ticket${b.guestCount === 1 ? '' : 's'}`,
        locale: b.locale,
        returnUrl: urls.returnUrl,
        cancelUrl: urls.cancelUrl,
      });
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.eventBooking.updateMany({
          where: { id: b.id, bookingStatus: 'PENDING', paymentStatus: { in: ['UNPAID', 'FAILED'] } },
          data: { paymentStatus: 'PENDING', paymentProvider: adapter.code, providerReference: session.sessionRef, isTest: adapter.isTest },
        });
        return tx.eventBookingPaymentAttempt.update({
          where: { id: attempt.id },
          data: { providerSessionRef: session.sessionRef, checkoutUrl: session.checkoutUrl, status: 'REQUIRES_ACTION', ...(session.expiresAt ? { expiresAt: session.expiresAt } : {}) },
        });
      });
      return this.sessionView(updated);
    } catch (e) {
      await this.prisma.eventBookingPaymentAttempt.update({
        where: { id: attempt.id },
        data: { status: 'FAILED', failureCode: 'SESSION_CREATE_FAILED', failureReason: sanitizeError((e as Error).message), completedAt: new Date() },
      });
      this.logger.error(`ticket checkout session failed ref=${b.publicReference}: ${sanitizeError((e as Error).message)}`);
      throw new BadGatewayException({ message: 'The payment provider is unavailable, please try again', code: 'PROVIDER_UNAVAILABLE' });
    }
  }

  private sessionView(a: { reference: string; checkoutUrl: string | null; expiresAt: Date | null; provider: string; isTest: boolean }) {
    return { attemptReference: a.reference, checkoutUrl: a.checkoutUrl, expiresAt: a.expiresAt, provider: a.provider, isTest: a.isTest };
  }

  /** Public event calendar (event details are public; no booking data). 409 CALENDAR_PENDING until the schedule is confirmed. */
  async eventCalendarSource(slug: string) {
    const event = await this.publicEvent(slug);
    const cfg = event.ticketConfig;
    return {
      uid: `${event.code}@meki`,
      name: cfg?.displayNameEn ?? event.titleEn,
      description: event.shortDescEn,
      location: cfg?.venueLabelEn ?? ([event.venueNameEn, event.city].filter(Boolean).join(', ') || null),
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timezone: event.timezone,
    };
  }

  // ───────────────────────── admin ─────────────────────────

  private adminView(b: AdminBooking) {
    return { ...b, unitPrice: D(b.unitPrice).toFixed(2), totalAmount: D(b.totalAmount).toFixed(2), refundedAmount: D(b.refundedAmount).toFixed(2) };
  }

  async adminList(eventId: string, q: BookingQueryDto) {
    const where: Prisma.EventBookingWhereInput = {
      eventId,
      ...(q.includeTest === 'true' ? {} : { isTest: false }),
      ...(q.bookingStatus ? { bookingStatus: q.bookingStatus } : {}),
      ...(q.paymentStatus ? { paymentStatus: q.paymentStatus } : {}),
      ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {}),
      ...(q.search
        ? { OR: [{ publicReference: { contains: q.search } }, { purchaserName: { contains: q.search } }, { purchaserEmail: { contains: q.search } }, { guests: { some: { OR: [{ fullName: { contains: q.search } }, { email: { contains: q.search } }] } } }] }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.eventBooking.findMany({
        where,
        select: adminBookingSelect,
        orderBy: parseSort(q.sort, ['createdAt', 'totalAmount', 'bookingStatus', 'paymentStatus'], { createdAt: 'desc' }),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.eventBooking.count({ where }),
    ]);
    return Paginated.of(items.map((b) => this.adminView(b)), total, q.page, q.pageSize);
  }

  async adminGet(eventId: string, bookingId: string) {
    const b = await this.prisma.eventBooking.findFirst({
      where: { id: bookingId, eventId },
      select: {
        ...adminBookingSelect,
        guests: {
          orderBy: { position: 'asc' },
          select: { id: true, position: true, fullName: true, email: true, phone: true, dietaryRequirements: true, isPurchaser: true, ticket: { select: { id: true, ticketNumber: true, status: true, issuedAt: true, checkedInAt: true, revokedAt: true, pdfGeneratedAt: true } } },
        },
        attempts: { orderBy: { initiatedAt: 'desc' }, select: { reference: true, provider: true, status: true, amount: true, currency: true, failureCode: true, initiatedAt: true, completedAt: true } },
        transactions: { orderBy: { occurredAt: 'asc' }, select: { id: true, type: true, status: true, classification: true, amount: true, currency: true, provider: true, providerTransactionRef: true, occurredAt: true } },
      },
    });
    if (!b) throw new NotFoundException('Booking not found');
    const { guests, attempts, transactions, ...rest } = b;
    return {
      ...this.adminView(rest as AdminBooking),
      guests: guests.map((g) => ({ ...g, ticket: g.ticket ? { ...g.ticket, hasPdf: g.ticket.pdfGeneratedAt !== null, pdfGeneratedAt: undefined } : null })),
      attempts: attempts.map((a) => ({ ...a, amount: D(a.amount).toFixed(2) })),
      transactions: transactions.map((t) => ({ ...t, amount: D(t.amount).toFixed(2) })),
      jobs: await this.jobs.jobsFor(b.id),
    };
  }

  async adminUpdate(eventId: string, bookingId: string, dto: UpdateBookingDto, actor: ActorContext) {
    const b = await this.prisma.eventBooking.findFirst({ where: { id: bookingId, eventId }, include: { guests: { include: { ticket: true } } } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.bookingStatus !== 'PENDING' && b.bookingStatus !== 'CONFIRMED') throw new ConflictException({ message: `A ${b.bookingStatus} booking cannot be edited`, code: 'BOOKING_NOT_EDITABLE' });

    const byId = new Map(b.guests.map((g) => [g.id, g]));
    const rename: string[] = [];
    const changed = new Set<string>();
    for (const u of dto.guests ?? []) {
      const g = byId.get(u.id);
      if (!g) throw new BadRequestException({ message: 'Guest does not belong to this booking', code: 'GUEST_NOT_IN_BOOKING' });
      if (u.fullName !== undefined && normalizeName(u.fullName) !== g.fullName) {
        if (g.ticket?.status === 'CHECKED_IN') throw new GalaRuleViolation('The name on a checked-in ticket cannot be changed', 'TICKET_CHECKED_IN');
        if (g.ticket?.status === 'ISSUED') rename.push(g.ticket.id);
      }
    }
    const next = b.guests.map((g) => {
      const u = dto.guests?.find((x) => x.id === g.id);
      return { fullName: u?.fullName ? normalizeName(u.fullName) : g.fullName, email: u?.email ? normalizeEmail(u.email) : g.email };
    });
    if (findDuplicateGuests(next).length) throw new GalaRuleViolation('Each guest needs a distinct e-mail address', 'DUPLICATE_GUEST');
    if (next.some((g) => !isPrintableGuestName(g.fullName))) throw new GalaRuleViolation('Guest names must use Latin or Arabic letters so they can be printed correctly on the ticket', 'UNSUPPORTED_NAME_CHARACTERS');
    if ([dto.purchaserPhone, ...(dto.guests ?? []).map((g) => g.phone)].some((p) => p !== undefined && !phoneIsValid(p))) {
      throw new BadRequestException({ message: 'Phone numbers must contain at least 7 digits', code: 'INVALID_PHONE' });
    }

    await this.prisma.$transaction(async (tx) => {
      const purchaser = {
        ...(dto.purchaserName !== undefined ? { purchaserName: normalizeName(dto.purchaserName) } : {}),
        ...(dto.purchaserEmail !== undefined ? { purchaserEmail: normalizeEmail(dto.purchaserEmail) } : {}),
        ...(dto.purchaserPhone !== undefined ? { purchaserPhone: dto.purchaserPhone.trim() } : {}),
      };
      if (Object.keys(purchaser).length) {
        await tx.eventBooking.update({ where: { id: b.id }, data: purchaser });
        Object.keys(purchaser).forEach((k) => changed.add(k));
      }
      for (const u of dto.guests ?? []) {
        const data = {
          ...(u.fullName !== undefined ? { fullName: normalizeName(u.fullName) } : {}),
          ...(u.email !== undefined ? { email: normalizeEmail(u.email) } : {}),
          ...(u.phone !== undefined ? { phone: u.phone.trim() } : {}),
          ...(u.dietaryRequirements !== undefined ? { dietaryRequirements: u.dietaryRequirements.trim() } : {}),
        };
        if (Object.keys(data).length) {
          await tx.eventBookingGuest.update({ where: { id: u.id }, data });
          Object.keys(data).forEach((k) => changed.add(`guest.${k}`));
        }
      }
      await this.audit.record(actor, 'gala.booking.update', 'EventBooking', b.id, { fields: [...changed], renamedIssuedTickets: rename.length }, tx);
    });

    // A renamed, already-issued ticket must carry the new name: rotate its QR token and regenerate the PDF.
    for (const ticketId of rename) await this.tickets.reissue(ticketId, actor, 'guest-name-changed');
    return this.adminGet(eventId, bookingId);
  }

  /**
   * Cancel. Unpaid booking → CANCELLED (tickets revoked). Paid booking → REFUND_PENDING (tickets revoked; the refund itself
   * is executed with the fiscal sponsor and only a verified provider event completes it). Nothing is deleted.
   */
  async adminCancel(eventId: string, bookingId: string, reason: string, actor: ActorContext) {
    const b = await this.prisma.eventBooking.findFirst({ where: { id: bookingId, eventId }, include: { tickets: true } });
    if (!b) throw new NotFoundException('Booking not found');
    const paid = b.paymentStatus === 'PAID';
    const to = paid ? 'REFUND_PENDING' : 'CANCELLED';
    if (b.bookingStatus === 'CANCELLED' || b.bookingStatus === 'REFUNDED' || b.bookingStatus === 'REFUND_PENDING' || !canTransitionBooking(b.bookingStatus, to)) {
      throw new ConflictException({ message: `Booking is already ${b.bookingStatus}`, code: 'BOOKING_NOT_CANCELLABLE' });
    }
    if (b.tickets.some((t) => t.status === 'CHECKED_IN')) {
      throw new GalaRuleViolation('A booking with checked-in guests cannot be cancelled', 'TICKET_CHECKED_IN');
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.eventBooking.updateMany({
        where: { id: b.id, bookingStatus: b.bookingStatus, paymentStatus: b.paymentStatus },
        data: { bookingStatus: to, cancelledAt: now, cancelReason: reason },
      });
      if (moved.count !== 1) throw new ConflictException({ message: 'Booking changed concurrently', code: 'BOOKING_CONFLICT' });
      await tx.eventTicket.updateMany({
        where: { bookingId: b.id, status: { in: ['PENDING', 'ISSUED'] } },
        data: { status: 'REVOKED', revokedAt: now, revokedById: actor.userId, revokeReason: `booking cancelled: ${reason}`.slice(0, 500) },
      });
      await this.audit.record(actor, 'gala.booking.cancel', 'EventBooking', b.id, { from: b.bookingStatus, to, paymentStatus: b.paymentStatus, reason }, tx);
    });
    void this.notifier.notify({ type: 'booking.cancelled', bookingId: b.id, bookingReference: b.publicReference }).catch(() => undefined);
    return this.adminGet(eventId, bookingId);
  }

  async regenerateTickets(eventId: string, bookingId: string, actor: ActorContext) {
    const b = await this.prisma.eventBooking.findFirst({ where: { id: bookingId, eventId }, select: { id: true, bookingStatus: true, paymentStatus: true } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.bookingStatus !== 'CONFIRMED' || b.paymentStatus !== 'PAID') throw new GalaRuleViolation('Tickets exist only for confirmed, paid bookings', 'BOOKING_NOT_CONFIRMED');
    const r = await this.tickets.regenerateMissing(b.id, actor);
    await this.audit.record(actor, 'gala.booking.regenerate_tickets', 'EventBooking', b.id, r);
    return r;
  }

  /**
   * Ticket revenue summary — read ONLY from the ticket ledger, always labelled EVENT_TICKET_PAYMENT. These amounts are never
   * part of donation totals or reports. No fair-market-value / deductible amount exists (not supplied by the client);
   * the sponsor (SDI) determines any tax treatment and issues any receipts.
   */
  async financials(eventId: string, q: FinancialQueryDto) {
    const test = q.includeTest === 'true' ? {} : { isTest: false };
    const base = { booking: { eventId }, classification: 'EVENT_TICKET_PAYMENT' as const, ...test };
    const [captured, refunded, bookings, tickets] = await Promise.all([
      this.prisma.eventBookingTransaction.aggregate({ where: { ...base, type: 'CAPTURE', status: 'SUCCEEDED' }, _sum: { amount: true }, _count: true }),
      this.prisma.eventBookingTransaction.aggregate({ where: { ...base, type: 'REFUND', status: 'SUCCEEDED' }, _sum: { amount: true }, _count: true }),
      this.prisma.eventBooking.groupBy({ by: ['bookingStatus'], where: { eventId, ...test }, _count: true }),
      this.prisma.eventTicket.groupBy({ by: ['status'], where: { eventId, booking: { ...test } }, _count: true }),
    ]);
    const gross = D(captured._sum.amount ?? 0);
    const refundedAmt = D(refunded._sum.amount ?? 0);
    const cfg = await this.prisma.eventTicketConfig.findUnique({ where: { eventId } });
    const currency = cfg?.currency ?? 'USD';
    return {
      classification: 'EVENT_TICKET_PAYMENT',
      currency,
      grossCaptured: formatAmount(gross, 2),
      refunded: formatAmount(refundedAmt, 2),
      net: formatAmount(gross.minus(refundedAmt), 2),
      capturedPayments: captured._count,
      refundPayments: refunded._count,
      bookingsByStatus: Object.fromEntries(bookings.map((x) => [x.bookingStatus, x._count])),
      ticketsByStatus: Object.fromEntries(tickets.map((x) => [x.status, x._count])),
      includesTestRecords: q.includeTest === 'true',
      taxTreatment: {
        taxDeductibleAmount: null,
        fairMarketValueProvided: false,
        note: 'Ticket revenue is not a charitable donation. No fair-market-value has been provided; the fiscal sponsor (SDI) determines any tax treatment and issues any receipts. MEKI generates no tax receipts for tickets.',
      },
    };
  }
}
