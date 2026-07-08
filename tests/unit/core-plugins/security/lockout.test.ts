import { describe, it, expect, beforeEach } from "vitest";
import { freshTestDb } from "../../helpers/test-db";
import {
  evaluateLockout,
  applyFailedAttempt,
  clearLockout,
  LOCKOUT_THRESHOLD,
  LOCKOUT_WINDOW_MINUTES,
  LOCKOUT_DURATION_MINUTES
} from "@core-plugins/security/lockout";
import type { DbClient } from "@core/db/client";

async function ensureSchema(db: DbClient) {
  await db.execute(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      email TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      lockout_until TEXT,
      lockout_attempt_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
}

async function seedUser(db: DbClient, id: string, email: string) {
  await db.execute({
    sql: "INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)",
    args: [id, email, "User"]
  });
}

async function seedFailures(db: DbClient, email: string, count: number, atISO: string) {
  for (let i = 0; i < count; i++) {
    await db.execute({
      sql: "INSERT INTO failed_logins (email, ip_address, reason, created_at) VALUES (?, ?, ?, ?)",
      args: [email, "1.1.1.1", "bad_password", atISO]
    });
  }
}

describe("evaluateLockout", () => {
  let db: DbClient;
  const NOW = new Date("2026-04-30T12:00:00.000Z");

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
  });

  it("returns locked=false for unknown email", async () => {
    const r = await evaluateLockout(db, "ghost@example.com", NOW);
    expect(r.locked).toBe(false);
    expect(r.until).toBeNull();
  });

  it("returns locked=true when lockout_until is in the future", async () => {
    await seedUser(db, "u1", "alice@example.com");
    const future = new Date(NOW.getTime() + 10 * 60 * 1000).toISOString();
    await db.execute({
      sql: "UPDATE users SET lockout_until = ? WHERE id = 'u1'",
      args: [future]
    });

    const r = await evaluateLockout(db, "alice@example.com", NOW);
    expect(r.locked).toBe(true);
    expect(r.until).toBe(future);
  });

  it("returns locked=false when lockout_until is in the past (expired)", async () => {
    await seedUser(db, "u1", "alice@example.com");
    const past = new Date(NOW.getTime() - 10 * 60 * 1000).toISOString();
    await db.execute({
      sql: "UPDATE users SET lockout_until = ? WHERE id = 'u1'",
      args: [past]
    });

    const r = await evaluateLockout(db, "alice@example.com", NOW);
    expect(r.locked).toBe(false);
    expect(r.until).toBe(past);
  });

  it("normalizes email casing + whitespace", async () => {
    await seedUser(db, "u1", "alice@example.com");
    const r = await evaluateLockout(db, "  Alice@Example.COM  ", NOW);
    expect(r.locked).toBe(false);
    expect(r.attempts).toBe(0);
  });
});

describe("applyFailedAttempt", () => {
  let db: DbClient;
  const NOW = new Date("2026-04-30T12:00:00.000Z");

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
    await seedUser(db, "u1", "alice@example.com");
  });

  it("does NOT lock when recent failures < threshold", async () => {
    await seedFailures(db, "alice@example.com", LOCKOUT_THRESHOLD - 1, NOW.toISOString());
    const r = await applyFailedAttempt(db, "alice@example.com", NOW);
    expect(r.locked).toBe(false);
    expect(r.attempts).toBe(LOCKOUT_THRESHOLD - 1);

    const row = await db.execute("SELECT lockout_until, lockout_attempt_count FROM users WHERE id='u1'");
    expect(row.rows[0]?.lockout_until).toBeNull();
    expect(Number(row.rows[0]?.lockout_attempt_count)).toBe(LOCKOUT_THRESHOLD - 1);
  });

  it("locks the account when recent failures >= threshold", async () => {
    await seedFailures(db, "alice@example.com", LOCKOUT_THRESHOLD, NOW.toISOString());
    const r = await applyFailedAttempt(db, "alice@example.com", NOW);

    expect(r.locked).toBe(true);
    expect(r.until).not.toBeNull();
    const expectedUntil = new Date(NOW.getTime() + LOCKOUT_DURATION_MINUTES * 60_000).toISOString();
    expect(r.until).toBe(expectedUntil);

    const row = await db.execute("SELECT lockout_until, lockout_attempt_count FROM users WHERE id='u1'");
    expect(String(row.rows[0]?.lockout_until)).toBe(expectedUntil);
    expect(Number(row.rows[0]?.lockout_attempt_count)).toBe(LOCKOUT_THRESHOLD);
  });

  it("does NOT count failures older than the sliding window", async () => {
    const stale = new Date(NOW.getTime() - (LOCKOUT_WINDOW_MINUTES + 1) * 60_000).toISOString();
    await seedFailures(db, "alice@example.com", LOCKOUT_THRESHOLD + 5, stale);

    const r = await applyFailedAttempt(db, "alice@example.com", NOW);
    expect(r.locked).toBe(false);
    expect(r.attempts).toBe(0);
  });

  it("preserves existing lockout when called again on a locked account", async () => {
    const future = new Date(NOW.getTime() + 20 * 60_000).toISOString();
    await db.execute({
      sql: "UPDATE users SET lockout_until = ?, lockout_attempt_count = ? WHERE id='u1'",
      args: [future, LOCKOUT_THRESHOLD]
    });

    const r = await applyFailedAttempt(db, "alice@example.com", NOW);
    expect(r.locked).toBe(true);
    expect(r.until).toBe(future);
  });

  it("returns locked=false for unknown email (no row to update)", async () => {
    const r = await applyFailedAttempt(db, "ghost@example.com", NOW);
    expect(r.locked).toBe(false);
    expect(r.attempts).toBe(0);
  });

  it("only counts bad_password + unknown_email failures, not rate_limited", async () => {
    // 5 rate_limited rows should NOT trigger a lock.
    for (let i = 0; i < 5; i++) {
      await db.execute({
        sql: "INSERT INTO failed_logins (email, ip_address, reason, created_at) VALUES (?, ?, ?, ?)",
        args: ["alice@example.com", "1.1.1.1", "rate_limited", NOW.toISOString()]
      });
    }
    const r = await applyFailedAttempt(db, "alice@example.com", NOW);
    expect(r.locked).toBe(false);
    expect(r.attempts).toBe(0);
  });
});

describe("clearLockout", () => {
  let db: DbClient;
  const NOW = new Date("2026-04-30T12:00:00.000Z");

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
    await seedUser(db, "u1", "alice@example.com");
  });

  it("zeros lockout_until and lockout_attempt_count", async () => {
    const future = new Date(NOW.getTime() + 30 * 60_000).toISOString();
    await db.execute({
      sql: "UPDATE users SET lockout_until = ?, lockout_attempt_count = 5 WHERE id='u1'",
      args: [future]
    });

    await clearLockout(db, "u1", NOW);

    const row = await db.execute("SELECT lockout_until, lockout_attempt_count FROM users WHERE id='u1'");
    expect(row.rows[0]?.lockout_until).toBeNull();
    expect(Number(row.rows[0]?.lockout_attempt_count)).toBe(0);
  });
});
