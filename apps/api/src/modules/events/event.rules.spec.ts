import { canTransitionEvent, eventPublishBlockers, isValidTimeZone, pageStatusFor, scheduleProblems, type EventPublishFacts } from './event.rules';

const future = new Date(Date.now() + 30 * 86_400_000);
const ok: EventPublishFacts = {
  provenance: 'PROPOSED',
  approvedAt: new Date(),
  titleEn: 'Gala',
  shortDescEn: 'An evening',
  startsAt: future,
  endsAt: new Date(future.getTime() + 3 * 3_600_000),
  timezone: 'Africa/Cairo',
  registrationMode: 'NONE',
  externalRegistrationUrl: null,
};

describe('event rules', () => {
  it('validates IANA time zones only', () => {
    expect(isValidTimeZone('Africa/Cairo')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('America/Argentina/Buenos_Aires')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('+02:00')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('schedule consistency', () => {
    expect(scheduleProblems({ startsAt: null, endsAt: null, timezone: null })).toEqual([]); // fully pending is allowed in drafts
    expect(scheduleProblems({ startsAt: future, endsAt: future, timezone: 'Africa/Cairo' })).toContain('endsAt must be after startsAt');
    expect(scheduleProblems({ startsAt: null, endsAt: future, timezone: 'Africa/Cairo' })).toContain('endsAt requires startsAt');
    expect(scheduleProblems({ startsAt: future, endsAt: null, timezone: null })).toContain('timezone is required when startsAt is set');
  });

  it('allows a complete, approved event', () => {
    expect(eventPublishBlockers(ok, { allowDemo: false })).toEqual([]);
  });

  it.each([
    [{ approvedAt: null }, 'Event content has no recorded client approval'],
    [{ startsAt: null, endsAt: null }, 'A confirmed start date and time (startsAt) is required'],
    [{ startsAt: null, endsAt: null, timezone: null }, 'A confirmed timezone is required'],
    [{ shortDescEn: '' }, 'shortDescEn is required'],
    [{ provenance: 'DEMO' as const }, 'DEMO content cannot be published'],
    [{ startsAt: new Date('2020-12-12T18:00:00Z'), endsAt: null }, 'Event date has already passed'],
    [{ registrationMode: 'EXTERNAL_LINK' as const }, 'externalRegistrationUrl is required for EXTERNAL_LINK registration'],
  ])('blocks %o', (patch, reason) => {
    expect(eventPublishBlockers({ ...ok, ...patch }, { allowDemo: false })).toContain(reason);
  });

  it('state machine and page status mapping', () => {
    expect(canTransitionEvent('publish', 'IN_REVIEW')).toBe(true);
    expect(canTransitionEvent('publish', 'CANCELLED')).toBe(false);
    expect(canTransitionEvent('complete', 'DRAFT')).toBe(false);
    expect(canTransitionEvent('archive', 'PUBLISHED')).toBe(false);
    expect(pageStatusFor('PUBLISHED')).toBe('PUBLISHED');
    expect(pageStatusFor('CANCELLED')).toBe('PUBLISHED');
    expect(pageStatusFor('IN_REVIEW')).toBe('DRAFT');
  });
});
