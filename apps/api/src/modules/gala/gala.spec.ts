import { Prisma } from '../../generated/prisma/client';
import { buildIcs, calendarAvailability } from './calendar';
import { renderMail, type MailContext, type MailTemplate } from './gala-email.templates';
import { sanitizeError } from './gala-jobs.service';
import {
  calculateTotal,
  canonical,
  canTransitionBooking,
  canTransitionTicket,
  csvCell,
  csvSafe,
  evaluateTicketForCheckIn,
  findDuplicateGuests,
  generateBookingAttemptReference,
  generateBookingReference,
  generateQrToken,
  generateTicketNumber,
  hashQrToken,
  phoneIsValid,
  QR_TOKEN_PATTERN,
  toCsv,
  verifyQrToken,
} from './gala.rules';
import { TicketPdfService } from './ticket-pdf.service';
import type { AppConfigService } from '../../config/app-config.service';

describe('booking price calculation', () => {
  it('multiplies the configured unit price by the guest count with decimal arithmetic', () => {
    expect(calculateTotal('750.00', 1).toFixed(2)).toBe('750.00');
    expect(calculateTotal('750.00', 3).toFixed(2)).toBe('2250.00');
    expect(calculateTotal(new Prisma.Decimal('0.10'), 3).toFixed(2)).toBe('0.30'); // no float drift (0.1 * 3)
  });
  it('rejects zero, negative and fractional guest counts', () => {
    for (const n of [0, -1, 1.5, NaN]) expect(() => calculateTotal('750', n)).toThrow(RangeError);
  });
});

describe('references and tokens', () => {
  it('generates non-sequential booking, attempt and ticket identifiers with the expected shapes', () => {
    expect(generateBookingReference()).toMatch(/^EB-[0-9A-HJKMNP-TV-Z]{12}$/);
    expect(generateBookingAttemptReference()).toMatch(/^BA-[0-9A-HJKMNP-TV-Z]{12}$/);
    expect(generateTicketNumber()).toMatch(/^TK-[0-9A-HJKMNP-TV-Z]{10}$/);
    const set = new Set(Array.from({ length: 2000 }, generateBookingReference));
    expect(set.size).toBe(2000);
  });

  it('QR tokens are opaque 256-bit random values; only their hash verifies', () => {
    const t = generateQrToken();
    expect(t).toMatch(QR_TOKEN_PATTERN);
    const h = hashQrToken(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(t);
    expect(verifyQrToken(t, h)).toBe(true);
    expect(verifyQrToken(generateQrToken(), h)).toBe(false); // token guessing
    expect(verifyQrToken(t, null)).toBe(false);
    expect(verifyQrToken(`${t}x`, h)).toBe(false);
    expect(verifyQrToken('mkt_short', h)).toBe(false);
    expect(new Set(Array.from({ length: 2000 }, generateQrToken)).size).toBe(2000);
  });
});

describe('guest validation helpers', () => {
  it('flags duplicate e-mails case-insensitively', () => {
    expect(findDuplicateGuests([{ fullName: 'A', email: 'a@x.org' }, { fullName: 'B', email: 'b@x.org' }])).toEqual([]);
    expect(findDuplicateGuests([{ fullName: 'A', email: 'a@x.org' }, { fullName: 'B', email: ' A@X.org ' }])).toEqual([1]);
  });
  it('requires at least 7 digits in a phone number', () => {
    expect(phoneIsValid('+1 212 555 0100')).toBe(true);
    expect(phoneIsValid('(212) 555-0100')).toBe(true);
    expect(phoneIsValid('123456')).toBe(false);
    expect(phoneIsValid('abc-def-ghij')).toBe(false);
  });
  it('canonical() makes the idempotency hash independent of key order', () => {
    expect(canonical({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(canonical({ a: [{ c: 2, d: 1 }], b: 1 }));
    expect(canonical({ a: 1 })).not.toBe(canonical({ a: 2 }));
  });
});

describe('state transitions', () => {
  it('booking transitions follow the lifecycle and REFUNDED is terminal', () => {
    expect(canTransitionBooking('PENDING', 'CONFIRMED')).toBe(true);
    expect(canTransitionBooking('CONFIRMED', 'REFUND_PENDING')).toBe(true);
    expect(canTransitionBooking('REFUND_PENDING', 'REFUNDED')).toBe(true);
    expect(canTransitionBooking('REFUNDED', 'CONFIRMED')).toBe(false);
    expect(canTransitionBooking('CANCELLED', 'CONFIRMED')).toBe(false); // a cancelled booking is never confirmed by a late payment
    expect(canTransitionBooking('PENDING', 'REFUNDED')).toBe(false);
  });
  it('ticket transitions: refunded/revoked tickets can never be checked in', () => {
    expect(canTransitionTicket('PENDING', 'ISSUED')).toBe(true);
    expect(canTransitionTicket('ISSUED', 'CHECKED_IN')).toBe(true);
    expect(canTransitionTicket('REVOKED', 'CHECKED_IN')).toBe(false);
    expect(canTransitionTicket('REFUNDED', 'CHECKED_IN')).toBe(false);
    expect(canTransitionTicket('PENDING', 'CHECKED_IN')).toBe(false);
    expect(canTransitionTicket('REFUNDED', 'ISSUED')).toBe(false);
  });
});

describe('check-in decision', () => {
  const paid = { bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' } as const;
  it.each([
    ['ISSUED', paid, 'VALID'],
    ['CHECKED_IN', paid, 'ALREADY_CHECKED_IN'],
    ['REVOKED', paid, 'REVOKED'],
    ['REFUNDED', paid, 'REFUNDED'],
    ['PENDING', paid, 'PAYMENT_NOT_CONFIRMED'],
    ['ISSUED', { bookingStatus: 'PENDING', paymentStatus: 'UNPAID' }, 'PAYMENT_NOT_CONFIRMED'],
    ['ISSUED', { bookingStatus: 'CONFIRMED', paymentStatus: 'FAILED' }, 'PAYMENT_NOT_CONFIRMED'],
  ] as const)('%s ticket on %j booking → %s', (status, booking, expected) => {
    expect(evaluateTicketForCheckIn({ status }, { ...booking })).toBe(expected);
  });
});

describe('CSV formula-injection protection', () => {
  it.each(['=1+1', '+cmd|x', '-2+3', '@SUM(A1)', '\tTAB', '\rCR'])('prefixes %j so spreadsheets treat it as text', (v) => {
    expect(csvSafe(v).startsWith("'")).toBe(true);
  });
  it('leaves normal values and plain phone numbers untouched', () => {
    expect(csvSafe('Amira Hassan')).toBe('Amira Hassan');
    expect(csvSafe('+1 212 555 0100')).toBe('+1 212 555 0100');
    expect(csvSafe('No nuts')).toBe('No nuts');
    expect(csvSafe(null)).toBe('');
  });
  it('quotes cells containing commas, quotes and newlines, after neutralising', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x","y")')).toBe('"\'=HYPERLINK(""x"",""y"")"');
  });
  it('builds CRLF rows with the header first', () => {
    expect(toCsv(['A', 'B'], [[1, '=x']])).toBe("A,B\r\n1,'=x\r\n");
  });
});

describe('calendar', () => {
  const base = { uid: 'evt@meki', name: 'Every Light Counts', description: 'Gala, with commas; and semicolons', location: '583 Park Avenue, New York', url: null };
  it('is pending (no ICS, no invented time) until start time AND timezone are confirmed', () => {
    expect(calendarAvailability({ startsAt: null, timezone: null })).toEqual({ available: false, reason: 'SCHEDULE_PENDING' });
    expect(calendarAvailability({ startsAt: new Date(), timezone: null }).available).toBe(false);
    expect(buildIcs({ ...base, startsAt: null, endsAt: null, timezone: 'America/New_York' })).toBeNull();
    expect(buildIcs({ ...base, startsAt: new Date(), endsAt: null, timezone: null })).toBeNull();
  });
  it('emits a valid VEVENT in UTC, escapes text, omits DTEND when the end time is unknown', () => {
    const ics = buildIcs({ ...base, startsAt: new Date('2026-12-13T00:00:00Z'), endsAt: null, timezone: 'America/New_York' }, new Date('2026-11-16T10:00:00Z'))!;
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART:20261213T000000Z');
    expect(ics).not.toContain('DTEND');
    expect(ics).toContain('SUMMARY:Every Light Counts');
    expect(ics).toContain('LOCATION:583 Park Avenue\\, New York');
    expect(ics).toContain('Gala\\, with commas\\; and semicolons');
    expect(ics.split('\r\n ').join('')).toContain('Time zone: America/New_York'); // unfold RFC 5545 line folding
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });
});

describe('e-mail templates', () => {
  const ctx: MailContext = {
    reference: 'EB-ABCDEFGH2345',
    eventName: 'Every Light Counts',
    eventDateLabel: 'Saturday, December 12, 2026',
    venueLabel: '583 Park Avenue, New York, USA',
    purchaserName: 'Amira <script>alert(1)</script>',
    calendarUrl: null,
    guests: [{ fullName: 'Guest One', ticketNumber: 'TK-1234567890' }],
    bookingUrl: 'https://example.org/b?x=1&y=2',
    guest: { fullName: 'Guest One', ticketNumber: 'TK-1234567890' },
  };
  const all: MailTemplate[] = ['booking.pending', 'booking.confirmed', 'ticket.delivery', 'payment.failed', 'booking.cancelled', 'ticket.refunded'];

  it('renders all six templates with subject, text and html', () => {
    for (const t of all) {
      const m = renderMail(t, ctx);
      expect(m.subject.length).toBeGreaterThan(5);
      expect(m.text.length).toBeGreaterThan(20);
      expect(m.html).toContain('<html');
    }
  });
  it('the pending template never claims confirmation', () => {
    const m = renderMail('booking.pending', ctx);
    expect(m.text).toMatch(/NOT confirmed/);
    expect(m.text.toLowerCase()).not.toContain('is confirmed');
    expect(m.subject.toLowerCase()).not.toContain('confirmed');
    const failed = renderMail('payment.failed', ctx);
    expect(failed.text).toMatch(/not confirmed/);
  });
  it('the confirmation includes thank-you, reference, date, venue, guests and a pending-calendar note', () => {
    const m = renderMail('booking.confirmed', ctx);
    for (const s of ['Thank you', ctx.reference, ctx.eventDateLabel, ctx.venueLabel, 'Guest One', 'calendar invitation will be sent once MEKI confirms']) expect(m.text).toContain(s);
    const withCal = renderMail('booking.confirmed', { ...ctx, calendarUrl: 'https://api.example.org/cal.ics' });
    expect(withCal.text).toContain('https://api.example.org/cal.ics');
    expect(withCal.text).not.toContain('calendar invitation will be sent');
  });
  it('escapes HTML and makes no tax or receipt claims', () => {
    for (const t of all) {
      const m = renderMail(t, ctx);
      expect(m.html).not.toContain('<script>');
      expect(`${m.text} ${m.html}`.toLowerCase()).not.toMatch(/tax[- ]deductible|tax receipt/);
    }
  });
});

describe('job error sanitising (no PII in stored errors or logs)', () => {
  it('redacts e-mail addresses and QR tokens and truncates', () => {
    const msg = sanitizeError('550 5.1.1 <amira.hassan@example.org> rejected; token mkt_' + 'A'.repeat(43) + ' ' + 'x'.repeat(1000));
    expect(msg).not.toMatch(/amira|example.org|mkt_A/);
    expect(msg).toContain('[email]');
    expect(msg).toContain('[token]');
    expect(msg.length).toBeLessThanOrEqual(300);
  });
});

describe('ticket PDF', () => {
  const svc = new TicketPdfService({ get: () => undefined } as unknown as AppConfigService);
  const input = {
    ticketNumber: 'TK-1234567890',
    guestName: 'Amira Hassan',
    bookingReference: 'EB-ABCDEFGH2345',
    eventName: 'Every Light Counts',
    eventDateLabel: 'Saturday, December 12, 2026',
    venueLabel: '583 Park Avenue, New York, USA',
    qrToken: generateQrToken(),
  };

  it('produces a structurally valid single-page PDF', async () => {
    const pdf = await svc.render(input);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.subarray(-6).toString()).toContain('%%EOF');
    expect(pdf.length).toBeGreaterThan(5_000);
    const body = pdf.toString('latin1');
    expect((body.match(/\/Type \/Page\b/g) ?? []).length).toBe(1);
    expect(body).toContain('/Image'); // QR (and logo) embedded
    expect(body).not.toContain(input.qrToken); // the token only exists inside the QR image
  });
  it('renders non-Latin names without throwing', async () => {
    const pdf = await svc.render({ ...input, guestName: 'أميرة حسن' });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
