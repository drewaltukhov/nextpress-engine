import { describe, it, expect, beforeEach } from "vitest";
import { freshTestDb } from "../../helpers/test-db";
import {
  defineSettings,
  getSetting,
  setSetting,
  deleteSetting,
  loadAutoloadCache,
  getDefinition,
  listDefinitions,
  listGroups,
  _resetRegistry
} from "@core-plugins/settings/registry";
import { z } from "zod";
import type { DbClient } from "@core/db/client";

const TEST_SECRET = "test-secret-key-for-encryption-32ch";

async function ensureSchema(db: DbClient) {
  await db.execute(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      email TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE site_settings (
      tenant_id INTEGER NOT NULL DEFAULT 1,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      autoload INTEGER NOT NULL DEFAULT 0,
      scope TEXT NOT NULL DEFAULT 'private',
      encrypted INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (tenant_id, key)
    )
  `);
}

describe("defineSettings / getDefinition / listDefinitions", () => {
  beforeEach(() => {
    _resetRegistry();
  });

  it("registers and retrieves a definition", () => {
    defineSettings([{
      key: "site.title",
      group: "Site",
      label: "Site Title",
      schema: z.string(),
      defaultValue: "NextPress",
      scope: "public"
    }]);

    const def = getDefinition("site.title");
    expect(def?.key).toBe("site.title");
    expect(def?.defaultValue).toBe("NextPress");
  });

  it("lists definitions by group", () => {
    defineSettings([
      { key: "site.title", group: "Site", label: "Title", schema: z.string(), defaultValue: "", scope: "public" },
      { key: "site.url", group: "Site", label: "URL", schema: z.string(), defaultValue: "", scope: "public" },
      { key: "seo.robots", group: "SEO", label: "Robots", schema: z.string(), defaultValue: "", scope: "public" }
    ]);

    expect(listDefinitions("Site")).toHaveLength(2);
    expect(listDefinitions("SEO")).toHaveLength(1);
    expect(listGroups()).toEqual(expect.arrayContaining(["Site", "SEO"]));
  });
});

describe("getSetting / setSetting", () => {
  let db: DbClient;

  beforeEach(async () => {
    _resetRegistry();
    db = freshTestDb();
    await ensureSchema(db);
  });

  it("returns default value when no DB row exists", async () => {
    defineSettings([{
      key: "site.title",
      group: "Site",
      label: "Title",
      schema: z.string(),
      defaultValue: "NextPress",
      scope: "public"
    }]);

    const val = await getSetting<string>(db, "site.title");
    expect(val).toBe("NextPress");
  });

  it("returns undefined for unknown key with no definition", async () => {
    const val = await getSetting(db, "nonexistent.key");
    expect(val).toBeUndefined();
  });

  it("writes and reads back a string value", async () => {
    defineSettings([{
      key: "site.title",
      group: "Site",
      label: "Title",
      schema: z.string(),
      defaultValue: "NextPress",
      scope: "public"
    }]);

    await setSetting(db, "site.title", "My Blog");
    const val = await getSetting<string>(db, "site.title");
    expect(val).toBe("My Blog");
  });

  it("writes and reads back a number value", async () => {
    defineSettings([{
      key: "security.threshold",
      group: "Security",
      label: "Threshold",
      schema: z.number().int().min(1),
      defaultValue: 5,
      scope: "private"
    }]);

    await setSetting(db, "security.threshold", 10);
    const val = await getSetting<number>(db, "security.threshold");
    expect(val).toBe(10);
  });

  it("validates against Zod schema on set", async () => {
    defineSettings([{
      key: "security.threshold",
      group: "Security",
      label: "Threshold",
      schema: z.number().int().min(1),
      defaultValue: 5,
      scope: "private"
    }]);

    await expect(setSetting(db, "security.threshold", "not-a-number")).rejects.toThrow();
  });

  it("upserts on conflict", async () => {
    defineSettings([{
      key: "site.title",
      group: "Site",
      label: "Title",
      schema: z.string(),
      defaultValue: "NP",
      scope: "public"
    }]);

    await setSetting(db, "site.title", "First");
    await setSetting(db, "site.title", "Second");
    const val = await getSetting<string>(db, "site.title");
    expect(val).toBe("Second");
  });

  it("deletes a setting", async () => {
    defineSettings([{
      key: "site.title",
      group: "Site",
      label: "Title",
      schema: z.string(),
      defaultValue: "Default",
      scope: "public"
    }]);

    await setSetting(db, "site.title", "Custom");
    await deleteSetting(db, "site.title");
    const val = await getSetting<string>(db, "site.title");
    expect(val).toBe("Default");  // falls back to definition default
  });
});

describe("encrypted settings", () => {
  let db: DbClient;

  beforeEach(async () => {
    _resetRegistry();
    db = freshTestDb();
    await ensureSchema(db);
  });

  it("encrypts and decrypts a value", async () => {
    defineSettings([{
      key: "smtp.password",
      group: "Email",
      label: "SMTP Password",
      schema: z.string(),
      defaultValue: "",
      scope: "private",
      encrypted: true
    }]);

    await setSetting(db, "smtp.password", "s3cret", { secret: TEST_SECRET });
    const val = await getSetting<string>(db, "smtp.password", TEST_SECRET);
    expect(val).toBe("s3cret");

    // Raw DB value should NOT contain the plaintext
    const row = await db.execute("SELECT value FROM site_settings WHERE key = 'smtp.password'");
    const raw = String(row.rows[0]?.value);
    expect(raw).not.toContain("s3cret");
    expect(raw).toContain("ciphertext");
  });
});

describe("autoload cache", () => {
  let db: DbClient;

  beforeEach(async () => {
    _resetRegistry();
    db = freshTestDb();
    await ensureSchema(db);
  });

  it("caches autoloaded settings", async () => {
    // Insert directly with autoload=1
    await db.execute({
      sql: `INSERT INTO site_settings (tenant_id, key, value, autoload, scope, encrypted)
            VALUES (1, 'site.title', '"Cached Title"', 1, 'public', 0)`,
      args: []
    });

    await loadAutoloadCache(db);

    // Should return from cache without hitting DB
    defineSettings([{
      key: "site.title",
      group: "Site",
      label: "Title",
      schema: z.string(),
      defaultValue: "Default",
      scope: "public"
    }]);

    const val = await getSetting<string>(db, "site.title");
    expect(val).toBe("Cached Title");
  });
});
