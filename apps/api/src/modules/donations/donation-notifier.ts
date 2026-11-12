import { Injectable, Logger } from '@nestjs/common';

export const DONATION_NOTIFIER = Symbol('DONATION_NOTIFIER');

export type DonationNotification =
  | 'donation.confirmed'
  | 'payment.failed'
  | 'recurring.reminder'
  | 'recurring.payment_failed'
  | 'refund.status'
  | 'receipt.available';

export interface DonationNotificationInput {
  type: DonationNotification;
  /** Donation/refund/recurring reference — the only identifier adapters may log */
  reference: string;
  /** Resolved by the adapter from the database when it actually sends (never logged) */
  donorId: string;
  locale: string;
  data?: Record<string, string>;
}

/** Outbound donor notifications. A real e-mail/SMS adapter is added once a provider is chosen. */
export interface DonationNotifier {
  notify(input: DonationNotificationInput): Promise<void>;
}

/** Default adapter: logs the event type and reference only — no names, e-mails, amounts or tokens. */
@Injectable()
export class LogDonationNotifier implements DonationNotifier {
  private readonly logger = new Logger('DonationNotifications');
  async notify(input: DonationNotificationInput) {
    this.logger.log(`[no delivery provider] ${input.type} ref=${input.reference} locale=${input.locale}`);
  }
}
