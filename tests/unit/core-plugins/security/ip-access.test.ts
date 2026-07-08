import { describe, it, expect, beforeEach } from "vitest";
import { freshTestDb } from "../../helpers/test-db";
import {
  checkIpAccess,
  blockIp,
  unblockIp,
  addAllowedIp,
  removeAllowedIp,
  autoBlockIfThresholdBreached,
  ipMatchesCidr,
  IP_FAILURE_THRESHOLD,
  IP_FAILURE_WINDOW_MINUTES,
  IP_LOCKOUT_MINUTES
} from "@core-plugins/security/ip-access";
import type { DbClient } from "@core/db/client";

async function ensureSchema(db: DbClient) {
  await db.execute(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      email TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active'
    )
  `);
  await db.execute(`
    CREATE TABLE blocked_ips (
      ip_address TEXT NOT NULL,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      reason TEXT NOT NULL,
      blocked_until TEXT,
      blocked_by TEXT,
      attempt_count INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (ip_address, tenant_id)
    )
  `);
  await db.execute(`
    CREATE TABLE allowed_ips (
      ip_cidr TEXT NOT NULL,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      label TEXT NOT NULL,
      notes TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (ip_cidr, tenant_id)
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

// ---------------------------------------------------------------------------
// ipMatchesCidr (pure function, no DB)
// ---------------------------------------------------------------------------

describe("ipMatchesCidr", () => {
  it("matches an IP within a /24 subnet", () => {
    expect(ipMatchesCidr("192.168.1.42", "192.168.1.0/24")).toBe(true);
  });

  it("rejects an IP outside a /24 subnet", () => {
    expect(ipMatchesCidr("192.168.2.1", "192.168.1.0/24")).toBe(false);
  });

  it("matches a single-host /32", () => {
    expect(ipMatchesCidr("10.0.0.5", "10.0.0.5/32")).toBe(true);
    expect(ipMatchesCidr("10.0.0.6", "10.0.0.5/32")).toBe(false);
  });

  it("matches any IP for /0", () => {
    expect(ipMatchesCidr("1.2.3.4", "0.0.0.0/0")).toBe(true);
    expect(ipMatchesCidr("255.255.255.255", "0.0.0.0/0")).toBe(true);
  });

  it("handles /8 networks", () => {
    expect(ipMatchesCidr("10.99.99.99", "10.0.0.0/8")).toBe(true);
    expect(ipMatchesCidr("11.0.0.1", "10.0.0.0/8")).toBe(false);
  });

  it("handles /16 networks", () => {
    expect(ipMatchesCidr("172.16.255.1", "172.16.0.0/16")).toBe(true);
    expect(ipMatchesCidr("172.17.0.1", "172.16.0.0/16")).toBe(false);
  });

  it("returns false for invalid CIDR notation", () => {
    expect(ipMatchesCidr("10.0.0.1", "not-a-cidr")).toBe(false);
    expect(ipMatchesCidr("10.0.0.1", "10.0.0.0")).toBe(false);  // no prefix
    expect(ipMatchesCidr("10.0.0.1", "10.0.0.0/33")).toBe(false); // prefix > 32
  });

  it("returns false for non-IPv4 addresses", () => {
    expect(ipMatchesCidr("::1", "::0/0")).toBe(false);
    expect(ipMatchesCidr("abc", "10.0.0.0/8")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkIpAccess
// ---------------------------------------------------------------------------

describe("checkIpAccess", () => {
  let db: DbClient;
  const NOW = new Date("2026-05-01T12:00:00.000Z");

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
  });

  it("returns ok for an IP with no block or allow entries", async () => {
    const r = await checkIpAccess(db, "1.2.3.4", NOW);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe("ok");
  });

  it("returns blocked for an actively blocked IP", async () => {
    const future = new Date(NOW.getTime() + 60 * 60_000).toISOString();
    await blockIp(db, { ipAddress: "1.2.3.4", reason: "manual", blockedUntil: future });

    const r = await checkIpAccess(db, "1.2.3.4", NOW);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("blocked");
    expect(r.blockReason).toBe("manual");
  });

  it("returns blocked for a permanent block (blocked_until = null)", async () => {
    await blockIp(db, { ipAddress: "1.2.3.4", reason: "admin_blocked" });

    const r = await checkIpAccess(db, "1.2.3.4", NOW);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("blocked");
  });

  it("returns ok for an expired block", async () => {
    const past = new Date(NOW.getTime() - 10 * 60_000).toISOString();
    await db.execute({
      sql: `INSERT INTO blocked_ips (ip_address, tenant_id, reason, blocked_until)
            VALUES (?, 1, 'auto:brute_force', ?)`,
      args: ["1.2.3.4", past]
    });

    const r = await checkIpAccess(db, "1.2.3.4", NOW);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe("ok");
  });

  it("allowed CIDR bypasses block check", async () => {
    const future = new Date(NOW.getTime() + 60 * 60_000).toISOString();
    await blockIp(db, { ipAddress: "10.0.0.5", reason: "manual", blockedUntil: future });
    await addAllowedIp(db, { ipCidr: "10.0.0.0/24", label: "office" });

    const r = await checkIpAccess(db, "10.0.0.5", NOW);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe("allowed_ip");
  });
});

// ---------------------------------------------------------------------------
// blockIp / unblockIp
// ---------------------------------------------------------------------------

describe("blockIp / unblockIp", () => {
  let db: DbClient;

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
  });

  it("inserts a block entry", async () => {
    await blockIp(db, { ipAddress: "5.5.5.5", reason: "manual", notes: "spam" });

    const row = await db.execute("SELECT * FROM blocked_ips WHERE ip_address = '5.5.5.5'");
    expect(row.rows.length).toBe(1);
    expect(row.rows[0]?.reason).toBe("manual");
    expect(row.rows[0]?.notes).toBe("spam");
  });

  it("upserts on duplicate IP", async () => {
    await blockIp(db, { ipAddress: "5.5.5.5", reason: "manual", notes: "first" });
    await blockIp(db, { ipAddress: "5.5.5.5", reason: "admin_blocked", notes: "updated" });

    const row = await db.execute("SELECT * FROM blocked_ips WHERE ip_address = '5.5.5.5'");
    expect(row.rows.length).toBe(1);
    expect(row.rows[0]?.reason).toBe("admin_blocked");
    expect(row.rows[0]?.notes).toBe("updated");
  });

  it("unblockIp removes the entry", async () => {
    await blockIp(db, { ipAddress: "5.5.5.5", reason: "manual" });
    await unblockIp(db, "5.5.5.5");

    const row = await db.execute("SELECT * FROM blocked_ips WHERE ip_address = '5.5.5.5'");
    expect(row.rows.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// addAllowedIp / removeAllowedIp
// ---------------------------------------------------------------------------

describe("addAllowedIp / removeAllowedIp", () => {
  let db: DbClient;

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
  });

  it("inserts an allowed CIDR entry", async () => {
    await addAllowedIp(db, { ipCidr: "10.0.0.0/8", label: "VPN" });

    const row = await db.execute("SELECT * FROM allowed_ips WHERE ip_cidr = '10.0.0.0/8'");
    expect(row.rows.length).toBe(1);
    expect(row.rows[0]?.label).toBe("VPN");
  });

  it("upserts on duplicate CIDR", async () => {
    await addAllowedIp(db, { ipCidr: "10.0.0.0/8", label: "VPN" });
    await addAllowedIp(db, { ipCidr: "10.0.0.0/8", label: "Office VPN" });

    const row = await db.execute("SELECT * FROM allowed_ips WHERE ip_cidr = '10.0.0.0/8'");
    expect(row.rows.length).toBe(1);
    expect(row.rows[0]?.label).toBe("Office VPN");
  });

  it("removeAllowedIp removes the entry", async () => {
    await addAllowedIp(db, { ipCidr: "10.0.0.0/8", label: "VPN" });
    await removeAllowedIp(db, "10.0.0.0/8");

    const row = await db.execute("SELECT * FROM allowed_ips WHERE ip_cidr = '10.0.0.0/8'");
    expect(row.rows.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// autoBlockIfThresholdBreached
// ---------------------------------------------------------------------------

describe("autoBlockIfThresholdBreached", () => {
  let db: DbClient;
  const NOW = new Date("2026-05-01T12:00:00.000Z");

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
  });

  async function seedIpFailures(ip: string, count: number, atISO: string) {
    for (let i = 0; i < count; i++) {
      await db.execute({
        sql: `INSERT INTO failed_logins (email, ip_address, reason, created_at)
              VALUES (?, ?, 'bad_password', ?)`,
        args: [`user${i}@example.com`, ip, atISO]
      });
    }
  }

  it("does NOT block when failures < threshold", async () => {
    await seedIpFailures("9.9.9.9", IP_FAILURE_THRESHOLD - 1, NOW.toISOString());

    const r = await autoBlockIfThresholdBreached(db, "9.9.9.9", NOW);
    expect(r.blocked).toBe(false);

    const row = await db.execute("SELECT * FROM blocked_ips WHERE ip_address = '9.9.9.9'");
    expect(row.rows.length).toBe(0);
  });

  it("blocks when failures >= threshold", async () => {
    await seedIpFailures("9.9.9.9", IP_FAILURE_THRESHOLD, NOW.toISOString());

    const r = await autoBlockIfThresholdBreached(db, "9.9.9.9", NOW);
    expect(r.blocked).toBe(true);

    const row = await db.execute("SELECT * FROM blocked_ips WHERE ip_address = '9.9.9.9'");
    expect(row.rows.length).toBe(1);
    expect(row.rows[0]?.reason).toBe("auto:brute_force");

    // Should have set blocked_until
    const blockedUntil = String(row.rows[0]?.blocked_until);
    const expected = new Date(NOW.getTime() + IP_LOCKOUT_MINUTES * 60_000).toISOString();
    expect(blockedUntil).toBe(expected);
  });

  it("does NOT count failures outside the sliding window", async () => {
    const stale = new Date(NOW.getTime() - (IP_FAILURE_WINDOW_MINUTES + 1) * 60_000).toISOString();
    await seedIpFailures("9.9.9.9", IP_FAILURE_THRESHOLD + 10, stale);

    const r = await autoBlockIfThresholdBreached(db, "9.9.9.9", NOW);
    expect(r.blocked).toBe(false);
  });

  it("returns blocked=true without re-inserting for already-blocked IP", async () => {
    const future = new Date(NOW.getTime() + 60 * 60_000).toISOString();
    // Use raw INSERT to simulate a pre-existing block (could be any reason)
    await db.execute({
      sql: `INSERT INTO blocked_ips (ip_address, tenant_id, reason, blocked_until)
            VALUES (?, 1, 'auto:brute_force', ?)`,
      args: ["9.9.9.9", future]
    });

    const r = await autoBlockIfThresholdBreached(db, "9.9.9.9", NOW);
    expect(r.blocked).toBe(true);

    // Reason should still be the original (not overwritten)
    const row = await db.execute("SELECT reason FROM blocked_ips WHERE ip_address = '9.9.9.9'");
    expect(row.rows[0]?.reason).toBe("auto:brute_force");
  });

  it("never auto-blocks an allowed IP", async () => {
    await addAllowedIp(db, { ipCidr: "9.9.9.0/24", label: "Office" });
    await seedIpFailures("9.9.9.9", IP_FAILURE_THRESHOLD + 10, NOW.toISOString());

    const r = await autoBlockIfThresholdBreached(db, "9.9.9.9", NOW);
    expect(r.blocked).toBe(false);

    const row = await db.execute("SELECT * FROM blocked_ips WHERE ip_address = '9.9.9.9'");
    expect(row.rows.length).toBe(0);
  });

  it("logs to system_log on auto-block", async () => {
    await seedIpFailures("9.9.9.9", IP_FAILURE_THRESHOLD, NOW.toISOString());
    await autoBlockIfThresholdBreached(db, "9.9.9.9", NOW);

    const logs = await db.execute(
      "SELECT * FROM system_log WHERE event = 'security.ip_blocked'"
    );
    expect(logs.rows.length).toBe(1);
    expect(logs.rows[0]?.level).toBe("warn");
  });
});
