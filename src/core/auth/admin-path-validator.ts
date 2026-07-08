/**
 * Admin-path slug validator.
 *
 * Format: leading "/", then `[a-z]` followed by 2-31 of `[a-z0-9_-]`.
 * Total length 3-32 chars after the slash. Reserved set covers top-level
 * paths NextPress already owns plus a few well-known asset paths.
 */

const FORMAT_RE = /^\/[a-z][a-z0-9_-]{2,31}$/;

const RESERVED = new Set([
  "/admin",
  "/api",
  "/_next",
  "/docs",
  "/setup",
  "/login",
  "/blog",
  "/sitemap.xml",
  "/robots.txt",
  "/favicon.ico",
]);

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateAdminPath(input: string): ValidationResult {
  if (typeof input !== "string" || input.length === 0) {
    return { ok: false, reason: "Path must not be empty" };
  }
  if (RESERVED.has(input)) {
    return { ok: false, reason: `"${input}" is reserved` };
  }
  if (!FORMAT_RE.test(input)) {
    return {
      ok: false,
      reason: "Path must start with / followed by 3-32 chars (a-z, 0-9, -, _)",
    };
  }
  return { ok: true };
}
