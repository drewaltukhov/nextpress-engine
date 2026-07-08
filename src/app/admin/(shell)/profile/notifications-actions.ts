"use server";

/**
 * Personal "action queue" feed surfaced via the topbar bell. Each row is
 * something the actor — and only the actor — should know about: a pending
 * email-change confirmation, an admin-flagged password reset, etc.
 *
 * Scope is intentionally narrow:
 *   - only items that need the actor's action right now
 *   - no marketing / "did you know" entries (matches the project's
 *     no-noise admin posture)
 *   - additive — new kinds slot in without changing the consumer shape
 *
 * Audit-derived events ("admin published your post", "your role
 * changed") are deferred until we have a clearer signal that they
 * earn their keep on the surface.
 */
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { isSmtpConfigured } from "@core/email/smtp";

export type NotificationSeverity = "info" | "warning" | "danger";

export interface NotificationItem {
  /** Stable React key. Constructed deterministically per kind so the
   *  popover doesn't flicker on re-fetch. */
  id: string;
  kind: "email-change-pending" | "must-reset-password" | "smtp-not-configured";
  title: string;
  description: string;
  /** Where the click takes the actor. Always a relative admin path. */
  href: string;
  severity: NotificationSeverity;
}

export async function getMyNotifications(): Promise<NotificationItem[]> {
  const session = await auth();
  if (!session?.user?.id) return [];

  const items: NotificationItem[] = [];

  // 1. Pending email change — actor asked to swap to a new address and
  //    is waiting on the confirmation link from the new inbox. Only the
  //    actor sees this, and only until they confirm or cancel.
  const pendingEmail = await db().execute({
    sql: `SELECT new_email, expires_at FROM user_email_changes
          WHERE user_id = ? AND consumed_at IS NULL AND expires_at > ?
          LIMIT 1`,
    args: [session.user.id, new Date().toISOString()],
  });
  const pe = pendingEmail.rows[0];
  if (pe) {
    const expires = new Date(String(pe.expires_at));
    const hoursLeft = Math.max(
      0,
      Math.round((expires.getTime() - Date.now()) / (60 * 60 * 1000)),
    );
    const expiresHint =
      hoursLeft >= 24
        ? `Expires in ${Math.round(hoursLeft / 24)} day${Math.round(hoursLeft / 24) === 1 ? "" : "s"}`
        : hoursLeft > 0
          ? `Expires in ${hoursLeft}h`
          : "Expires soon";
    items.push({
      id: "email-change-pending",
      kind: "email-change-pending",
      title: "Confirm your new email address",
      description: `Check ${String(pe.new_email)} for the confirmation link. ${expiresHint}.`,
      href: "/admin/profile",
      severity: "warning",
    });
  }

  // 2. Must-reset-password flag — set by the admin reset-password flow.
  //    We surface it as a reminder; enforcement (forcing a reset on
  //    login) lives in the auth layer.
  const credRow = await db().execute({
    sql: "SELECT must_reset FROM user_credentials WHERE user_id = ? LIMIT 1",
    args: [session.user.id],
  });
  if (credRow.rows.length > 0 && Number(credRow.rows[0].must_reset ?? 0) === 1) {
    items.push({
      id: "must-reset-password",
      kind: "must-reset-password",
      title: "Reset your password",
      description: "An administrator asked you to choose a new password.",
      href: "/admin/profile",
      severity: "danger",
    });
  }

  // 3. SMTP not configured — admins only, since only they can fix it.
  //    Without SMTP, password resets / invites / email verification all
  //    fail silently. Disappears automatically once the credentials are
  //    filled in (no dismiss state — the underlying check is the source
  //    of truth, same pattern as the other notifications above).
  const isAdmin = session.user.roles?.includes("admin") ?? false;
  if (isAdmin && !(await isSmtpConfigured(db()))) {
    items.push({
      id: "smtp-not-configured",
      kind: "smtp-not-configured",
      title: "Set up email transport",
      description:
        "Add SMTP credentials so NextPress can send password resets, invites, and verification emails.",
      href: "/admin/settings?tab=smtp",
      severity: "warning",
    });
  }

  return items;
}
