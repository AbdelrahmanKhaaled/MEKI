import type { EventStatus, Provenance } from '../../generated/prisma/enums';

export type EventAction = 'submit' | 'publish' | 'unpublish' | 'cancel' | 'complete' | 'archive';

export const EVENT_TRANSITIONS: Record<EventAction, { from: EventStatus[]; to: EventStatus }> = {
  submit: { from: ['DRAFT'], to: 'IN_REVIEW' },
  publish: { from: ['DRAFT', 'IN_REVIEW'], to: 'PUBLISHED' },
  unpublish: { from: ['IN_REVIEW', 'PUBLISHED', 'CANCELLED'], to: 'DRAFT' },
  cancel: { from: ['DRAFT', 'IN_REVIEW', 'PUBLISHED'], to: 'CANCELLED' },
  complete: { from: ['PUBLISHED'], to: 'COMPLETED' },
  archive: { from: ['DRAFT', 'CANCELLED', 'COMPLETED'], to: 'ARCHIVED' },
};

/** Statuses in which an (approved, previously published) event is visible publicly. */
export const PUBLIC_EVENT_STATUSES: EventStatus[] = ['PUBLISHED', 'CANCELLED', 'COMPLETED'];

/** Statuses whose landing page should be served. */
export const pageStatusFor = (s: EventStatus) => (PUBLIC_EVENT_STATUSES.includes(s) ? 'PUBLISHED' : 'DRAFT');

export const canTransitionEvent = (action: EventAction, from: EventStatus) => EVENT_TRANSITIONS[action].from.includes(from);

/** True when `tz` is an IANA time zone known to the runtime (e.g. "Africa/Cairo"). */
export function isValidTimeZone(tz: string): boolean {
  // IANA names only (rejects raw offsets such as "+02:00", which do not handle DST).
  if (!tz || tz.length > 64 || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface EventScheduleInput {
  startsAt: Date | null;
  endsAt: Date | null;
  timezone: string | null;
}

/** Schedule consistency rules applied on every create/update. Returns problems (empty = valid). */
export function scheduleProblems(e: EventScheduleInput): string[] {
  const problems: string[] = [];
  if (e.timezone && !isValidTimeZone(e.timezone)) problems.push('timezone must be a valid IANA time zone, e.g. "Africa/Cairo"');
  if (e.endsAt && !e.startsAt) problems.push('endsAt requires startsAt');
  if (e.startsAt && e.endsAt && e.endsAt <= e.startsAt) problems.push('endsAt must be after startsAt');
  if (e.startsAt && !e.timezone) problems.push('timezone is required when startsAt is set');
  return problems;
}

export interface EventPublishFacts extends EventScheduleInput {
  provenance: Provenance;
  approvedAt: Date | null;
  titleEn: string | null;
  shortDescEn: string | null;
  registrationMode: 'NONE' | 'EXTERNAL_LINK';
  externalRegistrationUrl: string | null;
}

/** Blocking reasons for publishing (empty = OK). Confirmed date/time/timezone + client approval are mandatory. */
export function eventPublishBlockers(e: EventPublishFacts, opts: { allowDemo: boolean; now?: Date }): string[] {
  const reasons = scheduleProblems(e);
  if (!e.approvedAt) reasons.push('Event content has no recorded client approval');
  if (e.provenance === 'DEMO' && !opts.allowDemo) reasons.push('DEMO content cannot be published');
  if (!e.titleEn?.trim()) reasons.push('titleEn is required');
  if (!e.shortDescEn?.trim()) reasons.push('shortDescEn is required');
  if (!e.startsAt) reasons.push('A confirmed start date and time (startsAt) is required');
  if (!e.timezone) reasons.push('A confirmed timezone is required');
  const end = e.endsAt ?? e.startsAt;
  if (end && end <= (opts.now ?? new Date())) reasons.push('Event date has already passed');
  if (e.registrationMode === 'EXTERNAL_LINK' && !e.externalRegistrationUrl) reasons.push('externalRegistrationUrl is required for EXTERNAL_LINK registration');
  return reasons;
}
