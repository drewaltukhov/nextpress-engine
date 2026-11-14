/**
 * Single source of truth for extracting the client IP and client country
 * from a request. Replaces five+ duplicate inline implementations that all
 * read `x-forwarded-for` naively.
 *
 * The naive `x-forwarded-for.split(",")[0]` is spoofable: Vercel and
 * Cloudflare both append to a client-sent header, so its first entry can be
 * attacker-controlled.
 *
 * NextPress runs on Vercel by default and may be self-hosted (often behind
 * Cloudflare). Each platform's edge headers are only trustworthy ON that
 * platform: off Vercel nothing strips a client-sent `x-vercel-forwarded-for`,
 * and on Vercel nothing strips a client-sent `cf-connecting-ip`. So the
 * Vercel headers are read only when `VERCEL=1`, and nothing else is read
 * there (security audit 2026-11-12).
 *
 * Order of trust:
 *   1. On Vercel (`VERCEL=1`): `x-vercel-forwarded-for` — edge-set, immune
 *      to spoofing there.
 *   2. `CLIENT_IP_HEADER` set: that one header only. Name the header your
 *      ingress always overwrites (e.g. `cf-connecting-ip` behind Cloudflare).
 *   3. Otherwise `cf-connecting-ip` (Cloudflare overwrites it), then
 *      `x-real-ip`, then the first hop of `x-forwarded-for` — best effort.
 *   4. `0.0.0.0` — last-resort sentinel that fails closed in IP allow-list
 *      checks (no allow-list entry matches `0.0.0.0` by accident).
 *
 * Off Vercel, any header is only as trustworthy as the ingress in front of
 * the app: if the origin can be reached without going through Cloudflare,
 * firewall it to Cloudflare's ranges, or a client can set these headers
 * itself.
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
 * Extract the client IP from request headers in the trust order above;
 * `"0.0.0.0"` when nothing usable is present so allow-list checks fail closed.
 *
 * Returns the raw IP string. IPv6 addresses keep their full form (no
 * normalization beyond `.trim()`). Callers comparing IPs should use
 * `ipMatchesCidr` from `@core-plugins/security` rather than string equality.
 */
export function getClientIp(input: Headers | NextRequest | Request): string {
  const headers = asHeaders(input);
  const firstHop = (v: string | null) => v?.split(",")[0]?.trim() || null;

  // On Vercel the edge-set header is the only trustworthy one; every other
  // header below is client-settable there.
  if (process.env.VERCEL === "1") {
    return firstHop(headers.get("x-vercel-forwarded-for")) ?? FALLBACK_IP;
  }

  const configured = process.env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (configured) return firstHop(headers.get(configured)) ?? FALLBACK_IP;

  const cloudflare = firstHop(headers.get("cf-connecting-ip"));
  if (cloudflare) return cloudflare;

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

/**
 * ISO country code of the client for the country filter, or null when
 * unknown. On Vercel (`VERCEL=1`) that is `x-vercel-ip-country`, set by
 * Vercel's edge; anywhere else it is Cloudflare's `cf-ipcountry` ("XX" =
 * unknown, "T1" = Tor), which a client that reaches the origin directly can
 * still set — the same caveat as `cf-connecting-ip` above. Each platform's
 * header is ignored on the other, where it is client-supplied.
 */
export function getClientCountry(input: Headers | NextRequest | Request): string | null {
  const header = process.env.VERCEL === "1" ? "x-vercel-ip-country" : "cf-ipcountry";
  const raw = asHeaders(input).get(header)?.trim().toUpperCase();
  if (!raw || !/^[A-Z]{2}$/.test(raw) || raw === "XX" || raw === "T1") return null;
  return raw;
}
