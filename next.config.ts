import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { join } from "path";

const { version } = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8")) as { version: string };

const nextConfig: NextConfig = {
  serverExternalPackages: ["undici"],
  allowedDevOrigins: ['192.168.*.*'],
  // Security: stop advertising the runtime, and surface dev-mode problems
  // earlier. Source maps in the browser bundle leak server path layout and
  // bloat downloads without helping end users of a published app.
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  // Next.js enables gzip/brotli compression for `next start` by default; no
  // custom compression middleware is needed (and would require a custom server).
  async headers() {
    return [
      {
        // Hashed build output never changes, so browsers/proxies may cache it
        // immutably for a year and skip revalidation entirely.
        // NOTE: scoped to /_next/static/ only — broader /_next/ patterns would
        // shadow the HMR WebSocket in development.
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/",
        headers: [
          { key: "Cache-Control", value: "private, no-cache, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_OMP_WEB_VERSION: version,
  },
};

export default nextConfig;
