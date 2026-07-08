/**
 * Resolve the actual database user ID from a session.
 *
 * After a backup restore or setup wizard re-creation, the JWT's `sub`
 * (which becomes session.user.id) can reference a UUID that no longer
 * exists in the `users` table. This helper falls back to an email-based
 * lookup so server actions don't hit FK constraint failures.
 *
 * Cached: same (id, email) pair always resolves to the same user id.
 * Invalidated by `invalidateUserCache()` from user-row writes.
 */
import { unstable_cache } from "next/cache";
import type { DbClient } from "@core/db/client";
import { cacheOrFallback } from "@core/caching/with-fallback";

function getRuntimeDb(): DbClient {
  const fn = (globalThis as unknown as Record<string, (() => DbClient) | undefined>)["__nextpress_db_accessor__"];
  if (!fn) throw new Error("DB accessor not initialised — boot hasn't run");
  return fn();
}

async function resolveUserIdRaw(
  db: DbClient,
  id: string,
  email: string,
): Promise<string> {
  const idCheck = await db.execute({
    sql: "SELECT id FROM users WHERE id = ? LIMIT 1",
    args: [id],
  });
  if (idCheck.rows.length > 0) return id;

  const emailCheck = await db.execute({
    sql: "SELECT id FROM users WHERE email = ? LIMIT 1",
    args: [email],
  });
  if (emailCheck.rows[0]?.id) return String(emailCheck.rows[0].id);

  // Last resort: return the original (will likely FK-fail, but at least
  // the caller gets a clear error rather than a silent null)
  return id;
}

const resolveUserIdCached = unstable_cache(
  (id: string, email: string): Promise<string> => resolveUserIdRaw(getRuntimeDb(), id, email),
  ["nextpress", "resolve-user-id", "v1"],
  { tags: ["nextpress:user"], revalidate: 60 },
);

export async function resolveUserId(
  db: DbClient,
  session: { id: string; email: string }
): Promise<string> {
  return cacheOrFallback(
    () => resolveUserIdCached(session.id, session.email),
    () => resolveUserIdRaw(db, session.id, session.email),
  );
}
