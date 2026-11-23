/**
 * Phase 6D pure CMS logic (no React — runs under `node --test`).
 *
 * HOMEPAGE: `HOMEPAGE` mirrors apps/web/src/lib/content.ts `mergeContent()` exactly — which section fields, label keys and
 * item lists the public homepage actually reads, and which lists have a FIXED size (the website keeps its built-in list
 * when the published count differs). A unit test cross-checks the sizes against apps/web/src/content/en.ts.
 *
 * MENUS: `menuEntryError` mirrors apps/web/src/content/pages.ts `resolveMenu()`.
 *
 * Gates mirror the API rules (cms.service.ts, faq.module.ts, statistics.module.ts); the API stays authoritative.
 */
import type { Gate } from "./content.ts";

const gate = (reasons: (string | false | null | undefined)[]): Gate => {
  const r = reasons.filter((x): x is string => !!x);
  return { allowed: r.length === 0, reasons: r };
};
const blank = (v: string | null | undefined) => !v || v.trim() === "";

// ───────────── homepage model ─────────────

export type SectionField = "eyebrow" | "title" | "subtitle" | "body" | "ctaPrimaryLabel" | "ctaSecondaryLabel" | "media";
export type ItemField = "title" | "text" | "media";

export interface ListRule {
  /** i18n key (t.cms.lists.*) */
  name: string;
  /** item codes this list uses: a prefix ("step-") or an exact set (vision/mission); undefined = every item of the section */
  prefix?: string;
  codes?: string[];
  /** the public layout uses exactly this many items; another count keeps the website's built-in list */
  fixed?: number;
  fields: ItemField[];
  /** managed on another admin page (e.g. menus) */
  managedAt?: string;
}

export interface SectionDef {
  key: string;
  fields: SectionField[];
  /** flat label keys read by the website */
  labels: string[];
  lists: ListRule[];
  /** content served from another module (shown with a link, never edited here) */
  data?: { module: "statistics" | "programmes" | "enabling" | "campaigns" | "faqs"; href: string; fixed?: number };
  /** structural sections are always rendered by the website; they cannot be hidden */
  hideable: boolean;
  /** Homepage Hero: main image (section media) + secondary image (item hero-secondary-image), with EN/AR alt labels */
  heroImages?: boolean;
}

export const HOMEPAGE: SectionDef[] = [
  { key: "HERO", fields: ["eyebrow", "title", "subtitle", "body", "ctaPrimaryLabel", "ctaSecondaryLabel"], labels: ["photoCaption", "scroll"], lists: [], hideable: false, heroImages: true },
  {
    key: "QUICK_DONATE",
    fields: ["title", "body"],
    labels: ["preview", "oneOff", "monthly", "frequencyLabel", "whereLabel", "whereDefault", "amountLabel", "other", "otherLabel", "otherPlaceholder", "give", "giveMonthly", "chooseAmount", "secure", "methodsAria"],
    lists: [],
    hideable: false,
  },
  { key: "TRUST", fields: [], labels: [], lists: [{ name: "trust", fixed: 4, fields: ["title", "text"] }], hideable: true },
  { key: "ABOUT", fields: ["eyebrow", "title", "body"], labels: ["legacy", "captionA", "captionB"], lists: [], hideable: true },
  { key: "VISION_MISSION", fields: ["eyebrow", "title", "subtitle"], labels: [], lists: [{ name: "visionMission", codes: ["vision", "mission"], fields: ["title", "text"] }], hideable: true },
  { key: "HOW_WE_WORK", fields: ["eyebrow", "title", "body"], labels: [], lists: [{ name: "verbs", fixed: 4, fields: ["title", "text"] }], hideable: true },
  { key: "IMPACT", fields: ["eyebrow", "title", "body"], labels: ["attribution"], lists: [], data: { module: "statistics", href: "/statistics", fixed: 4 }, hideable: true },
  { key: "PROGRAMMES", fields: ["eyebrow", "title", "body"], labels: ["mandateLabel", "themesLabel", "give"], lists: [], data: { module: "programmes", href: "/programs", fixed: 9 }, hideable: true },
  { key: "ENABLING", fields: ["eyebrow", "title", "body"], labels: [], lists: [], data: { module: "enabling", href: "/programs?kind=ENABLING_FUNCTION", fixed: 3 }, hideable: true },
  { key: "CAMPAIGNS", fields: ["eyebrow", "title", "body"], labels: ["badge", "donate", "prev", "next", "noFigures"], lists: [], data: { module: "campaigns", href: "/campaigns" }, hideable: false },
  { key: "WHY", fields: ["eyebrow", "title", "body"], labels: [], lists: [{ name: "reasons", fixed: 4, fields: ["title", "text"] }], hideable: true },
  {
    key: "PROCESS",
    fields: ["eyebrow", "title", "body"],
    labels: ["neverTitle", "status"],
    lists: [
      { name: "steps", prefix: "step-", fixed: 4, fields: ["title", "text"] },
      { name: "never", prefix: "never-", fixed: 3, fields: ["text"] },
    ],
    hideable: true,
  },
  { key: "GALLERY", fields: ["eyebrow", "title", "body"], labels: ["note"], lists: [{ name: "photos", fixed: 7, fields: ["title", "media"] }], hideable: true },
  { key: "FAQ", fields: ["eyebrow", "title", "body"], labels: [], lists: [], data: { module: "faqs", href: "/faqs" }, hideable: true },
  { key: "FINAL_CTA", fields: ["title", "subtitle", "body", "ctaPrimaryLabel", "ctaSecondaryLabel"], labels: ["chipProgrammes", "chipAccount"], lists: [], hideable: true },
  {
    key: "FOOTER",
    fields: ["title", "subtitle"],
    labels: ["explore", "programmes", "giving", "contactTitle", "contactPending", "legalPending", "rights", "backToTop"],
    lists: [
      { name: "headerMenu", prefix: "nav-", fields: ["title"], managedAt: "/menus" },
      { name: "givingMenu", prefix: "giving-", fields: ["title"], managedAt: "/menus" },
    ],
    hideable: false,
  },
];
export const sectionDef = (key: string) => HOMEPAGE.find((d) => d.key === key);

/** Items of a section that belong to a list rule, in display order. */
export function itemsFor<T extends { code: string | null; sortOrder: number }>(rule: ListRule, items: T[]): T[] {
  const mine = items.filter((i) => (rule.codes ? rule.codes.includes(i.code ?? "") : rule.prefix ? (i.code ?? "").startsWith(rule.prefix) : true));
  return [...mine].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Published count check: only VISIBLE items are published (hidden ones are dropped from the snapshot). A fixed-size list
 * with another visible count makes the website keep its built-in list → warn before publishing.
 */
export function listCountState(rule: ListRule, items: { isVisible: boolean }[]): { visible: number; ok: boolean } {
  const visible = items.filter((i) => i.isVisible).length;
  return { visible, ok: rule.fixed === undefined || visible === rule.fixed };
}

/** Next free item code for a prefixed list (e.g. step-5, nav-7). */
export function nextCode(prefix: string, items: { code: string | null }[]): string {
  const used = new Set(items.map((i) => i.code));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/**
 * Labels are a flat map; the editor only changes the keys it knows and sends the WHOLE map back, so keys it does not
 * know (added by a later website version) are preserved. Empty values are removed (the website then uses its fallback).
 */
export function mergeLabels(current: Record<string, string> | null | undefined, edits: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...(current ?? {}) };
  for (const [k, v] of Object.entries(edits)) {
    if (v.trim() === "") delete out[k];
    else out[k] = v;
  }
  return out;
}

/** Field name in the API for a section field + locale. */
export const fieldKey = (f: Exclude<SectionField, "media">, locale: "En" | "Ar") => `${f}${locale}` as const;

// ───────────── publishing gates (cms.service.ts) ─────────────

/** Section publish: content.publish; DEMO sections or DEMO visible items are refused by the API. */
export function sectionPublishGate(s: { provenance: string; items: { provenance: string; isVisible: boolean }[] }, can: boolean): Gate {
  return gate([!can && "permission", s.provenance === "DEMO" && "demo", s.items.some((i) => i.isVisible && i.provenance === "DEMO") && "demoItem"]);
}
export const sectionUnpublishGate = (s: { status: string }, can: boolean) => gate([!can && "permission", s.status !== "PUBLISHED" && "notPublished"]);
/** Block removal (Phase 6D API): only unpublished sections, never on event pages. */
export const sectionDeleteGate = (s: { status: string }, can: boolean) => gate([!can && "permission", s.status === "PUBLISHED" && "unpublishFirst"]);
export function pagePublishGate(p: { status: string; provenance: string; titleEn: string }, can: boolean): Gate {
  return gate([!can && "permission", p.status === "PUBLISHED" && "alreadyPublished", p.provenance === "DEMO" && "demo", blank(p.titleEn) && "missingTitle"]);
}
/** A section has changes the public site does not show yet. */
export const isDirtySection = (s: { status: string; hasUnpublishedChanges: boolean }) => s.status !== "PUBLISHED" || s.hasUnpublishedChanges;

/** Block types available for a content page: every non-event key not used yet (one section per key and page). */
export const freeKeys = (keys: readonly string[], used: string[]) => keys.filter((k) => !used.includes(k));

// ───────────── FAQs (faq.module.ts) ─────────────

export function faqPublishGate(f: { status: string; provenance: string; questionEn: string; answerEn: string }, can: boolean): Gate {
  return gate([!can && "permission", f.status === "PUBLISHED" && "alreadyPublished", f.provenance === "DEMO" && "demo", blank(f.questionEn) && "missingQuestion", blank(f.answerEn) && "missingAnswer"]);
}
export const faqCategoryError = (c: string) => (/^[a-z0-9_-]{2,60}$/.test(c) ? null : "categoryFormat");
/** Categories that exist in the data (the API has no category list); "general" is the API default. */
export const faqCategories = (faqs: { category: string }[]) => [...new Set(["general", ...faqs.map((f) => f.category)])].sort();

// ───────────── statistics (statistics.module.ts) ─────────────

/** Verify needs statistics.verify, a source reference and non-DEMO provenance. */
export function statVerifyGate(s: { provenance: string; sourceRef: string | null }, can: boolean): Gate {
  return gate([!can && "permission", s.provenance === "DEMO" && "demo", blank(s.sourceRef) && "missingSource"]);
}
/** Publish needs statistics.publish, VERIFIED, non-DEMO, source and English label. */
export function statPublishGate(s: { status: string; provenance: string; verificationStatus: string; sourceRef: string | null; labelEn: string }, can: boolean): Gate {
  return gate([
    !can && "permission",
    s.status === "PUBLISHED" && "alreadyPublished",
    s.provenance === "DEMO" && "demo",
    s.verificationStatus !== "VERIFIED" && "notVerified",
    blank(s.sourceRef) && "missingSource",
    blank(s.labelEn) && "missingLabel",
  ]);
}
export const statDeleteGate = (s: { status: string }, can: boolean) => gate([!can && "permission", s.status === "PUBLISHED" && "unpublishFirst"]);
/** Fields whose change resets a VERIFIED statistic to UNVERIFIED and unpublishes it (FACT_FIELDS in the API). */
export const FACT_FIELDS = ["value", "unit", "prefix", "suffix", "sourceRef", "reportingPeriodEn", "programmeId", "attributionEn"] as const;
export const resetsVerification = (verificationStatus: string, changed: string[]) => verificationStatus === "VERIFIED" && changed.some((k) => (FACT_FIELDS as readonly string[]).includes(k));
/** Decimal(18,2), sent as a JSON number (DTO). Returns an i18n error key or null. */
export const statValueError = (s: string) => (/^-?\d{1,16}(\.\d{1,2})?$/.test(s.trim()) ? null : "valueFormat");

// ───────────── menus (apps/web resolveMenu) ─────────────

/** Locale-less public paths the website knows (apps/web/src/content/pages.ts PAGE_PATH, home = "/"). */
export const SITE_PAGES: { key: string; path: string }[] = [
  { key: "home", path: "/" },
  { key: "about", path: "/about" },
  { key: "programs", path: "/programs" },
  { key: "give", path: "/give" },
  { key: "faq", path: "/faq" },
  { key: "contact", path: "/contact" },
  { key: "privacy", path: "/privacy" },
  { key: "terms", path: "/terms" },
  { key: "cookies", path: "/cookies" },
];
export const GALA_PATH = "/events/gala-night";

/** Error key for one menu entry, or null. Mirrors resolveMenu(): a known page path or an https URL, and a label. */
export function menuEntryError(e: { titleEn: string | null; href: string | null }): string | null {
  const href = (e.href ?? "").trim();
  if (blank(e.titleEn)) return "menuLabel";
  if (href.startsWith("#")) return "menuAnchor";
  if (href === GALA_PATH || SITE_PAGES.some((p) => p.path === href)) return null;
  if (/^https:\/\/[^\s"'<>]+$/.test(href)) return null;
  return "menuHref";
}
/** Gala Night is a fixed website entry: a Gala item in a list is ignored by the website (never duplicated). */
export const menuEntryWarning = (e: { href: string | null }) => ((e.href ?? "").trim() === GALA_PATH ? "menuGala" : null);

/**
 * Whether the website will use this published list: every visible entry valid and at least one that is not the ignored
 * Gala entry. Otherwise it keeps the built-in menu (the state of the seeded data, which still holds one-page "#anchor" links).
 */
export function menuState(items: { isVisible: boolean; titleEn: string | null; href: string | null }[]): { used: boolean; invalid: number } {
  const visible = items.filter((i) => i.isVisible);
  const invalid = visible.filter((i) => menuEntryError(i) !== null).length;
  const effective = visible.filter((i) => menuEntryWarning(i) === null).length;
  return { used: effective > 0 && invalid === 0, invalid };
}

// ───────────── site settings ─────────────

/** Mirrors the API DTO (settings.dto.ts) so most errors are shown before saving; the server stays authoritative. */
export const ASSET_URL = /^(\/[\w\-/.]+|https:\/\/[^\s"'<>]+)$/;
export const HTTPS_URL = /^https:\/\/[^\s"'<>]+$/;
export const PHONE = /^\+?[\d\s()-]{6,40}$/;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function siteErrors(v: { orgNameEn: string; contactEmail: string; contactPhone: string; logoPrimaryUrl: string; logoInverseUrl: string; logoIconUrl: string; socialLinks: { url: string }[] }) {
  const logo = (s: string) => (s.trim() && !ASSET_URL.test(s.trim()) ? "logo" : null);
  return {
    orgNameEn: v.orgNameEn.trim() ? null : "required",
    contactEmail: v.contactEmail.trim() && !EMAIL.test(v.contactEmail.trim()) ? "email" : null,
    contactPhone: v.contactPhone.trim() && !PHONE.test(v.contactPhone.trim()) ? "phone" : null,
    logoPrimaryUrl: logo(v.logoPrimaryUrl),
    logoInverseUrl: logo(v.logoInverseUrl),
    logoIconUrl: logo(v.logoIconUrl),
    socialLinks: v.socialLinks.length > 12 || v.socialLinks.some((l) => !HTTPS_URL.test(l.url.trim())) ? "social" : null,
  };
}
