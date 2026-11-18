import type { MetadataRoute } from "next";
import { robotsRules } from "@/lib/seo";
import { PUBLIC_INDEXING, siteOrigin } from "@/lib/site";

/** Disallows everything until MEKI approves the launch (PUBLIC_INDEXING); then allows public pages, never booking/status pages. */
export default function robots(): MetadataRoute.Robots {
  return robotsRules(PUBLIC_INDEXING, siteOrigin());
}
