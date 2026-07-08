import { describe, it, expect, beforeEach } from "vitest";
import { freshTestDb } from "../../helpers/test-db";
import {
  generateToken,
  hashToken,
  tokenPrefix,
  hasScope,
  createApiToken,
  revokeApiToken,
  lookupActiveToken,
  touchTokenUsage
} from "@core-plugins/api/tokens";
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
    CREATE TABLE api_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      prefix TEXT NOT NULL,
      scopes TEXT NOT NULL DEFAULT '[]',
      allowed_origins TEXT,
      rate_limit_per_minute INTEGER,
      expires_at TEXT,
      last_used_at TEXT,
      last_used_ip TEXT,
      revoked_at TEXT,
      revoked_by TEXT,
      revoked_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT,
      UNIQUE(token_hash)
    )
  `);
  await db.execute({
    sql: "INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)",
    args: ["u1", "alice@example.com", "Alice"]
  });
}

// ---------------------------------------------------------------------------
// generateToken / hashToken / tokenPrefix
// ---------------------------------------------------------------------------

describe("generateToken", () => {
  it("produces a token starting with npp_", () => {
    const token = generateToken();
    expect(token.startsWith("npp_")).toBe(true);
  });

  it("produces unique tokens", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
  });

  it("produces tokens of consistent length", () => {
    const token = generateToken();
    // npp_ (4) + 43 base64url chars = 47
    expect(token.length).toBeGreaterThanOrEqual(46);
    expect(token.length).toBeLessThanOrEqual(48);
  });
});

describe("hashToken", () => {
  it("returns a 64-char hex string (SHA-256)", () => {
    const hash = hashToken("npp_test1234");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("same input → same hash", () => {
    expect(hashToken("npp_abc")).toBe(hashToken("npp_abc"));
  });

  it("different input → different hash", () => {
    expect(hashToken("npp_abc")).not.toBe(hashToken("npp_def"));
  });
});

describe("tokenPrefix", () => {
  it("returns the first 8 characters", () => {
    expect(tokenPrefix("npp_a3f9xxxx")).toBe("npp_a3f9");
  });
});

// ---------------------------------------------------------------------------
// hasScope
// ---------------------------------------------------------------------------

describe("hasScope", () => {
  it("returns true when scope is present", () => {
    expect(hasScope(["posts:read", "posts:write"], "posts:read")).toBe(true);
  });

  it("returns false when scope is missing", () => {
    expect(hasScope(["posts:read"], "posts:write")).toBe(false);
  });

  it("wildcard * satisfies any scope", () => {
    expect(hasScope(["*"], "posts:write")).toBe(true);
    expect(hasScope(["*"], "media:delete")).toBe(true);
  });

  it("returns false for empty scopes", () => {
    expect(hasScope([], "posts:read")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createApiToken / lookupActiveToken / revokeApiToken
// ---------------------------------------------------------------------------

describe("createApiToken", () => {
  let db: DbClient;

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
  });

  it("creates a token and returns plaintext + prefix + hash", async () => {
    const result = await createApiToken(db, {
      userId: "u1",
      name: "CI token",
      scopes: ["posts:read"]
    });

    expect(result.plaintext.startsWith("npp_")).toBe(true);
    expect(result.prefix).toBe(result.plaintext.slice(0, 8));
    expect(result.tokenHash).toBe(hashToken(result.plaintext));
    expect(result.id).toBeGreaterThan(0);
  });

  it("stores the hash, not the plaintext", async () => {
    const result = await createApiToken(db, {
      userId: "u1",
      name: "Test",
      scopes: ["posts:read"]
    });

    const row = await db.execute({ sql: "SELECT token_hash FROM api_tokens WHERE id = ?", args: [result.id] });
    expect(row.rows[0]?.token_hash).toBe(result.tokenHash);
    // Plaintext should NOT appear anywhere in the DB
    const allRows = await db.execute("SELECT * FROM api_tokens");
    const serialized = JSON.stringify(allRows.rows);
    expect(serialized).not.toContain(result.plaintext);
  });

  it("stores scopes as JSON", async () => {
    const result = await createApiToken(db, {
      userId: "u1",
      name: "Multi-scope",
      scopes: ["posts:read", "media:upload"]
    });

    const row = await db.execute({ sql: "SELECT scopes FROM api_tokens WHERE id = ?", args: [result.id] });
    expect(JSON.parse(String(row.rows[0]?.scopes))).toEqual(["posts:read", "media:upload"]);
  });
});

describe("lookupActiveToken", () => {
  let db: DbClient;

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
  });

  it("finds a token by hash", async () => {
    const created = await createApiToken(db, {
      userId: "u1",
      name: "Lookup test",
      scopes: ["posts:read"]
    });

    const found = await lookupActiveToken(db, created.tokenHash);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.userId).toBe("u1");
    expect(found!.scopes).toEqual(["posts:read"]);
  });

  it("returns null for unknown hash", async () => {
    const found = await lookupActiveToken(db, "0000000000000000000000000000000000000000000000000000000000000000");
    expect(found).toBeNull();
  });

  it("returns null for revoked token", async () => {
    const created = await createApiToken(db, {
      userId: "u1",
      name: "To revoke",
      scopes: ["posts:read"]
    });
    await revokeApiToken(db, created.id, { revokedBy: "u1", reason: "compromised" });

    const found = await lookupActiveToken(db, created.tokenHash);
    expect(found).toBeNull();
  });
});

describe("revokeApiToken", () => {
  let db: DbClient;

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
  });

  it("sets revoked_at and reason", async () => {
    const created = await createApiToken(db, {
      userId: "u1",
      name: "Revoke me",
      scopes: ["*"]
    });

    await revokeApiToken(db, created.id, { revokedBy: "u1", reason: "no longer needed" });

    const row = await db.execute({ sql: "SELECT revoked_at, revoked_by, revoked_reason FROM api_tokens WHERE id = ?", args: [created.id] });
    expect(row.rows[0]?.revoked_at).not.toBeNull();
    expect(row.rows[0]?.revoked_by).toBe("u1");
    expect(row.rows[0]?.revoked_reason).toBe("no longer needed");
  });
});

describe("touchTokenUsage", () => {
  let db: DbClient;

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
  });

  it("updates last_used_at and last_used_ip", async () => {
    const created = await createApiToken(db, {
      userId: "u1",
      name: "Usage test",
      scopes: ["posts:read"]
    });

    await touchTokenUsage(db, created.id, "203.0.113.42");

    const row = await db.execute({ sql: "SELECT last_used_at, last_used_ip FROM api_tokens WHERE id = ?", args: [created.id] });
    expect(row.rows[0]?.last_used_at).not.toBeNull();
    expect(row.rows[0]?.last_used_ip).toBe("203.0.113.42");
  });
});
