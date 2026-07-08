import { describe, it, expect, beforeEach } from "vitest";
import { freshTestDb } from "../../helpers/test-db";
import {
  recordFailedLogin,
  recordPluginFailure,
  systemLog
} from "@core-plugins/logging";
import type { DbClient } from "@core/db/client";

async function ensureLoggingSchema(db: DbClient) {
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
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (phase IN ('boot','migrate','register','hook','route'))
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
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
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
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

describe("recordPluginFailure", () => {
  let db: DbClient;
  beforeEach(async () => {
    db = freshTestDb();
    await ensureLoggingSchema(db);
  });

  it("inserts a row with the supplied phase + slug + error fields", async () => {
    await recordPluginFailure(db, {
      pluginSlug: "topics",
      phase: "register",
      errorMessage: "boom",
      errorClass: "TypeError",
      errorStack: "at handler\n  at register"
    });

    const r = await db.execute("SELECT plugin_slug, phase, error_message, error_class FROM plugin_failures");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.plugin_slug).toBe("topics");
    expect(r.rows[0]?.phase).toBe("register");
    expect(r.rows[0]?.error_message).toBe("boom");
    expect(r.rows[0]?.error_class).toBe("TypeError");
  });

  it("redacts secret-shaped values in the context payload", async () => {
    await recordPluginFailure(db, {
      pluginSlug: "p",
      phase: "hook",
      hookName: "user.login",
      errorMessage: "x",
      context: { password: "hunter2", note: "ok" }
    });
    const r = await db.execute("SELECT context FROM plugin_failures");
    const ctx = JSON.parse(String(r.rows[0]?.context));
    expect(ctx.password).toBe("[REDACTED]");
    expect(ctx.note).toBe("ok");
  });

  it("rejects invalid phase via CHECK constraint", async () => {
    await expect(
      recordPluginFailure(db, {
        pluginSlug: "p",
        phase: "invalid" as never,
        errorMessage: "x"
      })
    ).rejects.toThrow();
  });
});

describe("recordFailedLogin + systemLog (smoke)", () => {
  let db: DbClient;
  beforeEach(async () => {
    db = freshTestDb();
    await ensureLoggingSchema(db);
  });

  it("recordFailedLogin inserts the supplied reason + email", async () => {
    await recordFailedLogin(db, {
      email: "alice@example.com",
      ipAddress: "1.2.3.4",
      reason: "bad_password",
      userAgent: "ua"
    });
    const r = await db.execute("SELECT email, reason, ip_address, user_agent FROM failed_logins");
    expect(r.rows[0]?.email).toBe("alice@example.com");
    expect(r.rows[0]?.reason).toBe("bad_password");
    expect(r.rows[0]?.ip_address).toBe("1.2.3.4");
    expect(r.rows[0]?.user_agent).toBe("ua");
  });

  it("systemLog redacts secrets in context", async () => {
    await systemLog(db, {
      level: "info",
      source: "core",
      event: "boot",
      message: "started",
      context: { apiKey: "sk-secret", ok: true }
    });
    const r = await db.execute("SELECT context FROM system_log");
    const ctx = JSON.parse(String(r.rows[0]?.context));
    expect(ctx.apiKey).toBe("[REDACTED]");
    expect(ctx.ok).toBe(true);
  });
});
