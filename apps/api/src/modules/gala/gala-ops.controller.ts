import { Controller, ForbiddenException, Get, Param, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import type { AuthUser } from '../../common/types/auth-request';
import { CheckInHistoryQueryDto, CheckInLookupQueryDto, JobQueryDto } from './gala.dto';
import { GalaLookup, SafeIdPipe } from './gala-support';
import { GalaOpsService } from './gala-ops.service';

/** Any one of these lets a user find the ticketed event(s); the operation endpoints keep their own (all-of) permissions. */
const GALA_ROLES_ANY = ['gala.bookings.read', 'gala.guests.read', 'gala.tickets.read', 'gala.checkin.validate', 'events.read'];

@ApiTags('Admin · Gala operations (Phase 6E)')
@ApiCookieAuth()
@Controller('admin/gala')
export class AdminGalaEventsController {
  constructor(private readonly ops: GalaOpsService) {}

  @Get('events')
  @ApiOperation({ summary: 'Events with ticketing configured (id, code, slug, title, status, schedule). Needs any gala.* read permission or events.read.' })
  events(@CurrentUser() user: AuthUser) {
    if (!user.isSuperAdmin && !GALA_ROLES_ANY.some((p) => user.permissions.includes(p))) {
      throw new ForbiddenException({ message: 'Insufficient permissions', code: 'FORBIDDEN', details: { anyOf: GALA_ROLES_ANY } });
    }
    return this.ops.ticketedEvents();
  }
}

@ApiTags('Admin · Gala operations (Phase 6E)')
@ApiCookieAuth()
@Controller('admin/events/:eventId')
export class AdminGalaOpsController {
  constructor(
    private readonly lookup: GalaLookup,
    private readonly ops: GalaOpsService,
  ) {}

  @Get('jobs') @RequirePermissions('gala.bookings.read')
  @ApiOperation({ summary: 'Ticket-PDF and e-mail jobs of the event (status, attempts, sanitised last error) + the configured mail transport. Read-only; retry = POST bookings/:id/resend.' })
  async jobs(@Param('eventId', SafeIdPipe) eventId: string, @Query() q: JobQueryDto) {
    await this.lookup.adminEvent(eventId);
    return this.ops.jobs(eventId, q);
  }

  @Get('check-in/lookup') @RequirePermissions('gala.checkin.validate')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'Door lookup by ticket number or guest name (min. 3 chars, max. 10 rows, minimal fields). Does not check in.' })
  async doorLookup(@Param('eventId', SafeIdPipe) eventId: string, @Query() q: CheckInLookupQueryDto) {
    await this.lookup.adminEvent(eventId);
    return this.ops.lookup(eventId, q.q);
  }

  @Get('check-in/history') @RequirePermissions('gala.checkin.validate')
  @ApiOperation({ summary: 'Check-in history of the event from the audit trail (scans, manual check-ins, rejections, undos)' })
  async history(@Param('eventId', SafeIdPipe) eventId: string, @Query() q: CheckInHistoryQueryDto) {
    await this.lookup.adminEvent(eventId);
    return this.ops.history(eventId, q);
  }
}
