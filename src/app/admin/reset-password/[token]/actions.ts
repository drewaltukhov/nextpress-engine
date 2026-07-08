"use server";

import { db } from "@core/db/instance";
import { hashPassword } from "@core-plugins/users/passwords";
import { consumeEmailToken, hashToken } from "@core-plugins/users/tokens";
import { auditLog } from "@core-plugins/logging";
import { invalidateUserCache } from "@core/auth/user-session-cache";
import { validatePassword } from "./password-rules";

export async function completePasswordReset(
  token: string,
  newPassword: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof token !== "string" || token.length < 16) {
    return { ok: false, error: "Invalid reset link" };
  }
  if (typeof newPassword !== "string") {
    return { ok: false, error: "Invalid password" };
  }
  const validation = validatePassword(newPassword);
  if (!validation.ok) {
    return { ok: false, error: `Password requirements not met: ${validation.failed.join(", ")}` };
  }

  // Resolve the token's purpose first — both invite and reset_password lead
  // to the same outcome (user sets their password), so accept either.
  const lookup = await db().execute({
    sql: "SELECT purpose FROM user_email_tokens WHERE token_hash = ? AND consumed_at IS NULL LIMIT 1",
    args: [hashToken(token)]
  });
  if (lookup.rows.length === 0) {
    return { ok: false, error: "This link is invalid or has already been used" };
  }
  const rawPurpose = String(lookup.rows[0].purpose);
  if (rawPurpose !== "reset_password" && rawPurpose !== "invite") {
    return { ok: false, error: "This link is invalid" };
  }
  const purpose = rawPurpose as "reset_password" | "invite";

  const result = await consumeEmailToken({ db: db(), token, purpose });
  if (!result.ok) {
    const reason: Record<typeof result.code, string> = {
      "not-found": "This link is invalid",
      "wrong-purpose": "This link is invalid",
      "expired": "This link has expired — request a new one",
      "already-consumed": "This link has already been used"
    };
    return { ok: false, error: reason[result.code] };
  }

  const userId = result.userId;
  const passwordHash = await hashPassword(newPassword);
  const now = new Date().toISOString();

  await db().execute({
    sql: `INSERT INTO user_credentials (user_id, password_hash, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            password_hash = excluded.password_hash,
            must_reset = 0,
            updated_at = excluded.updated_at`,
    args: [userId, passwordHash, now]
  });

  // Revoke all existing sessions — defends against an attacker still holding
  // a session cookie when the legitimate owner resets.
  await db().execute({
    sql: `INSERT INTO session_revocations (user_id, revoked_at, reason) VALUES (?, ?, 'password_change')
          ON CONFLICT(user_id) DO UPDATE SET revoked_at = excluded.revoked_at, reason = 'password_change'`,
    args: [userId, now]
  });
  invalidateUserCache();

  try {
    await auditLog(db(), {
      actorUserId: userId,
      action: purpose === "invite" ? "users.invite_accepted" : "users.password_reset_completed",
      targetType: "user",
      targetId: userId
    });
  } catch {
    // Audit failures must not break the action
  }

  return { ok: true };
}
