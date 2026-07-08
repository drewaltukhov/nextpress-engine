/**
 * Retention cleanup for the logging plugin's tables.
 *
 * Foundation §Log Retention & Cleanup defines per-table windows. v1 ships
 * `runRetentionCleanup()` as a callable job; the scheduling story (cron,
 * Vercel Cron, etc.) is wired in by the host environment — this module
 * only does the work.
 *
 * Behavior:
 * - Batched DELETEs (default 10K rows/batch) to avoid long locks.
 * - `audit_log` defaults to a 365-day window (configurable via
 *   `logging.audit_retention_days`). Setting it to the form max (3650)
 *   approximates "never prune" if compliance demands it.
 * - `failed_jobs` only prunes rows where `resolved_at < cutoff`. Unresolved
 *   rows are kept indefinitely.
 * - The job is idempotent: cutoffs are computed at call time, so running
 *   twice in a row simply finds nothing to delete on the second pass.
 */
import type { DbClient } from "@core/db/client";
import { getSetting } from "@core-plugins/settings/registry";

export interface RetentionPolicy {
  systemLogDays: number;
  failedJobsDays: number;       // counted from resolved_at
  failedLoginsDays: number;
  pluginFailuresDays: number;
  auditLogDays: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = {
  systemLogDays: 90,
  failedJobsDays: 30,
  failedLoginsDays: 180,
  pluginFailuresDays: 90,
  auditLogDays: 365
};

export interface RetentionResult {
  systemLog: number;
  failedJobs: number;
  failedLogins: number;
  pluginFailures: number;
  auditLog: number;
}

export interface RetentionOptions {
  policy?: Partial<RetentionPolicy>;
  batchSize?: number;
  /** Override "now" for tests. Defaults to current wall clock. */
  now?: Date;
}

const DEFAULT_BATCH_SIZE = 10_000;

function cutoffISO(now: Date, days: number): string {
  const ms = now.getTime() - days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

async function pruneByCreatedAt(
  db: DbClient,
  table: "system_log" | "failed_logins" | "plugin_failures" | "audit_log",
  cutoff: string,
  batchSize: number
): Promise<number> {
  let total = 0;
  for (;;) {
    const r = await db.execute({
      sql: `DELETE FROM ${table}
            WHERE id IN (SELECT id FROM ${table} WHERE created_at < ? LIMIT ?)`,
      args: [cutoff, batchSize]
    });
    const affected = Number(r.rowsAffected ?? 0);
    total += affected;
    if (affected < batchSize) break;
  }
  return total;
}

async function pruneFailedJobs(db: DbClient, cutoff: string, batchSize: number): Promise<number> {
  let total = 0;
  for (;;) {
    const r = await db.execute({
      sql: `DELETE FROM failed_jobs
            WHERE id IN (
              SELECT id FROM failed_jobs
              WHERE resolved_at IS NOT NULL AND resolved_at < ?
              LIMIT ?
            )`,
      args: [cutoff, batchSize]
    });
    const affected = Number(r.rowsAffected ?? 0);
    total += affected;
    if (affected < batchSize) break;
  }
  return total;
}

/**
 * Read the live retention overrides from the Settings registry. Returns a
 * partial policy — falls back to DEFAULT_RETENTION for any missing key.
 */
async function readRetentionFromSettings(db: DbClient): Promise<Partial<RetentionPolicy>> {
  try {
    const [system, failed, audit] = await Promise.all([
      getSetting<number>(db, "logging.system_log_retention_days"),
      getSetting<number>(db, "logging.failed_login_retention_days"),
      getSetting<number>(db, "logging.audit_retention_days"),
    ]);
    const out: Partial<RetentionPolicy> = {};
    if (Number.isFinite(system) && (system ?? 0) > 0) out.systemLogDays = system as number;
    if (Number.isFinite(failed) && (failed ?? 0) > 0) out.failedLoginsDays = failed as number;
    if (Number.isFinite(audit) && (audit ?? 0) > 0) out.auditLogDays = audit as number;
    return out;
  } catch {
    return {};
  }
}

export async function runRetentionCleanup(
  db: DbClient,
  options: RetentionOptions = {}
): Promise<RetentionResult> {
  // Precedence: explicit `options.policy` > settings registry > DEFAULT_RETENTION.
  // Tests pass `options.policy` directly so they don't need a populated
  // site_settings table.
  const fromSettings = options.policy ? {} : await readRetentionFromSettings(db);
  const policy: RetentionPolicy = { ...DEFAULT_RETENTION, ...fromSettings, ...options.policy };
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const now = options.now ?? new Date();

  const systemLog = await pruneByCreatedAt(
    db,
    "system_log",
    cutoffISO(now, policy.systemLogDays),
    batchSize
  );
  const failedLogins = await pruneByCreatedAt(
    db,
    "failed_logins",
    cutoffISO(now, policy.failedLoginsDays),
    batchSize
  );
  const pluginFailures = await pruneByCreatedAt(
    db,
    "plugin_failures",
    cutoffISO(now, policy.pluginFailuresDays),
    batchSize
  );
  const failedJobs = await pruneFailedJobs(
    db,
    cutoffISO(now, policy.failedJobsDays),
    batchSize
  );
  const auditLog = await pruneByCreatedAt(
    db,
    "audit_log",
    cutoffISO(now, policy.auditLogDays),
    batchSize
  );

  return { systemLog, failedJobs, failedLogins, pluginFailures, auditLog };
}
