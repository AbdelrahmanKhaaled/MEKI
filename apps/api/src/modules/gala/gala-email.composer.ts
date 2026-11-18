import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { calendarAvailability } from './calendar';
import { renderMail, type MailContext, type MailMessage } from './gala-email.templates';
import { BookingAccess, type GalaNotificationInput } from './gala-support';
import { PRIVATE_STORAGE, type PrivateStoragePort } from './ticket-storage';

export interface ComposedEmail extends MailMessage {
  to: string;
  locale: 'en' | 'ar';
  attachments: { filename: string; contentType: string; content: Buffer }[];
}

/**
 * Builds the final message (recipient, subject, body, PDF attachment) for a notification. A delivery adapter
 * (SMTP/API provider, chosen later) calls this and sends — the composer itself sends nothing. It refuses to compose
 * "confirmed"/ticket messages unless the booking is confirmed and paid.
 */
@Injectable()
export class GalaEmailComposer {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly access: BookingAccess,
    @Inject(PRIVATE_STORAGE) private readonly storage: PrivateStoragePort,
  ) {}

  calendarUrl(slug: string) {
    return `${this.config.get('API_PUBLIC_URL').replace(/\/$/, '')}/api/v1/public/events/${slug}/calendar.ics`;
  }

  /**
   * Purchaser link in e-mails. The access token travels in the URL FRAGMENT (#token=), which browsers never send to servers,
   * proxies or analytics and never put in a Referer header; the booking page reads it once and removes it from the address bar.
   * Links with ?token= sent before Phase 7 keep working (the page still accepts both).
   */
  bookingUrl(slug: string, reference: string, bookingId: string, locale: string) {
    const base = this.config.get('EVENT_BOOKING_RETURN_URL').replace('{locale}', locale === 'ar' ? 'ar' : 'en').replace('{slug}', slug);
    return `${base}?reference=${encodeURIComponent(reference)}#token=${encodeURIComponent(this.access.tokenFor(bookingId))}`;
  }

  async compose(input: GalaNotificationInput): Promise<ComposedEmail | null> {
    const b = await this.prisma.eventBooking.findUnique({
      where: { id: input.bookingId },
      include: { guests: { orderBy: { position: 'asc' }, include: { ticket: true } }, event: { include: { ticketConfig: true } } },
    });
    const cfg = b?.event.ticketConfig;
    if (!b || !cfg) return null;
    const paid = b.bookingStatus === 'CONFIRMED' && b.paymentStatus === 'PAID';
    if ((input.type === 'booking.confirmed' || input.type === 'ticket.delivery') && !paid) return null;

    // Arabic copy is a proposed translation: only used once MEKI approval is recorded in configuration.
    const locale: 'en' | 'ar' = b.locale === 'ar' && this.config.get('GALA_EMAIL_ARABIC_APPROVED') ? 'ar' : 'en';

    const ctx: MailContext = {
      reference: b.publicReference,
      eventName: cfg.displayNameEn,
      eventDateLabel: cfg.eventDateLabelEn,
      venueLabel: cfg.venueLabelEn,
      purchaserName: b.purchaserName,
      calendarUrl: calendarAvailability(b.event).available ? this.calendarUrl(b.event.slug) : null,
      guests: b.guests.map((g) => ({ fullName: g.fullName, ticketNumber: paid ? g.ticket?.ticketNumber : undefined })),
      bookingUrl: this.bookingUrl(b.event.slug, b.publicReference, b.id, b.locale),
      checkInNote: cfg.checkInNoteEn,
    };

    if (input.type === 'ticket.delivery') {
      const guest = b.guests.find((g) => g.ticket?.id === input.ticketId);
      const ticket = guest?.ticket;
      if (!guest || !ticket || ticket.status !== 'ISSUED' || !ticket.pdfStorageKey) return null;
      const pdf = await this.storage.get(ticket.pdfStorageKey);
      if (!pdf) return null;
      return {
        to: guest.email,
        locale,
        ...renderMail('ticket.delivery', { ...ctx, guest: { fullName: guest.fullName, ticketNumber: ticket.ticketNumber }, bookingUrl: null }, locale),
        attachments: [{ filename: `${ticket.ticketNumber}.pdf`, contentType: 'application/pdf', content: pdf }],
      };
    }
    return { to: b.purchaserEmail, locale, ...renderMail(input.type, ctx, locale), attachments: [] };
  }
}
