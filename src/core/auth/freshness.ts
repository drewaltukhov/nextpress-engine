/**
 * Session-freshness gate.
 *
 * NextAuth's JWT maxAge is set to one year so the cookie keeps a stable
 * signature. The actual session lifetime is enforced here against
 * `security.session_max_age_days`, the most recent `session_revocations`
 * row, and the user's live status. Node-runtime only. It runs on every
 * session read via the jwt callback in ./config.ts (so server actions and
 * route handlers are covered, not just the admin shell layout), keyed on
 * the app-set `authTime` claim, never on Auth.js's refreshable `iat`
 * (security audit 2026-11-12).
 */
import type { DbClient } from "@core/db/client";
import { getSetting } from "@core-plugins/settings/registry";
import { getAdminShellState } from "./user-session-cache";

export type FreshnessResult =
  /** `roles` is the user's current role list, or null when the read failed. */
  | { ok: true; roles: string[] | null }
  | { ok: false; reason: "missing_iat" | "expired" | "revoked" | "user_missing" | "disabled" };

const SECONDS_PER_DAY = 24 * 60 * 60;
const DEFAULT_MAX_AGE_DAYS = 30;

export async function checkSessionFreshness(
  db: DbClient,
  args: { userId: string; iat: number | null; now?: Date }
): Promise<FreshnessResult> {
  if (!args.iat) return { ok: false, reason: "missing_iat" };
  const now = args.now ?? new Date();
  const nowSec = Math.floor(now.getTime() / 1000);

  // 1. Soft maxAge gate.
  let maxAgeDays = DEFAULT_MAX_AGE_DAYS;
  try {
    const setting = await getSetting<number>(db, "security.session_max_age_days");
    if (Number.isFinite(setting) && (setting ?? 0) > 0) {
      maxAgeDays = setting as number;
    }
  } catch {
    // Fall back to the default if the settings table is unreachable.
  }

  if (nowSec - args.iat > maxAgeDays * SECONDS_PER_DAY) {
    return { ok: false, reason: "expired" };
  }

  // 2 + 3. Revocation + existence gates fetched in one cached query
  // (`user-session-cache.ts`). Same fail-open posture: if the read throws,
  // allow the session rather than lock everyone out.
  try {
    const state = await getAdminShellState(db, args.userId);
    if (!state.exists) return { ok: false, reason: "user_missing" };
    if (!state.active) return { ok: false, reason: "disabled" };
    if (state.revokedAt) {
      const revokedSec = Math.floor(new Date(state.revokedAt).getTime() / 1000);
      if (revokedSec >= args.iat) {
        return { ok: false, reason: "revoked" };
      }
    }
    return { ok: true, roles: state.roles };
  } catch {
    // Infrastructure error — fail open.
  }

  return { ok: true, roles: null };
}
