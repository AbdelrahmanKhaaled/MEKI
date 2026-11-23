/**
 * CMS live publishing — cache tags for published API content (pure; unit tested).
 *
 * Every cached API read carries `meki-public` plus ONE resource tag derived from its path. The API invalidates exactly these
 * strings after a publish (apps/api/src/modules/revalidation/revalidation.tags.ts — keep both lists in sync; both have tests).
 */
export const ALL_PUBLIC_TAG = "meki-public";

/** Tag grammar accepted by /api/internal/revalidate (anything else is rejected). */
export const TAG_PATTERN = /^(meki-public|meki:(home|events|programmes|campaigns|site|page:[a-z0-9]+(?:-[a-z0-9]+)*))$/;

/** Resource tag for an API path such as `/public/home?locale=en`. */
export function resourceTag(path: string): string {
  const p = path.split("?")[0];
  if (p === "/public/home") return "meki:home";
  const page = /^\/public\/pages\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(p);
  if (page) return `meki:page:${page[1]}`;
  if (p.startsWith("/public/events/")) return "meki:events";
  if (p.startsWith("/public/programmes")) return "meki:programmes";
  if (p.startsWith("/public/campaigns")) return "meki:campaigns";
  return "meki:site"; // site settings, donation config, giving options, hosted forms
}

export const tagsForPath = (path: string) => [ALL_PUBLIC_TAG, resourceTag(path)];

/**
 * Rendered routes to mark stale in addition to the data tags, in English AND Arabic. Every page's layout metadata, header and
 * footer read /public/home, so a homepage (or full) refresh marks the whole [locale] layout.
 */
export function pathsForTags(tags: string[]): { path: string; type?: "page" | "layout" }[] {
  const out: { path: string; type?: "page" | "layout" }[] = [];
  const both = (p: string) => ["en", "ar"].forEach((l) => out.push({ path: `/${l}${p}` }));
  for (const tag of tags) {
    if (tag === ALL_PUBLIC_TAG || tag === "meki:home") out.push({ path: "/[locale]", type: "layout" });
    else if (tag.startsWith("meki:page:")) both(`/${tag.slice("meki:page:".length)}`);
    else if (tag === "meki:events") both("/events/gala-night");
    else if (tag === "meki:programmes") {
      both("/programs");
      out.push({ path: "/[locale]/programs/[slug]", type: "page" });
    } else if (tag === "meki:site") {
      both("/give");
      out.push({ path: "/[locale]/programs/[slug]", type: "page" });
    }
  }
  const seen = new Set<string>();
  return out.filter((p) => {
    const k = `${p.path}|${p.type ?? ""}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}
