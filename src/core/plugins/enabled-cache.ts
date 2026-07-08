/**
 * Cached "which plugin slugs are currently enabled" lookup.
 *
 * Read on every admin page render (layout sidebar + dashboard widget gate).
 * Plugin enabled/disabled state changes only via `togglePlugin` in the
 * plugins admin action, which invalidates the cache on every toggle.
 */
import { unstable_cache, updateTag } from "next/cache";
import type { DbClient } from "@core/db/client";
import { cacheOrFallback } from "@core/caching/with-fallback";

const PLUGINS_CACHE_TAG = "nextpress:plugins";

function getRuntimeDb(): DbClient {
  const fn = (globalThis as unknown as Record<string, (() => DbClient) | undefined>)["__nextpress_db_accessor__"];
  if (!fn) throw new Error("DB accessor not initialised — boot hasn't run");
  return fn();
}

export function invalidateEnabledPluginsCache(): void {
  try {
    updateTag(PLUGINS_CACHE_TAG);
  } catch {
    // non-Server-Action context — caller relies on revalidate TTL
  }
}

async function loadEnabledPluginSlugsRaw(db: DbClient): Promise<string[]> {
  const r = await db.execute({
    sql: "SELECT slug FROM plugins WHERE enabled = 1",
    args: [],
  });
  return r.rows.map((row) => String(row.slug));
}

const loadEnabledPluginSlugsCached = unstable_cache(
  (): Promise<string[]> => loadEnabledPluginSlugsRaw(getRuntimeDb()),
  ["nextpress", "enabled-plugins", "v1"],
  { tags: [PLUGINS_CACHE_TAG], revalidate: 300 },
);

export async function getEnabledPluginSlugs(db: DbClient): Promise<string[]> {
  return cacheOrFallback(
    () => loadEnabledPluginSlugsCached(),
    () => loadEnabledPluginSlugsRaw(db),
  );
}
