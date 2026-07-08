// tests/unit/core/backup/exporter-options.test.ts
import { describe, it, expect } from "vitest";
import { validateManifest, type BackupManifest } from "@core/backup/manifest";
import { exportDatabase } from "@core/backup/exporter";
import { freshTestDb } from "../../helpers/test-db";
import type { DbClient } from "@core/db/client";

async function seedTwoTables(db: DbClient) {
  await db.execute({
    sql: `CREATE TABLE migration_lock (id INTEGER PRIMARY KEY, locked_at TEXT)`,
    args: [],
  });
  await db.execute({
    sql: `CREATE TABLE media (id TEXT PRIMARY KEY, filename TEXT, blob_data BLOB)`,
    args: [],
  });
  await db.execute({
    sql: `CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT)`,
    args: [],
  });
  await db.execute({
    sql: `CREATE TABLE audit_log (id INTEGER PRIMARY KEY, action TEXT)`,
    args: [],
  });
  await db.execute({ sql: `INSERT INTO posts (id, title) VALUES (1, 'hello')`, args: [] });
  await db.execute({
    sql: `INSERT INTO media (id, filename, blob_data) VALUES ('m1', 'a.png', x'89504e47')`,
    args: [],
  });
  await db.execute({
    sql: `INSERT INTO audit_log (id, action) VALUES (1, 'login')`,
    args: [],
  });
}

describe("validateManifest", () => {
  it("accepts a manifest with includesMedia: true", () => {
    const m: BackupManifest = {
      engine: "nextpress",
      version: "0.1.0",
      createdAt: new Date().toISOString(),
      tables: { posts: 3 },
      totalRows: 3,
      includesLogs: false,
      includesMedia: true,
      checksum: "abc",
    };
    expect(validateManifest(m)).toBe(true);
  });

  it("still accepts a legacy manifest with no includesMedia field", () => {
    const legacy = {
      engine: "nextpress",
      version: "0.1.0",
      createdAt: new Date().toISOString(),
      tables: {},
      totalRows: 0,
      includesLogs: false,
      checksum: "abc",
    };
    expect(validateManifest(legacy)).toBe(true);
  });
});

describe("exportDatabase options", () => {
  it("excludes the `media` table by default", async () => {
    const db = freshTestDb();
    await seedTwoTables(db);
    const { data, manifest } = await exportDatabase(db, {
      includeLogs: true,
      version: "test",
      provider: "turso",
    });
    expect(data.media).toBeUndefined();
    expect(manifest.includesMedia).toBe(false);
  });

  it("includes the `media` table when includeMedia is true", async () => {
    const db = freshTestDb();
    await seedTwoTables(db);
    const { data, manifest } = await exportDatabase(db, {
      includeLogs: true,
      version: "test",
      provider: "turso",
      includeMedia: true,
    });
    expect(data.media).toBeDefined();
    expect(data.media).toHaveLength(1);
    expect(data.media[0]!.id).toBe("m1");
    expect(typeof data.media[0]!.blob_data).toBe("string"); // base64
    expect(manifest.includesMedia).toBe(true);
    expect(manifest.tables.media).toBe(1);
  });

  it("drops tables listed in extraExcludes", async () => {
    const db = freshTestDb();
    await seedTwoTables(db);
    const { data } = await exportDatabase(db, {
      includeLogs: true,
      version: "test",
      provider: "turso",
      extraExcludes: new Set(["audit_log"]),
    });
    expect(data.audit_log).toBeUndefined();
    expect(data.posts).toBeDefined();
  });
});
