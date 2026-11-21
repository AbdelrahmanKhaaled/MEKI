import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Phase 9A: script-neutral CSP directives only (no script-src: Next.js / GSAP inline bootstrapping must keep working)
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  // Phase 9A: browsers apply HSTS only over HTTPS (ignored on http://localhost); no includeSubDomains — other subdomains are not ours to pin
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

/**
 * Phase 13A — hosted builds (Vercel, or MEKI_DEPLOY_ENV=staging|production) must never bake a localhost/http API into the site.
 * A missing value is reported loudly (the site still renders its approved static content, with every API-backed section in its
 * designed "unavailable" state); a value that points to localhost or plain http fails the build.
 */
export function checkPublicApiUrl(env: Record<string, string | undefined> = process.env): string | null {
  const target = env.MEKI_DEPLOY_ENV?.trim().toLowerCase();
  const hosted = !!env.VERCEL || target === "staging" || target === "production";
  const raw = env.NEXT_PUBLIC_API_URL?.trim();
  if (!raw) {
    if (hosted) console.warn("[meki/web] NEXT_PUBLIC_API_URL is not set for this hosted build: CMS content, programmes, Gala ticketing and donations will show their 'unavailable' state.");
    return null;
  }
  const url = new URL(raw);
  if (hosted && (url.protocol !== "https:" || ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(url.hostname))) {
    throw new Error("NEXT_PUBLIC_API_URL must be an https URL that is not localhost for a hosted website build");
  }
  if (!/\/api\/v1\/?$/.test(url.pathname)) console.warn("[meki/web] NEXT_PUBLIC_API_URL should end with /api/v1");
  return raw;
}
checkPublicApiUrl();

/** Uploaded Media Library images are served by the API (/media/*); allow only that origin for next/image. */
const apiMedia = (() => {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_API_URL ?? "");
    return [{ protocol: u.protocol.replace(":", "") as "http" | "https", hostname: u.hostname, port: u.port, pathname: "/media/**" }];
  } catch {
    return [];
  }
})();

const config: NextConfig = {
  poweredByHeader: false,
  images: { formats: ["image/avif", "image/webp"], qualities: [70, 75, 80], remotePatterns: apiMedia },
  // Workspace package with TypeScript sources (types + helpers).
  transpilePackages: ["@meki/api-client"],
  async redirects() {
    return [{ source: "/", destination: "/en", permanent: false }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
