import type { ApiEnvelope, ApiErrorBody } from "@meki/api-client";

/**
 * API base URLs. NEXT_PUBLIC_API_URL is a public value (the browser calls the donation endpoints with it);
 * it must never contain credentials. Server-side rendering may use API_INTERNAL_URL (e.g. a private network
 * address); it falls back to the public URL. When neither is set (e.g. the current Vercel preview), the site
 * renders its built-in content and the donation form stays in preview mode.
 */
export const PUBLIC_API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const SERVER_API_URL = (process.env.API_INTERNAL_URL ?? PUBLIC_API_URL).replace(/\/$/, "");

/** Seconds published CMS content may be served from cache before Next.js revalidates it (ISR). */
export const CONTENT_REVALIDATE_SECONDS = 300;

/**
 * Server-side GET of PUBLIC, cacheable content. Returns null on any failure (unset URL, timeout, 4xx/5xx,
 * malformed JSON) so callers fall back to the static content instead of rendering broken UI.
 */
export async function fetchPublicContent<T>(path: string): Promise<T | null> {
  if (!SERVER_API_URL) return null;
  try {
    const res = await fetch(`${SERVER_API_URL}${path}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: CONTENT_REVALIDATE_SECONDS, tags: ["meki-public"] },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<T>;
    return body?.data ?? null;
  } catch {
    return null;
  }
}

/** Error surfaced to UI code: only a stable code + HTTP status, never raw server messages. */
export class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

/**
 * Browser-side call for donation flows (never cached). The donor access token travels only in the
 * X-Donation-Token header — never in URLs — and responses are not logged.
 */
export async function clientApi<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; token?: string; idempotencyKey?: string; timeoutMs?: number } = {},
): Promise<T> {
  if (!PUBLIC_API_URL) throw new ApiRequestError("API_NOT_CONFIGURED", 0);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.token) headers["X-Donation-Token"] = init.token;
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
  let res: Response;
  try {
    res = await fetch(`${PUBLIC_API_URL}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      credentials: "omit",
      signal: AbortSignal.timeout(init.timeoutMs ?? 15000),
    });
  } catch {
    throw new ApiRequestError("NETWORK_ERROR", 0);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) throw new ApiRequestError((body as ApiErrorBody | null)?.error?.code ?? "UNKNOWN_ERROR", res.status);
  return (body as ApiEnvelope<T>).data;
}
