import { renderMailAr } from './gala-email.templates.ar';

/**
 * Booking e-mail templates (English; Arabic copy needs MEKI-approved translation — not invented here).
 * Pure functions: no I/O, no provider. Rules:
 *  - "confirmed" wording appears ONLY in templates that are sent after verified payment (confirmation, ticket delivery);
 *  - the pending template states that the booking is not confirmed;
 *  - no tax-deductibility or receipt claims for tickets (SDI handles tax receipts);
 *  - all interpolated values are HTML-escaped.
 */
export interface MailContext {
  reference: string;
  eventName: string;
  eventDateLabel: string;
  venueLabel: string;
  purchaserName: string;
  /** null while the schedule is pending */
  calendarUrl: string | null;
  guests: { fullName: string; ticketNumber?: string }[];
  /** Secure link for the purchaser to view the booking / download tickets (token-gated) */
  bookingUrl?: string | null;
  /** The guest this message is addressed to (ticket delivery) */
  guest?: { fullName: string; ticketNumber: string };
  checkInNote?: string | null;
  amount?: string;
  currency?: string;
}

export interface MailMessage {
  subject: string;
  text: string;
  html: string;
}

export type MailTemplate = 'booking.pending' | 'booking.confirmed' | 'ticket.delivery' | 'payment.failed' | 'booking.cancelled' | 'ticket.refunded';

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const CALENDAR_PENDING = 'A calendar invitation will be sent once MEKI confirms the event schedule.';

function wrap(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="en"><body style="margin:0;background:#f4f6f5;font-family:Helvetica,Arial,sans-serif;color:#1d2b27"><div style="max-width:560px;margin:0 auto;padding:24px"><div style="background:#0b3b30;color:#fff;padding:18px 24px;border-radius:8px 8px 0 0"><div style="font-size:12px;letter-spacing:2px;color:#d6a146">MEKI</div><div style="font-size:20px;margin-top:4px">${esc(title)}</div></div><div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;line-height:1.55">${bodyHtml}</div></div></body></html>`;
}

function details(c: MailContext): { text: string; html: string } {
  const cal = c.calendarUrl ? `Add to calendar: ${c.calendarUrl}` : CALENDAR_PENDING;
  return {
    text: [`Event: ${c.eventName}`, `Date: ${c.eventDateLabel}`, `Venue: ${c.venueLabel}`, `Booking reference: ${c.reference}`, cal].join('\n'),
    html: `<table style="border-collapse:collapse"><tr><td style="padding:2px 12px 2px 0;color:#5a6b66">Event</td><td>${esc(c.eventName)}</td></tr><tr><td style="padding:2px 12px 2px 0;color:#5a6b66">Date</td><td>${esc(c.eventDateLabel)}</td></tr><tr><td style="padding:2px 12px 2px 0;color:#5a6b66">Venue</td><td>${esc(c.venueLabel)}</td></tr><tr><td style="padding:2px 12px 2px 0;color:#5a6b66">Booking reference</td><td><strong>${esc(c.reference)}</strong></td></tr></table><p>${
      c.calendarUrl ? `<a href="${esc(c.calendarUrl)}">Add to your calendar</a>` : esc(CALENDAR_PENDING)
    }</p>`,
  };
}

function guestLines(c: MailContext) {
  return {
    text: c.guests.map((g) => `- ${g.fullName}${g.ticketNumber ? ` (ticket ${g.ticketNumber})` : ''}`).join('\n'),
    html: `<ul>${c.guests.map((g) => `<li>${esc(g.fullName)}${g.ticketNumber ? ` — ticket <code>${esc(g.ticketNumber)}</code>` : ''}</li>`).join('')}</ul>`,
  };
}

export type MailLocale = 'en' | 'ar';

/** `ar` uses the PROPOSED Arabic set (see gala-email.templates.ar.ts); callers decide whether it is approved for sending. */
export function renderMail(template: MailTemplate, c: MailContext, locale: MailLocale = 'en'): MailMessage {
  if (locale === 'ar') return renderMailAr(template, c);
  const d = details(c);
  const g = guestLines(c);
  const link = c.bookingUrl ? { text: `\nView your booking and download tickets securely: ${c.bookingUrl}\n`, html: `<p><a href="${esc(c.bookingUrl)}">View your booking and download your tickets</a></p>` } : { text: '', html: '' };

  switch (template) {
    case 'booking.pending':
      return {
        subject: `We received your booking request — ${c.reference}`,
        text: `Dear ${c.purchaserName},\n\nWe have received your booking request for ${c.eventName}. Your booking is NOT confirmed yet: it will be confirmed, and tickets issued, only once your payment has been verified.\n\n${d.text}\n\nGuests:\n${g.text}\n${link.text}\nIf you did not complete the payment, you can return to the booking page and try again.\n`,
        html: wrap('Booking request received', `<p>Dear ${esc(c.purchaserName)},</p><p>We have received your booking request for <strong>${esc(c.eventName)}</strong>. <strong>Your booking is not confirmed yet</strong> — it will be confirmed, and tickets issued, only once your payment has been verified.</p>${d.html}<p>Guests:</p>${g.html}${link.html}<p>If you did not complete the payment, you can return to the booking page and try again.</p>`),
      };
    case 'booking.confirmed':
      return {
        subject: `Thank you — your booking is confirmed (${c.reference})`,
        text: `Dear ${c.purchaserName},\n\nThank you for supporting MEKI. Your payment has been verified and your booking for ${c.eventName} is confirmed.\n\n${d.text}\n\nGuests (each guest receives an individual ticket with a unique QR code):\n${g.text}\n${link.text}\nPlease keep this message. Tickets are issued in each guest's own name.\n`,
        html: wrap('Booking confirmed', `<p>Dear ${esc(c.purchaserName)},</p><p>Thank you for supporting MEKI. Your payment has been verified and your booking for <strong>${esc(c.eventName)}</strong> is confirmed.</p>${d.html}<p>Guests (each guest receives an individual ticket with a unique QR code):</p>${g.html}${link.html}<p>Tickets are issued in each guest's own name.</p>`),
      };
    case 'ticket.delivery':
      return {
        subject: `Your ticket — ${c.eventName}`,
        text: `Dear ${c.guest?.fullName ?? 'guest'},\n\nYour ticket for ${c.eventName} is attached as a PDF (ticket ${c.guest?.ticketNumber ?? ''}).\n\n${d.text}\n\n${c.checkInNote?.trim() || 'Present the QR code on your ticket (printed or on your phone) with photo ID at the entrance. The QR code can be scanned once only; please do not share it.'}\n`,
        html: wrap('Your ticket', `<p>Dear ${esc(c.guest?.fullName ?? 'guest')},</p><p>Your ticket for <strong>${esc(c.eventName)}</strong> is attached as a PDF (ticket <code>${esc(c.guest?.ticketNumber)}</code>).</p>${d.html}<p>${esc(c.checkInNote?.trim() || 'Present the QR code on your ticket (printed or on your phone) with photo ID at the entrance. The QR code can be scanned once only; please do not share it.')}</p>`),
      };
    case 'payment.failed':
      return {
        subject: `Payment not completed — ${c.reference}`,
        text: `Dear ${c.purchaserName},\n\nWe could not verify a payment for your booking ${c.reference} for ${c.eventName}, so the booking is not confirmed and no tickets have been issued.\n${link.text}\nYou can return to the booking page to try again.\n`,
        html: wrap('Payment not completed', `<p>Dear ${esc(c.purchaserName)},</p><p>We could not verify a payment for your booking <strong>${esc(c.reference)}</strong> for ${esc(c.eventName)}, so the booking is not confirmed and no tickets have been issued.</p>${link.html}<p>You can return to the booking page to try again.</p>`),
      };
    case 'booking.cancelled':
      return {
        subject: `Booking cancelled — ${c.reference}`,
        text: `Dear ${c.purchaserName},\n\nYour booking ${c.reference} for ${c.eventName} has been cancelled and its tickets are no longer valid.\n\nIf a payment was made, any refund is handled by our fiscal sponsor and you will be contacted separately.\n`,
        html: wrap('Booking cancelled', `<p>Dear ${esc(c.purchaserName)},</p><p>Your booking <strong>${esc(c.reference)}</strong> for ${esc(c.eventName)} has been cancelled and its tickets are no longer valid.</p><p>If a payment was made, any refund is handled by our fiscal sponsor and you will be contacted separately.</p>`),
      };
    case 'ticket.refunded':
      return {
        subject: `Refund recorded — ${c.reference}`,
        text: `Dear ${c.purchaserName},\n\nA refund for booking ${c.reference} (${c.eventName}) has been recorded. The related tickets are no longer valid and cannot be used for entry.\n`,
        html: wrap('Refund recorded', `<p>Dear ${esc(c.purchaserName)},</p><p>A refund for booking <strong>${esc(c.reference)}</strong> (${esc(c.eventName)}) has been recorded. The related tickets are no longer valid and cannot be used for entry.</p>`),
      };
  }
}
