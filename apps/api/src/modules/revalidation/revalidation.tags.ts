/**
 * CMS live publishing — which public-website cache tags an admin mutation invalidates (pure; unit tested).
 *
 * The website tags every cached API read with `meki-public` plus ONE resource tag derived from the request path
 * (apps/web/src/lib/revalidation-tags.ts — keep the two lists in sync; both sides have tests on the exact strings):
 *   /public/home                        → meki:home      (homepage + every page's layout metadata, header and footer)
 *   /public/pages/<slug>                → meki:page:<slug>
 *   /public/events/...                  → meki:events    (Gala pages)
 *   /public/programmes/...              → meki:programmes
 *   /public/campaigns/...               → meki:campaigns
 *   anything else (/public/giving/*, /public/hosted-forms, /public/site, /public/donation-config) → meki:site
 */
export const ALL_PUBLIC_TAG = 'meki-public';
export const TAGS = {
  home: 'meki:home',
  events: 'meki:events',
  programmes: 'meki:programmes',
  campaigns: 'meki:campaigns',
  site: 'meki:site',
  page: (slug: string) => `meki:page:${slug}`,
} as const;

/** Tag grammar accepted by the website's revalidation route (and nothing else). */
export const TAG_PATTERN = /^(meki-public|meki:(home|events|programmes|campaigns|site|page:[a-z0-9]+(?:-[a-z0-9]+)*))$/;

/** Kinds of public content an admin route can change. `cms-page` / `cms-section` are resolved to a page slug at runtime. */
export type PublicScope = 'cms-page' | 'cms-section' | 'programmes' | 'campaigns' | 'faq' | 'statistics' | 'site' | 'events' | 'media';

/**
 * Static scopes → tags. Home aggregates site settings, programmes, campaigns, verified statistics and FAQs (/public/home), so
 * those modules always include it. Site settings and media metadata (alt text, consent) can appear on any page → full flush.
 */
export const SCOPE_TAGS: Record<Exclude<PublicScope, 'cms-page' | 'cms-section'>, string[]> = {
  programmes: [TAGS.home, TAGS.programmes, TAGS.site],
  campaigns: [TAGS.home, TAGS.campaigns, TAGS.programmes, TAGS.events, TAGS.site],
  faq: [TAGS.home],
  statistics: [TAGS.home, TAGS.programmes],
  events: [TAGS.events],
  site: [ALL_PUBLIC_TAG],
  media: [ALL_PUBLIC_TAG],
};

/** A site CMS page → its tag. Event landing pages are rendered by the Gala pages; `home` is the homepage. */
export function tagForPage(slug: string, isEventPage: boolean): string {
  if (isEventPage) return TAGS.events;
  if (slug === 'home') return TAGS.home;
  const tag = TAGS.page(slug);
  return TAG_PATTERN.test(tag) ? tag : ALL_PUBLIC_TAG;
}

/** Dedupe; a full flush makes every other tag redundant. */
export function normalizeTags(tags: Iterable<string>): string[] {
  const set = new Set([...tags].filter((t) => TAG_PATTERN.test(t)));
  if (set.has(ALL_PUBLIC_TAG)) return [ALL_PUBLIC_TAG];
  return [...set].sort();
}
