/**
 * Per-email account lockout. Mirrors foundation §Wordfence-style Anti-Brute-Force:
 *
 *   After N failed logins for the same email within W minutes,
 *   lock the account for D minutes.
 *
 * Thresholds are configurable via the Settings UI (security.lockout_*); the
 * constants below are fallbacks if the setting row is missing or invalid.
 */
import type { DbClient } from "@core/db/client";
import { getSetting } from "@core-plugins/settings/registry";

export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_WINDOW_MINUTES = 15;
export const LOCKOUT_DURATION_MINUTES = 30;

interface LockoutConfig {
  threshold: number;
  windowMinutes: number;
  durationMinutes: number;
}

async function readLockoutConfig(db: DbClient): Promise<LockoutConfig> {
  try {
    const [threshold, windowMinutes, durationMinutes] = await Promise.all([
      getSetting<number>(db, "security.lockout_threshold"),
      getSetting<number>(db, "security.lockout_window_minutes"),
      getSetting<number>(db, "security.lockout_duration_minutes"),
    ]);
    return {
      threshold: Number.isFinite(threshold) && (threshold ?? 0) > 0 ? (threshold as number) : LOCKOUT_THRESHOLD,
      windowMinutes:
        Number.isFinite(windowMinutes) && (windowMinutes ?? 0) > 0 ? (windowMinutes as number) : LOCKOUT_WINDOW_MINUTES,
      durationMinutes:
        Number.isFinite(durationMinutes) && (durationMinutes ?? 0) > 0
          ? (durationMinutes as number)
          : LOCKOUT_DURATION_MINUTES,
    };
  } catch {
    return {
      threshold: LOCKOUT_THRESHOLD,
      windowMinutes: LOCKOUT_WINDOW_MINUTES,
      durationMinutes: LOCKOUT_DURATION_MINUTES,
    };
  }
}

export interface LockoutState {
  locked: boolean;
  until: string | null;
  attempts: number;
}

function isoMinutesAgo(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60 * 1000).toISOString();
}

function isoMinutesAhead(now: Date, minutes: number): string {
  return new Date(now.getTime() + minutes * 60 * 1000).toISOString();
}

/**
 * Returns the current lockout state for `email`. Returns `{locked: false}` for
 * unknown emails (lockout is per-account; IP-level blocks are a separate
 * mechanism not yet shipped).
 *
 * `now` is overridable for tests.
 */
export async function evaluateLockout(
  db: DbClient,
  emailRaw: string,
  now: Date = new Date()
): Promise<LockoutState> {
  const email = emailRaw.trim().toLowerCase();
  if (!email) return { locked: false, until: null, attempts: 0 };

  const r = await db.execute({
    sql: `SELECT lockout_until, lockout_attempt_count
          FROM users
          WHERE tenant_id = 1 AND email = ?
          LIMIT 1`,
    args: [email]
  });
  const row = r.rows[0];
  if (!row) return { locked: false, until: null, attempts: 0 };

  const until = row.lockout_until ? String(row.lockout_until) : null;
  const attempts = Number(row.lockout_attempt_count ?? 0);
  const locked = until !== null && until > now.toISOString();
  return { locked, until, attempts };
}

/**
 * Records a failed attempt against `email` and locks the account if the
 * sliding-window threshold is reached. Idempotent w.r.t. an already-locked
 * account: returns the existing lock state without bumping further.
 *
 * Counts use `failed_logins.created_at` directly so we don't double-count
 * with our own UPDATE — `recordFailedLogin()` runs FIRST in the auth path,
 * then this helper queries.
 */
export async function applyFailedAttempt(
  db: DbClient,
  emailRaw: string,
  now: Date = new Date()
): Promise<LockoutState> {
  const email = emailRaw.trim().toLowerCase();
  if (!email) return { locked: false, until: null, attempts: 0 };

  const userRow = await db.execute({
    sql: `SELECT lockout_until FROM users
          WHERE tenant_id = 1 AND email = ?
          LIMIT 1`,
    args: [email]
  });
  const user = userRow.rows[0];
  if (!user) return { locked: false, until: null, attempts: 0 };

  const config = await readLockoutConfig(db);

  const existingUntil = user.lockout_until ? String(user.lockout_until) : null;
  if (existingUntil && existingUntil > now.toISOString()) {
    return { locked: true, until: existingUntil, attempts: config.threshold };
  }

  const windowStart = isoMinutesAgo(now, config.windowMinutes);
  const countRow = await db.execute({
    sql: `SELECT COUNT(*) AS n
          FROM failed_logins
          WHERE tenant_id = 1
            AND email = ?
            AND reason IN ('bad_password','unknown_email')
            AND created_at >= ?`,
    args: [email, windowStart]
  });
  const recentFails = Number(countRow.rows[0]?.n ?? 0);

  if (recentFails >= config.threshold) {
    const until = isoMinutesAhead(now, config.durationMinutes);
    await db.execute({
      sql: `UPDATE users
            SET lockout_until = ?,
                lockout_attempt_count = ?,
                updated_at = ?
            WHERE tenant_id = 1 AND email = ?`,
      args: [until, recentFails, now.toISOString(), email]
    });
    return { locked: true, until, attempts: recentFails };
  }

  await db.execute({
    sql: `UPDATE users
          SET lockout_attempt_count = ?,
              updated_at = ?
          WHERE tenant_id = 1 AND email = ?`,
    args: [recentFails, now.toISOString(), email]
  });
  return { locked: false, until: null, attempts: recentFails };
}

/**
 * Clears any active lockout state on the user row. Called from the
 * post-success path in @core/auth/services.
 */
export async function clearLockout(db: DbClient, userId: string, now: Date = new Date()): Promise<void> {
  await db.execute({
    sql: `UPDATE users
          SET lockout_until = NULL,
              lockout_attempt_count = 0,
              updated_at = ?
          WHERE id = ?`,
    args: [now.toISOString(), userId]
  });
}
