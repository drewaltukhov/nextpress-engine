"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { auditLog } from "@core-plugins/logging";
import { resolveUserId } from "@core/auth/resolve-user";
import { invalidateUserCache } from "@core/auth/user-session-cache";
import { validateStepUp } from "@core-plugins/security/step-up";
import { getSetting, setSetting } from "@core-plugins/settings/registry";
import { countryFor } from "@core-plugins/security/geo";

export type SaveResult = { ok: true } | { ok: false; error: string };

import { friendlyAction } from "./action-labels";

// ---------------------------------------------------------------------------
// Users list (for "Who" filter dropdown)
// ---------------------------------------------------------------------------

export interface UserOption {
  id: string;
  displayName: string;
  email: string;
}

export async function getUsers(): Promise<UserOption[]> {
  const res = await db().execute({
    sql: "SELECT id, display_name, email FROM users WHERE tenant_id = 1 ORDER BY display_name",
    args: [],
  });
  return res.rows.map((r) => ({
    id: String(r.id),
    displayName: String(r.display_name),
    email: String(r.email),
  }));
}

// ---------------------------------------------------------------------------
// Activity — audit_log viewer with human-readable action names
// ---------------------------------------------------------------------------

export interface ActivityFilters {
  actorId?: string;       // exact user ID from dropdown
  action?: string;        // exact action code from dropdown
  since?: string;         // ISO 8601
}

export interface ActivityRow {
  id: number;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  friendlyAction: string;
  targetType: string | null;
  targetId: string | null;
  details: string;        // plain-English summary
}

export interface ActivityPage {
  rows: ActivityRow[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 50;

/** Friendly names for target IDs that would otherwise show as raw keys */
const TARGET_LABELS: Record<string, string> = {
  "security.country": "Country access",
  "security": "Security settings",
  "logging": "Log settings",
  "country": "Country access",
  "maintenance": "Maintenance settings",
  "website": "Website settings",
  "smtp": "Email settings",
  "api": "API settings",
};

/** Capitalize first letter */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Build a plain-English details string from the row data */
function buildDetails(
  row: {
    action: string;
    actorId: string | null;
    targetType: string | null;
    targetId: string | null;
    diff: string | null;
  },
  userNames: Map<string, string>
): string {
  // Try to extract a meaningful summary from the diff JSON
  if (row.diff) {
    try {
      const parsed = JSON.parse(row.diff);
      if (typeof parsed === "object" && parsed !== null) {
        // Maintenance-specific: show what changed
        if (row.action === "settings.maintenance.update") {
          const parts: string[] = [];
          if (typeof parsed.enabled === "boolean") {
            parts.push(parsed.enabled ? "Turned on" : "Turned off");
          }
          if (typeof parsed.readOnly === "boolean" && parsed.readOnly) {
            parts.push("Read-only on");
          }
          return parts.length > 0 ? parts.join(", ") : "Updated settings";
        }
        // Log retention
        if (row.action === "settings.logging.update" && parsed.retentionMonths) {
          return `Retention: ${parsed.retentionMonths} month${parsed.retentionMonths > 1 ? "s" : ""}`;
        }
        if (row.action.startsWith("settings.") && parsed.key) {
          return TARGET_LABELS[String(parsed.key)] ?? String(parsed.key);
        }
        // Email change: show old → new
        if (parsed.before?.email && parsed.after?.email) {
          return `${parsed.before.email} → ${parsed.after.email}`;
        }
        if (parsed.email) return String(parsed.email);
        if (parsed.display_name) return String(parsed.display_name);
        if (parsed.title) return `"${String(parsed.title)}"`;
        if (parsed.name) return String(parsed.name);
        if (parsed.fileName) return String(parsed.fileName);
      }
    } catch {
      // Not JSON, ignore
    }
  }

  // Fallback to target info with friendly labels
  if (row.targetType && row.targetId) {
    const friendly = TARGET_LABELS[row.targetId];
    if (friendly) return friendly;

    // User-targeted actions
    if (row.targetType === "user") {
      // Self-action (actor === target): Who column already shows the name
      if (row.actorId && row.actorId === row.targetId) return "";
      // Other-user action: resolve target name
      const name = userNames.get(row.targetId);
      return name ?? row.targetId;
    }

    // Title-case the target type for display
    return `${capitalize(row.targetType)}: ${row.targetId}`;
  }
  if (row.targetType) return TARGET_LABELS[row.targetType] ?? row.targetType;
  return "";
}

function buildActivityWhere(f: ActivityFilters): { sql: string; args: (string | number)[] } {
  const clauses: string[] = ["a.tenant_id = 1"];
  const args: (string | number)[] = [];

  if (f.actorId) {
    clauses.push("a.actor_user_id = ?");
    args.push(f.actorId);
  }
  if (f.action) {
    clauses.push("a.action = ?");
    args.push(f.action);
  }
  if (f.since) {
    clauses.push("a.created_at >= ?");
    args.push(f.since);
  }

  return { sql: clauses.join(" AND "), args };
}

export async function getActivity(
  filters: ActivityFilters = {},
  page: number = 1
): Promise<ActivityPage> {
  const session = await auth();
  if (!session?.user?.id) return { rows: [], total: 0, page, pageSize: PAGE_SIZE };

  const where = buildActivityWhere(filters);
  const offset = Math.max(0, (page - 1) * PAGE_SIZE);

  const [rowsRes, countRes] = await Promise.all([
    db().execute({
      sql: `SELECT a.id, a.created_at, a.actor_user_id, u.display_name, u.email,
                   a.action, a.target_type, a.target_id, a.diff
            FROM audit_log a
            LEFT JOIN users u ON u.id = a.actor_user_id
            WHERE ${where.sql}
            ORDER BY a.created_at DESC
            LIMIT ? OFFSET ?`,
      args: [...where.args, PAGE_SIZE, offset],
    }),
    db().execute({
      sql: `SELECT COUNT(*) AS n FROM audit_log a WHERE ${where.sql}`,
      args: where.args,
    }),
  ]);

  // Resolve user UUIDs (both targets and actors) to display names
  const userNames = new Map<string, string>();

  // Seed from actor names already resolved by the JOIN
  for (const r of rowsRes.rows) {
    if (r.actor_user_id && r.display_name) {
      userNames.set(String(r.actor_user_id), String(r.display_name));
    }
  }

  // Batch-query any user-target UUIDs not already in the map
  const userTargetIds = rowsRes.rows
    .filter((r) => r.target_type === "user" && r.target_id && !userNames.has(String(r.target_id)))
    .map((r) => String(r.target_id));
  const uniqueUserIds = [...new Set(userTargetIds)];

  if (uniqueUserIds.length > 0) {
    const placeholders = uniqueUserIds.map(() => "?").join(", ");
    const nameRes = await db().execute({
      sql: `SELECT id, display_name FROM users WHERE id IN (${placeholders})`,
      args: uniqueUserIds,
    });
    for (const r of nameRes.rows) {
      userNames.set(String(r.id), String(r.display_name));
    }
  }

  return {
    rows: rowsRes.rows.map((r) => {
      const action = String(r.action);
      return {
        id: Number(r.id),
        createdAt: String(r.created_at),
        actorName: r.display_name ? String(r.display_name) : null,
        actorEmail: r.email ? String(r.email) : null,
        action,
        friendlyAction: friendlyAction(action),
        targetType: r.target_type ? String(r.target_type) : null,
        targetId: r.target_id ? String(r.target_id) : null,
        details: buildDetails(
          {
            action,
            actorId: r.actor_user_id ? String(r.actor_user_id) : null,
            targetType: r.target_type ? String(r.target_type) : null,
            targetId: r.target_id ? String(r.target_id) : null,
            diff: r.diff ? String(r.diff) : null,
          },
          userNames
        ),
      };
    }),
    total: Number(countRes.rows[0]?.n ?? 0),
    page,
    pageSize: PAGE_SIZE,
  };
}

// ---------------------------------------------------------------------------
// Failed Logins (simplified — no IP column, no IP filter)
// ---------------------------------------------------------------------------

export interface FailedLoginRow {
  id: number;
  createdAt: string;
  email: string | null;
  country: string | null;
  countryName: string | null;
}

export interface FailedLoginsPage {
  rows: FailedLoginRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getFailedLogins(
  sinceFilter?: string,
  page: number = 1
): Promise<FailedLoginsPage> {
  const session = await auth();
  if (!session?.user?.id) return { rows: [], total: 0, page, pageSize: PAGE_SIZE };

  const clauses: string[] = ["fl.tenant_id = 1"];
  const args: (string | number)[] = [];

  if (sinceFilter) {
    clauses.push("fl.created_at >= ?");
    args.push(sinceFilter);
  }

  const whereSql = clauses.join(" AND ");
  const offset = Math.max(0, (page - 1) * PAGE_SIZE);

  const [rowsRes, countRes] = await Promise.all([
    db().execute({
      sql: `SELECT fl.id, fl.created_at, fl.email, fl.ip_address
            FROM failed_logins fl
            WHERE ${whereSql}
            ORDER BY fl.created_at DESC
            LIMIT ? OFFSET ?`,
      args: [...args, PAGE_SIZE, offset],
    }),
    db().execute({
      sql: `SELECT COUNT(*) AS n FROM failed_logins fl WHERE ${whereSql}`,
      args,
    }),
  ]);

  const rowsWithCountry = await Promise.all(
    rowsRes.rows.map(async (r) => {
      const ip = String(r.ip_address);
      const country = await countryFor(ip);
      return {
        id: Number(r.id),
        createdAt: String(r.created_at),
        email: r.email ? String(r.email) : null,
        country,
        countryName: null as string | null, // resolved client-side from the code
      };
    })
  );

  return {
    rows: rowsWithCountry,
    total: Number(countRes.rows[0]?.n ?? 0),
    page,
    pageSize: PAGE_SIZE,
  };
}

// ---------------------------------------------------------------------------
// Sessions — active sessions with revoke
// ---------------------------------------------------------------------------

export interface ActiveSession {
  id: number;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  lastActive: string;
  userAgent: string | null;
  isCurrentSession: boolean;
}

export async function getActiveSessions(): Promise<ActiveSession[]> {
  const session = await auth();
  if (!session?.user?.id) return [];

  // Active sessions: recent successful logins that haven't been revoked
  // We join audit_log (login events) with users and check against revocations
  const res = await db().execute({
    sql: `SELECT a.id, a.actor_user_id, a.created_at, a.user_agent,
                 u.display_name, u.email
          FROM audit_log a
          LEFT JOIN users u ON u.id = a.actor_user_id
          WHERE a.tenant_id = 1
            AND a.action = 'auth.login.success'
            AND NOT EXISTS (
              SELECT 1 FROM session_revocations sr
              WHERE sr.user_id = a.actor_user_id
                AND sr.revoked_at > a.created_at
            )
          ORDER BY a.created_at DESC
          LIMIT 50`,
    args: [],
  });

  // Deduplicate by user — keep only the most recent session per user
  const seen = new Set<string>();
  const sessions: ActiveSession[] = [];

  for (const r of res.rows) {
    const userId = r.actor_user_id ? String(r.actor_user_id) : null;
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);

    sessions.push({
      id: Number(r.id),
      userId,
      userName: r.display_name ? String(r.display_name) : null,
      userEmail: r.email ? String(r.email) : null,
      lastActive: String(r.created_at),
      userAgent: r.user_agent ? String(r.user_agent) : null,
      isCurrentSession: userId === session.user.id,
    });
  }

  return sessions;
}

export async function revokeSession(userId: string): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };
  if (!session.user.roles?.includes("admin")) {
    return { ok: false, error: "Only administrators can revoke sessions" };
  }
  const actorId = await resolveUserId(db(), session.user);

  try {
    // UPSERT — `session_revocations.user_id` is the primary key, so a
    // plain INSERT trips a UNIQUE constraint when the user already
    // has a (perhaps long-stale) revocation row. Refresh the
    // revoked_at timestamp instead so the auth gate honours the
    // newest value. Mirrors the pattern in
    // `src/app/admin/(shell)/users/actions.ts`.
    await db().execute({
      sql: `INSERT INTO session_revocations (user_id, reason, revoked_at)
            VALUES (?, 'manual', datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET
              reason = 'manual',
              revoked_at = datetime('now')`,
      args: [userId],
    });
    invalidateUserCache();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Revoke failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "auth.session.revoked",
      targetType: "user",
      targetId: userId,
    });
  } catch {
    // Audit failures must not break the action
  }

  revalidatePath("/admin/logs");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Log settings — simplified retention + redaction
// ---------------------------------------------------------------------------

export interface LogSettings {
  retentionMonths: number;  // 1, 3, or 6
}

/** Map months → days for all three retention settings */
const MONTHS_TO_DAYS: Record<number, number> = { 1: 30, 3: 90, 6: 180 };
const VALID_MONTHS = [1, 3, 6];

/** Derive the "months" value from the current retention days (use the max) */
function daysToMonths(days: number): number {
  if (days <= 30) return 1;
  if (days <= 90) return 3;
  return 6;
}

export async function getLogSettings(): Promise<LogSettings> {
  const [audit, system, failed] = await Promise.all([
    getSetting<number>(db(), "logging.audit_retention_days"),
    getSetting<number>(db(), "logging.system_log_retention_days"),
    getSetting<number>(db(), "logging.failed_login_retention_days"),
  ]);
  const maxDays = Math.max(audit ?? 365, system ?? 90, failed ?? 180);
  return { retentionMonths: daysToMonths(maxDays) };
}

export async function saveLogSettings(input: LogSettings): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  if (!session.user.roles?.includes("admin")) {
    return { ok: false, error: "Only administrators can change log settings" };
  }
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };

  if (!VALID_MONTHS.includes(input.retentionMonths)) {
    return { ok: false, error: "Choose 1, 3, or 6 months" };
  }

  const days = MONTHS_TO_DAYS[input.retentionMonths];
  const userId = await resolveUserId(db(), session.user);
  const opts = { updatedBy: userId };

  try {
    await setSetting(db(), "logging.audit_retention_days", days, opts);
    await setSetting(db(), "logging.system_log_retention_days", days, opts);
    await setSetting(db(), "logging.failed_login_retention_days", days, opts);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: userId,
      action: "settings.logging.update",
      targetType: "settings",
      targetId: "logging",
      diff: { retentionMonths: input.retentionMonths, retentionDays: days },
    });
  } catch {
    // Audit failures must not break the action
  }

  revalidatePath("/admin/logs");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Purge all logs — password-protected destructive action
// ---------------------------------------------------------------------------

export async function purgeLogs(formData: FormData): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  if (!session.user.roles?.includes("admin")) {
    return { ok: false, error: "Only administrators can purge logs" };
  }
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };

  const password = formData.get("password") as string | null;
  if (!password) return { ok: false, error: "Password is required" };

  // Resolve actual DB user — the JWT's id/email can be stale after restore
  let actorId = session.user.id;
  const credCheck = await db().execute({
    sql: "SELECT user_id FROM user_credentials WHERE user_id = ? LIMIT 1",
    args: [actorId],
  });
  if (credCheck.rows.length === 0) {
    const userRow = await db().execute({
      sql: "SELECT id FROM users WHERE email = ? LIMIT 1",
      args: [session.user.email],
    });
    if (userRow.rows[0]?.id) {
      actorId = String(userRow.rows[0].id);
    } else {
      const adminRow = await db().execute({
        sql: `SELECT u.id FROM users u
              JOIN user_roles ur ON ur.user_id = u.id
              JOIN user_credentials uc ON uc.user_id = u.id
              WHERE ur.role_slug = 'admin' LIMIT 1`,
        args: [],
      });
      if (adminRow.rows[0]?.id) {
        actorId = String(adminRow.rows[0].id);
      } else {
        return { ok: false, error: "Could not find an admin account to verify against" };
      }
    }
  }

  // Verify password
  const stepUp = await validateStepUp(db(), actorId, password.trim());
  if (!stepUp) return { ok: false, error: "Incorrect password" };

  // Delete all rows from log tables
  try {
    await db().execute({ sql: "DELETE FROM audit_log", args: [] });
    await db().execute({ sql: "DELETE FROM system_log", args: [] });
    await db().execute({ sql: "DELETE FROM failed_logins", args: [] });
    await db().execute({ sql: "DELETE FROM failed_jobs", args: [] });
    await db().execute({ sql: "DELETE FROM plugin_failures", args: [] });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Purge failed" };
  }

  // Log the purge itself (this will be the only entry after purge)
  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "logs.purged",
      targetType: "settings",
      targetId: "logging",
    });
  } catch {
    // Audit failures must not break the action
  }

  revalidatePath("/admin/logs");
  return { ok: true };
}
