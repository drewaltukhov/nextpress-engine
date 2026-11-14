/**
 * Proxy-side session freshness gate.
 *
 * The proxy's Auth.js wrapper uses the edge config, which only verifies the
 * cookie signature. The Node jwt callback (./config.ts) additionally runs
 * checkSessionFreshness and drops sessions the database has ended — but a
 * server component cannot delete the cookie, so admin pages redirect to
 * /admin/login while the proxy, still seeing a signed cookie, sends
 * /admin/login straight back to /admin: an endless redirect loop. The proxy
 * runs this before its auth gating and sends a dead session to the
 * /admin/force-logout route handler, which clears the cookies. (The proxy
 * can't clear them itself: the Auth.js wrapper re-appends the session cookie
 * to every response it sees a session on.) Dual review, PR #2 round 2.
 */
import type { DbClient } from "@core/db/client";
import { checkSessionFreshness } from "./freshness";

/**
 * Where to send a request whose session the database has ended, or null when
 * the request is signed out or its session is still valid.
 */
export async function staleSessionRedirect(
  db: DbClient,
  auth: { user?: { id?: string; iat?: number | null } } | null
): Promise<string | null> {
  const userId = auth?.user?.id;
  if (!userId) return null;
  const fresh = await checkSessionFreshness(db, { userId, iat: auth.user?.iat ?? null });
  if (fresh.ok) return null;
  return `/admin/force-logout?reason=${fresh.reason}`;
}
