/**
 * IP guard — reusable helper for server-side (Node runtime) route handlers
 * that need to enforce IP block/allow lists.
 *
 * Edge middleware can't do DB queries with @libsql/client (Node-only), so
 * IP enforcement lives in the Node runtime layer:
 *
 *  - Login attempts: enforced via `checkIpAccess()` in authenticateWithCredentials()
 *  - Admin API routes: wrap handlers with `withIpGuard()` from this module
 *
 * When the API plugin ships (Phase 5), `/api/v1/*` routes will use this
 * same guard.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createDbClient, type DbClient } from "@core/db/client";
import { readEnv } from "@core/env";
import { getClientIp } from "@core/net/client-ip";
import { checkIpAccess } from "./ip-access";

let cached: DbClient | null = null;
function db(): DbClient {
  if (cached) return cached;
  const env = readEnv();
  cached = createDbClient({ databaseUrl: env.databaseUrl, authToken: env.authToken });
  return cached;
}

// Re-export the canonical IP extractor under the historical name so existing
// callers (`@core-plugins/security`'s public API) keep working. The
// implementation moved to `src/core/net/client-ip.ts` so every surface uses
// the same Vercel-aware logic — see that file for the security rationale.
export { getClientIp as extractIp } from "@core/net/client-ip";

/**
 * Wrap a Next.js route handler to reject requests from blocked IPs before
 * the handler runs. Returns 403 for blocked IPs.
 *
 * Usage:
 *   export const POST = withIpGuard(async (req) => { ... });
 */
export function withIpGuard<T extends NextRequest>(
  handler: (req: T) => Promise<NextResponse | Response>
): (req: T) => Promise<NextResponse | Response> {
  return async (req: T) => {
    const ip = getClientIp(req);

    try {
      const access = await checkIpAccess(db(), ip);
      if (!access.allowed) {
        return NextResponse.json(
          { error: "Your IP address has been blocked. Contact the site administrator if you believe this is a mistake." },
          { status: 403 }
        );
      }
    } catch {
      // If the IP check fails (DB down, etc.), allow through rather than
      // lock out all users. Fail open on infrastructure errors.
    }

    return handler(req);
  };
}
