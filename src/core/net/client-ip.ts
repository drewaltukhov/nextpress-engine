/**
 * Single source of truth for extracting the client IP and Vercel-provided
 * geo info from a request. Replaces five+ duplicate inline implementations
 * that all read `x-forwarded-for` naively.
 *
 * --- Why a custom helper ---
 *
 * The naive pattern `x-forwarded-for.split(",")[0]` is vulnerable to spoofing
 * when there's no upstream proxy that strips client-supplied headers. On
 * Vercel, *clients can prepend* their own value to `x-forwarded-for` and
 * Vercel's edge will append the real client IP after it — meaning the first
 * element is whatever the client wrote, not the real source.
 *
 * Vercel's solution is `x-vercel-forwarded-for`: that header is set by the
 * edge from a connection it actually owns, so the value is unspoofable.
 * Self-hosted deployments behind a sane reverse-proxy (nginx, Cloudflare
 * with strict mode, etc.) can rely on `x-forwarded-for[0]` because the
 * proxy strips client-supplied entries before adding its own.
 *
 * Order of trust:
 *   1. `x-vercel-forwarded-for` — edge-set, immune to spoofing on Vercel.
 *   2. `x-real-ip` — set by many reverse proxies (nginx, Caddy) to the
 *      single true client IP.
 *   3. First hop of `x-forwarded-for` — best effort for self-hosted.
 *   4. `0.0.0.0` — last-resort sentinel that fails closed in IP allow-list
 *      checks (no allow-list entry matches `0.0.0.0` by accident).
 */
import type { NextRequest } from "next/server";

const FALLBACK_IP = "0.0.0.0";

/**
 * Accepts either a `Headers` instance or a Next.js `NextRequest` so this
 * helper works in route handlers, middleware, and inside `headers()` calls
 * from server components without a wrapper.
 */
function asHeaders(input: Headers | NextRequest | Request): Headers {
  if (input instanceof Headers) return input;
  return input.headers;
}

/**
 * Extract the client IP from request headers. Prefers Vercel's unspoofable
 * `x-vercel-forwarded-for`; falls back to `x-real-ip`, then the first hop
 * of `x-forwarded-for`, then `"0.0.0.0"` so allow-list checks fail closed.
 *
 * Returns the raw IP string. IPv6 addresses keep their full form (no
 * normalization beyond `.trim()`). Callers comparing IPs should use
 * `ipMatchesCidr` from `@core-plugins/security` rather than string equality.
 */
export function getClientIp(input: Headers | NextRequest | Request): string {
  const headers = asHeaders(input);

  const vercel = headers.get("x-vercel-forwarded-for");
  if (vercel) {
    const first = vercel.split(",")[0]?.trim();
    if (first) return first;
  }

  const real = headers.get("x-real-ip");
  if (real) {
    const trimmed = real.trim();
    if (trimmed) return trimmed;
  }

  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  return FALLBACK_IP;
}
