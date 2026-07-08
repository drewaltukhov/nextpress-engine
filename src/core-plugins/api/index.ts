import type { PluginAPI } from "@core/plugins/api";

/**
 * API core-plugin — token-based auth for /api/v1/* routes.
 *
 * Phase 5 surfaces:
 *  - api_tokens table (CRUD, SHA-256 hashed storage, npp_ prefix format)
 *  - Bearer auth middleware (withBearerAuth) for route handlers
 *  - Scope system (posts:read/write/delete, media:*, taxonomies:*, forms:*, *)
 *  - Per-token CIDR allowlist
 *  - In-memory token-bucket rate limiter
 *  - GET /api/v1/me introspection endpoint
 *
 * Pending follow-ups:
 *  - Admin /admin/api-tokens screen (deferred to UI track)
 *  - Actual /api/v1/* content routes (depend on posts/media/terms plugins)
 *  - site_settings.api.* once Phase 6 (settings) ships
 */
export default function register(_api: PluginAPI): void {
  // Service-layer helpers are imported directly by route handlers.
}

// Token generation + CRUD
export {
  generateToken,
  hashToken,
  tokenPrefix,
  createApiToken,
  revokeApiToken,
  lookupActiveToken,
  touchTokenUsage,
  hasScope,
  listMyTokens,
  VALID_SCOPES,
  type ApiScope,
  type CreateTokenInput,
  type CreateTokenResult,
  type TokenLookupResult,
  type TokenListItem
} from "./tokens";

// Bearer auth middleware
export { withBearerAuth, getApiContext, type ApiRequestContext, type BearerAuthOptions } from "./bearer";

// Rate limiting
export {
  consumeToken,
  rateLimitHeaders,
  DEFAULT_RATE_LIMIT,
  BURST_ALLOWANCE,
  type RateLimitResult
} from "./rate-limit";
