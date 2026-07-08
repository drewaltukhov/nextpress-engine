/**
 * Email token helpers for the verify_email / reset_password / invite flows.
 *
 * The plain token is returned ONCE to the caller (so it can be emailed); only
 * the SHA-256 hash is persisted. Lookups go via the hash. This protects
 * against DB-leak token reuse and lets us safely log token IDs.
 */
import { randomBytes, createHash } from "node:crypto";
import type { DbClient } from "@core/db/client";

export type EmailTokenPurpose = "verify_email" | "reset_password" | "invite";

export interface IssueArgs {
  db: DbClient;
  userId: string;
  purpose: EmailTokenPurpose;
  ttlMs?: number;          // default 24h for verify/reset, 7d for invite
}

export interface IssuedToken {
  /** The token to email the user — never persisted, never logged. */
  token: string;
  /** SHA-256 of the token; this IS persisted (and safe to log). */
  tokenHash: string;
  expiresAt: string;       // ISO-8601 UTC
}

const DEFAULT_TTL: Record<EmailTokenPurpose, number> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 24 * 60 * 60 * 1000,
  invite: 7 * 24 * 60 * 60 * 1000
};

function generateToken(): string {
  // 32 bytes = 256 bits of entropy → 43-char base64url string
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function issueEmailToken(args: IssueArgs): Promise<IssuedToken> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const ttlMs = args.ttlMs ?? DEFAULT_TTL[args.purpose];
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  await args.db.execute({
    sql: `INSERT INTO user_email_tokens (token_hash, user_id, purpose, expires_at)
          VALUES (?, ?, ?, ?)`,
    args: [tokenHash, args.userId, args.purpose, expiresAt]
  });

  return { token, tokenHash, expiresAt };
}

/**
 * Mint a token for the self-service email-change flow. The caller persists
 * the row in `user_email_changes` (not `user_email_tokens`) — the change
 * flow needs to bind the token to a specific (oldEmail, newEmail) pair,
 * which doesn't fit the generic tokens table cleanly.
 */
export function issueEmailChangeToken(ttlMs: number = 24 * 60 * 60 * 1000): IssuedToken {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  return { token, tokenHash, expiresAt };
}

export interface ConsumeArgs {
  db: DbClient;
  token: string;
  purpose: EmailTokenPurpose;
  now?: Date;
}

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; code: "not-found" | "wrong-purpose" | "expired" | "already-consumed" };

export async function consumeEmailToken(args: ConsumeArgs): Promise<ConsumeResult> {
  const tokenHash = hashToken(args.token);
  const now = args.now ?? new Date();

  const r = await args.db.execute({
    sql: `SELECT user_id, purpose, expires_at, consumed_at
          FROM user_email_tokens
          WHERE token_hash = ?`,
    args: [tokenHash]
  });
  const row = r.rows[0];
  if (!row) return { ok: false, code: "not-found" };

  if (String(row.purpose) !== args.purpose) return { ok: false, code: "wrong-purpose" };
  if (row.consumed_at != null) return { ok: false, code: "already-consumed" };

  const expiresAt = new Date(String(row.expires_at));
  if (expiresAt.getTime() < now.getTime()) return { ok: false, code: "expired" };

  // Atomic mark-as-consumed; only succeeds if still un-consumed.
  const update = await args.db.execute({
    sql: `UPDATE user_email_tokens
          SET consumed_at = ?
          WHERE token_hash = ? AND consumed_at IS NULL`,
    args: [now.toISOString(), tokenHash]
  });
  if (update.rowsAffected === 0) {
    return { ok: false, code: "already-consumed" };
  }

  return { ok: true, userId: String(row.user_id) };
}

/**
 * Sweep expired or consumed tokens. Run from a cron / boot-time cleanup.
 * Default: drop rows where (expires_at < now) OR (consumed_at < now - 30 days).
 */
export async function pruneEmailTokens(db: DbClient, now: Date = new Date()): Promise<{ removed: number }> {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const r = await db.execute({
    sql: `DELETE FROM user_email_tokens
          WHERE expires_at < ? OR (consumed_at IS NOT NULL AND consumed_at < ?)`,
    args: [now.toISOString(), cutoff]
  });
  return { removed: r.rowsAffected };
}
