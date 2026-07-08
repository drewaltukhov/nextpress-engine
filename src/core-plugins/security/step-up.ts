/**
 * Step-up auth ("sudo mode"). Sensitive actions listed in a role's
 * `require_step_up` array force the user to re-authenticate before
 * proceeding. The re-auth timestamp is stored in the JWT and valid
 * for STEP_UP_TTL_MINUTES.
 *
 * Flow:
 *  1. Server checks `requiresStepUp(action, roles)` — does the action
 *     appear in any of the user's roles' require_step_up arrays?
 *  2. If yes, checks `isStepUpFresh(stepUpAt)` — was the password
 *     re-confirmed within the TTL?
 *  3. If stale/missing, return 403 with `{ stepUpRequired: true }` so the
 *     UI can prompt for password re-entry.
 *  4. POST /api/admin/auth/step-up verifies password and returns a new
 *     JWT with fresh stepUpAt.
 */
import type { DbClient } from "@core/db/client";
import { verifyPassword } from "@core-plugins/users/passwords";

export const STEP_UP_TTL_MINUTES = 5;

// ---------------------------------------------------------------------------
// Check whether an action requires step-up for the given roles
// ---------------------------------------------------------------------------

/**
 * Returns true if `action` appears in any of the supplied roles'
 * `require_step_up` arrays. `roleRows` should be the full role objects
 * (slug + require_step_up JSON) for the current user.
 */
export function requiresStepUp(
  action: string,
  roleStepUpMap: Array<{ slug: string; requireStepUp: string[] }>
): boolean {
  for (const role of roleStepUpMap) {
    if (role.requireStepUp.includes(action)) return true;
  }
  return false;
}

/**
 * Load the require_step_up arrays for a set of role slugs.
 */
export async function loadRoleStepUpConfig(
  db: DbClient,
  roleSlugs: string[]
): Promise<Array<{ slug: string; requireStepUp: string[] }>> {
  if (roleSlugs.length === 0) return [];

  const placeholders = roleSlugs.map(() => "?").join(",");
  const result = await db.execute({
    sql: `SELECT slug, require_step_up FROM roles WHERE slug IN (${placeholders})`,
    args: roleSlugs
  });

  return result.rows.map((r) => ({
    slug: String(r.slug),
    requireStepUp: parseStepUpArray(r.require_step_up)
  }));
}

function parseStepUpArray(raw: unknown): string[] {
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

// ---------------------------------------------------------------------------
// Freshness check
// ---------------------------------------------------------------------------

/**
 * Returns true if `stepUpAt` (ISO 8601) is within the TTL window.
 * Pass `ttlMinutes` to override the default — callers reading from the
 * Settings registry should resolve `security.step_up_ttl_minutes` first.
 */
export function isStepUpFresh(
  stepUpAt: string | null | undefined,
  now: Date = new Date(),
  ttlMinutes: number = STEP_UP_TTL_MINUTES
): boolean {
  if (!stepUpAt) return false;
  const stamp = new Date(stepUpAt).getTime();
  if (Number.isNaN(stamp)) return false;
  const cutoff = now.getTime() - ttlMinutes * 60 * 1000;
  return stamp >= cutoff;
}

/**
 * Resolve the live step-up TTL from the Settings registry, falling back to
 * the constant if the setting is missing/invalid. Async because settings
 * reads hit the DB.
 */
export async function getStepUpTtlMinutes(
  // Imported locally to avoid pulling settings/registry into this module's
  // top-level imports (keeps the constant fallback path zero-dependency).
  db: import("@core/db/client").DbClient
): Promise<number> {
  try {
    const { getSetting } = await import("@core-plugins/settings/registry");
    const value = await getSetting<number>(db, "security.step_up_ttl_minutes");
    return Number.isFinite(value) && (value ?? 0) > 0 ? (value as number) : STEP_UP_TTL_MINUTES;
  } catch {
    return STEP_UP_TTL_MINUTES;
  }
}

// ---------------------------------------------------------------------------
// Password re-verification
// ---------------------------------------------------------------------------

/**
 * Verify the user's password for step-up. Returns the ISO timestamp to
 * store as `stepUpAt` in the JWT, or null if verification fails.
 */
export async function validateStepUp(
  db: DbClient,
  userId: string,
  password: string,
  now: Date = new Date()
): Promise<string | null> {
  const credRow = await db.execute({
    sql: "SELECT password_hash FROM user_credentials WHERE user_id = ? LIMIT 1",
    args: [userId]
  });
  const cred = credRow.rows[0];
  if (!cred) return null;

  const ok = await verifyPassword(password, String(cred.password_hash));
  if (!ok) return null;

  return now.toISOString();
}
