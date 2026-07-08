/**
 * Resolve the canonical site URL for public-facing output (canonical
 * links, og:url, sitemap, RSS, JSON-LD).
 *
 * Precedence:
 *   1. `site.url` setting (admin-managed, source of truth)
 *   2. `NEXT_PUBLIC_SITE_URL` env (deployment-pinned override)
 *   3. `VERCEL_PROJECT_PRODUCTION_URL` env (stable prod URL on Vercel)
 *   4. `VERCEL_URL` env (per-deployment URL; preview deploys)
 *   5. empty string
 *
 * Why a setting at all (when there's a request `Host` we could read)?
 *   - Edge/ISR HTML caches serve one rendered body for every Host header
 *     that hits the route — there's no "current" request at render time.
 *   - Search engines index whatever URL you advertise (canonical,
 *     og:url, sitemap loc); it has to be authoritative, not derived.
 *   - Email links, RSS items, og images all need an absolute URL with
 *     no request context.
 *
 * Why the env fallbacks?
 *   - Avoids the "I forgot to update site.url after the prod cutover"
 *     foot-gun. On Vercel, `VERCEL_PROJECT_PRODUCTION_URL` is set
 *     automatically and stable, so most installs Just Work.
 *
 * Admin settings forms (where the user EDITS the setting) keep reading
 * the raw value directly — they should show what's actually stored.
 */
import type { DbClient } from "@core/db/client";
import { getSetting } from "@core-plugins/settings/registry";

export async function resolveSiteUrl(db: DbClient): Promise<string> {
  const setting = (await getSetting<string>(db, "site.url"))?.trim();
  if (setting) return stripTrailingSlash(setting);
  return resolveSiteUrlFromEnv();
}

/**
 * Synchronous variant for callers that already have a `site.url` setting
 * value loaded (e.g. inside a bulk-read of SEO settings). Skips the
 * cached settings read and just applies the env fallbacks.
 */
export function resolveSiteUrlFromValue(stored: string | null | undefined): string {
  const v = stored?.trim();
  if (v) return stripTrailingSlash(v);
  return resolveSiteUrlFromEnv();
}

function resolveSiteUrlFromEnv(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const withProto = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
    return stripTrailingSlash(withProto);
  }
  return "";
}

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}
