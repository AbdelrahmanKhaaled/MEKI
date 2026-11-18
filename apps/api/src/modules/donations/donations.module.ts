import { Module } from '@nestjs/common';
import { DonationConfigService } from './donation-config.service';
import { DONATION_NOTIFIER, LogDonationNotifier } from './donation-notifier';
import {
  AdminDonationsController,
  AdminDonorsController,
  AdminPaymentsController,
  AdminReceiptsController,
  AdminRecurringController,
  AdminRefundsController,
  AdminReportsController,
  PaymentsAdminService,
  PaymentWebhooksController,
  PublicDonationsController,
} from './donations.controllers';
import { DonationsService } from './donations.service';
import { MockCheckoutController } from './mock-checkout.controller';
import { DonorsService } from './donors.service';
import { PaymentProviderRegistry } from './payments/payment-provider.registry';
import { NotConfiguredPdfRenderer, RECEIPT_PDF_RENDERER } from './receipt-template';
import { ReceiptsService } from './receipts.service';
import { RecurringService } from './recurring.service';
import { RefundsService } from './refunds.service';
import { ReportsService } from './reports.service';
import { WebhooksService } from './webhooks.service';

/**
 * Donation core. Provider-specific code lives only in ./payments (adapters + registry);
 * everything else depends on the PaymentProviderAdapter interface.
 */
@Module({
  controllers: [
    PublicDonationsController,
    PaymentWebhooksController,
    AdminDonationsController,
    AdminDonorsController,
    AdminPaymentsController,
    AdminRecurringController,
    AdminRefundsController,
    AdminReceiptsController,
    AdminReportsController,
    MockCheckoutController,
  ],
  providers: [
    PaymentProviderRegistry,
    DonationConfigService,
    DonationsService,
    DonorsService,
    WebhooksService,
    RecurringService,
    RefundsService,
    ReceiptsService,
    ReportsService,
    PaymentsAdminService,
    { provide: DONATION_NOTIFIER, useClass: LogDonationNotifier },
    { provide: RECEIPT_PDF_RENDERER, useClass: NotConfiguredPdfRenderer },
  ],
  exports: [PaymentProviderRegistry, DONATION_NOTIFIER, DonationConfigService, WebhooksService],
})
export class DonationsModule {}
