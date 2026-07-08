"use server";

import { revalidatePath } from "next/cache";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { hashPassword } from "@core-plugins/users/passwords";
import { validateStepUp } from "@core-plugins/security/step-up";
import { issueEmailToken } from "@core-plugins/users/tokens";
import { auditLog } from "@core-plugins/logging";
import { sendEmail } from "@core/email";
import { auth } from "@core/auth";
import { resolveUserId } from "@core/auth/resolve-user";
import { invalidateUserCache } from "@core/auth/user-session-cache";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { isUnverifiableEmail } from "./email-utils";
import {
  emptySocials,
  normalizeSocials,
  type Socials,
} from "./socials";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface UserListItem {
  id: string;
  email: string;
  displayName: string;
  /** Empty string when unset — keeps the field non-nullable for the UI. */
  avatarUrl: string;
  status: string;
  roles: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

export async function getUsers(): Promise<UserListItem[]> {
  const result = await db().execute({
    sql: `SELECT u.id, u.email, u.display_name, u.avatar_url, u.status,
                 u.last_login_at, u.created_at,
                 GROUP_CONCAT(ur.role_slug) AS roles
          FROM users u
          LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = 1
          WHERE u.tenant_id = 1 AND u.deleted_at IS NULL
          GROUP BY u.id
          ORDER BY u.created_at DESC`,
    args: []
  });

  return result.rows.map((r) => ({
    id: String(r.id),
    email: String(r.email),
    displayName: String(r.display_name),
    avatarUrl: r.avatar_url ? String(r.avatar_url) : "",
    status: String(r.status),
    roles: r.roles ? String(r.roles).split(",") : [],
    lastLoginAt: r.last_login_at ? String(r.last_login_at) : null,
    createdAt: String(r.created_at)
  }));
}

export interface UserDetail {
  id: string;
  email: string;
  displayName: string;
  fullName: string;
  bio: string;
  avatarUrl: string;
  status: string;
  roles: string[];
  socials: Socials;
}

export async function getUser(userId: string): Promise<UserDetail | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const r = await db().execute({
    sql: `SELECT u.id, u.email, u.display_name, u.full_name, u.bio, u.avatar_url, u.status, u.meta,
                 (SELECT GROUP_CONCAT(role_slug) FROM user_roles
                   WHERE user_id = u.id AND tenant_id = 1) AS roles
          FROM users u
          WHERE u.id = ? AND u.tenant_id = 1 AND u.deleted_at IS NULL
          LIMIT 1`,
    args: [userId]
  });
  const row = r.rows[0];
  if (!row) return null;

  let meta: Record<string, unknown> = {};
  const rawMeta = row.meta;
  if (rawMeta && typeof rawMeta === "string") {
    try {
      const parsed = JSON.parse(rawMeta);
      if (parsed && typeof parsed === "object") meta = parsed as Record<string, unknown>;
    } catch {
      meta = {};
    }
  } else if (rawMeta && typeof rawMeta === "object") {
    meta = rawMeta as unknown as Record<string, unknown>;
  }

  const stored = normalizeSocials(meta.socials);
  const socials = { ...emptySocials(), ...stored };

  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name),
    fullName: row.full_name ? String(row.full_name) : "",
    bio: row.bio ? String(row.bio) : "",
    avatarUrl: row.avatar_url ? String(row.avatar_url) : "",
    status: String(row.status),
    roles: row.roles ? String(row.roles).split(",") : [],
    socials,
  };
}

// Cheap availability check used by the AddUserForm live hint. Mirrors the
// duplicate guard inside createUser. Soft-deleted rows don't count as "taken"
// — that matches the createUser invariant: a deleted email can be re-used.
export async function checkEmailAvailable(
  email: string
): Promise<{ available: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { available: false };

  const cleaned = email.trim().toLowerCase();
  if (!cleaned || cleaned.indexOf("@") < 1) return { available: false };

  const result = await db().execute({
    sql: "SELECT 1 FROM users WHERE tenant_id = 1 AND email = ? AND deleted_at IS NULL LIMIT 1",
    args: [cleaned]
  });
  return { available: result.rows.length === 0 };
}

export async function getRoles(): Promise<Array<{ slug: string; label: string }>> {
  const result = await db().execute({
    sql: "SELECT slug, label FROM roles ORDER BY slug",
    args: []
  });
  return result.rows.map((r) => ({ slug: String(r.slug), label: String(r.label) }));
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface CreateUserInput {
  email: string;
  displayName: string;
  fullName?: string;
  bio?: string;
  avatarUrl?: string;
  socials?: Record<string, string>;
  password: string;       // ignored when sendInvite is true
  role: string;
  sendInvite: boolean;
}

export async function createUser(
  input: CreateUserInput
): Promise<{ ok: true; id: string; warning?: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };
  const actorId = await resolveUserId(db(), session.user);

  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!email || !displayName) {
    return { ok: false, error: "Email and display name are required" };
  }

  if (input.sendInvite) {
    if (isUnverifiableEmail(email)) {
      return { ok: false, error: "Can't send an invite to a placeholder email — pick a real address" };
    }
  } else if (!input.password) {
    return { ok: false, error: "Password is required when not sending an invite" };
  }

  const fullName = (input.fullName ?? "").trim().slice(0, 200) || null;
  const bio = (input.bio ?? "").trim().slice(0, 2000) || null;
  // Avatar URL is the same shape we store on `seo_og_image` etc — a
  // bare URL chosen via MediaPickerInput. The picker enforces the
  // site-wide media settings (extension allowlist, max size) at
  // upload time, so we trust the value here. Trim + cap at 500 chars
  // matches the SEO image limits.
  const avatarUrl = (input.avatarUrl ?? "").trim().slice(0, 500) || null;
  const socials = normalizeSocials(input.socials);
  const meta = Object.keys(socials).length > 0 ? { socials } : {};

  // Check for duplicate email
  const existing = await db().execute({
    sql: "SELECT id FROM users WHERE tenant_id = 1 AND email = ? AND deleted_at IS NULL LIMIT 1",
    args: [email]
  });
  if (existing.rows.length > 0) {
    return { ok: false, error: "A user with this email already exists" };
  }

  const userId = randomUUID();
  const now = new Date().toISOString();

  await db().execute({
    sql: `INSERT INTO users (id, tenant_id, email, display_name, full_name, bio, avatar_url, meta, status, created_at, updated_at)
          VALUES (?, 1, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    args: [userId, email, displayName, fullName, bio, avatarUrl, JSON.stringify(meta), now, now]
  });

  if (!input.sendInvite) {
    const passwordHash = await hashPassword(input.password);
    await db().execute({
      sql: "INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)",
      args: [userId, passwordHash]
    });
  }

  await db().execute({
    sql: "INSERT INTO user_roles (user_id, role_slug, tenant_id) VALUES (?, ?, 1)",
    args: [userId, input.role]
  });

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "users.create",
      targetType: "user",
      targetId: userId,
      diff: { email, displayName, role: input.role, invited: input.sendInvite }
    });
  } catch {
    // Audit failures must not break the action
  }

  let inviteWarning: string | undefined;
  if (input.sendInvite) {
    const issued = await issueEmailToken({ db: db(), userId, purpose: "invite" });
    const origin = await getAppOrigin();
    const inviteUrl = `${origin}/admin/reset-password/${encodeURIComponent(issued.token)}`;

    if (process.env.NODE_ENV !== "production") {
      console.warn(`[dev] invite URL for ${email}: ${inviteUrl}`);
    }

    let inviteSent = false;
    try {
      await sendEmail({
        input: {
          to: email,
          subject: "You're invited to NextPress",
          text: [
            `Hi ${displayName},`,
            ``,
            `${session.user.name ?? "An administrator"} invited you to a NextPress site.`,
            `Open the link below within 7 days to set your password and sign in:`,
            ``,
            inviteUrl,
            ``,
            `If you weren't expecting this invitation, you can ignore this email.`
          ].join("\n")
        }
      });
      inviteSent = true;
    } catch (err) {
      // The user row exists — don't block the admin in the form. Surface a
      // warning instead so they can resend the invite once SMTP is fixed.
      inviteWarning = `User created, but invite email failed: ${err instanceof Error ? err.message : "transport error"}`;
    }

    if (inviteSent) {
      try {
        await auditLog(db(), {
          actorUserId: actorId,
          action: "users.invite_sent",
          targetType: "user",
          targetId: userId
        });
      } catch {
        // Audit failures must not break the action
      }
    }
  }

  revalidatePath("/admin/users");
  return inviteWarning
    ? { ok: true, id: userId, warning: inviteWarning }
    : { ok: true, id: userId };
}

export interface UpdateUserInput {
  id: string;
  displayName: string;
  fullName?: string;
  bio?: string;
  avatarUrl?: string;
  socials?: Record<string, string>;
  role: string;
}

// Email changes are intentionally not supported here. Email is a login
// credential — changing it requires a dedicated flow with verification on the
// new address and notification on the old one.
export async function updateUser(
  input: UpdateUserInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };
  const actorId = await resolveUserId(db(), session.user);

  const displayName = input.displayName.trim();
  if (!displayName) {
    return { ok: false, error: "Display name is required" };
  }

  const fullName = (input.fullName ?? "").trim().slice(0, 200) || null;
  const bio = (input.bio ?? "").trim().slice(0, 2000) || null;
  const avatarUrl = (input.avatarUrl ?? "").trim().slice(0, 500) || null;
  const socials = normalizeSocials(input.socials);

  const current = await db().execute({
    sql: `SELECT u.display_name, u.full_name, u.bio, u.avatar_url, u.meta,
                 (SELECT GROUP_CONCAT(role_slug) FROM user_roles
                   WHERE user_id = u.id AND tenant_id = 1) AS roles
          FROM users u
          WHERE u.id = ? AND u.tenant_id = 1 AND u.deleted_at IS NULL
          LIMIT 1`,
    args: [input.id]
  });
  if (current.rows.length === 0) return { ok: false, error: "User not found" };
  const before = current.rows[0];
  const beforeRoles = before.roles ? String(before.roles).split(",") : [];

  // Prevent self-demotion out of admin (mirrors self-disable guard)
  if (
    input.id === session.user.id &&
    beforeRoles.includes("admin") &&
    input.role !== "admin"
  ) {
    return { ok: false, error: "You cannot remove your own admin role" };
  }

  // Preserve any meta keys outside of socials so this action is non-destructive
  // to other plugins that may stash data on the user.
  let meta: Record<string, unknown> = {};
  const rawMeta = before.meta;
  if (rawMeta && typeof rawMeta === "string") {
    try {
      const parsed = JSON.parse(rawMeta);
      if (parsed && typeof parsed === "object") meta = parsed as Record<string, unknown>;
    } catch {
      meta = {};
    }
  } else if (rawMeta && typeof rawMeta === "object") {
    meta = rawMeta as unknown as Record<string, unknown>;
  }
  if (Object.keys(socials).length > 0) {
    meta.socials = socials;
  } else {
    delete meta.socials;
  }

  const now = new Date().toISOString();
  await db().execute({
    sql: `UPDATE users
            SET display_name = ?, full_name = ?, bio = ?, avatar_url = ?, meta = ?, updated_at = ?
          WHERE id = ? AND tenant_id = 1`,
    args: [displayName, fullName, bio, avatarUrl, JSON.stringify(meta), now, input.id]
  });

  // Replace roles (single-role model in current UI)
  await db().execute({
    sql: "DELETE FROM user_roles WHERE user_id = ? AND tenant_id = 1",
    args: [input.id]
  });
  await db().execute({
    sql: "INSERT INTO user_roles (user_id, role_slug, tenant_id) VALUES (?, ?, 1)",
    args: [input.id, input.role]
  });

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "users.update",
      targetType: "user",
      targetId: input.id,
      diff: {
        before: { displayName: before.display_name, fullName: before.full_name, roles: beforeRoles },
        after: { displayName, fullName, roles: [input.role] }
      }
    });
  } catch {
    // Audit failures must not break the action
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${input.id}/edit`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Email change (admin path — direct, no verification)
// ---------------------------------------------------------------------------
//
// changeEmailBootstrap: a *.local placeholder is being replaced with a real
//   address for the first time. No mail goes out (the old address can't
//   receive it) and no admin role is required (this is the seed-admin's own
//   first-run claim flow).
// changeEmailDirect: an admin replaces any user's verified email. A notice
//   goes to the old address; sessions are revoked so the target re-logs in
//   with the new email. Requires the actor to hold the `admin` role.

export async function changeEmailBootstrap(
  userId: string,
  newEmail: string
): Promise<{ ok: true } | { ok: false; error: string }> {
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

  const row = await db().execute({
    sql: "SELECT email FROM users WHERE id = ? AND tenant_id = 1 AND deleted_at IS NULL LIMIT 1",
    args: [userId]
  });
  if (row.rows.length === 0) return { ok: false, error: "User not found" };
  const currentEmail = String(row.rows[0].email);

  // Server-side guard — bootstrap path is ONLY for *.local placeholders.
  if (!isUnverifiableEmail(currentEmail)) {
    return {
      ok: false,
      error: "This account already has a real email — changes need the verified flow"
    };
  }

  // Uniqueness check
  const dup = await db().execute({
    sql: "SELECT id FROM users WHERE tenant_id = 1 AND email = ? AND id != ? AND deleted_at IS NULL LIMIT 1",
    args: [cleanNew, userId]
  });
  if (dup.rows.length > 0) {
    return { ok: false, error: "A user with this email already exists" };
  }

  const now = new Date().toISOString();
  await db().execute({
    sql: "UPDATE users SET email = ?, updated_at = ? WHERE id = ? AND tenant_id = 1",
    args: [cleanNew, now, userId]
  });

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "users.email_change_bootstrap",
      targetType: "user",
      targetId: userId,
      diff: { before: { email: currentEmail }, after: { email: cleanNew } }
    });
  } catch {
    // Audit failures must not break the action
  }

  return { ok: true };
}

export async function changeEmailDirect(
  userId: string,
  newEmail: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };
  if (!session.user.roles?.includes("admin")) {
    return { ok: false, error: "Only administrators can change another user's email" };
  }
  const actorId = await resolveUserId(db(), session.user);

  const cleanNew = newEmail.trim().toLowerCase();
  if (!cleanNew || cleanNew.indexOf("@") < 1) {
    return { ok: false, error: "Enter a valid email address" };
  }
  if (isUnverifiableEmail(cleanNew)) {
    return { ok: false, error: "Pick a real email address (not a *.local placeholder)" };
  }

  const row = await db().execute({
    sql: "SELECT email, display_name FROM users WHERE id = ? AND tenant_id = 1 AND deleted_at IS NULL LIMIT 1",
    args: [userId]
  });
  if (row.rows.length === 0) return { ok: false, error: "User not found" };
  const currentEmail = String(row.rows[0].email);
  const displayName = String(row.rows[0].display_name);

  if (currentEmail === cleanNew) {
    return { ok: false, error: "That's already the current email" };
  }

  // Bootstrap path handles *.local rows — keep this action focused on
  // verified-to-verified swaps so the two flows stay distinct.
  if (isUnverifiableEmail(currentEmail)) {
    return {
      ok: false,
      error: "This account uses a placeholder email — use the bootstrap flow instead"
    };
  }

  const dup = await db().execute({
    sql: "SELECT id FROM users WHERE tenant_id = 1 AND email = ? AND id != ? AND deleted_at IS NULL LIMIT 1",
    args: [cleanNew, userId]
  });
  if (dup.rows.length > 0) {
    return { ok: false, error: "A user with this email already exists" };
  }

  const now = new Date().toISOString();
  await db().execute({
    sql: "UPDATE users SET email = ?, updated_at = ? WHERE id = ? AND tenant_id = 1",
    args: [cleanNew, now, userId]
  });

  // Cancel any in-flight self-service change requests for this user — the
  // direct change wins and the pending token (if any) becomes meaningless.
  await db().execute({
    sql: `UPDATE user_email_changes SET consumed_at = ?
          WHERE user_id = ? AND consumed_at IS NULL`,
    args: [now, userId]
  });

  // Force re-login so the target's JWT picks up the new email. The JWT was
  // issued at login with the OLD email baked in; without a revocation, the
  // session would keep displaying the old address until it expired.
  await db().execute({
    sql: `INSERT INTO session_revocations (user_id, revoked_at, reason)
          VALUES (?, ?, 'manual')
          ON CONFLICT(user_id) DO UPDATE
            SET revoked_at = excluded.revoked_at, reason = 'manual'`,
    args: [userId, now]
  });
  invalidateUserCache();

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "users.email_change_direct",
      targetType: "user",
      targetId: userId,
      diff: { before: { email: currentEmail }, after: { email: cleanNew } }
    });
  } catch {
    // Audit failures must not break the action
  }

  // Send a heads-up to the old address. Delivery failures must not break
  // the action — the DB change has already landed.
  try {
    await sendEmail({
      input: {
        to: currentEmail,
        subject: "Your email address was changed",
        text: [
          `Hi ${displayName},`,
          ``,
          `An administrator changed the email on your NextPress account.`,
          `New address: ${cleanNew}`,
          ``,
          `If this wasn't expected, contact your administrator. You'll need to`,
          `sign in again using the new address — your existing session has been`,
          `revoked as a precaution.`
        ].join("\n")
      }
    });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[dev] email-change notice to ${currentEmail} failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Password reset (admin-triggered)
// ---------------------------------------------------------------------------

async function getAppOrigin(): Promise<string> {
  const envUrl = process.env.AUTH_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function requestPasswordReset(
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };
  const actorId = await resolveUserId(db(), session.user);

  const userRow = await db().execute({
    sql: "SELECT email, display_name FROM users WHERE id = ? AND tenant_id = 1 AND deleted_at IS NULL LIMIT 1",
    args: [userId]
  });
  if (userRow.rows.length === 0) return { ok: false, error: "User not found" };
  const targetEmail = String(userRow.rows[0].email);
  const targetName = String(userRow.rows[0].display_name);

  // Bootstrap guard — *.local addresses can't receive mail. Don't waste a
  // token on something we can't deliver; tell the caller to fix the email.
  if (isUnverifiableEmail(targetEmail)) {
    return {
      ok: false,
      error: "This account uses a placeholder email — set a real email first, then send the reset"
    };
  }

  // Rate limit — reject if a non-consumed reset token was issued in the last 60s.
  const recent = await db().execute({
    sql: `SELECT 1 FROM user_email_tokens
          WHERE user_id = ? AND purpose = 'reset_password' AND consumed_at IS NULL
          AND created_at > datetime('now', '-60 seconds')
          LIMIT 1`,
    args: [userId]
  });
  if (recent.rows.length > 0) {
    return { ok: false, error: "A reset email was just sent — wait a moment before retrying" };
  }

  const issued = await issueEmailToken({ db: db(), userId, purpose: "reset_password" });
  const origin = await getAppOrigin();
  const resetUrl = `${origin}/admin/reset-password/${encodeURIComponent(issued.token)}`;

  if (process.env.NODE_ENV !== "production") {
    // Dev convenience — surface the reset URL even when SMTP delivery fails
    // (e.g., when the recipient address is the seed admin@nextpress.local).
    console.warn(`[dev] password reset URL for ${targetEmail}: ${resetUrl}`);
  }

  try {
    await sendEmail({
      input: {
        to: targetEmail,
        subject: "Reset your password",
        text: [
          `Hi ${targetName},`,
          ``,
          `An administrator requested a password reset for your NextPress account.`,
          `Open the link below within 24 hours to set a new password:`,
          ``,
          resetUrl,
          ``,
          `If you didn't expect this, you can ignore this email — your existing password keeps working until you complete the reset.`
        ].join("\n")
      }
    });
  } catch (err) {
    return {
      ok: false,
      error: `Couldn't send reset email: ${err instanceof Error ? err.message : "transport error"}`
    };
  }

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "users.password_reset_requested",
      targetType: "user",
      targetId: userId
    });
  } catch {
    // Audit failures must not break the action
  }

  return { ok: true };
}

export interface UserContentSummary {
  posts: number;
  pages: number;
  topics: number;
  media: number;
  galleries: number;
  total: number;
}

/**
 * Count content authored / uploaded by `userId` across every surface that
 * carries an FK to `users.id`. Used by DeleteUserDialog to decide whether
 * to render the reassign picker — no content, no prompt.
 *
 * Each query is cheap (indexed FK column) and they run in parallel; total
 * round-trip is bounded by the slowest single query.
 */
export async function getUserContentSummary(userId: string): Promise<UserContentSummary> {
  const [posts, pages, topics, media, galleries] = await Promise.all([
    db().execute({ sql: "SELECT COUNT(*) AS c FROM posts WHERE created_by = ? AND tenant_id = 1", args: [userId] }),
    db().execute({ sql: "SELECT COUNT(*) AS c FROM pages WHERE created_by = ? AND tenant_id = 1", args: [userId] }),
    db().execute({ sql: "SELECT COUNT(*) AS c FROM topics WHERE created_by = ? AND tenant_id = 1", args: [userId] }),
    db().execute({ sql: "SELECT COUNT(*) AS c FROM media WHERE uploaded_by = ? AND tenant_id = 1", args: [userId] }),
    db().execute({ sql: "SELECT COUNT(*) AS c FROM galleries WHERE created_by = ? AND tenant_id = 1", args: [userId] }),
  ]);

  const summary = {
    posts: Number(posts.rows[0]?.c ?? 0),
    pages: Number(pages.rows[0]?.c ?? 0),
    topics: Number(topics.rows[0]?.c ?? 0),
    media: Number(media.rows[0]?.c ?? 0),
    galleries: Number(galleries.rows[0]?.c ?? 0),
    total: 0,
  };
  summary.total = summary.posts + summary.pages + summary.topics + summary.media + summary.galleries;
  return summary;
}

export interface ReassignCandidate {
  id: string;
  displayName: string;
  email: string;
}

/**
 * Active users who can inherit a deleted user's content. Excludes the
 * target itself and any soft-deleted rows. Sorted by display name so the
 * picker is alphabetic.
 */
export async function getReassignCandidates(excludeUserId: string): Promise<ReassignCandidate[]> {
  const session = await auth();
  if (!session?.user?.id) return [];

  const r = await db().execute({
    sql: `SELECT id, display_name, email
          FROM users
          WHERE tenant_id = 1
            AND deleted_at IS NULL
            AND status != 'disabled'
            AND id != ?
          ORDER BY display_name COLLATE NOCASE ASC`,
    args: [excludeUserId],
  });
  return r.rows.map((row) => ({
    id: String(row.id),
    displayName: String(row.display_name),
    email: String(row.email),
  }));
}

export async function deleteUser(
  userId: string,
  /**
   * Actor's own password. Required when the target carries the `admin`
   * role — destructive admin-on-admin actions get a step-up gate so a
   * compromised admin session can't unilaterally tear down the team.
   * Ignored for non-admin targets.
   */
  password?: string,
  /**
   * Optional UUID of a user to inherit the target's authored / uploaded
   * content (posts, pages, topics, media, galleries). Null / undefined
   * leaves the rows attributed to the soft-deleted user — the historical
   * behaviour, kept available for cases like a duplicate-admin cleanup
   * where there's nothing meaningful to reassign.
   */
  reassignTo?: string | null,
): Promise<
  | { ok: true; reassigned?: number }
  | { ok: false; error: string; reason?: "step-up-required" | "wrong-password" | "last-admin" | "invalid-reassign" }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };
  const actorId = await resolveUserId(db(), session.user);

  if (userId === session.user.id) {
    return { ok: false, error: "You can't delete your own account" };
  }

  // Lookup target — must exist and be live. We deliberately allow
  // deleting admin profiles so cleanup scenarios (post-restore with a
  // duplicate seed admin, replacing a departing admin) are possible.
  // The admin path is gated by step-up below.
  const row = await db().execute({
    sql: `SELECT u.email,
                 EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id
                          AND ur.role_slug = 'admin' AND ur.tenant_id = 1) AS is_admin
          FROM users u
          WHERE u.id = ? AND u.tenant_id = 1 AND u.deleted_at IS NULL
          LIMIT 1`,
    args: [userId]
  });
  if (row.rows.length === 0) return { ok: false, error: "User not found" };
  const targetEmail = String(row.rows[0].email);
  const targetIsAdmin = Number(row.rows[0].is_admin) === 1;

  if (targetIsAdmin) {
    // System-safety guard: never allow the live admin count to drop to
    // zero. Without this, a single admin could lock themselves out by
    // deleting peers in succession (the self-delete guard above stops
    // them after the LAST cross-delete, but an itchy script could still
    // chain calls). Counts the live admin set excluding the target.
    const otherAdmins = await db().execute({
      sql: `SELECT COUNT(*) AS c
            FROM user_roles ur
            INNER JOIN users u ON u.id = ur.user_id AND u.deleted_at IS NULL
            WHERE ur.tenant_id = 1 AND ur.role_slug = 'admin'
              AND ur.user_id != ?`,
      args: [userId],
    });
    if (Number(otherAdmins.rows[0]?.c ?? 0) === 0) {
      return {
        ok: false,
        reason: "last-admin",
        error:
          "Can't delete the last administrator. Promote another user to admin first.",
      };
    }

    // Step-up: actor must re-enter their own password. Mirrors the
    // role's `require_step_up` policy (admins already need step-up for
    // users.delete) but does it inline so the dialog can ask for the
    // password right when it's needed without the JWT/window dance.
    if (typeof password !== "string" || password.length === 0) {
      return {
        ok: false,
        reason: "step-up-required",
        error: "Re-enter your password to delete an admin profile.",
      };
    }
    const stepUpAt = await validateStepUp(db(), session.user.id, password);
    if (!stepUpAt) {
      try {
        await auditLog(db(), {
          actorUserId: actorId,
          action: "users.delete.password_failed",
          targetType: "user",
          targetId: userId,
        });
      } catch { /* audit non-fatal */ }
      return {
        ok: false,
        reason: "wrong-password",
        error: "That password didn't match. Try again.",
      };
    }
  }

  // Optional reassign — runs before the soft-delete so the inheritance
  // is observable in the same transaction window. Validate the target
  // exists and isn't the user being deleted; if it's invalid we bail
  // before mutating so partial reassigns can't happen.
  let reassignedTotal = 0;
  if (reassignTo) {
    if (reassignTo === userId) {
      return { ok: false, reason: "invalid-reassign", error: "Cannot reassign to the user being deleted" };
    }
    const targetExists = await db().execute({
      sql: `SELECT 1 FROM users WHERE id = ? AND tenant_id = 1
              AND deleted_at IS NULL AND status != 'disabled' LIMIT 1`,
      args: [reassignTo],
    });
    if (targetExists.rows.length === 0) {
      return { ok: false, reason: "invalid-reassign", error: "The reassign target user does not exist or is disabled" };
    }

    // Five UPDATEs in parallel — each surface that has an FK to users.id
    // gets its rows re-attributed. Sequential await is fine too; this is a
    // one-shot admin operation, throughput isn't critical.
    const updateResults = await Promise.all([
      db().execute({ sql: "UPDATE posts SET created_by = ? WHERE created_by = ? AND tenant_id = 1", args: [reassignTo, userId] }),
      db().execute({ sql: "UPDATE pages SET created_by = ? WHERE created_by = ? AND tenant_id = 1", args: [reassignTo, userId] }),
      db().execute({ sql: "UPDATE topics SET created_by = ? WHERE created_by = ? AND tenant_id = 1", args: [reassignTo, userId] }),
      db().execute({ sql: "UPDATE media SET uploaded_by = ? WHERE uploaded_by = ? AND tenant_id = 1", args: [reassignTo, userId] }),
      db().execute({ sql: "UPDATE galleries SET created_by = ? WHERE created_by = ? AND tenant_id = 1", args: [reassignTo, userId] }),
    ]);
    for (const r of updateResults) reassignedTotal += r.rowsAffected;
  }

  const now = new Date().toISOString();
  await db().execute({
    sql: "UPDATE users SET deleted_at = ?, updated_at = ? WHERE id = ? AND tenant_id = 1",
    args: [now, now, userId]
  });

  // Revoke any live sessions so they can't keep using the cookie post-delete.
  await db().execute({
    sql: `INSERT INTO session_revocations (user_id, revoked_at, reason) VALUES (?, ?, 'manual')
          ON CONFLICT(user_id) DO UPDATE SET revoked_at = excluded.revoked_at, reason = 'manual'`,
    args: [userId, now]
  });
  invalidateUserCache();

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "users.delete",
      targetType: "user",
      targetId: userId,
      diff: {
        email: targetEmail,
        wasAdmin: targetIsAdmin,
        reassignTo: reassignTo ?? null,
        reassignedRows: reassignedTotal,
      }
    });
  } catch {
    // Audit failures must not break the action
  }

  // Reassigned content's edit pages need a fresh render so the new
  // attribution shows up on the actor's next page view.
  if (reassignTo && reassignedTotal > 0) {
    revalidatePath("/admin/posts");
    revalidatePath("/admin/pages");
    revalidatePath("/admin/topics");
    revalidatePath("/admin/media");
  }

  return { ok: true, reassigned: reassignedTotal };
}

export async function toggleUserStatus(
  userId: string,
  newStatus: "active" | "disabled"
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };
  const actorId = await resolveUserId(db(), session.user);

  // Prevent self-disable
  if (userId === session.user.id && newStatus === "disabled") {
    return { ok: false, error: "You cannot disable your own account" };
  }

  const now = new Date().toISOString();
  await db().execute({
    sql: "UPDATE users SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = 1",
    args: [newStatus, now, userId]
  });

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: newStatus === "active" ? "users.enable" : "users.disable",
      targetType: "user",
      targetId: userId
    });
  } catch {
    // Audit failures must not break the action
  }

  return { ok: true };
}
