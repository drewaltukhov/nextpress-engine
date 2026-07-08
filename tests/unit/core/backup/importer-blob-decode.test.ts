import { describe, it, expect } from "vitest";
import { restoreDatabase } from "@core/backup/importer";
import { freshTestDb } from "../../helpers/test-db";

describe("restoreDatabase blob decoding", () => {
  it("base64-decodes string values destined for BLOB columns", async () => {
    const db = freshTestDb();
    await db.execute({
      sql: `CREATE TABLE media (id TEXT PRIMARY KEY, blob_data BLOB)`,
      args: [],
    });

    // Base64 of 0x89 0x50 0x4e 0x47 0x0d ("iVBORw0=") — same fixture as
    // the exporter-blob-types test
    await restoreDatabase(
      db,
      {
        media: [{ id: "m1", blob_data: "iVBORw0=" }],
      },
      "turso",
      { includeMedia: true }
    );

    const r = await db.execute({
      sql: "SELECT typeof(blob_data) AS t, LENGTH(blob_data) AS n FROM media WHERE id = 'm1'",
      args: [],
    });
    expect(r.rows[0]!.t).toBe("blob");
    expect(Number(r.rows[0]!.n)).toBe(5); // 5 raw bytes, not 8 base64 chars
  });

  it("leaves non-BLOB string columns untouched", async () => {
    const db = freshTestDb();
    await db.execute({
      sql: `CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT)`,
      args: [],
    });
    await restoreDatabase(
      db,
      {
        posts: [{ id: 1, title: "iVBORw0=" }], // looks like base64 but isn't
      },
      "turso"
    );
    const r = await db.execute({
      sql: "SELECT typeof(title) AS t, title FROM posts WHERE id = 1",
      args: [],
    });
    expect(r.rows[0]!.t).toBe("text");
    expect(r.rows[0]!.title).toBe("iVBORw0="); // unchanged
  });
});
