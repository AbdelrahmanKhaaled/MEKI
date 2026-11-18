import { cache } from "react";
import type { PublicFaq, PublicSite, PublicCampaign, PublicHome, PublicProgramme, PublicSection, PublicSectionItem } from "@meki/api-client";
import type { Campaign, Dict, IconName, Programme } from "@/content/en";
import { toMediaRef } from "@/content/media";
import { getDict, type Locale } from "@/lib/i18n";
import { fetchPublicContent } from "@/lib/api";

/** A campaign the backend reports as live + approved; the donation form may target it by slug. */
export type LiveCampaign = { slug: string; title: string; currency: string; acceptingDonations: boolean };

export interface PageContent {
  t: Dict;
  /** true when published content came from the API; false = built-in fallback content */
  live: boolean;
  liveCampaigns: LiveCampaign[];
  /** Featured Campaigns render only when the API publishes approved campaigns and the CMS section is visible. */
  showCampaigns: boolean;
  /** Published site settings (contact, social). Null when the API is unavailable. */
  site: PublicSite | null;
  /** Published FAQ records with their CMS category (empty → built-in questions). */
  faqs: PublicFaq[];
  /** Homepage sections an editor published as hidden (Phase 6D); empty when the API is unavailable. */
  hiddenSections: string[];
}

/** Sections the CMS may hide on the homepage. Hero, quick donate and footer are structural and always shown. */
export const HIDEABLE_SECTIONS = ["TRUST", "ABOUT", "VISION_MISSION", "HOW_WE_WORK", "IMPACT", "PROGRAMMES", "ENABLING", "WHY", "PROCESS", "GALLERY", "FAQ", "FINAL_CTA"] as const;

const ICONS: IconName[] = ["users", "stethoscope", "graduation", "briefcase", "home", "droplets", "lifebuoy", "landmark", "flask", "handshake", "map", "chart"];
const icon = (v: string | null | undefined, fallback: IconName): IconName => (v && (ICONS as string[]).includes(v) ? (v as IconName) : fallback);

/** Returns `value` when it is a non-empty string, otherwise the static fallback. */
const str = (value: string | null | undefined, fallback: string) => (typeof value === "string" && value.trim() !== "" ? value : fallback);

/**
 * Replaces a fixed-layout list only when the API provides the same number of items; otherwise keeps the
 * built-in list. Several sections are designed around an exact count (4 verbs, 9 programmes…), so a
 * partially edited list can never break a layout or an animation.
 */
function sameShape<S, A>(fallback: S[], incoming: A[] | null | undefined, map: (a: A, i: number, f: S) => S): S[] {
  if (!incoming || incoming.length !== fallback.length) return fallback;
  return incoming.map((a, i) => map(a, i, fallback[i]));
}

const labels = (s: PublicSection | undefined) => s?.labels ?? {};
const byCode = (s: PublicSection | undefined, prefix: string) => (s?.items ?? []).filter((i) => i.code?.startsWith(prefix));

/** Overlays published API content onto the built-in dictionary, field by field. */
export function mergeContent(base: Dict, home: PublicHome): Dict {
  const t = structuredClone(base);
  const sec = new Map(home.page.sections.map((s) => [s.key, s]));
  const L = (s: PublicSection | undefined, key: string, fb: string) => str(labels(s)[key], fb);

  // meta
  t.meta.title = str(home.page.seoTitle, t.meta.title);
  t.meta.description = str(home.page.seoDescription, t.meta.description);

  const hero = sec.get("HERO");
  if (hero) {
    t.hero.eyebrow = str(hero.eyebrow, t.hero.eyebrow);
    t.hero.titleA = str(hero.title, t.hero.titleA);
    t.hero.titleB = str(hero.subtitle, t.hero.titleB);
    t.hero.lead = str(hero.body, t.hero.lead);
    t.hero.ctaPrimary = str(hero.ctaPrimaryLabel, t.hero.ctaPrimary);
    t.hero.ctaSecondary = str(hero.ctaSecondaryLabel, t.hero.ctaSecondary);
    t.hero.photoCaption = L(hero, "photoCaption", t.hero.photoCaption);
    t.hero.scroll = L(hero, "scroll", t.hero.scroll);
  }

  const quick = sec.get("QUICK_DONATE");
  if (quick) {
    t.quick.title = str(quick.title, t.quick.title);
    t.quick.note = str(quick.body, t.quick.note);
    for (const k of Object.keys(t.quick) as (keyof Dict["quick"])[]) {
      if (k !== "title" && k !== "note") t.quick[k] = L(quick, k, t.quick[k]);
    }
  }

  t.trust = sameShape(t.trust, sec.get("TRUST")?.items, (i, _n, f) => ({ title: str(i.title, f.title), text: str(i.text, f.text) }));

  const about = sec.get("ABOUT");
  if (about) {
    t.about.eyebrow = str(about.eyebrow, t.about.eyebrow);
    t.about.title = str(about.title, t.about.title);
    t.about.body = str(about.body, t.about.body);
    t.about.legacy = L(about, "legacy", t.about.legacy);
    t.about.captionA = L(about, "captionA", t.about.captionA);
    t.about.captionB = L(about, "captionB", t.about.captionB);
  }
  const vm = sec.get("VISION_MISSION");
  if (vm) {
    t.about.vmEyebrow = str(vm.eyebrow, t.about.vmEyebrow);
    t.about.vmTitle = str(vm.title, t.about.vmTitle);
    t.about.vmTagline = str(vm.subtitle, t.about.vmTagline);
    const vision = vm.items.find((i) => i.code === "vision");
    const mission = vm.items.find((i) => i.code === "mission");
    t.about.visionLabel = str(vision?.title, t.about.visionLabel);
    t.about.vision = str(vision?.text, t.about.vision);
    t.about.missionLabel = str(mission?.title, t.about.missionLabel);
    t.about.mission = str(mission?.text, t.about.mission);
  }

  const how = sec.get("HOW_WE_WORK");
  if (how) {
    t.how.eyebrow = str(how.eyebrow, t.how.eyebrow);
    t.how.title = str(how.title, t.how.title);
    t.how.intro = str(how.body, t.how.intro);
    t.how.items = sameShape(t.how.items, how.items, (i, _n, f) => ({ verb: str(i.title, f.verb), text: str(i.text, f.text) }));
  }

  const impact = sec.get("IMPACT");
  if (impact) {
    t.impact.eyebrow = str(impact.eyebrow, t.impact.eyebrow);
    t.impact.title = str(impact.title, t.impact.title);
    t.impact.intro = str(impact.body, t.impact.intro);
    t.impact.attribution = L(impact, "attribution", t.impact.attribution);
  }
  // Only published AND verified figures are returned by the API; each keeps its attribution.
  t.impact.stats = sameShape(t.impact.stats, home.statistics, (s, _n, f) => {
    const value = Number(s.value);
    return { value: Number.isFinite(value) ? value : f.value, prefix: s.prefix ?? "", suffix: s.suffix ?? "", label: str(s.label, f.label) };
  });

  const progSec = sec.get("PROGRAMMES");
  if (progSec) {
    t.programmes.eyebrow = str(progSec.eyebrow, t.programmes.eyebrow);
    t.programmes.title = str(progSec.title, t.programmes.title);
    t.programmes.intro = str(progSec.body, t.programmes.intro);
    t.programmes.mandateLabel = L(progSec, "mandateLabel", t.programmes.mandateLabel);
    t.programmes.themesLabel = L(progSec, "themesLabel", t.programmes.themesLabel);
    t.programmes.give = L(progSec, "give", t.programmes.give);
  }
  const programmes = home.programmes.filter((p) => p.kind === "PROGRAMME");
  t.programmes.items = sameShape<Programme, PublicProgramme>(t.programmes.items, programmes, (p, i, f) => ({
    n: p.number != null ? String(p.number).padStart(2, "0") : f.n,
    slug: p.slug || f.slug,
    name: str(p.name, f.name),
    short: str(p.shortDesc, f.short),
    mandate: str(p.mandate, f.mandate),
    themes: p.focusAreas?.length ? p.focusAreas : f.themes,
    image: toMediaRef(p.cover) ?? f.image,
    icon: icon(p.icon, f.icon),
  }));

  const enabling = sec.get("ENABLING");
  if (enabling) {
    t.enabling.eyebrow = str(enabling.eyebrow, t.enabling.eyebrow);
    t.enabling.title = str(enabling.title, t.enabling.title);
    t.enabling.intro = str(enabling.body, t.enabling.intro);
  }
  t.enabling.items = sameShape(t.enabling.items, home.programmes.filter((p) => p.kind === "ENABLING_FUNCTION"), (p, _n, f) => ({
    name: str(p.name, f.name),
    text: str(p.shortDesc, f.text),
    icon: icon(p.icon, f.icon),
  }));

  const camp = sec.get("CAMPAIGNS");
  if (camp) {
    t.campaigns.eyebrow = str(camp.eyebrow, t.campaigns.eyebrow);
    t.campaigns.title = str(camp.title, t.campaigns.title);
    t.campaigns.intro = str(camp.body, t.campaigns.intro);
    for (const k of ["badge", "donate", "prev", "next", "noFigures"] as const) t.campaigns[k] = L(camp, k, t.campaigns[k]);
  }
  // Approved, published campaigns replace the preview cards. With none approved (today) the preview
  // cards — clearly labelled "pending approval" — remain, exactly as on the current site.
  if (home.campaigns.length > 0) {
    t.campaigns.items = home.campaigns.map<Campaign>((c: PublicCampaign, i) => {
      const f = base.campaigns.items[i % base.campaigns.items.length];
      return {
        slug: c.slug,
        title: c.title,
        programme: c.programme?.name ?? "",
        programmeSlug: c.programme?.slug ?? "",
        text: str(c.summary, ""),
        image: toMediaRef(c.cover) ?? f.image,
      };
    });
  }

  const why = sec.get("WHY");
  if (why) {
    t.why.eyebrow = str(why.eyebrow, t.why.eyebrow);
    t.why.quote = str(why.title, t.why.quote);
    t.why.lead = str(why.body, t.why.lead);
    t.why.items = sameShape(t.why.items, why.items, (i, _n, f) => ({ title: str(i.title, f.title), text: str(i.text, f.text) }));
  }

  const process = sec.get("PROCESS");
  if (process) {
    t.process.eyebrow = str(process.eyebrow, t.process.eyebrow);
    t.process.title = str(process.title, t.process.title);
    t.process.intro = str(process.body, t.process.intro);
    t.process.neverTitle = L(process, "neverTitle", t.process.neverTitle);
    t.process.status = L(process, "status", t.process.status);
    t.process.steps = sameShape(t.process.steps, byCode(process, "step-"), (i, _n, f) => ({ title: str(i.title, f.title), text: str(i.text, f.text) }));
    t.process.never = sameShape(t.process.never, byCode(process, "never-"), (i: PublicSectionItem, _n, f) => str(i.text, f));
  }

  const gallery = sec.get("GALLERY");
  if (gallery) {
    t.gallery.eyebrow = str(gallery.eyebrow, t.gallery.eyebrow);
    t.gallery.title = str(gallery.title, t.gallery.title);
    t.gallery.intro = str(gallery.body, t.gallery.intro);
    t.gallery.note = L(gallery, "note", t.gallery.note);
    t.gallery.items = sameShape(t.gallery.items, gallery.items, (i, _n, f) => ({ image: toMediaRef(i.media) ?? f.image, caption: str(i.title, f.caption) }));
  }

  const faq = sec.get("FAQ");
  if (faq) {
    t.faq.eyebrow = str(faq.eyebrow, t.faq.eyebrow);
    t.faq.title = str(faq.title, t.faq.title);
    t.faq.intro = str(faq.body, t.faq.intro);
  }
  // The FAQ accordion is list-driven, so any number of published questions is supported.
  if (home.faqs.length > 0) t.faq.items = home.faqs.map((f) => ({ q: f.question, a: f.answer }));

  const final = sec.get("FINAL_CTA");
  if (final) {
    t.final.titleA = str(final.title, t.final.titleA);
    t.final.titleB = str(final.subtitle, t.final.titleB);
    t.final.text = str(final.body, t.final.text);
    t.final.ctaPrimary = str(final.ctaPrimaryLabel, t.final.ctaPrimary);
    t.final.ctaSecondary = str(final.ctaSecondaryLabel, t.final.ctaSecondary);
    t.final.chipProgrammes = L(final, "chipProgrammes", t.final.chipProgrammes);
    t.final.chipAccount = L(final, "chipAccount", t.final.chipAccount);
  }

  const footer = sec.get("FOOTER");
  if (footer) {
    t.footer.tagline = str(footer.title, t.footer.tagline);
    t.footer.legacy = str(footer.subtitle, t.footer.legacy);
    for (const k of ["explore", "programmes", "giving", "contactTitle", "contactPending", "legalPending", "rights", "backToTop"] as const) {
      t.footer[k] = L(footer, k, t.footer[k]);
    }
    // Menus are lists of any length (Phase 6D): the header/footer validate them with resolveMenu() and fall back to the
    // built-in page menu unless every entry is a known page or an https URL.
    const nav = byCode(footer, "nav-");
    if (nav.length) t.nav.links = nav.map((i) => ({ href: i.href ?? "", label: i.title ?? "" }));
    const giving = byCode(footer, "giving-");
    if (giving.length) t.footer.givingLinks = giving.map((i) => ({ href: i.href ?? "", label: i.title ?? "" }));
  }
  return t;
}

const UK_US: [RegExp, string][] = [
  [/programme/g, "program"], [/Programme/g, "Program"], [/labour/g, "labor"], [/Labour/g, "Labor"],
  [/organis/g, "organiz"], [/Organis/g, "Organiz"], [/stabilis/g, "stabiliz"], [/Stabilis/g, "Stabiliz"], [/finalis/g, "finaliz"],
];
/** Display-only American spelling for English strings (keys, slugs, hrefs and URLs are never touched). */
function americanize<T>(v: T): T {
  if (typeof v === "string") return (/^(\/|#|https?:)/.test(v) ? v : UK_US.reduce((s: string, [re, to]) => s.replace(re, to), v)) as T;
  if (Array.isArray(v)) return v.map(americanize) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "slug" || k === "programmeSlug" || k === "href" ? x : americanize(x)])) as T;
  return v;
}

/**
 * Superseded seed copy (client-approved wording replaced it). A published CMS value that still equals one of
 * these was never edited by an admin, so the approved built-in wording wins; any admin edit is preserved.
 */
const SUPERSEDED = {
  heroPrimary: ["explore our programmes", "explore our programs", "استكشف برامجنا"],
  heroSecondary: ["how giving works", "كيف يتم التبرع"],
  mission: ["أن نربط الشركاء حول العالم ونوحّدهم في تنمية قائمة على الأدلة تدوم، تمكّن الأفراد والمجتمعات والمؤسسات، مع حساب كل مساهمة من البداية إلى النهاية.", "to connect and unite partners across the world in evidence-based development that lasts, empowering people, communities and institutions, with every contribution accounted for from start to finish."],
};
const isStale = (v: string, list: string[]) => list.includes(v.trim().toLowerCase());

/** Final pass: keep approved wording over untouched legacy CMS seed values, drop hidden-section anchors, US spelling. */
function finish(t: Dict, locale: Locale, showCampaigns = false): Dict {
  const b = getDict(locale);
  if (isStale(t.hero.ctaPrimary, SUPERSEDED.heroPrimary)) t.hero.ctaPrimary = b.hero.ctaPrimary;
  if (isStale(t.hero.ctaSecondary, SUPERSEDED.heroSecondary)) t.hero.ctaSecondary = b.hero.ctaSecondary;
  if (isStale(t.about.mission, SUPERSEDED.mission)) t.about.mission = b.about.mission;
  if (locale === "en") {
    t.about.vmTagline = b.about.vmTagline;
    if (t.hero.titleA.trim().toLowerCase() === "lasting change,") { t.hero.titleA = b.hero.titleA; t.hero.titleB = b.hero.titleB; }
  }
  // Hidden-section anchors are removed from the navigation.
  if (!showCampaigns) t.nav.links = t.nav.links.filter((l) => l.href !== "#campaigns");
  return locale === "en" ? americanize(t) : t;
}

/**
 * Landing-page content for a locale: published API content overlaid on the built-in dictionary.
 * One cached request per locale and revalidation window (React cache dedupes page + metadata calls).
 */
export const getPageContent = cache(async (locale: Locale): Promise<PageContent> => {
  const base = getDict(locale);
  const home = await fetchPublicContent<PublicHome>(`/public/home?locale=${locale}`);
  if (!home?.page?.sections) return { t: finish(base, locale), live: false, liveCampaigns: [], showCampaigns: false, site: null, faqs: [], hiddenSections: [] };
  try {
    return {
      t: finish(mergeContent(base, home), locale, home.campaigns.length > 0),
      live: true,
      site: home.site ?? null,
      faqs: home.faqs ?? [],
      hiddenSections: (home.page.hiddenSectionKeys ?? []).filter((k) => (HIDEABLE_SECTIONS as readonly string[]).includes(k)),
      showCampaigns: home.campaigns.length > 0 && home.page.sections.some((s) => s.key === "CAMPAIGNS"),
      liveCampaigns: home.campaigns.map((c) => ({ slug: c.slug, title: c.title, currency: c.currency, acceptingDonations: c.acceptingDonations })),
    };
  } catch {
    // Defensive: an unexpected payload never takes the page down.
    return { t: finish(base, locale), live: false, liveCampaigns: [], showCampaigns: false, site: null, faqs: [], hiddenSections: [] };
  }
});

/** Programme / campaign detail endpoints (for future detail pages; not rendered on the landing page). */
export const getProgramme = (slug: string, locale: Locale) => fetchPublicContent<PublicProgramme>(`/public/programmes/${encodeURIComponent(slug)}?locale=${locale}`);
export const getCampaign = (slug: string, locale: Locale) => fetchPublicContent<PublicCampaign>(`/public/campaigns/${encodeURIComponent(slug)}?locale=${locale}`);
