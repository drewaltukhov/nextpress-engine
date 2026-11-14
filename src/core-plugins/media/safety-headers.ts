/**
 * Extra response headers for media served inline from this origin
 * (`/media/<id>`, `/thumb`, `/medium` on the `db` storage backend).
 *
 * An uploaded SVG is a document that can carry script. Served from the site's
 * own origin and opened directly, it would run with the site's cookies. The
 * sandboxing Content-Security-Policy that stops that is set for all of
 * `/media/*` in next.config.ts — config headers replace a route's own CSP, so
 * it can't live here. This adds `nosniff`, and for SVG an attachment
 * disposition; `<img>` embedding (the only way content uses media) ignores
 * both (security audit 2026-11-12,
 * nextpress:media:svg-upload-served-same-origin-unsanitized).
 *
 * R2-backed media is served from the R2 public host, a different origin, so
 * the redirect branches don't need this.
 */
export function mediaSafetyHeaders(mime: string, filename: string): Record<string, string> {
  const headers: Record<string, string> = { "X-Content-Type-Options": "nosniff" };
  if (mime.toLowerCase().startsWith("image/svg")) {
    const safeName = filename.replace(/[^\w.-]+/g, "_") || "image.svg";
    headers["Content-Disposition"] = `attachment; filename="${safeName}"`;
  }
  return headers;
}
