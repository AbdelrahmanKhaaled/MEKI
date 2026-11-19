/** Endpoints every page depends on: a 404 here means a misconfigured API base (e.g. NEXT_PUBLIC_API_URL without /api/v1). */
const CORE_CONTENT = ["/public/home", "/public/site"];

/**
 * Phase 7: visitors still get the approved built-in content, but a failed CMS fetch is never silent for operators. Returns the
 * log level: "error" for network failures, 5xx and a missing core endpoint; "warn" for other 4xx (e.g. an unpublished page).
 * Only the public path and status are logged — no tokens, no response bodies.
 */
export function contentFailureLevel(path: string, status: number): "error" | "warn" {
  return status === 0 || status >= 500 || CORE_CONTENT.some((c) => path.startsWith(c)) ? "error" : "warn";
}
