/**
 * Resolver for the default Open Graph / Twitter card image.
 *
 * Two settings can populate the fallback. Resolution order:
 *   1. `seo.default_og_image` — site-wide URL set on the SEO admin tab.
 *      Accepts absolute URLs and absolute media paths (`/media/<id>`).
 *   2. `theme.<active_slug>.default_og_image_media_id` — set on the
 *      theme settings page near the Logo. Resolves to `/media/<id>`.
 *
 * Returns an empty string when neither source is filled.
 */
import type { DbClient } from "@core/db/client";
import { getSetting } from "@core-plugins/settings/registry";

const ACTIVE_THEME_SETTING = "theme.active_slug";

export async function resolveDefaultOgImage(db: DbClient): Promise<string> {
  const direct = (await getSetting<string>(db, "seo.default_og_image"))?.trim();
  if (direct) return direct;

  const slug = (await getSetting<string>(db, ACTIVE_THEME_SETTING))?.trim();
  if (!slug) return "";
  const mediaId = (
    await getSetting<string>(db, `theme.${slug}.default_og_image_media_id`)
  )?.trim();
  if (!mediaId) return "";
  // The stored value historically accepted either a bare id
  // (`6f0b1865-…`) or a path-prefixed value (`/media/6f0b1865-…`).
  // Normalize so the consumer always emits `/media/<id>` exactly
  // once — without this, settings saved with the `/media/` prefix
  // produced `/media//media/<id>` (which the absolute-URL builder
  // collapsed into `/media/media/<id>` on the public site).
  const bareId = mediaId.replace(/^\/+/, "").replace(/^media\//, "");
  return `/media/${bareId}`;
}
