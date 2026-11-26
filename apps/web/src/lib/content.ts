import { deliveryPhotos } from "@/content/delivery";
import { cache } from "react";
import type { PublicFaq, PublicSite, PublicCampaign, PublicHome, PublicProgramme, PublicSection, PublicSectionItem } from "@meki/api-client";
import type { Campaign, Dict, GalleryItem, IconName, Programme, SocialLink } from "@/content/en";
import { photoCaption } from "@/lib/venue-photos";
import { isAllowedRemoteImage, toMediaRef } from "@/content/media";
import { getDict, type Locale } from "@/lib/i18n";
import { fetchPublicContent } from "@/lib/api";
import { SUPERSEDED_PROGRAMMES } from "@/content/superseded-programmes";

/** CMS item code of the Hero's secondary (circular) image — same constant as the API (apps/api/src/modules/cms/hero-images.ts). */
export const HERO_SECONDARY_ITEM_CODE = "hero-secondary-image";

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
    // Hero images (CMS): main = section media, secondary = item "hero-secondary-image". Unset → the curated defaults stay.
    // Alt text: the slot's own EN/AR label, else the Media Library alt text, else decorative ("").
    const main = toMediaRef(hero.media);
    if (main && main !== "hero-field") {
      t.hero.image = main;
      t.hero.imageAlt = L(hero, "mainImageAlt", str(hero.media?.alt, ""));
    }
    const second = hero.items?.find((i) => i.code === HERO_SECONDARY_ITEM_CODE)?.media;
    const secondRef = toMediaRef(second);
    if (secondRef && secondRef !== "water-pier" && secondRef !== "water-pipe") {
      t.hero.secondaryImage = secondRef;
      t.hero.secondaryImageAlt = L(hero, "secondaryImageAlt", str(second?.alt, ""));
    }
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
    // MEKI Legacy (25 Nov 2026): labels legacyTitle / legacyTagline + items legacy-1…3 (paragraphs).
    t.about.legacyTitle = L(about, "legacyTitle", t.about.legacyTitle);
    t.about.legacyTagline = L(about, "legacyTagline", t.about.legacyTagline);
    const paras = byCode(about, "legacy-").map((i) => (i.text ?? "").trim()).filter(Boolean);
    if (paras.length) t.about.legacyParas = paras;
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
    t.programmes.outcomesLabel = L(progSec, "outcomesLabel", t.programmes.outcomesLabel);
    t.programmes.give = L(progSec, "give", t.programmes.give);
    t.programmes.howTitle = L(progSec, "howTitle", t.programmes.howTitle);
    // "How it works" (MEKI client edits, 22 Nov 2026): five numbered steps, CMS items "how-1" … "how-5".
    t.programmes.how = sameShape(t.programmes.how, byCode(progSec, "how-"), (i, _n, f) => ({ title: str(i.title, f.title), text: str(i.text, f.text) }));
  }
  const programmes = home.programmes.filter((p) => p.kind === "PROGRAMME");
  // Programs Word document (25 Nov 2026): a database value that still equals the previous seeded/approved copy (SUPERSEDED_PROGRAMMES)
  // was never edited by an admin, so the new built-in copy wins; any other value an admin wrote is shown as written.
  const oldCovers: Record<string, string> = { "social-solidarity": "livestock", health: "doctor-patient", education: "student-reading", "economic-empowerment": "weaver", housing: "housing-roof", wash: "water-pier", "emergency-response": "relief", "heritage-culture": "swimmer", "scientific-research": "student-lab" };
  const old = SUPERSEDED_PROGRAMMES[base.locale === "ar" ? "ar" : "en"];
  const stale = (v: string | null | undefined, list: string[] | undefined) => !v || (list ?? []).some((o) => o.trim() === v.trim());
  const staleList = (v: string[] | null | undefined, lists: string[][] | undefined) => !v?.length || (lists ?? []).some((o) => o.length === v.length && o.every((x, i) => x.trim() === v[i]?.trim()));
  t.programmes.items = sameShape<Programme, PublicProgramme>(t.programmes.items, programmes, (p, _i, f) => {
    f = base.programmes.items.find((item) => item.slug === p.slug) ?? f;
    const cover = toMediaRef(p.cover);
    const o = old.programmes[f.slug];
    const themes = staleList(p.focusAreas, o?.themes) ? f.themes : (p.focusAreas as string[]);
    // area descriptions: the admin's own list when it matches the titles one-to-one; the built-in ones while the titles are the built-in ones
    const details = p.focusAreaDetails?.length === themes.length ? p.focusAreaDetails : themes === f.themes ? f.areaTexts : themes.map(() => "");
    return {
      n: p.number != null ? String(p.number).padStart(2, "0") : f.n,
      slug: p.slug || f.slug,
      name: str(p.name, f.name),
      pageTitle: str(p.pageTitle, f.pageTitle ?? ""),
      short: stale(p.shortDesc, o?.short) ? f.short : (p.shortDesc as string),
      summary: stale(p.summary, o?.summary) ? f.summary : (p.summary as string),
      mandate: stale(p.mandate, o?.mandate) ? f.mandate : (p.mandate as string),
      themes,
      areaTexts: details,
      outcomes: staleList(p.outcomes, o?.outcomes) ? f.outcomes : (p.outcomes as string[]),
      image: cover && cover !== oldCovers[p.slug] ? cover : f.image,
      icon: icon(p.icon, f.icon),
    };
  });

  const enabling = sec.get("ENABLING");
  if (enabling) {
    t.enabling.eyebrow = str(enabling.eyebrow, t.enabling.eyebrow);
    t.enabling.title = str(enabling.title, t.enabling.title);
    t.enabling.intro = str(enabling.body, t.enabling.intro);
  }
  // Enabling functions: shortDesc = the tagline, summary = the sentence. Values still equal to the previous approved copy keep the new built-in wording.
  t.enabling.items = sameShape(t.enabling.items, home.programmes.filter((p) => p.kind === "ENABLING_FUNCTION"), (p, n, f) => {
    const o = old.enabling[n];
    return { name: stale(p.name, o?.name) ? f.name : (p.name as string), tagline: stale(p.shortDesc, o?.tagline) ? f.tagline : (p.shortDesc as string), text: stale(p.summary, o?.text) ? f.text : (p.summary as string), icon: icon(p.icon, f.icon) };
  });

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
    t.gallery.showMore = L(gallery, "showMore", t.gallery.showMore ?? "Show more photos");
    t.gallery.showLess = L(gallery, "showLess", t.gallery.showLess ?? "Show fewer photos");
    // The gallery is list-driven (any number of photos, MEKI client delivery 24 Nov 2026): every published photo is shown.
    // Previously the list was replaced only when exactly 7 photos were published, so adding photos in Admin changed nothing.
    if (Array.isArray(gallery.items)) {
      const defaults = getDict(base.locale as Locale).gallery.items;
      const items = gallery.items.flatMap((i) => {
        const ref = toMediaRef(i.media);
        if (!ref) return [];
        return [galleryItem(i, defaults.find((item) => item.image === ref))];
      });
      const originalSeed = items.length === defaults.length && items.every((item, n) => item.image === defaults[n].image && item.title === defaults[n].title && item.place === defaults[n].place && item.program === defaults[n].program);
      if (!originalSeed) t.gallery.items = [...new Map(items.map((item) => [item.image, item])).values()];
    }
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
    t.footer.followUs = L(footer, "followUs", t.footer.followUs);
  }
  // "Follow us" (item 14): the social accounts stored in Site settings (https only). None stored → the confirmed Instagram account.
  t.footer.social = socialLinks(home.site?.socialLinks, t.footer.social);
  applySiteSettings(t, base, home.site);
  return t;
}

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i;
/**
 * Logo files superseded by the approved MEKI_Secondary artwork (client edits, 23 Nov 2026). Site settings are seeded only once, so
 * sites created before that change can still store these paths; they are ignored (the approved default shows) — no database edit needed.
 */
export const SUPERSEDED_LOGOS = new Set(["/brand/MEKI_Primary_Green.svg", "/brand/MEKI_Primary_White.svg"]);
/** Keeps an editor-changed value (≠ the built-in default); otherwise a non-empty Site-settings value; otherwise the default. */
const prefer = (current: string, builtIn: string, site: string | null | undefined) => (current.trim() !== builtIn.trim() || !site?.trim() ? current : site.trim());

/**
 * Site settings (Admin → Site settings) → website. Previously only the contact page read them; the footer showed built-in text, so
 * editing Copyright / Footer text / Footer note / contact details changed nothing publicly. Rules: a value edited in the homepage
 * Footer section keeps priority (it differs from the built-in default); otherwise the Site-settings value is shown; otherwise the
 * built-in default. Contact details and the footer text are shown only when stored — nothing is invented. `site` is part of
 * /public/home, which a Site-settings save revalidates (scope "site" = full flush).
 */
export function applySiteSettings(t: Dict, base: Dict, site: PublicSite | null | undefined) {
  if (!site) return;
  t.meta.title = prefer(t.meta.title, base.meta.title, site.seoTitle);
  t.meta.description = prefer(t.meta.description, base.meta.description, site.seoDescription);
  const f = t.footer;
  f.tagline = prefer(f.tagline, base.footer.tagline, site.tagline);
  f.legacy = prefer(f.legacy, base.footer.legacy, site.legacyLine);
  f.rights = prefer(f.rights, base.footer.rights, site.copyright);
  const note = site.footerNote?.trim();
  if (note && note !== base.footer.contactPending.trim()) f.note = note; // the stored placeholder is never shown next to real details
  if (site.footerText?.trim()) f.text = site.footerText.trim();
  if (site.contactEmail && EMAIL.test(site.contactEmail.trim())) f.email = site.contactEmail.trim();
  if (site.contactPhone?.trim()) f.phone = site.contactPhone.trim();
  if (site.address?.trim()) f.address = site.address.trim();
  // Logos (Site settings → Branding): primary = on light backgrounds, inverse = on dark. Only same-origin /brand/ files or an allowed
  // Media Library image are accepted, and the logo is never re-drawn or stretched (Logo sets only the width).
  const logo = (u: string | null | undefined) => (u && !SUPERSEDED_LOGOS.has(u.trim()) && (/^\/brand\/[\w.-]+\.(?:png|svg|webp)$/.test(u.trim()) || isAllowedRemoteImage(u.trim())) ? u.trim() : undefined);
  const green = logo(site.logos?.primary);
  const white = logo(site.logos?.inverse);
  if (green || white) t.brand = { ...(green ? { green } : {}), ...(white ? { white } : {}) };
}

/**
 * Every caption ever seeded for a curated gallery photo (EN + AR; pre-21-Nov "·" labels and the 21 Nov "Title – Place" ones —
 * see deploy/staging/apply-nov21-captions.mjs). A database still holding one of them was never edited for that photo, so the
 * current approved structured caption is shown: all photos stay in one format even before the update script runs (client
 * feedback 23 Nov 2026: "not all of them are synchronized"). Any other editor-written caption is kept as written.
 */
const LEGACY_GALLERY_CAPTIONS: Record<string, string[]> = {
  "weavers-loom": ["Hand-weaving workshop · Alexandria", "Hand-weaving workshop – Alexandria", "ورشة السجاد اليدوي · الإسكندرية", "ورشة السجاد اليدوي – الإسكندرية"],
  "water-station": ["Water desalination station · Luxor", "Water desalination station – Luxor", "محطة تحلية مياه · الأقصر", "محطة تحلية مياه – الأقصر"],
  "greenhouse-harvest": ["Greenhouses · Beni Suef", "Greenhouses – Beni Suef", "الصوب الزراعية · بني سويف", "الصوب الزراعية – بني سويف"],
  "housing-site": ["Housing works · Shelter & warmth", "Shelter & Warmth housing works – Egypt", "أعمال إسكان · سكن ودفا", "أعمال إسكان «سكن ودفا» – مصر"],
  "mobile-clinic": ["Mobile medical unit", "Mobile medical unit – Egypt", "قافلة طبية متنقلة", "قافلة طبية متنقلة – مصر"],
  "farmer-portrait": ["Luxor", "Water-connection project – Luxor", "الأقصر", "مشروع توصيل المياه – الأقصر"],
  "operating-room": ["Hospital support", "Hospital support – Egypt", "دعم المستشفيات", "دعم المستشفيات – مصر"],
};

/** Program slug from a gallery item's link ("/programs/<slug>" or "/<locale>/programs/<slug>"). */
const programSlug = (href: string | null | undefined) => /^\/(?:(?:en|ar)\/)?programs\/([a-z0-9-]+)\/?$/.exec(href ?? "")?.[1];

/**
 * One gallery photo. CMS item: title = Title, text = Place, href = "/programs/<slug>" (the program, optional), media = photo.
 * A legacy item whose title still holds the whole built-in caption ("Title – Place") of the same photo keeps the built-in
 * structured caption, so the program line appears before the database is updated.
 */
export function galleryItem(i: PublicSectionItem, f?: GalleryItem): GalleryItem {
  const image = toMediaRef(i.media) ?? f?.image ?? "";
  const title = str(i.title, f?.title ?? "");
  const samePhoto = !!f && image === f.image;
  const legacy = !!f && (title === f.title || title === photoCaption(f.title, f.place) || (LEGACY_GALLERY_CAPTIONS[String(f.image)] ?? []).includes(title.trim()));
  if (f && !i.text?.trim() && !i.href && samePhoto && legacy) return { ...f, image };
  return { image, title, place: i.text?.trim() || undefined, program: programSlug(i.href) ?? (samePhoto && !i.href ? f?.program : undefined) };
}

/** Social accounts for "Follow us": valid https links from Site settings, else the built-in confirmed list. */
export function socialLinks(stored: { network?: string; url?: string }[] | null | undefined, fallback: SocialLink[]): SocialLink[] {
  const ok = (stored ?? []).filter((l): l is SocialLink => typeof l?.network === "string" && typeof l?.url === "string" && /^https:\/\/[^\s"'<>]+$/.test(l.url));
  return ok.length ? ok.map((l) => ({ network: l.network.toLowerCase(), url: l.url })) : fallback;
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
  heroSecondary: ["how giving works", "كيف يتم التبرع", "explore our programmes", "explore our programs"],
  mission: ["أن نربط الشركاء حول العالم ونوحّدهم في تنمية قائمة على الأدلة تدوم، تمكّن الأفراد والمجتمعات والمؤسسات، مع حساب كل مساهمة من البداية إلى النهاية.", "to connect and unite partners across the world in evidence-based development that lasts, empowering people, communities and institutions, with every contribution accounted for from start to finish."],
};
const isStale = (v: string, list: string[]) => list.includes(v.trim().toLowerCase());

/** Pre-22-Nov-2026 seed copy replaced by "MEKI-US Website Edits for the IT Team" (EN, UK-spelling seed variants and draft AR). */
export const STALE_COPY = new Set([
  "MEKI unites partners across the world behind development that lasts, supporting people, communities and institutions through evidence-based programs, with every contribution accounted for from start to finish.",
  "MEKI unites partners across the world behind development that lasts, supporting people, communities and institutions through evidence-based programmes, with every contribution accounted for from start to finish.",
  "تجمع MEKI الشركاء حول العالم خلف تنمية تدوم، وتدعم الأفراد والمجتمعات والمؤسسات من خلال برامج قائمة على الأدلة، مع حساب كل مساهمة من البداية إلى النهاية.",
  "MEKI unites partners across the world behind development that lasts. Drawing on 20 years of Misr El-Kheir's experience, we support people, communities and institutions through evidence-based programs, with every contribution accounted for from start to finish.",
  "MEKI unites partners across the world behind development that lasts. Drawing on 20 years of Misr El-Kheir's experience, we support people, communities and institutions through evidence-based programmes, with every contribution accounted for from start to finish.",
  "تجمع MEKI الشركاء حول العالم خلف تنمية تدوم. واستنادًا إلى خبرة مصر الخير الممتدة لعشرين عامًا، ندعم الأفراد والمجتمعات والمؤسسات من خلال برامج قائمة على الأدلة، مع حساب كل مساهمة من البداية إلى النهاية.",
  "Nine programs. One purpose.", "Nine programmes. One purpose.", "تسعة برامج. هدف واحد.",
  "Each program tackles a different part of what people and communities need to thrive. Based on assessed needs, a household may enter one or more program pathways.",
  "Each programme tackles a different part of what people and communities need to thrive. Based on assessed needs, a household may enter one or more programme pathways.",
  "يتناول كل برنامج جانبًا مختلفًا مما يحتاجه الأفراد والمجتمعات للازدهار. وبناءً على الاحتياجات المُقيَّمة، قد تدخل الأسرة مسارًا واحدًا أو أكثر.",
  "Focus areas", "مجالات التركيز",
  "Three functions support all nine programs. They are capabilities, not programs.", "Three functions support all nine programmes. They are capabilities, not programmes.",
  "ثلاث وظائف تدعم البرامج التسعة جميعها. إنها قدرات، وليست برامج.",
  "Released against milestones", "صرف مرتبط بمراحل الإنجاز", "With results reported back.", "مع تقارير عن النتائج.",
  "Every gift is held for the purpose you chose and released against milestones.", "يُحفظ كل تبرع للغرض الذي اخترته، ويُصرف وفق مراحل الإنجاز.",
  // gallery note and About photo labels seeded before the 21/23 Nov caption convention
  "Captions are working labels from the source folders; final captions and photographer credits to be confirmed.",
  "Captions follow “Title – Place”, taken from the source folders; final captions and photographer credits to be confirmed.",
  "تتبع التعليقات صيغة «العنوان – المكان» المأخوذة من مجلدات المصدر؛ التعليقات النهائية وحقوق المصورين قيد التأكيد.",
  "Alexandria · Economic Empowerment", "الإسكندرية · التمكين الاقتصادي",
  // 25 Nov 2026 (Programs Word document): the 22–24 Nov approved Programs landing copy and section labels
  "Nine programs. One commitment.", "Nine programmes. One commitment.",
  "Hardship rarely comes alone. A family facing illness may also face debt, unsafe housing or a child leaving school. That is why our nine programs work together around each household's needs.",
  "Hardship rarely comes alone. A family facing illness may also face debt, unsafe housing or a child leaving school. That is why our nine programmes work together around each household's needs.",
  "نادرًا ما تأتي الشدائد منفردة. فالأسرة التي تواجه المرض قد تواجه أيضًا الديون أو السكن غير الآمن أو انقطاع طفل عن الدراسة. لذلك تعمل برامجنا التسعة معًا حول احتياجات كل أسرة.",
  "Mandate", "التكليف", "What we do", "ما نقوم به", "The change we aim for", "التغيير الذي نسعى إليه",
]);
/** About photo label B was seeded as a bare place ("Luxor"); only that exact legacy value is replaced. */
const STALE_CAPTION_B = new Set(["Luxor", "الأقصر"]);
type Path = [(d: Dict) => string, (d: Dict, v: string) => void];
const STALE_PATHS: Path[] = [
  [(d) => d.hero.lead, (d, v) => { d.hero.lead = v; }],
  [(d) => d.about.body, (d, v) => { d.about.body = v; }],
  [(d) => d.programmes.title, (d, v) => { d.programmes.title = v; }],
  [(d) => d.programmes.intro, (d, v) => { d.programmes.intro = v; }],
  [(d) => d.programmes.themesLabel, (d, v) => { d.programmes.themesLabel = v; }],
  [(d) => d.programmes.mandateLabel, (d, v) => { d.programmes.mandateLabel = v; }],
  [(d) => d.programmes.outcomesLabel, (d, v) => { d.programmes.outcomesLabel = v; }],
  [(d) => d.enabling.intro, (d, v) => { d.enabling.intro = v; }],
  [(d) => d.trust[1]?.title ?? "", (d, v) => { if (d.trust[1]) d.trust[1].title = v; }],
  [(d) => d.trust[1]?.text ?? "", (d, v) => { if (d.trust[1]) d.trust[1].text = v; }],
  [(d) => d.why.items[0]?.text ?? "", (d, v) => { if (d.why.items[0]) d.why.items[0].text = v; }],
  [(d) => d.gallery.note, (d, v) => { d.gallery.note = v; }],
  [(d) => d.about.captionA, (d, v) => { d.about.captionA = v; }],
];

/** Final pass: keep approved wording over untouched legacy CMS seed values, drop hidden-section anchors, US spelling. */
function finish(t: Dict, locale: Locale, showCampaigns = false): Dict {
  const b = getDict(locale);
  if (isStale(t.hero.ctaPrimary, SUPERSEDED.heroPrimary)) t.hero.ctaPrimary = b.hero.ctaPrimary;
  if (isStale(t.hero.ctaSecondary, SUPERSEDED.heroSecondary)) t.hero.ctaSecondary = b.hero.ctaSecondary;
  if (isStale(t.about.mission, SUPERSEDED.mission)) t.about.mission = b.about.mission;
  // MEKI client edits (22 Nov 2026): untouched pre-edit seed values never override the approved copy (any admin edit is kept).
  for (const [get, set] of STALE_PATHS) if (STALE_COPY.has(get(t).trim())) set(t, get(b));
  if (STALE_CAPTION_B.has(t.about.captionB.trim())) t.about.captionB = b.about.captionB;
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
  const dictionary = getDict(locale);
  const base: Dict = { ...dictionary, footer: { ...dictionary.footer, email: "Inquiries@meki-us.org" }, gallery: { ...dictionary.gallery, items: deliveryPhotos(locale) } };
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
