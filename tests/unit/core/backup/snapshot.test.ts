import { describe, it, expect } from "vitest";
import { buildDemoBundle } from "@core/backup/snapshot";
import { restoreDatabase } from "@core/backup/importer";
import { validateManifest, type BackupManifest } from "@core/backup/manifest";
import { freshTestDb } from "../../helpers/test-db";
import type { DbClient } from "@core/db/client";
import { unzipSync, strFromU8 } from "fflate";

async function createDemoSchema(db: DbClient) {
  // Creates the 5 tables used by these tests — no row inserts.
  await db.execute({
    sql: `CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT)`,
    args: [],
  });
  await db.execute({
    sql: `CREATE TABLE media (id TEXT PRIMARY KEY, filename TEXT, blob_data BLOB)`,
    args: [],
  });
  await db.execute({
    sql: `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`,
    args: [],
  });
  await db.execute({
    sql: `CREATE TABLE audit_log (id INTEGER PRIMARY KEY, action TEXT)`,
    args: [],
  });
  await db.execute({
    sql: `CREATE TABLE migration_lock (id INTEGER PRIMARY KEY)`,
    args: [],
  });
}

async function seedDemoLikeDb(db: DbClient) {
  await createDemoSchema(db);
  await db.execute({
    sql: `INSERT INTO posts (id, title) VALUES (1, 'hello'), (2, 'world')`,
    args: [],
  });
  await db.execute({
    sql: `INSERT INTO media (id, filename, blob_data) VALUES ('m1', 'a.png', x'89504e47')`,
    args: [],
  });
  await db.execute({
    sql: `INSERT INTO settings (key, value) VALUES ('site.title', 'Demo Site')`,
    args: [],
  });
  await db.execute({
    sql: `INSERT INTO audit_log (id, action) VALUES (1, 'login')`,
    args: [],
  });
}

describe("buildDemoBundle", () => {
  it("produces a ZIP with manifest.json + per-table JSON entries", async () => {
    const db = freshTestDb();
    await seedDemoLikeDb(db);
    const { bytes, manifest } = await buildDemoBundle(db, {
      version: "test",
      provider: "turso",
    });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(manifest.includesMedia).toBe(true);
    expect(manifest.tables.posts).toBe(2);
    expect(manifest.tables.media).toBe(1);
    expect(manifest.tables.audit_log).toBeUndefined();

    const entries = unzipSync(bytes);
    expect(entries["manifest.json"]).toBeDefined();
    expect(entries["data/posts.json"]).toBeDefined();
    expect(entries["data/media.json"]).toBeDefined();
    expect(entries["data/settings.json"]).toBeDefined();
    expect(entries["data/audit_log.json"]).toBeUndefined();
  });

  it("redacts encrypted site_settings rows (secrets) but keeps plain ones", async () => {
    const db = freshTestDb();
    await db.execute({
      sql: `CREATE TABLE site_settings (key TEXT PRIMARY KEY, value TEXT, encrypted INTEGER)`,
      args: [],
    });
    await db.execute({
      sql: `INSERT INTO site_settings (key, value, encrypted) VALUES
              ('smtp.password', '{"ciphertext":"SECRET","iv":"xx"}', 1),
              ('crypto-beat.api_key', '{"ciphertext":"KEY","iv":"yy"}', 1),
              ('seo.language', '"en"', 0)`,
      args: [],
    });

    const { bytes, manifest } = await buildDemoBundle(db, {
      version: "test",
      provider: "turso",
    });

    // Manifest count reflects the redaction (3 rows in DB → 1 in bundle).
    expect(manifest.tables.site_settings).toBe(1);

    const entries = unzipSync(bytes);
    const rows = JSON.parse(strFromU8(entries["data/site_settings.json"]!)) as Array<{ key: string }>;
    expect(rows.map((r) => r.key)).toEqual(["seo.language"]);
    // No secret material anywhere in the emitted table.
    expect(strFromU8(entries["data/site_settings.json"]!)).not.toContain("ciphertext");
    expect(strFromU8(entries["data/site_settings.json"]!)).not.toContain("SECRET");
  });

  it("round-trips: bundle restored into a fresh DB recreates the rows", async () => {
    const sourceDb = freshTestDb();
    await seedDemoLikeDb(sourceDb);
    const { bytes } = await buildDemoBundle(sourceDb, {
      version: "test",
      provider: "turso",
    });

    // Fresh target DB with the same schema (no rows)
    const targetDb = freshTestDb();
    await createDemoSchema(targetDb);

    // Parse + restore
    const entries = unzipSync(bytes);
    const manifest = JSON.parse(strFromU8(entries["manifest.json"]!)) as BackupManifest;
    expect(validateManifest(manifest)).toBe(true);
    const data: Record<string, Record<string, unknown>[]> = {};
    for (const [name, raw] of Object.entries(entries)) {
      if (!name.startsWith("data/")) continue;
      const table = name.slice("data/".length, -".json".length);
      data[table] = JSON.parse(strFromU8(raw));
    }
    await restoreDatabase(targetDb, data, "turso", { includeMedia: true });

    const posts = await targetDb.execute({ sql: "SELECT COUNT(*) n FROM posts", args: [] });
    const media = await targetDb.execute({ sql: "SELECT filename FROM media WHERE id = 'm1'", args: [] });
    const settings = await targetDb.execute({ sql: "SELECT value FROM settings WHERE key = 'site.title'", args: [] });
    expect(Number(posts.rows[0]!.n)).toBe(2);
    expect(media.rows[0]!.filename).toBe("a.png");
    expect(settings.rows[0]!.value).toBe("Demo Site");
  });
});
