/**
 * Media shortcode parser + HTML substitution.
 *
 * Two NextPress-flavoured shortcodes — purposely WordPress-shaped so muscle
 * memory carries over from the WP world:
 *
 *   [img id="<media-id>"]    → full-size embedded image, click → lightbox
 *   [thumb id="<media-id>"]  → small thumbnail, click → lightbox
 *
 * Substitution happens inside RichText HTML. The shortcode appears as raw
 * text in a Tiptap-emitted paragraph (e.g. `<p>Lead-in [img id="abc"]</p>`),
 * so we keep the surrounding markup intact and only swap the shortcode
 * tokens for `<img>` / `<a><img></a>` HTML carrying `data-np-shortcode`
 * markers — `RichTextDisplay` listens for clicks on those markers and opens
 * the lightbox without us having to walk the DOM.
 */
import type { MediaSummary } from "@core-plugins/media/service";

/**
 * Capture the id from `[img id="..."]` and `[thumb id="..."]`. Restricted to
 * alphanumerics + hyphens + underscores so the regex can't be tricked into
 * eating surrounding markup. Newlines never appear inside the brackets in
 * practice (Tiptap emits them on a single line), so `.` semantics don't bite.
 */
const ID_PATTERN = "[A-Za-z0-9_-]+";
const IMG_RE = new RegExp(`\\[img\\s+id=\"(${ID_PATTERN})\"\\s*\\]`, "g");
const THUMB_RE = new RegExp(`\\[thumb\\s+id=\"(${ID_PATTERN})\"\\s*\\]`, "g");
// Matches `data-np-id="..."` attributes left on `<img>` tags by the
// RichTextEditor's media-library insert. The attribute is the public
// renderer's signal to wire up lightbox + populate alt/dims, even when no
// text-form shortcode is present.
const NP_ID_ATTR_RE = new RegExp(`data-np-id=\"(${ID_PATTERN})\"`, "g");

/**
 * Walk a string of RichText HTML and pull out every media id referenced —
 * either via `[img]` / `[thumb]` text shortcodes or via the inline
 * `data-np-id` attribute the editor stamps on library-picked images. Used
 * by the public page renderer to batch fetch every referenced media row in
 * one round-trip and inject the results via Puck metadata so the
 * substitution below can read alt + dimensions.
 */
export function collectMediaIdsFromHtml(html: string): string[] {
  const ids = new Set<string>();
  for (const re of [IMG_RE, THUMB_RE, NP_ID_ATTR_RE]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html)) !== null) {
      ids.add(match[1]);
    }
  }
  return Array.from(ids);
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface BuildOptions {
  variant: "img" | "thumb";
  id: string;
  media?: MediaSummary;
}

/**
 * Render a single shortcode to HTML. The `data-np-shortcode` marker is what
 * `RichTextDisplay` keys off to wire up the lightbox; the `data-np-id`
 * carries the media id so the click handler can look up the full record
 * from the metadata-derived map without re-parsing the DOM.
 */
function renderShortcode({ variant, id, media }: BuildOptions): string {
  const altRaw = media?.altText?.trim() || media?.filename?.replace(/\.[^.]+$/, "") || "";
  const alt = escapeAttr(altRaw);
  const safeId = escapeAttr(id);

  if (variant === "thumb") {
    // Thumbnail: route to the small WebP variant; click target is the
    // wrapper button so the whole tile picks up the cursor + lightbox
    // affordance.
    return (
      `<button type="button" data-np-shortcode="thumb" data-np-id="${safeId}" `
      + `class="np-shortcode np-shortcode-thumb" aria-label="Open image">`
      + `<img src="/media/${safeId}/thumb" alt="${alt}" loading="lazy" />`
      + `</button>`
    );
  }

  // Full-size image. Width/height attributes when known to keep CLS low.
  const dims = media?.width && media?.height
    ? ` width="${media.width}" height="${media.height}"`
    : "";
  return (
    `<img src="/media/${safeId}" alt="${alt}"${dims} loading="lazy" `
    + `data-np-shortcode="img" data-np-id="${safeId}" class="np-shortcode np-shortcode-img" />`
  );
}

/**
 * Replace every `[img]` / `[thumb]` shortcode in `html` with rendered HTML.
 * Unknown ids still produce a working `<img>` pointing at `/media/{id}` —
 * the route 404s gracefully, so a missing record shows a broken image
 * rather than crashing the page.
 */
export function expandMediaShortcodes(
  html: string,
  mediaMap: Record<string, MediaSummary>,
): string {
  return html
    .replace(IMG_RE, (_, id: string) =>
      renderShortcode({ variant: "img", id, media: mediaMap[id] }),
    )
    .replace(THUMB_RE, (_, id: string) =>
      renderShortcode({ variant: "thumb", id, media: mediaMap[id] }),
    );
}
