"use server";

import { db } from "@core/db/instance";
import { issueEmailToken } from "@core-plugins/users/tokens";
import { auditLog } from "@core-plugins/logging";
import { sendEmail } from "@core/email";
import { headers } from "next/headers";
import { isUnverifiableEmail } from "../(shell)/users/email-utils";

async function getAppOrigin(): Promise<string> {
  const envUrl = process.env.AUTH_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

// Self-service password reset request. Always returns { ok: true } regardless
// of whether the email exists, is unverifiable, or is rate-limited — that way
// this endpoint can't be used to enumerate registered users.
export async function requestSelfPasswordReset(email: string): Promise<{ ok: true }> {
  const cleaned = email.trim().toLowerCase();
  if (!cleaned || cleaned.indexOf("@") < 1) return { ok: true };

  const userRow = await db().execute({
    sql: "SELECT id, display_name FROM users WHERE tenant_id = 1 AND email = ? AND deleted_at IS NULL LIMIT 1",
    args: [cleaned]
  });
  if (userRow.rows.length === 0) return { ok: true };

  // Can't deliver to a placeholder address — silently no-op rather than reveal
  // that fact to an enumerator.
  if (isUnverifiableEmail(cleaned)) return { ok: true };

  const userId = String(userRow.rows[0].id);
  const targetName = String(userRow.rows[0].display_name);

  // Rate limit — silently swallow if a non-consumed reset token was issued in
  // the last 60 seconds for this user.
  const recent = await db().execute({
    sql: `SELECT 1 FROM user_email_tokens
          WHERE user_id = ? AND purpose = 'reset_password' AND consumed_at IS NULL
          AND created_at > datetime('now', '-60 seconds')
          LIMIT 1`,
    args: [userId]
  });
  if (recent.rows.length > 0) return { ok: true };

  const issued = await issueEmailToken({ db: db(), userId, purpose: "reset_password" });
  const origin = await getAppOrigin();
  const resetUrl = `${origin}/admin/reset-password/${encodeURIComponent(issued.token)}`;

  if (process.env.NODE_ENV !== "production") {
    console.warn(`[dev] self-service reset URL for ${cleaned}: ${resetUrl}`);
  }

  try {
    await sendEmail({
      input: {
        to: cleaned,
        subject: "Reset your password",
        text: [
          `Hi ${targetName},`,
          ``,
          `We received a request to reset your NextPress password.`,
          `Open the link below within 24 hours to choose a new one:`,
          ``,
          resetUrl,
          ``,
          `If you didn't request this, you can ignore this email — your existing password keeps working.`
        ].join("\n")
      }
    });
  } catch {
    // Swallow transport failures here too — don't reveal SMTP state to the
    // unauthenticated caller. The dev console.warn above still surfaces the
    // URL for local testing.
  }

  try {
    await auditLog(db(), {
      actorUserId: userId,
      action: "users.password_reset_requested_self",
      targetType: "user",
      targetId: userId
    });
  } catch {
    // Audit failures must not break the action
  }

  return { ok: true };
}
