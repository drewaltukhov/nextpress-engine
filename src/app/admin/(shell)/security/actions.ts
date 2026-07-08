"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { resolveUserId } from "@core/auth/resolve-user";
import { auditLog } from "@core-plugins/logging";
import { getSetting, setSetting } from "@core-plugins/settings/registry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SecurityKnobs {
  lockoutThreshold: number;
  lockoutWindowMinutes: number;
  lockoutDurationMinutes: number;
  sessionMaxAgeDays: number;
}

export interface LockedAccount {
  userId: string;
  displayName: string;
  email: string;
  lockoutUntil: string;
}

export type CountryMode = "off" | "allowlist" | "denylist";

export interface CountrySettings {
  mode: CountryMode;
  codes: string; // newline-separated ISO-3166-1 alpha-2
}

export interface SecurityData {
  knobs: SecurityKnobs;
  locked: LockedAccount[];
  country: CountrySettings;
}

export type SaveResult = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireAdmin(roles: readonly string[] | undefined): string | null {
  if (!roles?.includes("admin")) return "Only administrators can change security settings";
  return null;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

export async function getSecurityData(): Promise<SecurityData> {
  const [
    lockoutThreshold,
    lockoutWindowMinutes,
    lockoutDurationMinutes,
    sessionMaxAgeDays,
    countryMode,
    countryCodes,
    lockedRes,
  ] = await Promise.all([
    getSetting<number>(db(), "security.lockout_threshold"),
    getSetting<number>(db(), "security.lockout_window_minutes"),
    getSetting<number>(db(), "security.lockout_duration_minutes"),
    getSetting<number>(db(), "security.session_max_age_days"),
    getSetting<CountryMode>(db(), "security.country_mode"),
    getSetting<string>(db(), "security.country_codes"),
    db().execute({
      sql: `SELECT id, display_name, email, lockout_until
            FROM users
            WHERE tenant_id = 1
              AND lockout_until IS NOT NULL
              AND lockout_until > datetime('now')
            ORDER BY lockout_until DESC`,
      args: [],
    }),
  ]);

  return {
    knobs: {
      lockoutThreshold: lockoutThreshold ?? 5,
      lockoutWindowMinutes: lockoutWindowMinutes ?? 15,
      lockoutDurationMinutes: lockoutDurationMinutes ?? 30,
      sessionMaxAgeDays: sessionMaxAgeDays ?? 30,
    },
    country: {
      mode: countryMode ?? "off",
      codes: countryCodes ?? "",
    },
    locked: lockedRes.rows.map((r) => ({
      userId: String(r.id),
      displayName: String(r.display_name),
      email: String(r.email),
      lockoutUntil: String(r.lockout_until),
    })),
  };
}

// ---------------------------------------------------------------------------
// Unlock account
// ---------------------------------------------------------------------------

export async function unlockAccount(userId: string): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };
  const denied = requireAdmin(session.user.roles);
  if (denied) return { ok: false, error: denied };

  try {
    await db().execute({
      sql: `UPDATE users
            SET lockout_until = NULL, lockout_attempt_count = 0, updated_at = datetime('now')
            WHERE id = ?`,
      args: [userId],
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unlock failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: userId,
      action: "user.unlocked",
      targetType: "user",
      targetId: userId,
    });
  } catch {
    // Audit failures must not break the action
  }

  revalidatePath("/admin/security");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Country settings
// ---------------------------------------------------------------------------

export async function saveCountrySettings(input: CountrySettings): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };
  const denied = requireAdmin(session.user.roles);
  if (denied) return { ok: false, error: denied };

  const lines = input.codes
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (!/^[A-Za-z]{2}$/.test(line)) {
      return { ok: false, error: `Not a 2-letter country code: ${line}` };
    }
  }
  const normalized = Array.from(new Set(lines.map((s) => s.toUpperCase()))).join("\n");

  const userId = await resolveUserId(db(), session.user);
  const opts = { updatedBy: userId };
  try {
    await setSetting(db(), "security.country_mode", input.mode, opts);
    await setSetting(db(), "security.country_codes", normalized, opts);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: userId,
      action: "settings.changed",
      targetType: "settings",
      targetId: "security.country",
      diff: { mode: input.mode, codes: normalized },
    });
  } catch {
    // Audit failures must not break the action
  }

  revalidatePath("/admin/security");
  return { ok: true };
}

/**
 * Append a single country code to the denylist (and switch to denylist mode
 * if currently off). Used by the Logins tab "Ban country" quick action.
 */
export async function banCountryByCode(code: string): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };
  const denied = requireAdmin(session.user.roles);
  if (denied) return { ok: false, error: denied };

  const cleanCode = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cleanCode)) {
    return { ok: false, error: "Not a 2-letter country code" };
  }

  const userId = await resolveUserId(db(), session.user);

  const [currentMode, currentCodes] = await Promise.all([
    getSetting<CountryMode>(db(), "security.country_mode"),
    getSetting<string>(db(), "security.country_codes"),
  ]);

  if (currentMode === "allowlist") {
    return {
      ok: false,
      error: "Country filter is in allowlist mode — switch to denylist before banning a country",
    };
  }

  const existing = (currentCodes ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (existing.includes(cleanCode)) {
    if (currentMode !== "denylist") {
      await setSetting(db(), "security.country_mode", "denylist", { updatedBy: userId });
    }
    return { ok: true };
  }

  const next = Array.from(new Set([...existing, cleanCode])).join("\n");
  const opts = { updatedBy: userId };
  try {
    await setSetting(db(), "security.country_mode", "denylist", opts);
    await setSetting(db(), "security.country_codes", next, opts);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: userId,
      action: "security.country_ban",
      targetType: "country",
      targetId: cleanCode,
      diff: { mode: "denylist" },
    });
  } catch {
    // Audit failures must not break the action
  }

  revalidatePath("/admin/security");
  revalidatePath("/admin/logs");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Security knobs
// ---------------------------------------------------------------------------

export async function saveSecurityKnobs(input: SecurityKnobs): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };
  const denied = requireAdmin(session.user.roles);
  if (denied) return { ok: false, error: denied };

  const userId = await resolveUserId(db(), session.user);
  const opts = { updatedBy: userId };
  try {
    await setSetting(db(), "security.lockout_threshold", input.lockoutThreshold, opts);
    await setSetting(db(), "security.lockout_window_minutes", input.lockoutWindowMinutes, opts);
    await setSetting(db(), "security.lockout_duration_minutes", input.lockoutDurationMinutes, opts);
    await setSetting(db(), "security.session_max_age_days", input.sessionMaxAgeDays, opts);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: userId,
      action: "settings.changed",
      targetType: "settings",
      targetId: "security",
      diff: input,
    });
  } catch {
    // Audit failures must not break the action
  }

  revalidatePath("/admin/security");
  return { ok: true };
}
