/**
 * Cached per-user session/shell state used by the admin layout.
 *
 * Three queries fire on every admin page render and are all keyed only on
 * the actor's user id:
 *   1. `SELECT avatar_url FROM users WHERE id = ?`              (admin layout topbar)
 *   2. `SELECT 1 FROM users WHERE id = ?`                       (freshness existence gate)
 *   3. `SELECT revoked_at FROM session_revocations WHERE user_id = ?` (revocation gate)
 *
 * Each query is a separate ~350ms Supabase round-trip — together they put
 * a hard floor under every admin render. This module collapses them into
 * one batched LEFT JOIN + memoizes the result with `unstable_cache`.
 *
 * Invalidation: every write that updates a user row, deletes a user, or
 * inserts a row into `session_revocations` calls `invalidateUserCache()`.
 * The global tag means one user write invalidates every user's cache —
 * acceptable because user writes are rare (a few per day).
 */
import { unstable_cache, updateTag } from "next/cache";
import type { DbClient } from "@core/db/client";
import { cacheOrFallback } from "@core/caching/with-fallback";

const USER_CACHE_TAG = "nextpress:user";

export interface AdminShellState {
  /** User exists in the `users` table (false → force re-auth via freshness). */
  exists: boolean;
  /** Avatar URL or null if not set. Used by the admin top-bar. */
  avatarUrl: string | null;
  /** Most-recent revocation timestamp (ISO string) or null. */
  revokedAt: string | null;
}

function getRuntimeDb(): DbClient {
  const fn = (globalThis as unknown as Record<string, (() => DbClient) | undefined>)["__nextpress_db_accessor__"];
  if (!fn) throw new Error("DB accessor not initialised — boot hasn't run");
  return fn();
}

/**
 * Invalidate every cached admin-shell state. Call from any write that
 * touches the `users` table or `session_revocations`. Safe outside a
 * Server Action — the throw is swallowed.
 */
export function invalidateUserCache(): void {
  try {
    updateTag(USER_CACHE_TAG);
  } catch {
    // non-Server-Action context — caller relies on revalidate TTL
  }
}

async function loadAdminShellStateRaw(db: DbClient, userId: string): Promise<AdminShellState> {
  const r = await db.execute({
    sql: `SELECT u.avatar_url,
                 sr.revoked_at
            FROM users u
            LEFT JOIN session_revocations sr ON sr.user_id = u.id
           WHERE u.id = ? AND u.tenant_id = 1
           ORDER BY sr.revoked_at DESC
           LIMIT 1`,
    args: [userId],
  });
  const row = r.rows[0];
  if (!row) return { exists: false, avatarUrl: null, revokedAt: null };
  return {
    exists: true,
    avatarUrl: row.avatar_url != null ? String(row.avatar_url) : null,
    revokedAt: row.revoked_at != null ? String(row.revoked_at) : null,
  };
}

const loadAdminShellStateCached = unstable_cache(
  (userId: string): Promise<AdminShellState> => loadAdminShellStateRaw(getRuntimeDb(), userId),
  ["nextpress", "user-shell-state", "v1"],
  // Short revalidate window: 60s is short enough that role demotions /
  // password changes propagate within a minute even if the explicit
  // updateTag call happens to fail (e.g., write outside a Server Action).
  { tags: [USER_CACHE_TAG], revalidate: 60 },
);

export async function getAdminShellState(db: DbClient, userId: string): Promise<AdminShellState> {
  return cacheOrFallback(
    () => loadAdminShellStateCached(userId),
    () => loadAdminShellStateRaw(db, userId),
  );
}
