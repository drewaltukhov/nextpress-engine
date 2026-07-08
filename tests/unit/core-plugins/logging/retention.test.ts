import { describe, it, expect, beforeEach } from "vitest";
import { freshTestDb } from "../../helpers/test-db";
import { runRetentionCleanup, DEFAULT_RETENTION } from "@core-plugins/logging/retention";
import type { DbClient } from "@core/db/client";

async function ensureSchema(db: DbClient) {
  await db.execute(`
    CREATE TABLE system_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      level TEXT NOT NULL,
      source TEXT NOT NULL,
      event TEXT NOT NULL,
      message TEXT NOT NULL,
      context TEXT NOT NULL DEFAULT '{}',
      trace_id TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE failed_logins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      email TEXT,
      ip_address TEXT NOT NULL,
      reason TEXT NOT NULL,
      geo TEXT NOT NULL DEFAULT '{}',
      user_agent TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE plugin_failures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plugin_slug TEXT NOT NULL,
      phase TEXT NOT NULL,
      hook_name TEXT,
      error_message TEXT NOT NULL,
      error_class TEXT,
      error_stack TEXT,
      context TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE failed_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      job_type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      error_message TEXT NOT NULL,
      error_stack TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 1,
      next_retry_at TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      actor_user_id TEXT,
      action TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
}

function isoDaysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("runRetentionCleanup", () => {
  let db: DbClient;
  const NOW = new Date("2026-04-30T12:00:00.000Z");

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
  });

  it("prunes system_log rows older than the configured window, keeps newer", async () => {
    const old = isoDaysAgo(NOW, 200);
    const fresh = isoDaysAgo(NOW, 5);
    for (const created of [old, old, fresh]) {
      await db.execute({
        sql: "INSERT INTO system_log (level, source, event, message, created_at) VALUES (?, ?, ?, ?, ?)",
        args: ["info", "core", "boot", "x", created]
      });
    }

    const r = await runRetentionCleanup(db, { now: NOW });

    expect(r.systemLog).toBe(2);
    const rows = await db.execute("SELECT COUNT(*) as n FROM system_log");
    expect(Number(rows.rows[0]?.n)).toBe(1);
  });

  it("keeps failed_logins within the 180-day window, prunes older", async () => {
    const old = isoDaysAgo(NOW, 200);
    const fresh = isoDaysAgo(NOW, 30);
    await db.execute({
      sql: "INSERT INTO failed_logins (ip_address, reason, created_at) VALUES (?, ?, ?)",
      args: ["1.1.1.1", "bad_password", old]
    });
    await db.execute({
      sql: "INSERT INTO failed_logins (ip_address, reason, created_at) VALUES (?, ?, ?)",
      args: ["2.2.2.2", "bad_password", fresh]
    });

    const r = await runRetentionCleanup(db, { now: NOW });
    expect(r.failedLogins).toBe(1);
    const rows = await db.execute("SELECT ip_address FROM failed_logins");
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.ip_address).toBe("2.2.2.2");
  });

  it("only prunes resolved failed_jobs older than the window; unresolved are kept", async () => {
    // Old resolved → pruned
    await db.execute({
      sql: "INSERT INTO failed_jobs (job_type, error_message, resolved_at, created_at) VALUES (?, ?, ?, ?)",
      args: ["email.send", "smtp", isoDaysAgo(NOW, 60), isoDaysAgo(NOW, 60)]
    });
    // Old unresolved → KEPT (resolved_at IS NULL)
    await db.execute({
      sql: "INSERT INTO failed_jobs (job_type, error_message, created_at) VALUES (?, ?, ?)",
      args: ["email.send", "smtp", isoDaysAgo(NOW, 60)]
    });
    // Recent resolved → kept
    await db.execute({
      sql: "INSERT INTO failed_jobs (job_type, error_message, resolved_at, created_at) VALUES (?, ?, ?, ?)",
      args: ["email.send", "smtp", isoDaysAgo(NOW, 5), isoDaysAgo(NOW, 5)]
    });

    const r = await runRetentionCleanup(db, { now: NOW });
    expect(r.failedJobs).toBe(1);
    const rows = await db.execute("SELECT COUNT(*) as n FROM failed_jobs");
    expect(Number(rows.rows[0]?.n)).toBe(2);
    const unresolved = await db.execute("SELECT COUNT(*) as n FROM failed_jobs WHERE resolved_at IS NULL");
    expect(Number(unresolved.rows[0]?.n)).toBe(1);
  });

  it("prunes audit_log rows older than auditLogDays (default 365)", async () => {
    // Beyond the 365-day default → pruned.
    await db.execute({
      sql: "INSERT INTO audit_log (action, created_at) VALUES (?, ?)",
      args: ["auth.login.success", isoDaysAgo(NOW, 400)]
    });
    // Inside the window → kept.
    await db.execute({
      sql: "INSERT INTO audit_log (action, created_at) VALUES (?, ?)",
      args: ["auth.login.success", isoDaysAgo(NOW, 30)]
    });
    const r = await runRetentionCleanup(db, { now: NOW });
    expect(r.auditLog).toBe(1);
    const rows = await db.execute("SELECT COUNT(*) as n FROM audit_log");
    expect(Number(rows.rows[0]?.n)).toBe(1);
  });

  it("respects custom policy overrides", async () => {
    // Insert one row 10 days old; default is 90, so it would NOT be pruned.
    // Override to 7 days → it should be pruned.
    await db.execute({
      sql: "INSERT INTO system_log (level, source, event, message, created_at) VALUES (?, ?, ?, ?, ?)",
      args: ["info", "core", "x", "x", isoDaysAgo(NOW, 10)]
    });

    const r = await runRetentionCleanup(db, {
      now: NOW,
      policy: { systemLogDays: 7 }
    });

    expect(r.systemLog).toBe(1);
  });

  it("loops in batches until exhausted (batchSize=2 over 5 stale rows)", async () => {
    const old = isoDaysAgo(NOW, 200);
    for (let i = 0; i < 5; i++) {
      await db.execute({
        sql: "INSERT INTO system_log (level, source, event, message, created_at) VALUES (?, ?, ?, ?, ?)",
        args: ["info", "core", "x", `m${i}`, old]
      });
    }
    const r = await runRetentionCleanup(db, { now: NOW, batchSize: 2 });
    expect(r.systemLog).toBe(5);
    const rows = await db.execute("SELECT COUNT(*) as n FROM system_log");
    expect(Number(rows.rows[0]?.n)).toBe(0);
  });

  it("returns zero counts when nothing is stale", async () => {
    const fresh = isoDaysAgo(NOW, 1);
    await db.execute({
      sql: "INSERT INTO system_log (level, source, event, message, created_at) VALUES (?, ?, ?, ?, ?)",
      args: ["info", "core", "x", "x", fresh]
    });
    const r = await runRetentionCleanup(db, { now: NOW });
    expect(r).toEqual({
      systemLog: 0,
      failedJobs: 0,
      failedLogins: 0,
      pluginFailures: 0,
      auditLog: 0
    });
  });

  it("DEFAULT_RETENTION matches foundation §Log Retention", () => {
    expect(DEFAULT_RETENTION).toEqual({
      systemLogDays: 90,
      failedJobsDays: 30,
      failedLoginsDays: 180,
      pluginFailuresDays: 90,
      auditLogDays: 365
    });
  });
});
