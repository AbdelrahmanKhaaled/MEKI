import type { ApiEnvelope, ApiErrorBody } from "@meki/api-client";
import { contentFailureLevel } from "./content-failure";

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
 * Phase 7: visitors never wait more than 4 s for CMS content (built-in content is shown instead). During `next build` every
 * page is generated in parallel and the API answers the same heavy /public/home request many times at once, so the build
 * waits longer instead of baking the fallback into the static pages.
 */
const CONTENT_TIMEOUT_MS = process.env.NEXT_PHASE === "phase-production-build" ? 20_000 : 4000;

/**
 * Server-side GET of PUBLIC, cacheable content. Returns null on any failure (unset URL, timeout, 4xx/5xx,
 * malformed JSON) so callers fall back to the static content instead of rendering broken UI.
 */
export async function fetchPublicContent<T>(path: string, attempt = 1): Promise<T | null> {
  if (!SERVER_API_URL) return null;
  try {
    const res = await fetch(`${SERVER_API_URL}${path}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: CONTENT_REVALIDATE_SECONDS, tags: ["meki-public"] },
      signal: AbortSignal.timeout(CONTENT_TIMEOUT_MS),
    });
    if (!res.ok) {
      reportContentFailure(path, res.status);
      return null;
    }
    const body = (await res.json()) as ApiEnvelope<T>;
    return body?.data ?? null;
  } catch (e) {
    // Phase 7: a connection-level failure or timeout is retried once; HTTP errors are not retried.
    if (attempt === 1) return fetchPublicContent<T>(path, 2);
    reportContentFailure(path, 0, e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network");
    return null;
  }
}

/**
 * Phase 11A: like fetchPublicContent, but tells "the API says this does not exist" (404 → the page must 404, e.g. an unpublished
 * programme) apart from "the API is unreachable" (the page may fall back to approved built-in content).
 */
export type PublicResource<T> = { status: "ok"; data: T } | { status: "not_found" } | { status: "unavailable" };
export async function fetchPublicResource<T>(path: string, attempt = 1): Promise<PublicResource<T>> {
  if (!SERVER_API_URL) return { status: "unavailable" };
  try {
    const res = await fetch(`${SERVER_API_URL}${path}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: CONTENT_REVALIDATE_SECONDS, tags: ["meki-public"] },
      signal: AbortSignal.timeout(CONTENT_TIMEOUT_MS),
    });
    if (res.status === 404) return { status: "not_found" };
    if (!res.ok) {
      reportContentFailure(path, res.status);
      return { status: "unavailable" };
    }
    const body = (await res.json()) as ApiEnvelope<T>;
    return body?.data ? { status: "ok", data: body.data } : { status: "unavailable" };
  } catch (e) {
    if (attempt === 1) return fetchPublicResource<T>(path, 2);
    reportContentFailure(path, 0, e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network");
    return { status: "unavailable" };
  }
}

function reportContentFailure(path: string, status: number, reason = "network") {
  const level = contentFailureLevel(path, status);
  console[level](`[meki-web] CMS content unavailable (${status || reason}) for ${path.split("?")[0]} — built-in content is shown`);
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
  init: { method?: "GET" | "POST"; body?: unknown; token?: string; bookingToken?: string; idempotencyKey?: string; timeoutMs?: number } = {},
): Promise<T> {
  if (!PUBLIC_API_URL) throw new ApiRequestError("API_NOT_CONFIGURED", 0);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.token) headers["X-Donation-Token"] = init.token;
  if (init.bookingToken) headers["X-Booking-Token"] = init.bookingToken; // booking tokens travel in a header, never in URLs
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

/** Authorised binary download (e.g. a ticket PDF). The booking token goes in a header, so it never appears in a URL. */
export async function clientApiBlob(path: string, bookingToken: string): Promise<Blob> {
  if (!PUBLIC_API_URL) throw new ApiRequestError("API_NOT_CONFIGURED", 0);
  let res: Response;
  try {
    res = await fetch(`${PUBLIC_API_URL}${path}`, { headers: { "X-Booking-Token": bookingToken }, cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(30000) });
  } catch {
    throw new ApiRequestError("NETWORK_ERROR", 0);
  }
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("application/pdf")) throw new ApiRequestError("DOWNLOAD_FAILED", res.status);
  return res.blob();
}
