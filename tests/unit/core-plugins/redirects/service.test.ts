import { describe, it, expect, beforeEach } from "vitest";
import { freshTestDb } from "../../helpers/test-db";
import {
  matchRedirect,
  createRedirect,
  createAutoRedirect,
  bumpHitCount,
  deactivateRedirect,
  deleteRedirect,
  validateNoCycle,
  RedirectCycleError
} from "@core-plugins/redirects/service";
import type { DbClient } from "@core/db/client";

async function ensureSchema(db: DbClient) {
  await db.execute(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      email TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE redirects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      from_path TEXT NOT NULL,
      to_path TEXT NOT NULL,
      status INTEGER NOT NULL DEFAULT 301,
      source TEXT NOT NULL DEFAULT 'manual',
      hit_count INTEGER NOT NULL DEFAULT 0,
      last_hit_at TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT,
      notes TEXT,
      UNIQUE(tenant_id, from_path)
    )
  `);
}

// ---------------------------------------------------------------------------
// matchRedirect
// ---------------------------------------------------------------------------

describe("matchRedirect", () => {
  let db: DbClient;
  const NOW = new Date("2026-05-01T12:00:00.000Z");

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
  });

  it("matches an active redirect", async () => {
    await createRedirect(db, { fromPath: "/old", toPath: "/new" });

    const match = await matchRedirect(db, "/old", NOW);
    expect(match).not.toBeNull();
    expect(match!.toPath).toBe("/new");
    expect(match!.status).toBe(301);
  });

  it("returns null for non-existent path", async () => {
    const match = await matchRedirect(db, "/nope", NOW);
    expect(match).toBeNull();
  });

  it("ignores inactive redirects", async () => {
    const id = await createRedirect(db, { fromPath: "/old", toPath: "/new" });
    await deactivateRedirect(db, id);

    const match = await matchRedirect(db, "/old", NOW);
    expect(match).toBeNull();
  });

  it("ignores expired redirects", async () => {
    const past = new Date(NOW.getTime() - 60_000).toISOString();
    await createRedirect(db, { fromPath: "/old", toPath: "/new", expiresAt: past });

    const match = await matchRedirect(db, "/old", NOW);
    expect(match).toBeNull();
  });

  it("matches unexpired redirects", async () => {
    const future = new Date(NOW.getTime() + 60_000).toISOString();
    await createRedirect(db, { fromPath: "/old", toPath: "/new", expiresAt: future });

    const match = await matchRedirect(db, "/old", NOW);
    expect(match).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createRedirect
// ---------------------------------------------------------------------------

describe("createRedirect", () => {
  let db: DbClient;

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
  });

  it("creates a redirect with default 301 status", async () => {
    const id = await createRedirect(db, { fromPath: "/a", toPath: "/b" });
    expect(id).toBeGreaterThan(0);

    const row = await db.execute({ sql: "SELECT status, source FROM redirects WHERE id = ?", args: [id] });
    expect(Number(row.rows[0]?.status)).toBe(301);
    expect(row.rows[0]?.source).toBe("manual");
  });

  it("upserts on duplicate from_path", async () => {
    await createRedirect(db, { fromPath: "/a", toPath: "/b" });
    await createRedirect(db, { fromPath: "/a", toPath: "/c" });

    const rows = await db.execute("SELECT * FROM redirects WHERE from_path = '/a'");
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0]?.to_path).toBe("/c");
  });

  it("supports 410 Gone status", async () => {
    const id = await createRedirect(db, { fromPath: "/removed", toPath: "", status: 410 });
    const row = await db.execute({ sql: "SELECT status FROM redirects WHERE id = ?", args: [id] });
    expect(Number(row.rows[0]?.status)).toBe(410);
  });
});

// ---------------------------------------------------------------------------
// createAutoRedirect
// ---------------------------------------------------------------------------

describe("createAutoRedirect", () => {
  let db: DbClient;

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
  });

  it("creates a 301 with the given source", async () => {
    await createAutoRedirect(db, { fromPath: "/old-slug", toPath: "/new-slug", source: "slug_change" });

    const rows = await db.execute("SELECT * FROM redirects WHERE from_path = '/old-slug'");
    expect(rows.rows.length).toBe(1);
    expect(Number(rows.rows[0]?.status)).toBe(301);
    expect(rows.rows[0]?.source).toBe("slug_change");
  });

  it("skips when fromPath === toPath", async () => {
    await createAutoRedirect(db, { fromPath: "/same", toPath: "/same", source: "slug_change" });

    const rows = await db.execute("SELECT * FROM redirects");
    expect(rows.rows.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// bumpHitCount
// ---------------------------------------------------------------------------

describe("bumpHitCount", () => {
  let db: DbClient;

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
  });

  it("increments hit_count", async () => {
    const id = await createRedirect(db, { fromPath: "/a", toPath: "/b" });
    await bumpHitCount(db, id);
    await bumpHitCount(db, id);

    const row = await db.execute({ sql: "SELECT hit_count FROM redirects WHERE id = ?", args: [id] });
    expect(Number(row.rows[0]?.hit_count)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Cycle detection
// ---------------------------------------------------------------------------

describe("validateNoCycle", () => {
  let db: DbClient;

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
  });

  it("allows a simple redirect (no chain)", async () => {
    await expect(validateNoCycle(db, "/b", "/a")).resolves.toBeUndefined();
  });

  it("allows a short chain (2 hops)", async () => {
    await createRedirect(db, { fromPath: "/b", toPath: "/c" });
    await expect(validateNoCycle(db, "/b", "/a")).resolves.toBeUndefined();
  });

  it("detects a direct cycle (A → B → A)", async () => {
    await createRedirect(db, { fromPath: "/b", toPath: "/a" });
    await expect(validateNoCycle(db, "/b", "/a")).rejects.toThrow(RedirectCycleError);
  });

  it("detects an indirect cycle (A → B → C → A)", async () => {
    await createRedirect(db, { fromPath: "/b", toPath: "/c" });
    await createRedirect(db, { fromPath: "/c", toPath: "/a" });
    await expect(validateNoCycle(db, "/b", "/a")).rejects.toThrow(RedirectCycleError);
  });

  it("rejects chains longer than 5 hops", async () => {
    await createRedirect(db, { fromPath: "/b", toPath: "/c" });
    await createRedirect(db, { fromPath: "/c", toPath: "/d" });
    await createRedirect(db, { fromPath: "/d", toPath: "/e" });
    await createRedirect(db, { fromPath: "/e", toPath: "/f" });
    await createRedirect(db, { fromPath: "/f", toPath: "/g" });

    await expect(validateNoCycle(db, "/b", "/a")).rejects.toThrow(RedirectCycleError);
  });
});

// ---------------------------------------------------------------------------
// deactivateRedirect / deleteRedirect
// ---------------------------------------------------------------------------

describe("deactivateRedirect / deleteRedirect", () => {
  let db: DbClient;

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
  });

  it("deactivateRedirect sets active=0", async () => {
    const id = await createRedirect(db, { fromPath: "/a", toPath: "/b" });
    await deactivateRedirect(db, id);

    const row = await db.execute({ sql: "SELECT active FROM redirects WHERE id = ?", args: [id] });
    expect(Number(row.rows[0]?.active)).toBe(0);
  });

  it("deleteRedirect removes the row", async () => {
    const id = await createRedirect(db, { fromPath: "/a", toPath: "/b" });
    await deleteRedirect(db, id);

    const row = await db.execute({ sql: "SELECT * FROM redirects WHERE id = ?", args: [id] });
    expect(row.rows.length).toBe(0);
  });
});
