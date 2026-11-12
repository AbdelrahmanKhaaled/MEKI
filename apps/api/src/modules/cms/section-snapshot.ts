import type { MediaAsset, PageSection, SectionItem } from '../../generated/prisma/client';

export type SectionForSnapshot = PageSection & {
  media: MediaAsset | null;
  items: (SectionItem & { media: MediaAsset | null })[];
};

/** Media reference stored in snapshots; the public URL is resolved at read time (storage/base URL may change). */
export interface SnapshotMedia {
  id: string;
  storageDriver: MediaAsset['storageDriver'];
  storageKey: string;
  width: number | null;
  height: number | null;
  altEn: string | null;
  altAr: string | null;
  captionEn: string | null;
  captionAr: string | null;
}

const mediaRef = (m: MediaAsset | null): SnapshotMedia | null =>
  m && !m.deletedAt
    ? {
        id: m.id,
        storageDriver: m.storageDriver,
        storageKey: m.storageKey,
        width: m.width,
        height: m.height,
        altEn: m.altEn,
        altAr: m.altAr,
        captionEn: m.captionEn,
        captionAr: m.captionAr,
      }
    : null;

/** Builds the public snapshot of a section (published copy). Pure: used by the CMS service and the seed. */
export function buildSectionSnapshot(s: SectionForSnapshot) {
  return {
    id: s.id,
    key: s.key,
    anchor: s.anchor,
    sortOrder: s.sortOrder,
    isVisible: s.isVisible,
    eyebrowEn: s.eyebrowEn,
    eyebrowAr: s.eyebrowAr,
    titleEn: s.titleEn,
    titleAr: s.titleAr,
    subtitleEn: s.subtitleEn,
    subtitleAr: s.subtitleAr,
    bodyEn: s.bodyEn,
    bodyAr: s.bodyAr,
    ctaPrimaryLabelEn: s.ctaPrimaryLabelEn,
    ctaPrimaryLabelAr: s.ctaPrimaryLabelAr,
    ctaPrimaryHref: s.ctaPrimaryHref,
    ctaSecondaryLabelEn: s.ctaSecondaryLabelEn,
    ctaSecondaryLabelAr: s.ctaSecondaryLabelAr,
    ctaSecondaryHref: s.ctaSecondaryHref,
    labelsEn: s.labelsEn,
    labelsAr: s.labelsAr,
    provenance: s.provenance,
    media: mediaRef(s.media),
    items: [...s.items]
      .filter((i) => i.isVisible)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => ({
        id: i.id,
        code: i.code,
        sortOrder: i.sortOrder,
        titleEn: i.titleEn,
        titleAr: i.titleAr,
        textEn: i.textEn,
        textAr: i.textAr,
        icon: i.icon,
        href: i.href,
        provenance: i.provenance,
        media: mediaRef(i.media),
      })),
  };
}

export type SectionSnapshot = ReturnType<typeof buildSectionSnapshot>;
