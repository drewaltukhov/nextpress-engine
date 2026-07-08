// tests/unit/core/backup/importer-options.test.ts
import { describe, it, expect } from "vitest";
import { restoreDatabase } from "@core/backup/importer";
import { freshTestDb } from "../../helpers/test-db";
import type { DbClient } from "@core/db/client";

async function createSchema(db: DbClient) {
  await db.execute({
    sql: `CREATE TABLE media (id TEXT PRIMARY KEY, filename TEXT, blob_data BLOB)`,
    args: [],
  });
  await db.execute({
    sql: `CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT)`,
    args: [],
  });
}

describe("restoreDatabase media handling", () => {
  it("skips the `media` table by default (back-compat)", async () => {
    const db = freshTestDb();
    await createSchema(db);
    await restoreDatabase(
      db,
      {
        media: [{ id: "m1", filename: "a.png", blob_data: "iVBORw0KGgo=" }],
        posts: [{ id: 1, title: "hello" }],
      },
      "turso"
    );
    const m = await db.execute({ sql: "SELECT COUNT(*) AS n FROM media", args: [] });
    const p = await db.execute({ sql: "SELECT COUNT(*) AS n FROM posts", args: [] });
    expect(Number(m.rows[0]!.n)).toBe(0);
    expect(Number(p.rows[0]!.n)).toBe(1);
  });

  it("restores `media` when includeMedia is true", async () => {
    const db = freshTestDb();
    await createSchema(db);
    await restoreDatabase(
      db,
      {
        media: [{ id: "m1", filename: "a.png", blob_data: "iVBORw0KGgo=" }],
        posts: [{ id: 1, title: "hello" }],
      },
      "turso",
      { includeMedia: true }
    );
    const m = await db.execute({
      sql: "SELECT id, filename FROM media",
      args: [],
    });
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0]!.id).toBe("m1");
    expect(m.rows[0]!.filename).toBe("a.png");
  });
});
