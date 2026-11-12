import { campaignPublishBlockers, canTransition, type CampaignPublishFacts } from './campaign.rules';

const ok: CampaignPublishFacts = {
  status: 'IN_REVIEW',
  provenance: 'PROPOSED',
  approvedAt: new Date(),
  titleEn: 'Title',
  summaryEn: 'Summary',
  programmeId: 'p1',
  programmePublished: true,
  startsAt: null,
  endsAt: null,
};

describe('campaign rules', () => {
  it('allows an approved, complete campaign', () => {
    expect(campaignPublishBlockers(ok, { allowDemo: false })).toEqual([]);
  });

  it.each([
    [{ approvedAt: null }, 'Campaign has no recorded MEKI approval'],
    [{ provenance: 'DEMO' as const }, 'DEMO content cannot be published'],
    [{ summaryEn: ' ' }, 'summaryEn is required'],
    [{ programmeId: null }, 'A related programme is required'],
    [{ programmePublished: false }, 'The related programme must be published'],
    [{ startsAt: new Date('2027-02-01'), endsAt: new Date('2027-01-01') }, 'endsAt must be after startsAt'],
    [{ endsAt: new Date('2020-01-01') }, 'Campaign end date has passed'],
  ])('blocks %o', (patch, reason) => {
    expect(campaignPublishBlockers({ ...ok, ...patch }, { allowDemo: false })).toContain(reason);
  });

  it('DEMO only passes when explicitly allowed (staging)', () => {
    expect(campaignPublishBlockers({ ...ok, provenance: 'DEMO' }, { allowDemo: true })).toEqual([]);
  });

  it('enforces the lifecycle state machine', () => {
    expect(canTransition('publish', 'DRAFT')).toBe(true);
    expect(canTransition('publish', 'COMPLETED')).toBe(false);
    expect(canTransition('pause', 'DRAFT')).toBe(false);
    expect(canTransition('resume', 'PAUSED')).toBe(true);
    expect(canTransition('archive', 'PUBLISHED')).toBe(false);
    expect(canTransition('complete', 'PAUSED')).toBe(true);
  });
});
