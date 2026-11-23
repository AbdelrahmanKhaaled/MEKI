import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { pathsForTags, TAG_PATTERN } from "@/lib/revalidation-tags";

/**
 * CMS live publishing — server-to-server cache invalidation, called ONLY by the MEKI API after a publish has been committed.
 *
 * - Authenticated with a server-only shared secret (MEKI_REVALIDATE_SECRET, runtime env; never NEXT_PUBLIC_*) sent as
 *   `Authorization: Bearer …`. Never accepted in a query string. Compared in constant time.
 * - Only tags from the fixed grammar are accepted (no arbitrary paths), at most 20 per call.
 * - `revalidateTag(tag, { expire: 0 })`: the cached data AND every rendered page that used it expire immediately, so the NEXT
 *   request renders the new content (the default "max" profile would serve the old page once more — the original defect).
 * - nginx does not expose /api/internal/ publicly; the API calls the website over loopback.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 4096;
const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const digest = (v: string) => createHash("sha256").update(v).digest();

export async function POST(request: Request) {
  const secret = process.env.MEKI_REVALIDATE_SECRET ?? "";
  if (secret.length < 32) return json({ revalidated: false, error: "NOT_CONFIGURED" }, 503);

  // constant-time comparison of fixed-length digests (no early exit on the first differing byte, no length oracle)
  const auth = request.headers.get("authorization") ?? "";
  if (!timingSafeEqual(digest(auth), digest(`Bearer ${secret}`))) return json({ revalidated: false, error: "UNAUTHORIZED" }, 401);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ revalidated: false, error: "PAYLOAD_TOO_LARGE" }, 413);
  let tags: unknown;
  try {
    tags = (JSON.parse(raw) as { tags?: unknown })?.tags;
  } catch {
    return json({ revalidated: false, error: "INVALID_BODY" }, 400);
  }
  if (!Array.isArray(tags) || tags.length === 0 || tags.length > 20 || !tags.every((t) => typeof t === "string" && TAG_PATTERN.test(t))) {
    return json({ revalidated: false, error: "INVALID_TAGS" }, 400);
  }

  const unique = [...new Set(tags as string[])];
  for (const tag of unique) revalidateTag(tag, { expire: 0 });
  const paths = pathsForTags(unique);
  for (const p of paths) revalidatePath(p.path, p.type);
  console.info(`[meki-web] cache refreshed for ${unique.join(", ")} (${paths.length} route${paths.length === 1 ? "" : "s"})`);
  return json({ revalidated: true, tags: unique, paths: paths.length, at: new Date().toISOString() }, 200);
}

export function GET() {
  return json({ error: "METHOD_NOT_ALLOWED" }, 405);
}
