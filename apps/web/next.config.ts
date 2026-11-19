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
