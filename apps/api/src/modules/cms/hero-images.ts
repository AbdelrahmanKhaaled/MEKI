import type { MediaAsset } from '../../generated/prisma/client';
import { isPubliclyServable } from '../media/media.service';

/**
 * Homepage Hero images (CMS). No schema change: the existing CMS relations carry them, so drafts, publish snapshots, audit and
 * the public API work exactly like every other section.
 *  - main (arched) image      → HERO section `mediaId`
 *  - secondary (circle) image → HERO section item with code `hero-secondary-image`, `mediaId`
 * A null mediaId means "website default" (the curated hero-field / water-pier photos).
 */
export const HERO_SECONDARY_ITEM_CODE = 'hero-secondary-image';

export type HeroImageSlot = 'main' | 'secondary';

/** Minimum pixel sizes: the arched frame renders up to ~520 css px wide at 3:4 (×2 for high-density screens); the circle 144 px. */
export const HERO_IMAGE_RULES: Record<HeroImageSlot, { minWidth: number; minHeight: number; maxBytes: number }> = {
  main: { minWidth: 800, minHeight: 1000, maxBytes: 10 * 1024 * 1024 },
  secondary: { minWidth: 300, minHeight: 300, maxBytes: 10 * 1024 * 1024 },
};

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type HeroImageProblem = 'DELETED' | 'NOT_IMAGE' | 'NOT_PUBLIC' | 'DEMO' | 'UNKNOWN_SIZE' | 'TOO_SMALL' | 'TOO_LARGE';

/** Why an asset cannot be used in a Hero slot (empty = acceptable). Pure; unit tested. */
export function heroImageProblems(
  asset: Pick<MediaAsset, 'deletedAt' | 'mimeType' | 'consentStatus' | 'provenance' | 'width' | 'height' | 'sizeBytes' | 'storageDriver'>,
  slot: HeroImageSlot,
  consentMode: 'not_denied' | 'confirmed_only',
): HeroImageProblem[] {
  const rule = HERO_IMAGE_RULES[slot];
  const out: HeroImageProblem[] = [];
  if (asset.deletedAt) out.push('DELETED');
  if (!IMAGE_MIMES.has(asset.mimeType)) out.push('NOT_IMAGE');
  // the public website must be able to load it (consent policy of the media file route)
  if (!isPubliclyServable(asset, consentMode)) out.push('NOT_PUBLIC');
  // DEMO material is never published as real content (CLAUDE.md guardrail)
  if (asset.provenance === 'DEMO') out.push('DEMO');
  if (asset.width == null || asset.height == null) {
    if (asset.storageDriver !== 'WEB_STATIC') out.push('UNKNOWN_SIZE');
  } else if (asset.width < rule.minWidth || asset.height < rule.minHeight) out.push('TOO_SMALL');
  if (asset.sizeBytes > rule.maxBytes) out.push('TOO_LARGE');
  return out;
}
