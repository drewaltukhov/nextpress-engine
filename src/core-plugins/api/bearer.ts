/**
 * Bearer auth middleware for /api/v1/* routes.
 *
 * Wraps a Next.js route handler with the full 5-step auth flow:
 *   1. Extract token from Authorization header
 *   2. Hash & lookup in api_tokens
 *   3. Check expiration
 *   4. Verify required scope(s)
 *   5. Check CIDR allowlist, set request context, rate-limit, async-update usage
 *
 * Also integrates the IP guard from the security plugin.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createDbClient, type DbClient } from "@core/db/client";
import { readEnv } from "@core/env";
import { getClientIp } from "@core/net/client-ip";
import { checkIpAccess } from "@core-plugins/security/ip-access";
import { ipMatchesCidr } from "@core-plugins/security";
import { getSetting } from "@core-plugins/settings/registry";
import { hashToken, lookupActiveToken, touchTokenUsage, hasScope, type TokenLookupResult } from "./tokens";
import { DEFAULT_RATE_LIMIT, consumeToken, rateLimitHeaders } from "./rate-limit";

let cached: DbClient | null = null;
function db(): DbClient {
  if (cached) return cached;
  const env = readEnv();
  cached = createDbClient({ databaseUrl: env.databaseUrl, authToken: env.authToken });
  return cached;
}

function jsonError(code: string, message: string, status: number, extraHeaders?: Record<string, string>) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: extraHeaders }
  );
}

// ---------------------------------------------------------------------------
// CORS — driven by api.cors_allowed_origins (one origin per line)
// ---------------------------------------------------------------------------

async function isOriginAllowed(origin: string | null): Promise<boolean> {
  if (!origin) return false;
  try {
    const raw = await getSetting<string>(db(), "api.cors_allowed_origins");
    const list = (raw ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    return list.includes(origin);
  } catch {
    return false;
  }
}

function applyCorsHeaders(response: NextResponse | Response, origin: string): void {
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Vary", "Origin");
}

async function buildPreflightResponse(req: NextRequest, origin: string | null): Promise<NextResponse> {
  if (!origin || !(await isOriginAllowed(origin))) {
    // Origin not allowed — return 204 with no CORS headers so the browser
    // cleanly fails the preflight.
    return new NextResponse(null, { status: 204 });
  }
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods":
      req.headers.get("access-control-request-method") ?? "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      req.headers.get("access-control-request-headers") ?? "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  return new NextResponse(null, { status: 204, headers });
}

// ---------------------------------------------------------------------------
// Authenticated request context
// ---------------------------------------------------------------------------

export interface ApiRequestContext {
  token: TokenLookupResult;
  userId: string;
  scopes: string[];
  ip: string;
}

/** Symbol key for attaching API context to the request. */
const API_CTX = Symbol.for("nextpress.api.ctx");

/** Retrieve the API context set by withBearerAuth. */
export function getApiContext(req: NextRequest): ApiRequestContext | undefined {
  return (req as unknown as Record<symbol, ApiRequestContext>)[API_CTX];
}

// ---------------------------------------------------------------------------
// Middleware wrapper
// ---------------------------------------------------------------------------

export interface BearerAuthOptions {
  /** Required scope(s) for this route. Empty = any valid token. */
  scopes?: string[];
}

/**
 * Wrap a route handler with Bearer token auth + rate limiting.
 *
 * Usage:
 *   export const GET = withBearerAuth({ scopes: ["posts:read"] }, async (req) => {
 *     const ctx = getApiContext(req)!;
 *     // ... handler logic
 *   });
 */
export function withBearerAuth(
  opts: BearerAuthOptions,
  handler: (req: NextRequest) => Promise<NextResponse | Response>
): (req: NextRequest) => Promise<NextResponse | Response> {
  const requiredScopes = opts.scopes ?? [];

  return async (req: NextRequest) => {
    const ip = getClientIp(req);
    const origin = req.headers.get("origin");

    // CORS preflight — answer before auth so cross-origin browsers can probe
    // their allowed-method list without a token.
    if (req.method === "OPTIONS") {
      return buildPreflightResponse(req, origin);
    }

    // 0. IP block check (security plugin)
    try {
      const ipAccess = await checkIpAccess(db(), ip);
      if (!ipAccess.allowed) {
        return jsonError("forbidden", "Your IP address has been blocked.", 403);
      }
    } catch {
      // Fail open on infrastructure errors
    }

    // 1. Extract token from Authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonError("unauthorized", "Missing or invalid Authorization header", 401);
    }
    const plaintext = authHeader.slice(7).trim();
    if (!plaintext) {
      return jsonError("unauthorized", "Missing or invalid Authorization header", 401);
    }

    // 2. Hash & lookup
    const hash = hashToken(plaintext);
    const token = await lookupActiveToken(db(), hash);
    if (!token) {
      return jsonError("unauthorized", "Invalid or revoked token", 401);
    }

    // 3. Check expiration
    if (token.expiresAt && token.expiresAt <= new Date().toISOString()) {
      return jsonError("token_expired", "This token has expired", 401);
    }

    // 4. Check required scopes
    for (const scope of requiredScopes) {
      if (!hasScope(token.scopes, scope)) {
        return jsonError("forbidden", `Token does not have required scope: ${scope}`, 403);
      }
    }

    // 5a. Check per-token CIDR allowlist
    if (token.allowedOrigins && token.allowedOrigins.length > 0) {
      const matched = token.allowedOrigins.some((cidr) => ipMatchesCidr(ip, cidr));
      if (!matched) {
        return jsonError("forbidden", "Request IP is not in this token's allowed origins", 403);
      }
    }

    // 5b. Rate limiting — token's per-token rate override wins; otherwise
    // pull the site-wide default from settings (falls back to DEFAULT_RATE_LIMIT).
    let rateLimit = token.rateLimitPerMinute;
    if (rateLimit == null) {
      try {
        const siteDefault = await getSetting<number>(db(), "api.rate_limit_per_minute");
        if (Number.isFinite(siteDefault) && (siteDefault ?? 0) > 0) {
          rateLimit = siteDefault as number;
        }
      } catch {
        rateLimit = DEFAULT_RATE_LIMIT;
      }
    }
    const rateResult = consumeToken(token.id, rateLimit);
    const rlHeaders = rateLimitHeaders(rateResult);
    if (!rateResult.allowed) {
      return jsonError(
        "rate_limit_exceeded",
        `Rate limit exceeded. Please retry after ${rateResult.retryAfterSeconds} seconds.`,
        429,
        rlHeaders
      );
    }

    // 5c. Set request context
    (req as unknown as Record<symbol, ApiRequestContext>)[API_CTX] = {
      token,
      userId: token.userId,
      scopes: token.scopes,
      ip
    };

    // 5d. Async-update usage (fire and forget)
    touchTokenUsage(db(), token.id, ip);

    // Run handler, attach rate-limit headers + CORS headers (when allowed)
    // to the response.
    const response = await handler(req);
    for (const [key, value] of Object.entries(rlHeaders)) {
      response.headers.set(key, value);
    }
    if (origin && (await isOriginAllowed(origin))) {
      applyCorsHeaders(response, origin);
    }
    return response;
  };
}
