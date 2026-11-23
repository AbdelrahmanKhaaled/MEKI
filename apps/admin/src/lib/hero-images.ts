/**
 * Homepage Hero images — admin-side mirror of the API rules (apps/api/src/modules/cms/hero-images.ts). Used for instant feedback
 * in the picker; the API re-checks every assignment (HERO_IMAGE_INVALID) and is the authority. Pure; unit tested.
 *  - main image      → HERO section media (mediaId)
 *  - secondary image → HERO item with code `hero-secondary-image` (mediaId)
 */
export const HERO_SECONDARY_ITEM_CODE = "hero-secondary-image";
export type HeroSlot = "main" | "secondary";

export const HERO_RULES: Record<HeroSlot, { minWidth: number; minHeight: number; maxBytes: number }> = {
  main: { minWidth: 800, minHeight: 1000, maxBytes: 10 * 1024 * 1024 },
  secondary: { minWidth: 300, minHeight: 300, maxBytes: 10 * 1024 * 1024 },
};

/** Alt-text labels stored on the HERO section (labelsEn / labelsAr). */
export const HERO_ALT_LABELS: Record<HeroSlot, string> = { main: "mainImageAlt", secondary: "secondaryImageAlt" };

type Candidate = { width: number | null; height: number | null; provenance: string; consentStatus: string; sizeBytes: number; mimeType: string; storageDriver: string };

export function heroImageProblems(m: Candidate, slot: HeroSlot): string[] {
  const r = HERO_RULES[slot];
  const out: string[] = [];
  if (!["image/jpeg", "image/png", "image/webp"].includes(m.mimeType)) out.push("NOT_IMAGE");
  if (m.consentStatus === "NOT_GRANTED") out.push("NOT_PUBLIC");
  if (m.provenance === "DEMO") out.push("DEMO");
  if (m.width == null || m.height == null) {
    if (m.storageDriver !== "WEB_STATIC") out.push("UNKNOWN_SIZE");
  } else if (m.width < r.minWidth || m.height < r.minHeight) out.push("TOO_SMALL");
  if (m.sizeBytes > r.maxBytes) out.push("TOO_LARGE");
  return out;
}
