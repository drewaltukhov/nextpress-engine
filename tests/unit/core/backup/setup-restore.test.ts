// tests/unit/core/backup/setup-restore.test.ts
//
// Unit test for the demo-restore branch of completeSetup. We can't easily
// import the server action directly (it uses next/cache + db() singleton),
// so this test isolates the *logic* by calling a thin exported helper
// `applyDemoBundle` that completeSetup delegates to. The action wrapper is
// covered by the manual smoke in Task 10.
import { describe, it, expect } from "vitest";
import { applyDemoBundle } from "@/app/admin/setup/actions";
import { buildDemoBundle } from "@core/backup/snapshot";
import { ENGINE_VERSION } from "@core/version";
import { freshTestDb } from "../../helpers/test-db";

describe("applyDemoBundle", () => {
  it("restores rows from a demo bundle into a fresh DB", async () => {
    const sourceDb = freshTestDb();
    await sourceDb.execute({
      sql: `CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT)`,
      args: [],
    });
    await sourceDb.execute({
      sql: `CREATE TABLE media (id TEXT PRIMARY KEY, filename TEXT, blob_data BLOB)`,
      args: [],
    });
    await sourceDb.execute({
      sql: `INSERT INTO posts (id, title) VALUES (1, 'demo')`,
      args: [],
    });
    await sourceDb.execute({
      sql: `INSERT INTO media (id, filename, blob_data) VALUES ('m1', 'a.png', x'89504e47')`,
      args: [],
    });
    const { bytes } = await buildDemoBundle(sourceDb, {
      version: ENGINE_VERSION,
      provider: "turso",
    });

    const targetDb = freshTestDb();
    await targetDb.execute({
      sql: `CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT)`,
      args: [],
    });
    await targetDb.execute({
      sql: `CREATE TABLE media (id TEXT PRIMARY KEY, filename TEXT, blob_data BLOB)`,
      args: [],
    });

    await applyDemoBundle(targetDb, bytes, "turso");
    const posts = await targetDb.execute({ sql: "SELECT title FROM posts WHERE id = 1", args: [] });
    expect(posts.rows[0]!.title).toBe("demo");
  });

  it("throws a clear error on a malformed bundle", async () => {
    const db = freshTestDb();
    await expect(applyDemoBundle(db, new Uint8Array([1, 2, 3]), "turso")).rejects.toThrow(
      /backup/i
    );
  });

  it("throws a clear error when manifest.json is not valid JSON", async () => {
    // Build a valid zip that contains a non-JSON manifest.json
    const { zipSync, strToU8 } = await import("fflate");
    const badZip = zipSync({ "manifest.json": strToU8("not-json!!!") });
    const db = freshTestDb();
    await expect(applyDemoBundle(db, badZip, "turso")).rejects.toThrow(
      /backup/i
    );
  });
});
