import { Module, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { DonationsModule } from '../donations/donations.module';
import { WebhooksService } from '../donations/webhooks.service';
import { BookingPaymentsService } from './booking-payments.service';
import { BookingsService } from './bookings.service';
import { CheckInService } from './checkin.service';
import { GalaEmailComposer } from './gala-email.composer';
import { GalaJobsService, GALA_NOTIFIER_PROVIDER } from './gala-jobs.service';
import { BookingAccess, GalaLookup } from './gala-support';
import { createMailTransport, MAIL_TRANSPORT } from './mail-transport';
import { AdminGalaController, PublicBookingsController, PublicEventTicketsController } from './gala.controllers';
import { GuestsService } from './guests.service';
import { AdminGalaEventsController, AdminGalaOpsController } from './gala-ops.controller';
import { GalaOpsService } from './gala-ops.service';
import { TicketConfigService } from './ticket-config.service';
import { LocalPrivateStorage, PRIVATE_STORAGE } from './ticket-storage';
import { TicketPdfService } from './ticket-pdf.service';
import { TicketsService } from './tickets.service';

/**
 * Gala booking & ticketing (Phase 5B). Ticket payments are NOT donations: they use booking-keyed attempts/ledger and
 * share only the provider port, registry and the verified webhook pipeline with the donation module.
 */
@Module({
  imports: [DonationsModule],
  controllers: [PublicEventTicketsController, PublicBookingsController, AdminGalaController, AdminGalaEventsController, AdminGalaOpsController],
  providers: [
    BookingAccess,
    GalaLookup,
    BookingsService,
    BookingPaymentsService,
    TicketsService,
    TicketPdfService,
    TicketConfigService,
    GuestsService,
    CheckInService,
    GalaOpsService,
    GalaEmailComposer,
    GalaJobsService,
    GALA_NOTIFIER_PROVIDER,
    { provide: MAIL_TRANSPORT, useFactory: createMailTransport, inject: [AppConfigService] },
    { provide: PRIVATE_STORAGE, useClass: LocalPrivateStorage },
  ],
  exports: [GalaEmailComposer, GalaJobsService, MAIL_TRANSPORT, BookingPaymentsService],
})
export class GalaModule implements OnModuleInit {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly payments: BookingPaymentsService,
  ) {}

  onModuleInit() {
    this.webhooks.registerExternalHandler(this.payments);
  }
}
