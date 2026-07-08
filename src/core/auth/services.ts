/**
 * Auth-side data services. Pulled out of the NextAuth config so they can be
 * unit-tested without spinning up the framework.
 */
import { createDbClient, type DbClient } from "@core/db/client";
import { readEnv } from "@core/env";
import { verifyPassword } from "@core-plugins/users/passwords";
import { auditLog, recordFailedLogin } from "@core-plugins/logging";
import { applyFailedAttempt, evaluateLockout, clearLockout } from "@core-plugins/security";
import { checkIpAccess, autoBlockIfThresholdBreached } from "@core-plugins/security/ip-access";

// Pre-computed argon2id hash of a random string. Used to burn CPU time on
// the unknown-email / no-credentials paths so the response latency matches
// the valid-user-wrong-password path — prevents timing-based email enumeration.
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$YWJjZGVmZ2hpamtsbW5vcA$K0/RhMFVJGJmtiaFoMIxaW0M3GnXpMpGkLiGFCnFLMs";

let cached: DbClient | null = null;
function db(): DbClient {
  if (cached) return cached;
  const env = readEnv();
  cached = createDbClient({ databaseUrl: env.databaseUrl, authToken: env.authToken });
  return cached;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  emailVerifiedAt: string | null;
  status: "active" | "invited" | "disabled";
  roles: string[];
}

export interface AuthRequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Look up a user by email + verify the supplied password against their stored
 * argon2id hash. Returns the user (with role slugs) on success, null otherwise.
 *
 * Returns null indistinguishably for: unknown email, disabled user, no
 * credentials row, wrong password — protects against email enumeration. The
 * actual reason lands in `failed_logins` for forensics + the security
 * plugin's lockout / IP-block thresholds.
 */
export async function authenticateWithCredentials(
  emailRaw: string,
  password: string,
  ctx: AuthRequestContext = {}
): Promise<AuthenticatedUser | null> {
  const email = emailRaw.trim().toLowerCase();
  const ipAddress = ctx.ipAddress ?? "0.0.0.0";
  const userAgent = ctx.userAgent ?? null;

  async function logFailure(reason: Parameters<typeof recordFailedLogin>[1]["reason"]) {
    try {
      await recordFailedLogin(db(), { email: email || null, ipAddress, reason, userAgent });
    } catch {
      // Logging failures must never break the auth path. Swallow and continue.
    }
    // After every recorded failure, check whether this IP has breached the
    // auto-block threshold. The check runs against failed_logins rows that
    // were just inserted above.
    try {
      await autoBlockIfThresholdBreached(db(), ipAddress);
    } catch {
      // IP auto-block must not break the auth path.
    }
  }

  if (!email || !password) {
    await logFailure("unknown_email");
    return null;
  }

  // IP block pre-check. If the request IP is actively blocked (and not on
  // the allow list), reject immediately without revealing the block reason.
  try {
    const ipResult = await checkIpAccess(db(), ipAddress);
    if (!ipResult.allowed) {
      await logFailure("rate_limited");
      return null;
    }
  } catch {
    // IP access check failures must not block the auth path; fall through.
  }

  // Lockout pre-check. If the account is already locked, log a rate_limited
  // failure and return null without revealing the lockout to the caller —
  // foundation §1546: "no info leak about lockout state".
  try {
    const lockState = await evaluateLockout(db(), email);
    if (lockState.locked) {
      await logFailure("rate_limited");
      return null;
    }
  } catch {
    // Lockout read failures must not block the auth path; fall through.
  }

  const userRow = await db().execute({
    sql: `SELECT id, email, display_name, email_verified_at, status, deleted_at
          FROM users
          WHERE tenant_id = 1 AND email = ?
          LIMIT 1`,
    args: [email]
  });
  const user = userRow.rows[0];
  if (!user || user.deleted_at != null) {
    // Burn argon2 time so the response latency is indistinguishable from a
    // valid-user-wrong-password attempt (prevents timing-based enumeration).
    await verifyPassword(password, DUMMY_HASH);
    await logFailure("unknown_email");
    return null;
  }
  if (String(user.status) !== "active") {
    await verifyPassword(password, DUMMY_HASH);
    await logFailure("account_disabled");
    return null;
  }

  const credRow = await db().execute({
    sql: "SELECT password_hash FROM user_credentials WHERE user_id = ? LIMIT 1",
    args: [String(user.id)]
  });
  const cred = credRow.rows[0];
  if (!cred) {
    await verifyPassword(password, DUMMY_HASH);
    await logFailure("bad_password");
    return null;
  }

  const ok = await verifyPassword(password, String(cred.password_hash));
  if (!ok) {
    await logFailure("bad_password");
    // recordFailedLogin lands BEFORE the count query so this attempt is
    // included in the sliding-window total.
    try {
      await applyFailedAttempt(db(), email);
    } catch {
      // Lockout bookkeeping must not break the auth path.
    }
    return null;
  }

  const rolesRow = await db().execute({
    sql: "SELECT role_slug FROM user_roles WHERE user_id = ? AND tenant_id = 1",
    args: [String(user.id)]
  });
  const roles = rolesRow.rows.map((r) => String(r.role_slug));

  return {
    id: String(user.id),
    email: String(user.email),
    displayName: String(user.display_name),
    emailVerifiedAt: user.email_verified_at != null ? String(user.email_verified_at) : null,
    status: String(user.status) as AuthenticatedUser["status"],
    roles
  };
}

/**
 * Touch users.last_login_at, reset lockout_attempt_count, append an audit_log
 * entry for the successful login. Called from the credentials provider after
 * authorize() returns a user.
 */
export async function recordSuccessfulLogin(
  userId: string,
  ctx: AuthRequestContext = {}
): Promise<void> {
  const now = new Date().toISOString();
  await db().execute({
    sql: `UPDATE users
          SET last_login_at = ?, updated_at = ?
          WHERE id = ?`,
    args: [now, now, userId]
  });
  // Clear any pending lockout state on success. clearLockout zeros the
  // attempt counter and nulls lockout_until in one statement.
  try {
    await clearLockout(db(), userId);
  } catch {
    // Lockout bookkeeping must not break the auth path.
  }

  try {
    await auditLog(db(), {
      actorUserId: userId,
      action: "auth.login.success",
      targetType: "user",
      targetId: userId,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null
    });
  } catch {
    // Audit failures must never break the auth path.
  }
}
