import type { CampaignStatus, Provenance } from '../../generated/prisma/enums';

export type CampaignAction = 'submit' | 'publish' | 'pause' | 'resume' | 'complete' | 'unpublish' | 'archive';

/** Allowed lifecycle transitions. Anything not listed is rejected. */
export const CAMPAIGN_TRANSITIONS: Record<CampaignAction, { from: CampaignStatus[]; to: CampaignStatus }> = {
  submit: { from: ['DRAFT'], to: 'IN_REVIEW' },
  publish: { from: ['DRAFT', 'IN_REVIEW'], to: 'PUBLISHED' },
  pause: { from: ['PUBLISHED'], to: 'PAUSED' },
  resume: { from: ['PAUSED'], to: 'PUBLISHED' },
  complete: { from: ['PUBLISHED', 'PAUSED'], to: 'COMPLETED' },
  unpublish: { from: ['IN_REVIEW', 'PUBLISHED', 'PAUSED'], to: 'DRAFT' },
  archive: { from: ['DRAFT', 'IN_REVIEW', 'PAUSED', 'COMPLETED'], to: 'ARCHIVED' },
};

export interface CampaignPublishFacts {
  status: CampaignStatus;
  provenance: Provenance;
  approvedAt: Date | null;
  titleEn: string | null;
  summaryEn: string | null;
  programmeId: string | null;
  programmePublished: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

/** Returns blocking reasons for making a campaign publicly visible (empty array = OK). */
export function campaignPublishBlockers(c: CampaignPublishFacts, opts: { allowDemo: boolean }): string[] {
  const reasons: string[] = [];
  if (!c.approvedAt) reasons.push('Campaign has no recorded MEKI approval');
  if (c.provenance === 'DEMO' && !opts.allowDemo) reasons.push('DEMO content cannot be published');
  if (!c.titleEn?.trim()) reasons.push('titleEn is required');
  if (!c.summaryEn?.trim()) reasons.push('summaryEn is required');
  if (!c.programmeId) reasons.push('A related programme is required');
  else if (!c.programmePublished) reasons.push('The related programme must be published');
  if (c.startsAt && c.endsAt && c.endsAt <= c.startsAt) reasons.push('endsAt must be after startsAt');
  if (c.endsAt && c.endsAt <= new Date()) reasons.push('Campaign end date has passed');
  return reasons;
}

export function canTransition(action: CampaignAction, from: CampaignStatus) {
  return CAMPAIGN_TRANSITIONS[action].from.includes(from);
}
