import type { MediaUrlInput } from "./types";

/**
 * Build the public URL for a media row's original or thumb variant.
 *
 * Every URL is the same `/media/<id>` (or `/media/<id>/thumb`) regardless of
 * which backend wrote the row — the route handlers at `src/app/media/[id]/`
 * dispatch internally:
 *   - `storage_backend = 'db'` → serve bytes from the row.
 *   - `storage_backend = 'r2'` → 302-redirect to `${NEXT_PUBLIC_R2_PUBLIC_URL}/${storage_ref}`.
 *
 * Why one URL form for both backends: lets HTML/og:image/feed-output URLs
 * stay branded + stable, lets us switch backends per-row without rewriting
 * any rendered URL, and keeps client components ignorant of storage details
 * (no env vars, no helper imports — they can just build `/media/<id>` directly
 * if they want, though this helper is the canonical entry point).
 *
 * Variant fallback: when `variant: 'thumb'` is requested but `hasThumb` is
 * false (SVG, or a legacy row where thumb generation failed silently), this
 * returns the original URL. The route handler does the same fallback
 * internally as a defense in depth, so callers don't strictly need to pass
 * `hasThumb` accurately — but doing so saves an unnecessary 302 hop.
 */
export function getMediaPublicUrl(input: MediaUrlInput): string {
  let effectiveVariant: "original" | "thumb" | "medium" = input.variant;
  if (effectiveVariant === "thumb" && !input.hasThumb) effectiveVariant = "original";
  if (effectiveVariant === "medium" && !input.hasMedium) effectiveVariant = "original";
  const path =
    effectiveVariant === "thumb"
      ? `/media/${input.id}/thumb`
      : effectiveVariant === "medium"
        ? `/media/${input.id}/medium`
        : `/media/${input.id}`;
  // Append the content-version query so that migration (which changes the
  // backing storage but not the row's id) busts any existing browser/CDN cache.
  return input.contentVersion ? `${path}?v=${input.contentVersion}` : path;
}

/**
 * Transform a stored featured-image URL into its thumb variant for inline
 * render on public pages. The stored URL stays the "original" and is used
 * verbatim for og:image / JSON-LD metadata; this helper only kicks in at
 * the `<img>` render site.
 *
 * Recognized pattern: `/media/<id>` → `/media/<id>/thumb`, idempotent on
 * already-thumb URLs, preserves any query/hash. External URLs (anything
 * not starting with `/media/`) are returned unchanged — the helper never
 * transforms URLs it doesn't own.
 */
export function toFeaturedThumbVariant(url: string | null | undefined): string | null {
  if (!url) return url ?? null;
  if (/\/thumb(?:[?#]|$)/.test(url)) return url;
  const m = url.match(/^(\/media\/[^/?#]+)(\?.*|#.*|$)/);
  if (m) return `${m[1]}/thumb${m[2]}`;
  return url;
}
