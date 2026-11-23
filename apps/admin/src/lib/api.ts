/**
 * The ONLY place that talks to the network. Same-origin `/api/v1/*` (proxied to the MEKI API, see next.config.ts):
 * the HttpOnly session cookie travels automatically and is never readable from JavaScript. The CSRF token lives in memory
 * only (re-fetched with GET /admin/auth/csrf after a reload) and is sent as X-CSRF-Token on mutations.
 */
import type { ZodType } from "zod";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** structured details from the API error envelope (e.g. `{ reasons: [...] }`, `{ id }`, usage counts) */
  readonly details?: unknown;
  /** the API's own message — logged/inspected only; the UI shows translated texts keyed by `code` */
  readonly apiMessage?: string;
  constructor(code: string, status: number, details?: unknown, apiMessage?: string) {
    super(code);
    this.code = code;
    this.status = status;
    this.details = details;
    this.apiMessage = apiMessage;
  }
}

let csrfToken: string | null = null;
export const setCsrfToken = (t: string | null) => {
  csrfToken = t;
};

/** Listeners are told when the session is gone (401) so the app can return to the login page. */
const unauthorizedListeners = new Set<() => void>();
export const onUnauthorized = (fn: () => void) => {
  unauthorizedListeners.add(fn);
  return () => void unauthorizedListeners.delete(fn);
};

/**
 * CMS live publishing: after a successful content mutation the API reports whether the public website confirmed its cache
 * refresh (X-Meki-Revalidation: revalidated | pending | disabled). Listeners (the live-website notice) are told every outcome.
 */
export type RevalidationOutcome = "revalidated" | "pending" | "disabled";
const revalidationListeners = new Set<(o: RevalidationOutcome) => void>();
export const onRevalidation = (fn: (o: RevalidationOutcome) => void) => {
  revalidationListeners.add(fn);
  return () => void revalidationListeners.delete(fn);
};
export function readRevalidation(header: string | null): RevalidationOutcome | null {
  return header === "revalidated" || header === "pending" || header === "disabled" ? header : null;
}

export type Query = Record<string, string | number | boolean | undefined | null>;

const qs = (q?: Query) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q ?? {})) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

/**
 * Same-origin URL for a document the browser opens itself (e.g. a receipt rendered as HTML by the API). The session cookie
 * travels with the navigation; nothing is fetched or stored by this code.
 */
export const apiUrl = (path: string, query?: Query) => `/api/v1${path}${qs(query)}`;

export interface Envelope<T> {
  data: T;
  meta?: { page: number; pageSize: number; total: number; totalPages: number };
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** The API's error envelope → ApiError (stable `code`, optional `details`, e.g. publish blockers or a duplicate's id). */
function toError(status: number, json: unknown, path: string): ApiError {
  const e = (json as { error?: { code?: string; message?: unknown; details?: unknown } } | null)?.error;
  // A wrong CURRENT password on the change-password form is also a 401: it must show an inline error, not sign the user out
  // (a genuinely expired session is caught by the next request, e.g. the /me refresh that follows).
  if (status === 401 && path !== "/admin/auth/login" && path !== "/admin/auth/password/change") unauthorizedListeners.forEach((f) => f());
  return new ApiError(e?.code ?? (status === 413 ? "PAYLOAD_TOO_LARGE" : status === 415 ? "UNSUPPORTED_MEDIA_TYPE" : "UNKNOWN_ERROR"), status, e?.details, typeof e?.message === "string" ? e.message : undefined);
}

/** A stale in-memory CSRF token (after a long idle period) is refreshed once and the mutation retried. */
async function refreshCsrfToken() {
  const res = await fetch("/api/v1/admin/auth/csrf", { headers: { Accept: "application/json" }, cache: "no-store", credentials: "same-origin" });
  const json = (await res.json().catch(() => null)) as { data?: { csrfToken?: string } } | null;
  if (res.ok && json?.data?.csrfToken) csrfToken = json.data.csrfToken;
}

async function request(method: Method, path: string, opts: { query?: Query; body?: unknown } = {}): Promise<unknown> {
  return (await requestFull(method, path, opts)).json;
}

async function requestFull(method: Method, path: string, opts: { query?: Query; body?: unknown } = {}, retried = false): Promise<{ json: unknown; revalidation: RevalidationOutcome | null }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}${qs(opts.query)}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: "no-store",
      credentials: "same-origin",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", 0);
  }
  let json: unknown = null;
  if (res.status !== 204) {
    try {
      json = await res.json();
    } catch {
      /* non-JSON body */
    }
  }
  if (!res.ok) {
    const err = toError(res.status, json, path);
    if (method !== "GET" && !retried && err.status === 403 && err.code === "CSRF_INVALID") {
      await refreshCsrfToken();
      return requestFull(method, path, opts, true);
    }
    throw err;
  }
  const revalidation = method === "GET" ? null : readRevalidation(res.headers.get("X-Meki-Revalidation"));
  if (revalidation) revalidationListeners.forEach((f) => f(revalidation));
  return { json, revalidation };
}

/** GET + validate `data` against a schema. A response that does not match is an error, never rendered. */
export async function apiGet<T>(path: string, schema: ZodType<T>, query?: Query): Promise<T> {
  const json = (await request("GET", path, { query })) as Envelope<unknown>;
  const parsed = schema.safeParse(json?.data);
  if (!parsed.success) throw new ApiError("INVALID_RESPONSE", 502);
  return parsed.data;
}

/** GET a paginated list: validates every item and the meta block. */
export async function apiList<T>(path: string, item: ZodType<T>, query?: Query): Promise<{ items: T[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const json = (await request("GET", path, { query })) as Envelope<unknown[]>;
  const meta = json?.meta;
  if (!Array.isArray(json?.data) || !meta) throw new ApiError("INVALID_RESPONSE", 502);
  const items: T[] = [];
  for (const raw of json.data) {
    const p = item.safeParse(raw);
    if (!p.success) throw new ApiError("INVALID_RESPONSE", 502);
    items.push(p.data);
  }
  return { items, total: meta.total, page: meta.page, pageSize: meta.pageSize, totalPages: meta.totalPages };
}

async function send<T>(method: "POST" | "PATCH" | "PUT", path: string, schema: ZodType<T>, body?: unknown): Promise<T> {
  const json = (await request(method, path, { body: body ?? {} })) as Envelope<unknown>;
  const parsed = schema.safeParse(json?.data);
  if (!parsed.success) throw new ApiError("INVALID_RESPONSE", 502);
  return parsed.data;
}

export const apiPost = <T>(path: string, schema: ZodType<T>, body?: unknown) => send("POST", path, schema, body);

/** POST that also returns the live-website refresh outcome (publish / unpublish actions). */
export async function apiPostOutcome<T>(path: string, schema: ZodType<T>, body?: unknown): Promise<{ data: T; revalidation: RevalidationOutcome | null }> {
  const { json, revalidation } = await requestFull("POST", path, { body: body ?? {} });
  const parsed = schema.safeParse((json as Envelope<unknown> | null)?.data);
  if (!parsed.success) throw new ApiError("INVALID_RESPONSE", 502);
  return { data: parsed.data, revalidation };
}
export const apiPatch = <T>(path: string, schema: ZodType<T>, body: unknown) => send("PATCH", path, schema, body);
export const apiPut = <T>(path: string, schema: ZodType<T>, body: unknown) => send("PUT", path, schema, body);

/** DELETE (the API answers 204 No Content). */
export async function apiDelete(path: string): Promise<void> {
  await request("DELETE", path);
}

/**
 * Multipart upload with progress (XMLHttpRequest — fetch cannot report upload progress). Same rules as every other call:
 * same-origin /api/v1, session cookie sent automatically, X-CSRF-Token header, envelope + schema validation, 401 handling.
 */
export function apiUpload<T>(path: string, form: FormData, schema: ZodType<T>, onProgress?: (fraction: number) => void, retried = false): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/v1${path}`);
    xhr.withCredentials = false; // same-origin: cookies are sent anyway; never credentialed cross-origin
    xhr.setRequestHeader("Accept", "application/json");
    if (csrfToken) xhr.setRequestHeader("X-CSRF-Token", csrfToken);
    xhr.timeout = 120_000;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onerror = () => reject(new ApiError("NETWORK_ERROR", 0));
    xhr.ontimeout = () => reject(new ApiError("NETWORK_ERROR", 0));
    xhr.onload = () => {
      let json: unknown = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON body (e.g. a proxy error page) */
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        const err = toError(xhr.status, json, path);
        if (!retried && err.status === 403 && err.code === "CSRF_INVALID") {
          refreshCsrfToken().then(() => apiUpload(path, form, schema, onProgress, true).then(resolve, reject), reject);
          return;
        }
        return reject(err);
      }
      const parsed = schema.safeParse((json as Envelope<unknown> | null)?.data);
      if (!parsed.success) return reject(new ApiError("INVALID_RESPONSE", 502));
      onProgress?.(1);
      resolve(parsed.data);
    };
    xhr.send(form);
  });
}

/**
 * Authenticated binary download (ticket PDF, guest-list CSV/XLSX). The bytes go straight to a temporary object URL and a
 * browser download — nothing is stored. Errors come back as the normal JSON envelope → ApiError (403/404/422 are shown, never
 * saved as a file). The file name comes from Content-Disposition when the server sends one.
 */
export async function apiDownload(path: string, query?: Query, fallbackName = "download"): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}${qs(query)}`, { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(120_000) });
  } catch {
    throw new ApiError("NETWORK_ERROR", 0);
  }
  if (!res.ok) throw toError(res.status, await res.json().catch(() => null), path);
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return name;
}

/** Count-only helper for `meta.total` (pageSize 1 keeps the payload tiny). */
export async function apiCount(path: string, query?: Query): Promise<number> {
  const json = (await request("GET", path, { query: { ...query, page: 1, pageSize: 1 } })) as Envelope<unknown[]>;
  if (typeof json?.meta?.total !== "number") throw new ApiError("INVALID_RESPONSE", 502);
  return json.meta.total;
}
