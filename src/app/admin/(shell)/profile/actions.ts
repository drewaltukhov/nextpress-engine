"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { sendEmail } from "@core/email";
import { assertWriteable } from "@core/maintenance";
import { hashToken, issueEmailChangeToken } from "@core-plugins/users/tokens";
import { auditLog } from "@core-plugins/logging";
import { resolveUserId } from "@core/auth/resolve-user";
import { invalidateUserCache } from "@core/auth/user-session-cache";
import { isUnverifiableEmail } from "../users/email-utils";

async function getAppOrigin(): Promise<string> {
  const envUrl = process.env.AUTH_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export interface PendingEmailChange {
  newEmail: string;
  expiresAt: string;
  createdAt: string;
}

export interface MyProfile {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  pendingEmailChange: PendingEmailChange | null;
}

export async function getMyProfile(): Promise<MyProfile | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userRow = await db().execute({
    sql: `SELECT id, email, display_name FROM users
          WHERE id = ? AND tenant_id = 1 AND deleted_at IS NULL
          LIMIT 1`,
    args: [session.user.id]
  });
  const u = userRow.rows[0];
  if (!u) return null;

  const pending = await db().execute({
    sql: `SELECT new_email, expires_at, created_at FROM user_email_changes
          WHERE user_id = ? AND consumed_at IS NULL AND expires_at > ?
          LIMIT 1`,
    args: [String(u.id), new Date().toISOString()]
  });
  const p = pending.rows[0];

  return {
    id: String(u.id),
    email: String(u.email),
    displayName: String(u.display_name),
    isAdmin: session.user.roles?.includes("admin") ?? false,
    pendingEmailChange: p
      ? {
          newEmail: String(p.new_email),
          expiresAt: String(p.expires_at),
          createdAt: String(p.created_at)
        }
      : null
  };
}

export type RequestResult = { ok: true } | { ok: false; error: string };

export async function requestEmailChange(newEmail: string): Promise<RequestResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };
  const actorId = await resolveUserId(db(), session.user);

  const cleanNew = newEmail.trim().toLowerCase();
  if (!cleanNew || cleanNew.indexOf("@") < 1) {
    return { ok: false, error: "Enter a valid email address" };
  }
  if (isUnverifiableEmail(cleanNew)) {
    return { ok: false, error: "Pick a real email address (not a *.local placeholder)" };
  }

  const userRow = await db().execute({
    sql: `SELECT email, display_name FROM users
          WHERE id = ? AND tenant_id = 1 AND deleted_at IS NULL
          LIMIT 1`,
    args: [session.user.id]
  });
  const u = userRow.rows[0];
  if (!u) return { ok: false, error: "User not found" };

  const oldEmail = String(u.email);
  const displayName = String(u.display_name);
  if (oldEmail === cleanNew) {
    return { ok: false, error: "That's already your current email" };
  }

  // Same dedup rule as createUser — soft-deleted rows don't count as taken.
  const dup = await db().execute({
    sql: `SELECT id FROM users
          WHERE tenant_id = 1 AND email = ? AND id != ? AND deleted_at IS NULL
          LIMIT 1`,
    args: [cleanNew, session.user.id]
  });
  if (dup.rows.length > 0) {
    return { ok: false, error: "A user with this email already exists" };
  }

  const now = new Date().toISOString();

  // Cancel any prior pending change so the partial-unique index lets us
  // insert the new row. Anything we cancel here was already invalidated by
  // a fresh request anyway.
  await db().execute({
    sql: `UPDATE user_email_changes SET consumed_at = ?
          WHERE user_id = ? AND consumed_at IS NULL`,
    args: [now, session.user.id]
  });

  const issued = issueEmailChangeToken();
  await db().execute({
    sql: `INSERT INTO user_email_changes
            (token_hash, user_id, old_email, new_email, expires_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [issued.tokenHash, session.user.id, oldEmail, cleanNew, issued.expiresAt, now]
  });

  const origin = await getAppOrigin();
  const confirmUrl = `${origin}/admin/confirm-email/${encodeURIComponent(issued.token)}`;

  if (process.env.NODE_ENV !== "production") {
    console.warn(`[dev] email-change confirm URL for ${cleanNew}: ${confirmUrl}`);
  }

  // Send the confirm link to the NEW address — that's how we prove the user
  // can receive mail there. Delivery failure is fatal for this flow because
  // without the link the change can't proceed.
  try {
    await sendEmail({
      input: {
        to: cleanNew,
        subject: "Confirm your new email address",
        text: [
          `Hi ${displayName},`,
          ``,
          `You asked to change the email on your NextPress account from`,
          `${oldEmail} to ${cleanNew}.`,
          ``,
          `Click the link below within 24 hours to confirm:`,
          confirmUrl,
          ``,
          `If you didn't request this, you can ignore this email — the change`,
          `won't take effect.`
        ].join("\n")
      }
    });
  } catch (err) {
    // Roll the pending row back so the user can retry without hitting the
    // partial-unique conflict.
    await db().execute({
      sql: `UPDATE user_email_changes SET consumed_at = ?
            WHERE token_hash = ?`,
      args: [now, issued.tokenHash]
    });
    return {
      ok: false,
      error: `Couldn't send confirmation email: ${err instanceof Error ? err.message : "transport error"}`
    };
  }

  // Best-effort heads-up to the OLD address. Don't fail the request if this
  // fails — the flow is still safe (the new address still has to confirm).
  try {
    await sendEmail({
      input: {
        to: oldEmail,
        subject: "Email change requested",
        text: [
          `Hi ${displayName},`,
          ``,
          `Someone — hopefully you — asked to change the email on your`,
          `NextPress account to ${cleanNew}.`,
          ``,
          `If that was you, check ${cleanNew} for a confirmation link.`,
          `If it wasn't, you can ignore this email and the change won't go`,
          `through. Consider changing your password as a precaution.`
        ].join("\n")
      }
    });
  } catch {
    // Heads-up failure is non-fatal.
  }

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "users.email_change_requested",
      targetType: "user",
      targetId: session.user.id,
      diff: { old: oldEmail, new: cleanNew }
    });
  } catch {
    // Audit failures must not break the action
  }

  revalidatePath("/admin/profile");
  return { ok: true };
}

export async function cancelEmailChange(): Promise<RequestResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };

  const now = new Date().toISOString();
  await db().execute({
    sql: `UPDATE user_email_changes SET consumed_at = ?
          WHERE user_id = ? AND consumed_at IS NULL`,
    args: [now, session.user.id]
  });

  revalidatePath("/admin/profile");
  return { ok: true };
}

export type ConfirmResult =
  | { ok: true; newEmail: string }
  | { ok: false; code: "not-found" | "expired" | "already-consumed" };

/**
 * Consume an email-change token. Used by the /admin/confirm-email/[token]
 * route. Atomic: only the first caller to flip consumed_at wins.
 */
export async function confirmEmailChange(token: string): Promise<ConfirmResult> {
  const tokenHash = hashToken(token);
  const now = new Date();
  const nowIso = now.toISOString();

  const row = await db().execute({
    sql: `SELECT user_id, old_email, new_email, expires_at, consumed_at
          FROM user_email_changes
          WHERE token_hash = ?`,
    args: [tokenHash]
  });
  const r = row.rows[0];
  if (!r) return { ok: false, code: "not-found" };
  if (r.consumed_at != null) return { ok: false, code: "already-consumed" };

  const expiresAt = new Date(String(r.expires_at));
  if (expiresAt.getTime() < now.getTime()) return { ok: false, code: "expired" };

  const userId = String(r.user_id);
  const oldEmail = String(r.old_email);
  const newEmail = String(r.new_email);

  // Atomic mark-as-consumed. If a second click slips in, only the first
  // bumps rowsAffected and runs the email update.
  const update = await db().execute({
    sql: `UPDATE user_email_changes SET consumed_at = ?
          WHERE token_hash = ? AND consumed_at IS NULL`,
    args: [nowIso, tokenHash]
  });
  if (update.rowsAffected === 0) {
    return { ok: false, code: "already-consumed" };
  }

  // Final dedup check before swapping the canonical email — a different
  // user could have claimed `newEmail` while this token sat in the user's
  // inbox.
  const dup = await db().execute({
    sql: `SELECT id FROM users
          WHERE tenant_id = 1 AND email = ? AND id != ? AND deleted_at IS NULL
          LIMIT 1`,
    args: [newEmail, userId]
  });
  if (dup.rows.length > 0) {
    // Best-effort surface — rare race, treat as "expired" so the user
    // re-initiates with a different address.
    return { ok: false, code: "expired" };
  }

  await db().execute({
    sql: `UPDATE users SET email = ?, updated_at = ?
          WHERE id = ? AND tenant_id = 1`,
    args: [newEmail, nowIso, userId]
  });

  // Force re-login so the JWT picks up the new email.
  await db().execute({
    sql: `INSERT INTO session_revocations (user_id, revoked_at, reason)
          VALUES (?, ?, 'manual')
          ON CONFLICT(user_id) DO UPDATE
            SET revoked_at = excluded.revoked_at, reason = 'manual'`,
    args: [userId, nowIso]
  });
  invalidateUserCache();

  // Final notice to the OLD address so the original owner sees the change
  // landed. Best-effort.
  try {
    await sendEmail({
      input: {
        to: oldEmail,
        subject: "Your email address was changed",
        text: [
          `Your NextPress email was changed to ${newEmail}.`,
          ``,
          `If this wasn't you, contact your administrator immediately and`,
          `reset your password.`
        ].join("\n")
      }
    });
  } catch {
    // Notice failure is non-fatal.
  }

  try {
    await auditLog(db(), {
      actorUserId: userId,
      action: "users.email_change_confirmed",
      targetType: "user",
      targetId: userId,
      diff: { old: oldEmail, new: newEmail }
    });
  } catch {
    // Audit failures must not break the action
  }

  return { ok: true, newEmail };
}
