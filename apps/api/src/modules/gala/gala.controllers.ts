import { Body, ConflictException, Controller, NotFoundException, type PipeTransform, Get, Headers, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Actor, CurrentUser, Public, RequirePermissions, SkipCsrf } from '../../common/decorators';
import { DONATION_THROTTLE, STATUS_THROTTLE } from '../../common/rate-limit';
import type { ActorContext, AuthUser } from '../../common/types/auth-request';
import { buildIcs } from './calendar';
import { BookingsService } from './bookings.service';
import { CheckInService } from './checkin.service';
import {
  BookingQueryDto,
  BookingTokenQueryDto,
  CreateBookingDto,
  CreateHostedBookingDto,
  FinancialQueryDto,
  GuestExportQueryDto,
  GuestQueryDto,
  ReasonDto,
  TicketQueryDto,
  UpdateBookingDto,
  ValidateCheckInDto,
} from './gala.dto';
import { GalaLookup, SafeIdPipe } from './gala-support';
import { GalaJobsService } from './gala-jobs.service';
import { GuestsService } from './guests.service';
import { CreateTicketConfigDto, TicketConfigService, UpdateTicketConfigDto } from './ticket-config.service';
import { TicketsService } from './tickets.service';

/** Ticket numbers are TK- + 10 Crockford characters: anything else (NUL bytes, traversal, odd encodings) is a plain 404. */
class TicketNumberPipe implements PipeTransform<string, string> {
  transform(value: string) {
    if (!/^TK-[0-9A-HJKMNP-TV-Z]{10}$/.test(value)) throw new NotFoundException();
    return value;
  }
}

const noStore = (res: Response) => res.setHeader('Cache-Control', 'private, no-store').setHeader('X-Content-Type-Options', 'nosniff');

// ─────────────────────────────── public ───────────────────────────────

@ApiTags('Public · Event tickets')
@Public()
@Controller('public/events')
export class PublicEventTicketsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get(':slug/ticketing')
  @Throttle(STATUS_THROTTLE)
  @ApiOperation({ summary: 'Ticket offer for a published event: server-controlled price (decimal string), limits, sales/checkout availability, calendar availability' })
  ticketing(@Param('slug') slug: string) {
    return this.bookings.ticketingInfo(slug);
  }

  @Post(':slug/bookings')
  @SkipCsrf()
  @Throttle(DONATION_THROTTLE)
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Client-generated unique key (16-80 chars). Replays return the same booking.' })
  @ApiOperation({ summary: 'Create a PENDING ticket booking (one ticket per guest). The price is calculated by the server; no payment is taken here.' })
  create(@Param('slug') slug: string, @Body() dto: CreateBookingDto, @Headers('idempotency-key') key: string | undefined) {
    return this.bookings.create(slug, dto, key);
  }

  /** Phase 12 — SDI hosted model: reserve a MEKI booking reference, then pay on SDI's Zeffy form. */
  @Post(':slug/hosted-bookings')
  @SkipCsrf()
  @Throttle(DONATION_THROTTLE)
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Client-generated unique key (16-80 chars). Replays return the same reference.' })
  @ApiOperation({ summary: 'Create a PENDING booking reference for SDI\'s hosted Zeffy ticket form. No payment, guest list or MEKI ticket; confirmation only via an approved SDI report.' })
  createHosted(@Param('slug') slug: string, @Body() dto: CreateHostedBookingDto, @Headers('idempotency-key') key: string | undefined) {
    return this.bookings.createHosted(slug, dto, key);
  }

  @Get(':slug/calendar.ics')
  @Throttle(STATUS_THROTTLE)
  @ApiOperation({ summary: 'iCalendar file for the event. 409 CALENDAR_PENDING until the schedule (time + timezone) is confirmed.' })
  async calendar(@Param('slug') slug: string, @Res() res: Response) {
    const ics = buildIcs(await this.bookings.eventCalendarSource(slug));
    if (!ics) throw new ConflictException({ message: 'The event schedule has not been confirmed yet', code: 'CALENDAR_PENDING' });
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8').setHeader('Content-Disposition', `attachment; filename="${slug}.ics"`).setHeader('Cache-Control', 'public, max-age=300');
    res.send(ics);
  }
}

@ApiTags('Public · Event tickets')
@Public()
@Controller('public/bookings')
export class PublicBookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly tickets: TicketsService,
  ) {}

  @Get(':reference/status')
  @Throttle(STATUS_THROTTLE)
  @ApiHeader({ name: 'X-Booking-Token', required: false })
  @ApiOperation({ summary: 'Purchaser-safe status (no personal data). confirmed=true only after a verified provider event.' })
  status(@Param('reference') reference: string, @Headers('x-booking-token') header: string | undefined, @Query() q: BookingTokenQueryDto) {
    return this.bookings.publicStatus(reference, header ?? q.token);
  }

  @Get(':reference/confirmation')
  @Throttle(STATUS_THROTTLE)
  @ApiHeader({ name: 'X-Booking-Token', required: false })
  @ApiOperation({ summary: 'Confirmation page data (same safe view; the browser return URL itself never confirms payment)' })
  confirmation(@Param('reference') reference: string, @Headers('x-booking-token') header: string | undefined, @Query() q: BookingTokenQueryDto) {
    return this.bookings.publicStatus(reference, header ?? q.token);
  }

  @Post(':reference/checkout')
  @HttpCode(200)
  @SkipCsrf()
  @Throttle(DONATION_THROTTLE)
  @ApiHeader({ name: 'X-Booking-Token', required: true })
  @ApiOperation({ summary: 'Start (or reuse) a provider-hosted checkout for the booking. 503 PAYMENTS_UNAVAILABLE until a provider is approved and enabled.' })
  checkout(@Param('reference') reference: string, @Headers('x-booking-token') token: string | undefined) {
    return this.bookings.createCheckout(reference, token);
  }

  @Get(':reference/tickets/:ticketNumber/pdf')
  @Throttle(STATUS_THROTTLE)
  @ApiHeader({ name: 'X-Booking-Token', required: false })
  @ApiOperation({ summary: 'Download one guest ticket (PDF). Needs the booking token; only for confirmed, paid bookings and valid tickets.' })
  async pdf(@Param('reference') reference: string, @Param('ticketNumber', TicketNumberPipe) ticketNumber: string, @Headers('x-booking-token') header: string | undefined, @Query() q: BookingTokenQueryDto, @Res() res: Response) {
    const booking = await this.bookings.findForPurchaser(reference, header ?? q.token);
    const file = await this.tickets.pdfFor({
      bookingId: booking.id,
      ticketNumber,
      status: { in: ['ISSUED', 'CHECKED_IN'] },
      booking: { bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' },
    });
    noStore(res).setHeader('Content-Type', 'application/pdf').setHeader('Content-Disposition', `attachment; filename="${file.ticketNumber}.pdf"`);
    res.send(file.body);
  }
}

// ─────────────────────────────── admin ───────────────────────────────

@ApiTags('Admin · Gala ticketing')
@ApiCookieAuth()
@Controller('admin/events/:eventId')
export class AdminGalaController {
  constructor(
    private readonly lookup: GalaLookup,
    private readonly bookings: BookingsService,
    private readonly tickets: TicketsService,
    private readonly guests: GuestsService,
    private readonly checkIn: CheckInService,
    private readonly config: TicketConfigService,
    private readonly jobs: GalaJobsService,
  ) {}

  // ── ticket configuration ──

  @Get('ticketing') @RequirePermissions('gala.bookings.read')
  @ApiOperation({ summary: 'Ticket sale configuration (server-controlled price, limits, sales switch)' })
  async getConfig(@Param('eventId', SafeIdPipe) eventId: string) {
    await this.lookup.adminEvent(eventId);
    return this.config.get(eventId);
  }

  @Post('ticketing') @RequirePermissions('events.manage')
  @ApiOperation({ summary: 'Create the ticket configuration (sales start CLOSED; opening them needs events.approve)' })
  async createConfig(@Param('eventId', SafeIdPipe) eventId: string, @Body() dto: CreateTicketConfigDto, @Actor() actor: ActorContext) {
    await this.lookup.adminEvent(eventId);
    return this.config.create(eventId, dto, actor);
  }

  @Patch('ticketing') @RequirePermissions('events.manage')
  @ApiOperation({ summary: 'Update price/limits/labels; salesEnabled additionally requires events.approve' })
  async updateConfig(@Param('eventId', SafeIdPipe) eventId: string, @Body() dto: UpdateTicketConfigDto, @CurrentUser() user: AuthUser, @Actor() actor: ActorContext) {
    await this.lookup.adminEvent(eventId);
    return this.config.update(eventId, dto, user, actor);
  }

  // ── bookings ──

  @Get('bookings') @RequirePermissions('gala.bookings.read')
  @ApiOperation({ summary: 'List/search/filter bookings (test-provider bookings excluded unless includeTest=true)' })
  async listBookings(@Param('eventId', SafeIdPipe) eventId: string, @Query() q: BookingQueryDto) {
    await this.lookup.adminEvent(eventId);
    return this.bookings.adminList(eventId, q);
  }

  @Get('bookings/:bookingId') @RequirePermissions('gala.bookings.read')
  @ApiOperation({ summary: 'Booking with guests, tickets, payment attempts and ledger entries' })
  async getBooking(@Param('eventId', SafeIdPipe) eventId: string, @Param('bookingId', SafeIdPipe) bookingId: string) {
    await this.lookup.adminEvent(eventId);
    return this.bookings.adminGet(eventId, bookingId);
  }

  @Patch('bookings/:bookingId') @RequirePermissions('gala.bookings.manage')
  @ApiOperation({ summary: 'Correct purchaser/guest details. Renaming an issued ticket rotates its QR token and regenerates the PDF.' })
  async updateBooking(@Param('eventId', SafeIdPipe) eventId: string, @Param('bookingId', SafeIdPipe) bookingId: string, @Body() dto: UpdateBookingDto, @Actor() actor: ActorContext) {
    await this.lookup.adminEvent(eventId);
    return this.bookings.adminUpdate(eventId, bookingId, dto, actor);
  }

  @Post('bookings/:bookingId/cancel') @HttpCode(200) @RequirePermissions('gala.bookings.manage')
  @ApiOperation({ summary: 'Cancel. Unpaid → CANCELLED; paid → REFUND_PENDING (refund completes only via a verified provider event). Tickets are revoked.' })
  async cancelBooking(@Param('eventId', SafeIdPipe) eventId: string, @Param('bookingId', SafeIdPipe) bookingId: string, @Body() dto: ReasonDto, @Actor() actor: ActorContext) {
    await this.lookup.adminEvent(eventId);
    return this.bookings.adminCancel(eventId, bookingId, dto.reason, actor);
  }

  @Post('bookings/:bookingId/regenerate-tickets') @HttpCode(200) @RequirePermissions('gala.tickets.manage')
  @ApiOperation({ summary: 'Re-issue (rotate QR + regenerate PDF) every issued ticket of the booking that has no PDF' })
  async regenerate(@Param('eventId', SafeIdPipe) eventId: string, @Param('bookingId', SafeIdPipe) bookingId: string, @Actor() actor: ActorContext) {
    await this.lookup.adminEvent(eventId);
    return this.bookings.regenerateTickets(eventId, bookingId, actor);
  }

  @Post('bookings/:bookingId/resend') @HttpCode(200) @RequirePermissions('gala.bookings.manage')
  @ApiOperation({ summary: 'Re-queue failed/parked ticket-PDF and e-mail jobs of a confirmed booking and run them now. Sends nothing if no e-mail provider is configured (jobs stay SKIPPED).' })
  async resend(@Param('eventId', SafeIdPipe) eventId: string, @Param('bookingId', SafeIdPipe) bookingId: string, @Actor() actor: ActorContext) {
    await this.lookup.adminEvent(eventId);
    await this.bookings.adminGet(eventId, bookingId); // event-scope check (404)
    return this.jobs.requeue(bookingId, actor);
  }

  @Post('jobs/run') @HttpCode(200) @RequirePermissions('gala.tickets.manage')
  @ApiOperation({ summary: 'Run due background jobs now (normally done by the poller)' })
  async runJobs(@Param('eventId', SafeIdPipe) eventId: string) {
    await this.lookup.adminEvent(eventId);
    return this.jobs.runDue({ limit: 50 });
  }

  @Get('financials') @RequirePermissions('gala.bookings.read')
  @ApiOperation({ summary: 'Ticket revenue summary (EVENT_TICKET_PAYMENT only — never mixed with donations; no tax-deductible value is computed)' })
  async financials(@Param('eventId', SafeIdPipe) eventId: string, @Query() q: FinancialQueryDto) {
    await this.lookup.adminEvent(eventId);
    return this.bookings.financials(eventId, q);
  }

  // ── guests ──

  @Get('guests') @RequirePermissions('gala.guests.read')
  @ApiOperation({ summary: 'Combined guest list (one row per guest ticket): filter by payment/ticket/check-in status, search name/e-mail/reference' })
  async listGuests(@Param('eventId', SafeIdPipe) eventId: string, @Query() q: GuestQueryDto) {
    await this.lookup.adminEvent(eventId);
    return this.guests.list(eventId, q);
  }

  @Get('guests/export') @RequirePermissions('gala.guests.export')
  @ApiOperation({ summary: 'Download the guest list as CSV (default) or native XLSX (format=xlsx). Same filters, columns and permission; formula-injection safe; audited.' })
  async exportGuests(@Param('eventId', SafeIdPipe) eventId: string, @Query() q: GuestExportQueryDto, @Actor() actor: ActorContext, @Res() res: Response) {
    const event = await this.lookup.adminEvent(eventId);
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    if (q.format === 'xlsx') {
      await this.guests.exportXlsx(eventId, q, actor, res, () =>
        noStore(res)
          .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
          .setHeader('Content-Disposition', `attachment; filename="guests-${event.slug}-${day}.xlsx"`),
      );
      return;
    }
    const csv = await this.guests.exportCsv(eventId, q, actor);
    noStore(res).setHeader('Content-Type', 'text/csv; charset=utf-8').setHeader('Content-Disposition', `attachment; filename="guests-${event.slug}-${day}.csv"`);
    res.send(csv);
  }

  // ── tickets ──

  @Get('tickets') @RequirePermissions('gala.tickets.read')
  async listTickets(@Param('eventId', SafeIdPipe) eventId: string, @Query() q: TicketQueryDto) {
    await this.lookup.adminEvent(eventId);
    return this.tickets.list(eventId, q);
  }

  @Get('tickets/:ticketId') @RequirePermissions('gala.tickets.read')
  async getTicket(@Param('eventId', SafeIdPipe) eventId: string, @Param('ticketId', SafeIdPipe) ticketId: string) {
    await this.lookup.adminEvent(eventId);
    return this.tickets.get(eventId, ticketId);
  }

  @Get('tickets/:ticketId/pdf') @RequirePermissions('gala.tickets.read')
  @ApiOperation({ summary: 'Download a ticket PDF (private storage; never a public URL)' })
  async ticketPdf(@Param('eventId', SafeIdPipe) eventId: string, @Param('ticketId', SafeIdPipe) ticketId: string, @Res() res: Response) {
    await this.lookup.adminEvent(eventId);
    const file = await this.tickets.pdfFor({ id: ticketId, eventId });
    noStore(res).setHeader('Content-Type', 'application/pdf').setHeader('Content-Disposition', `attachment; filename="${file.ticketNumber}.pdf"`);
    res.send(file.body);
  }

  @Post('tickets/:ticketId/revoke') @HttpCode(200) @RequirePermissions('gala.tickets.manage')
  async revoke(@Param('eventId', SafeIdPipe) eventId: string, @Param('ticketId', SafeIdPipe) ticketId: string, @Body() dto: ReasonDto, @Actor() actor: ActorContext) {
    await this.lookup.adminEvent(eventId);
    return this.tickets.revoke(eventId, ticketId, dto.reason, actor);
  }

  @Post('tickets/:ticketId/reissue') @HttpCode(200) @RequirePermissions('gala.tickets.manage')
  @ApiOperation({ summary: 'Rotate the QR token and regenerate the PDF (the previous QR stops working immediately)' })
  async reissue(@Param('eventId', SafeIdPipe) eventId: string, @Param('ticketId', SafeIdPipe) ticketId: string, @Body() dto: ReasonDto, @Actor() actor: ActorContext) {
    await this.lookup.adminEvent(eventId);
    return this.tickets.reissue(ticketId, actor, dto.reason, eventId);
  }

  // ── check-in ──

  @Post('check-in/validate') @HttpCode(200) @RequirePermissions('gala.checkin.validate')
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @ApiOperation({ summary: 'Validate a scanned QR token for this event and record the check-in atomically (verifyOnly=true looks up without checking in)' })
  async validate(@Param('eventId', SafeIdPipe) eventId: string, @Body() dto: ValidateCheckInDto, @Actor() actor: ActorContext) {
    await this.lookup.adminEvent(eventId);
    return this.checkIn.validate(eventId, dto.token, actor, dto.verifyOnly === true);
  }

  @Get('check-in/statistics') @RequirePermissions('gala.checkin.validate')
  async statistics(@Param('eventId', SafeIdPipe) eventId: string) {
    await this.lookup.adminEvent(eventId);
    return this.checkIn.statistics(eventId);
  }

  @Post('tickets/:ticketId/check-in') @HttpCode(200) @RequirePermissions('gala.checkin.manage')
  @ApiOperation({ summary: 'Manual check-in by ticket (damaged QR / lost phone)' })
  async manual(@Param('eventId', SafeIdPipe) eventId: string, @Param('ticketId', SafeIdPipe) ticketId: string, @Actor() actor: ActorContext) {
    await this.lookup.adminEvent(eventId);
    return this.checkIn.manualCheckIn(eventId, ticketId, actor);
  }

  @Post('tickets/:ticketId/undo-check-in') @HttpCode(200) @RequirePermissions('gala.checkin.manage')
  async undo(@Param('eventId', SafeIdPipe) eventId: string, @Param('ticketId', SafeIdPipe) ticketId: string, @Body() dto: ReasonDto, @Actor() actor: ActorContext) {
    await this.lookup.adminEvent(eventId);
    return this.checkIn.undo(eventId, ticketId, dto.reason, actor);
  }
}
