import type { NextConfig } from "next";

/**
 * The admin app never talks to the API cross-origin. Every `/api/v1/*` request is proxied (rewritten) to the MEKI API, so the
 * API's HttpOnly, SameSite=Strict session cookie is set for the ADMIN host, no CORS/credentials plumbing is needed and the
 * cookie keeps its `__Host-` prefix semantics in production. The upstream address comes from the environment — nothing about
 * production hosting is hard-coded. In production put the same rule in the reverse proxy (see docs/24).
 */
const API_UPSTREAM = (process.env.ADMIN_API_UPSTREAM ?? "http://localhost:4000").replace(/\/$/, "");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  // Phase 9A fix: the QR check-in scanner (/gala/check-in) needs the camera on this origin; camera=() blocked it on every device
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  // Phase 9A: script-neutral CSP directives only (no script-src: Next.js inline bootstrapping must keep working)
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  // Phase 9A: browsers apply HSTS only over HTTPS (ignored on http://localhost); no includeSubDomains — other subdomains are not ours to pin
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "Cache-Control", value: "no-store" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const config: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@meki/api-client"],
  experimental: {
    // Phase 6C: Next buffers proxied request bodies and cuts them at 10 MiB by default. Media uploads are limited to 10 MB per
    // FILE by the API (MEDIA_MAX_UPLOAD_MB), and the multipart envelope adds bytes on top, so the proxy allows 12 MB: the API
    // stays the only enforcer and over-limit files get its clean 413 instead of a truncated body (verified: 500 before).
    proxyClientMaxBodySize: "12mb",
  },
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${API_UPSTREAM}/api/v1/:path*` },
      // Phase 6C: uploaded media files (LOCAL storage) are served by the API at /media/<storageKey>. Proxying them keeps
      // admin previews same-origin, so the session cookie lets media.read users preview assets that are not public yet.
      { source: "/media/uploads/:path*", destination: `${API_UPSTREAM}/media/uploads/:path*` },
    ];
  },
  async redirects() {
    return [{ source: "/", destination: "/en/dashboard", permanent: false }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
