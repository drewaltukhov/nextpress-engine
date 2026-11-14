/**
 * Self-service password reset — the work behind /admin/forgot-password.
 *
 * The server action answers `{ ok: true }` before calling this, detached, so a
 * registered address and an unknown one take the same time to answer (no
 * timing oracle). This module must not be imported by a "use server" file as
 * an export: every export there is a public endpoint, and `ip` here is trusted.
 *
 * Mail quota: anonymous callers can't burn the site's SMTP (Gmail) quota —
 * per-IP and site-wide hourly caps (the site-wide and per-account checks run
 * in the same SQL statement that writes the token, so concurrent requests —
 * even on separate serverless instances — can't overshoot them), plus one
 * in-flight request per account
 * (security audit 2026-11-12: nextpress:forgot-password:enumeration-timing-oracle,
 * nextpress:forgot-password:reset-email-quota-flood).
 *
 * The per-IP window and the in-flight set are in-memory, like the API rate
 * limiter: correct for a single server instance; the site-wide cap is
 * counted in the database so it survives restarts.
 */
import type { DbClient } from "@core/db/client";
import { issueEmailTokenIf } from "./tokens";
import { auditLog } from "@core-plugins/logging";
import { sendEmail } from "@core/email";
import { getSetting } from "@core-plugins/settings/registry";
import { isUnverifiableEmail } from "@/app/admin/(shell)/users/email-utils";

export const PER_IP_HOURLY_LIMIT = 5;
export const SITE_HOURLY_LIMIT = 30;
const HOUR_MS = 60 * 60 * 1000;

const requestsByIp = new Map<string, number[]>();
const inFlight = new Set<string>();
// Runs reset-token issues one at a time within this process — only to avoid
// needless write contention. The quota itself is enforced atomically in SQL
// by issueEmailTokenIf, which also holds across serverless instances.
let quotaQueue: Promise<unknown> = Promise.resolve();
function withQuotaLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = quotaQueue.then(fn, fn);
  quotaQueue = run.catch(() => {});
  return run;
}

/** Test hook: clears the in-memory windows. */
export function __resetSelfResetLimits(): void {
  requestsByIp.clear();
  inFlight.clear();
}

/** Records the attempt and says whether this IP is still under its hourly cap. */
function takeIpSlot(ip: string, now: number): boolean {
  const recent = (requestsByIp.get(ip) ?? []).filter((t) => now - t < HOUR_MS);
  if (recent.length >= PER_IP_HOURLY_LIMIT) {
    requestsByIp.set(ip, recent);
    return false;
  }
  recent.push(now);
  requestsByIp.set(ip, recent);
  if (requestsByIp.size > 10_000) {
    for (const [key, times] of requestsByIp) {
      if (!times.some((t) => now - t < HOUR_MS)) requestsByIp.delete(key);
    }
  }
  return true;
}

export async function processSelfPasswordReset(
  db: DbClient,
  args: { email: string; ip: string; origin: string }
): Promise<void> {
  const { email, ip, origin } = args;
  if (!takeIpSlot(ip, Date.now())) return;

  const userRow = await db.execute({
    sql: "SELECT id, display_name FROM users WHERE tenant_id = 1 AND email = ? AND deleted_at IS NULL LIMIT 1",
    args: [email]
  });
  if (userRow.rows.length === 0) return;
  // Can't deliver to a placeholder address.
  if (isUnverifiableEmail(email)) return;

  const userId = String(userRow.rows[0].id);
  const targetName = String(userRow.rows[0].display_name);

  if (inFlight.has(userId)) return;
  inFlight.add(userId);
  try {
    // Site-wide hourly cap + one reset email per account per minute, checked
    // in the same statement that writes the token (issueEmailTokenIf), so
    // concurrent requests on separate serverless instances can't overshoot
    // either cap. The in-process lock only avoids needless write contention.
    const issued = await withQuotaLock(() =>
      issueEmailTokenIf({
        db,
        userId,
        purpose: "reset_password",
        where: `(SELECT COUNT(*) FROM user_email_tokens
                  WHERE purpose = 'reset_password' AND created_at > datetime('now', '-60 minutes')) < ?
                AND NOT EXISTS (SELECT 1 FROM user_email_tokens
                  WHERE user_id = ? AND purpose = 'reset_password' AND consumed_at IS NULL
                  AND created_at > datetime('now', '-60 seconds'))`,
        whereArgs: [SITE_HOURLY_LIMIT, userId],
      })
    );
    if (!issued) return;
    const resetUrl = `${origin}/admin/reset-password/${encodeURIComponent(issued.token)}`;

    if (process.env.NODE_ENV !== "production") {
      console.warn(`[dev] self-service reset URL for ${email}: ${resetUrl}`);
    }

    const siteName =
      (await getSetting<string>(db, "site.title").catch(() => null))?.trim() || "NextPress";
    // Transport failures are swallowed: nothing here reaches the caller.
    await sendEmail({
      input: {
        to: email,
        subject: "Reset your password",
        text: [
          `Hi ${targetName},`,
          ``,
          `We received a request to reset your ${siteName} password.`,
          `Open the link below within 24 hours to choose a new one:`,
          ``,
          resetUrl,
          ``,
          `If you didn't request this, you can ignore this email — your existing password keeps working.`
        ].join("\n")
      }
    }).catch(() => {});

    try {
      await auditLog(db, {
        actorUserId: userId,
        action: "users.password_reset_requested_self",
        targetType: "user",
        targetId: userId
      });
    } catch {
      // Audit failures must not break the flow.
    }
  } finally {
    inFlight.delete(userId);
  }
}
