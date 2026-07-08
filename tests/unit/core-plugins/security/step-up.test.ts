import { describe, it, expect, beforeEach } from "vitest";
import { freshTestDb } from "../../helpers/test-db";
import {
  requiresStepUp,
  isStepUpFresh,
  validateStepUp,
  loadRoleStepUpConfig,
  STEP_UP_TTL_MINUTES
} from "@core-plugins/security/step-up";
import { hashPassword } from "@core-plugins/users/passwords";
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
    CREATE TABLE user_credentials (
      user_id TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.execute(`
    CREATE TABLE roles (
      slug TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      label TEXT NOT NULL,
      permissions TEXT NOT NULL DEFAULT '[]',
      require_step_up TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// ---------------------------------------------------------------------------
// requiresStepUp (pure function)
// ---------------------------------------------------------------------------

describe("requiresStepUp", () => {
  const roles = [
    { slug: "admin", requireStepUp: ["users.delete", "plugins.disable", "settings.security.update"] },
    { slug: "editor", requireStepUp: [] }
  ];

  it("returns true when action is in a role's require_step_up list", () => {
    expect(requiresStepUp("users.delete", roles)).toBe(true);
    expect(requiresStepUp("plugins.disable", roles)).toBe(true);
  });

  it("returns false when action is NOT in any role's require_step_up list", () => {
    expect(requiresStepUp("posts.create", roles)).toBe(false);
  });

  it("returns false for empty roles", () => {
    expect(requiresStepUp("users.delete", [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isStepUpFresh
// ---------------------------------------------------------------------------

describe("isStepUpFresh", () => {
  const NOW = new Date("2026-05-01T12:00:00.000Z");

  it("returns true for a timestamp within the TTL", () => {
    const recent = new Date(NOW.getTime() - (STEP_UP_TTL_MINUTES - 1) * 60_000).toISOString();
    expect(isStepUpFresh(recent, NOW)).toBe(true);
  });

  it("returns false for a timestamp older than the TTL", () => {
    const stale = new Date(NOW.getTime() - (STEP_UP_TTL_MINUTES + 1) * 60_000).toISOString();
    expect(isStepUpFresh(stale, NOW)).toBe(false);
  });

  it("returns false for null / undefined", () => {
    expect(isStepUpFresh(null, NOW)).toBe(false);
    expect(isStepUpFresh(undefined, NOW)).toBe(false);
  });

  it("returns false for invalid date string", () => {
    expect(isStepUpFresh("not-a-date", NOW)).toBe(false);
  });

  it("returns true for a timestamp exactly at the TTL boundary", () => {
    const boundary = new Date(NOW.getTime() - STEP_UP_TTL_MINUTES * 60_000).toISOString();
    // At the exact boundary, stamp >= cutoff → true
    expect(isStepUpFresh(boundary, NOW)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateStepUp
// ---------------------------------------------------------------------------

describe("validateStepUp", () => {
  let db: DbClient;
  const NOW = new Date("2026-05-01T12:00:00.000Z");
  const PASSWORD = "correct-horse-battery-staple";

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
    await db.execute({
      sql: "INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)",
      args: ["u1", "alice@example.com", "Alice"]
    });
    const hash = await hashPassword(PASSWORD);
    await db.execute({
      sql: "INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)",
      args: ["u1", hash]
    });
  });

  it("returns an ISO timestamp on correct password", async () => {
    const result = await validateStepUp(db, "u1", PASSWORD, NOW);
    expect(result).toBe(NOW.toISOString());
  });

  it("returns null on wrong password", async () => {
    const result = await validateStepUp(db, "u1", "wrong-password", NOW);
    expect(result).toBeNull();
  });

  it("returns null for a user with no credentials row", async () => {
    await db.execute({
      sql: "INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)",
      args: ["u2", "bob@example.com", "Bob"]
    });
    const result = await validateStepUp(db, "u2", PASSWORD, NOW);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadRoleStepUpConfig
// ---------------------------------------------------------------------------

describe("loadRoleStepUpConfig", () => {
  let db: DbClient;

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
    await db.execute({
      sql: "INSERT INTO roles (slug, label, permissions, require_step_up) VALUES (?, ?, ?, ?)",
      args: ["admin", "Administrator", '["*"]', '["users.delete","plugins.disable"]']
    });
    await db.execute({
      sql: "INSERT INTO roles (slug, label, permissions, require_step_up) VALUES (?, ?, ?, ?)",
      args: ["editor", "Editor", '["posts.*"]', "[]"]
    });
  });

  it("loads step-up config for requested roles", async () => {
    const config = await loadRoleStepUpConfig(db, ["admin", "editor"]);
    expect(config).toHaveLength(2);

    const admin = config.find((r) => r.slug === "admin");
    expect(admin?.requireStepUp).toEqual(["users.delete", "plugins.disable"]);

    const editor = config.find((r) => r.slug === "editor");
    expect(editor?.requireStepUp).toEqual([]);
  });

  it("returns empty array for no role slugs", async () => {
    const config = await loadRoleStepUpConfig(db, []);
    expect(config).toEqual([]);
  });

  it("ignores unknown role slugs", async () => {
    const config = await loadRoleStepUpConfig(db, ["admin", "nonexistent"]);
    expect(config).toHaveLength(1);
    expect(config[0]?.slug).toBe("admin");
  });
});
