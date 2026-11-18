/**
 * iCalendar (RFC 5545) generation. The event's start time/timezone are client decisions that may still be missing:
 * nothing is ever defaulted or invented — without a confirmed `startsAt` AND `timezone` the calendar is "pending".
 * Times are emitted in UTC (unambiguous, needs no VTIMEZONE); the confirmed IANA timezone is stated in the description.
 */
export interface CalendarEvent {
  uid: string;
  name: string;
  description?: string | null;
  location?: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  timezone: string | null;
  url?: string | null;
}

export type CalendarAvailability = { available: true } | { available: false; reason: 'SCHEDULE_PENDING' };

/** A real IANA zone known to the runtime ("America/New_York"), never an arbitrary offset string. */
export function isIanaTimezone(tz: string | null | undefined): tz is string {
  if (!tz || (!tz.includes('/') && tz !== 'UTC')) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function calendarAvailability(e: Pick<CalendarEvent, 'startsAt' | 'timezone'>): CalendarAvailability {
  return e.startsAt && isIanaTimezone(e.timezone) ? { available: true } : { available: false, reason: 'SCHEDULE_PENDING' };
}

const pad = (n: number) => String(n).padStart(2, '0');
const utc = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Folds to 75 octets per line (RFC 5545 §3.1) without splitting multi-byte characters. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length === 0 ? 75 : 74)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** Returns null while the schedule is pending (callers answer 409 CALENDAR_PENDING). */
export function buildIcs(e: CalendarEvent, now = new Date()): string | null {
  if (!calendarAvailability(e).available || !e.startsAt) return null;
  const description = [e.description?.trim(), `Time zone: ${e.timezone}`].filter(Boolean).join('\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MEKI//Event Ticketing//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${utc(now)}`,
    `DTSTART:${utc(e.startsAt)}`,
    ...(e.endsAt ? [`DTEND:${utc(e.endsAt)}`] : []), // never invented: omitted until the end time is confirmed
    `SUMMARY:${escapeText(e.name)}`,
    `DESCRIPTION:${escapeText(description)}`,
    ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
