"use server";

import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { auditLog } from "@core-plugins/logging";
import { validateStepUp } from "@core-plugins/security/step-up";

export type ResetResult = { ok: true } | { ok: false; error: string };

/**
 * Wipe the site back to first-run state. Mirrors what scripts/reset-setup.ts
 * does — deletes users / credentials / role assignments / revocations,
 * flips system.setup_complete back to false, and wipes site.* + smtp.*
 * settings so the wizard starts truly fresh. Backups are preserved (they
 * exist precisely so you can recover from a reset).
 *
 * Hard-gated: admin-only, password re-confirmation via step-up, and the
 * caller must literally type "RESET" into the confirmation field.
 *
 * Cookie cleanup (setup cookie + Auth.js session variants) lives in the
 * sibling route handler /api/admin/reset/finish — Set-Cookie from
 * cookies() in a server action does not reliably attach to the response,
 * so the client redirects there after a successful wipe. Same pattern
 * /admin/force-logout/route.ts already uses for the freshness gate.
 */
export async function confirmReset(input: {
  password: string;
  confirmation: string;
}): Promise<ResetResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  if (!session.user.roles?.includes("admin")) {
    return { ok: false, error: "Only administrators can reset the site" };
  }

  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };

  if (input.confirmation.trim() !== "RESET") {
    return { ok: false, error: "Type RESET (in capitals) to confirm." };
  }
  if (!input.password) {
    return { ok: false, error: "Password is required" };
  }

  // Resolve the live DB user id — JWT id can drift if the user row was
  // re-created (same shape as confirmRestore in backup/actions.ts).
  let dbUserId = session.user.id;
  const credCheck = await db().execute({
    sql: "SELECT user_id FROM user_credentials WHERE user_id = ? LIMIT 1",
    args: [dbUserId],
  });
  if (credCheck.rows.length === 0 && session.user.email) {
    const userRow = await db().execute({
      sql: "SELECT id FROM users WHERE email = ? LIMIT 1",
      args: [session.user.email],
    });
    if (userRow.rows.length > 0) {
      dbUserId = String(userRow.rows[0].id);
    }
  }

  const verified = await validateStepUp(db(), dbUserId, input.password.trim());
  if (!verified) return { ok: false, error: "Incorrect password" };

  // Best-effort audit entry BEFORE we wipe — the row is going away with
  // the rest of the data, but a tail through the live dev log catches it.
  try {
    await auditLog(db(), {
      actorUserId: dbUserId,
      action: "system.reset",
      targetType: "system",
      targetId: "all",
      diff: { email: session.user.email ?? null },
    });
  } catch { /* audit non-fatal */ }

  // Wipe every user-data table back to its post-migration empty state.
  // Skipped intentionally: migrations_log + migration_lock (schema state),
  // roles + reserved_slugs (seeded config), plugins (registry — boot
  // re-discovers). site_settings is selectively cleared: setup-complete
  // flips to false, smtp.* and site.* user-set rows go, but seeded
  // plugin defaults stay so the site has sensible behavior on first boot.
  await db().batch(
    [
      // Auth + user sub-tables (FK-ordered so cascades aren't load-bearing)
      "DELETE FROM user_email_tokens",
      "DELETE FROM user_email_changes",
      "DELETE FROM user_oauth_accounts",
      "DELETE FROM user_roles",
      "DELETE FROM user_credentials",
      "DELETE FROM session_revocations",
      "DELETE FROM failed_logins",
      "DELETE FROM users",
      // User-generated content
      "DELETE FROM media",
      "DELETE FROM redirects",
      "DELETE FROM api_tokens",
      // Logs + journals
      "DELETE FROM audit_log",
      "DELETE FROM system_log",
      "DELETE FROM plugin_failures",
      "DELETE FROM failed_jobs",
      // Stale metadata (no archive bytes were ever persisted)
      "DELETE FROM backups",
      // Security IP lists (user-managed)
      "DELETE FROM allowed_ips",
      "DELETE FROM blocked_ips",
      // Setup wizard + wizard-set settings
      "UPDATE site_settings SET value = 'false' WHERE key = 'system.setup_complete' AND tenant_id = 1",
      "DELETE FROM site_settings WHERE tenant_id = 1 AND key LIKE 'smtp.%'",
      "DELETE FROM site_settings WHERE tenant_id = 1 AND key IN ('site.title','site.tagline','site.url','site.timezone')",
    ],
    "write",
  );

  return { ok: true };
}
