/**
 * API token generation, hashing, CRUD, and lookup.
 *
 * Token format: npp_<32-random-bytes-base64url> (48 chars total)
 * Storage: only SHA-256(token) stored in DB. Full token shown once at creation.
 * Prefix: first 8 chars stored for admin UI identification (e.g. "npp_a3f9").
 */
import { createHash, randomBytes } from "node:crypto";
import type { DbClient } from "@core/db/client";

export { VALID_SCOPES, hasScope, type ApiScope } from "./scopes";

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

const TOKEN_PREFIX = "npp_";

/**
 * Generate a cryptographically random API token.
 * Returns the full plaintext token (show once, then discard).
 */
export function generateToken(): string {
  const random = randomBytes(32).toString("base64url");
  return `${TOKEN_PREFIX}${random}`;
}

/**
 * SHA-256 hash a plaintext token for storage/lookup.
 */
export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Extract the display prefix from a plaintext token (first 8 chars).
 */
export function tokenPrefix(plaintext: string): string {
  return plaintext.slice(0, 8);
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

export interface CreateTokenInput {
  userId: string;
  name: string;
  scopes: string[];
  allowedOrigins?: string[] | null;
  rateLimitPerMinute?: number | null;
  expiresAt?: string | null;
  createdBy?: string | null;
}

export interface CreateTokenResult {
  id: number;
  plaintext: string;          // shown once
  prefix: string;
  tokenHash: string;
}

/**
 * Create a new API token. Returns the plaintext (show once) and the DB row id.
 */
export async function createApiToken(
  db: DbClient,
  input: CreateTokenInput
): Promise<CreateTokenResult> {
  const plaintext = generateToken();
  const hash = hashToken(plaintext);
  const prefix = tokenPrefix(plaintext);

  const result = await db.execute({
    sql: `INSERT INTO api_tokens
            (tenant_id, user_id, name, token_hash, prefix, scopes,
             allowed_origins, rate_limit_per_minute, expires_at, created_by)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.userId,
      input.name,
      hash,
      prefix,
      JSON.stringify(input.scopes),
      input.allowedOrigins ? JSON.stringify(input.allowedOrigins) : null,
      input.rateLimitPerMinute ?? null,
      input.expiresAt ?? null,
      input.createdBy ?? input.userId
    ]
  });

  return {
    id: Number(result.lastInsertRowid),
    plaintext,
    prefix,
    tokenHash: hash
  };
}

/**
 * Revoke a token (soft-delete). Sets revoked_at + reason.
 */
export async function revokeApiToken(
  db: DbClient,
  tokenId: number,
  opts: { revokedBy: string; reason?: string | null }
): Promise<void> {
  await db.execute({
    sql: `UPDATE api_tokens
          SET revoked_at = CURRENT_TIMESTAMP,
              revoked_by = ?,
              revoked_reason = ?
          WHERE id = ? AND tenant_id = 1`,
    args: [opts.revokedBy, opts.reason ?? null, tokenId]
  });
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export interface TokenLookupResult {
  id: number;
  userId: string;
  name: string;
  prefix: string;
  scopes: string[];
  allowedOrigins: string[] | null;
  rateLimitPerMinute: number | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

/**
 * Look up a token by its SHA-256 hash. Returns null if not found or revoked.
 */
export async function lookupActiveToken(
  db: DbClient,
  hash: string
): Promise<TokenLookupResult | null> {
  const result = await db.execute({
    sql: `SELECT id, user_id, name, prefix, scopes, allowed_origins,
                 rate_limit_per_minute, expires_at, revoked_at
          FROM api_tokens
          WHERE token_hash = ? AND tenant_id = 1 AND revoked_at IS NULL
          LIMIT 1`,
    args: [hash]
  });

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: Number(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    prefix: String(row.prefix),
    scopes: parseJsonArray(row.scopes),
    allowedOrigins: row.allowed_origins ? parseJsonArray(row.allowed_origins) : null,
    rateLimitPerMinute: row.rate_limit_per_minute != null ? Number(row.rate_limit_per_minute) : null,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    revokedAt: row.revoked_at ? String(row.revoked_at) : null
  };
}

/**
 * Fire-and-forget update of last_used_at and last_used_ip. Swallows errors.
 */
export async function touchTokenUsage(db: DbClient, tokenId: number, ip: string): Promise<void> {
  try {
    await db.execute({
      sql: "UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP, last_used_ip = ? WHERE id = ?",
      args: [ip, tokenId]
    });
  } catch {
    // Usage tracking must not break the request path
  }
}

// ---------------------------------------------------------------------------
// Admin list query
// ---------------------------------------------------------------------------

export interface TokenListItem {
  id: number;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/**
 * List the active (non-revoked) tokens owned by a single user, newest first.
 * Used by the admin "My Tokens" screen.
 */
export async function listMyTokens(
  db: DbClient,
  userId: string
): Promise<TokenListItem[]> {
  const result = await db.execute({
    sql: `SELECT id, name, prefix, scopes, last_used_at, last_used_ip,
                 expires_at, created_at
          FROM api_tokens
          WHERE tenant_id = 1 AND user_id = ? AND revoked_at IS NULL
          ORDER BY created_at DESC`,
    args: [userId]
  });

  return result.rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    prefix: String(r.prefix),
    scopes: parseJsonArray(r.scopes),
    lastUsedAt: r.last_used_at ? String(r.last_used_at) : null,
    lastUsedIp: r.last_used_ip ? String(r.last_used_ip) : null,
    expiresAt: r.expires_at ? String(r.expires_at) : null,
    createdAt: String(r.created_at)
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJsonArray(raw: unknown): string[] {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  if (Array.isArray(raw)) return raw as string[];
  return [];
}
