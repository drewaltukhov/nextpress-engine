import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // Theme assets live under `themes/<slug>/...` and are served by the
  // /api/themes/[slug]/[...path] route handler at runtime. Vercel's
  // serverless tracing only bundles files imported by code, so without
  // this hint theme PNG/JPG/SVG files would 404 in production.
  outputFileTracingIncludes: {
    "/api/themes/**/*": [
      "./themes/**/*.png",
      "./themes/**/*.jpg",
      "./themes/**/*.jpeg",
      "./themes/**/*.svg",
      "./themes/**/*.webp",
      "./themes/**/*.ico",
      "./themes/**/*.css",
    ],
    // Theme component (.tsx/.ts) files are imported by `renderActiveTheme`,
    // and their SQL migrations are read at boot via fs.readFile. Both need
    // to be present in every serverless function bundle, not just the
    // theme-asset route. The existing block above stays scoped to
    // `/api/themes/**/*` since asset-style files don't need to be in
    // every route's bundle.
    "/**": [
      "./themes/**/*.tsx",
      "./themes/**/*.ts",
      "./themes/**/*.sql",
    ],
  },
  experimental: {
    // Default server-action body limit is 1MB — too small for media uploads.
    // Cap matches the upper bound of the media.max_file_size_mb setting (100).
    // Per-file validation still happens in the upload action, so admins can
    // set a tighter limit in /admin/media → Settings without changing this.
    serverActions: {
      bodySizeLimit: "100mb",
    },
    // Enables `forbidden()` from `next/navigation` + the `forbidden.tsx`
    // file convention. Used by `assertPublicAccess` to short-circuit
    // country-blocked / IP-blocked visitors with a real HTTP 403.
    authInterrupts: true,
  },
  async headers() {
    // HSTS is HTTPS-only — emitting it under `next dev` on http://localhost
    // teaches the browser to upgrade local requests to https, which then
    // fails. Gate it on production so dev stays usable.
    const isProd = process.env.NODE_ENV === "production";

    const baseHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // Lock down powerful browser features we don't use. Anything the
      // admin UI later needs (e.g. clipboard-write for copy buttons) can
      // be added to the allow-list here.
      {
        key: "Permissions-Policy",
        value: [
          "accelerometer=()",
          "autoplay=()",
          "camera=()",
          "display-capture=()",
          "encrypted-media=()",
          "fullscreen=(self)",
          "geolocation=()",
          "gyroscope=()",
          "magnetometer=()",
          "microphone=()",
          "midi=()",
          "payment=()",
          "picture-in-picture=()",
          "publickey-credentials-get=()",
          "screen-wake-lock=()",
          "sync-xhr=()",
          "usb=()",
          "xr-spatial-tracking=()",
        ].join(", "),
      },
      // Cross-origin opener policy isolates the top-level browsing context
      // — cheap to add and unlocks future use of cross-origin isolated
      // features (SharedArrayBuffer, precise timers) without changing
      // anything else.
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ];

    if (isProd) {
      baseHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }

    return [{ source: "/(.*)", headers: baseHeaders }];
  }
};

const withMDX = createMDX();

export default withMDX(config);
