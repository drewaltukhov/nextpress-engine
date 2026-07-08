import { unstable_cache, updateTag } from "next/cache";
import type { DbClient } from "@core/db/client";
import { cacheOrFallback } from "@core/caching/with-fallback";

const ROLES_CACHE_TAG = "nextpress:roles";

function getRuntimeDb(): DbClient {
  const fn = (globalThis as unknown as Record<string, (() => DbClient) | undefined>)["__nextpress_db_accessor__"];
  if (!fn) throw new Error("DB accessor not initialised — boot hasn't run");
  return fn();
}

export function invalidateRolesCache(): void {
  try {
    updateTag(ROLES_CACHE_TAG);
  } catch {
    // non-Server-Action context — caller relies on revalidate TTL
  }
}

async function getEffectivePermissionsRaw(
  db: DbClient,
  roleSlugs: string[]
): Promise<string[]> {
  if (roleSlugs.length === 0) return [];
  const placeholders = roleSlugs.map(() => "?").join(",");
  const res = await db.execute({
    sql: `SELECT permissions FROM roles WHERE slug IN (${placeholders})`,
    args: roleSlugs,
  });
  const perms = new Set<string>();
  for (const row of res.rows) {
    try {
      const arr = JSON.parse(String(row.permissions));
      if (Array.isArray(arr)) {
        for (const p of arr) perms.add(String(p));
      }
    } catch {
      /* skip malformed JSON */
    }
  }
  return Array.from(perms);
}

// unstable_cache hashes function args, so distinct role-set arrays get
// distinct cache entries. Result is an array (Set isn't JSON-serializable);
// caller reconstructs the Set.
const getPermissionsArrayCached = unstable_cache(
  (roleSlugs: string[]): Promise<string[]> => {
    return getEffectivePermissionsRaw(getRuntimeDb(), [...roleSlugs].sort());
  },
  ["nextpress", "role-permissions", "v1"],
  { tags: [ROLES_CACHE_TAG], revalidate: 300 },
);

/**
 * Compute the union of permissions across the given role slugs.
 *
 * Permissions are stored as JSON arrays on `roles.permissions` and may
 * contain literal action strings (`"media.add"`), domain wildcards
 * (`"media.*"`), or the global wildcard (`"*"`).
 */
export async function getEffectivePermissions(
  db: DbClient,
  roleSlugs: string[]
): Promise<Set<string>> {
  if (roleSlugs.length === 0) return new Set();
  const sorted = [...roleSlugs].sort();
  const arr = await cacheOrFallback(
    () => getPermissionsArrayCached(sorted),
    () => getEffectivePermissionsRaw(db, sorted),
  );
  return new Set(arr);
}

/**
 * Test whether a permission set grants a given action.
 * - Global wildcard `"*"` grants everything.
 * - Domain wildcard like `"media.*"` grants any action in that domain.
 * - Otherwise an exact match is required.
 */
export function hasPermission(perms: Set<string>, action: string): boolean {
  if (perms.has("*")) return true;
  if (perms.has(action)) return true;
  const dot = action.indexOf(".");
  if (dot > 0) {
    const domainWildcard = `${action.slice(0, dot)}.*`;
    if (perms.has(domainWildcard)) return true;
  }
  return false;
}
