import { NextResponse, type NextRequest } from "next/server";
import { createDbClient } from "@core/db/client";
import { readEnv } from "@core/env";
import { withBearerAuth, getApiContext } from "@core-plugins/api/bearer";
import { auditLog } from "@core-plugins/logging";
import { getSetting } from "@core-plugins/settings/registry";

/**
 * GET /api/v1/me — Token introspection.
 * No scope required — any valid token can call this.
 * Returns the token owner, scopes, prefix, and expiration.
 *
 * When `api.log_token_introspection` is on, every successful call writes
 * an `auth.api.introspect` audit-log entry tagged with the token id.
 */
async function handler(req: NextRequest) {
  const ctx = getApiContext(req)!;

  // Best-effort audit. The setting is private and rarely on; the read +
  // write are fire-and-forget so they can't slow the response.
  void (async () => {
    try {
      const env = readEnv();
      const db = createDbClient({ databaseUrl: env.databaseUrl, authToken: env.authToken });
      const enabled = await getSetting<boolean>(db, "api.log_token_introspection");
      if (!enabled) return;
      await auditLog(db, {
        actorUserId: ctx.userId,
        actorTokenId: ctx.token.id,
        action: "auth.api.introspect",
        targetType: "api_token",
        targetId: String(ctx.token.id),
        ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: req.headers.get("user-agent") ?? null,
      });
    } catch {
      // Audit failure must not affect the response.
    }
  })();

  return NextResponse.json({
    data: {
      user_id: ctx.userId,
      scopes: ctx.scopes,
      prefix: ctx.token.prefix,
      name: ctx.token.name,
      expires_at: ctx.token.expiresAt
    }
  });
}

export const GET = withBearerAuth({ scopes: [] }, handler);
