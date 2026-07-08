import { describe, it, expect } from "vitest";
import { exportDatabase } from "@core/backup/exporter";
import { freshTestDb } from "../../helpers/test-db";

describe("exportDatabase blob handling", () => {
  it("base64-encodes BLOB columns regardless of driver-returned shape", async () => {
    const db = freshTestDb();
    await db.execute({
      sql: `CREATE TABLE media (id TEXT PRIMARY KEY, blob_data BLOB)`,
      args: [],
    });
    // Insert a known byte sequence (5 bytes: 0x89 'P' 'N' 'G' 0x0d)
    await db.execute({
      sql: `INSERT INTO media (id, blob_data) VALUES ('m1', x'89504e470d')`,
      args: [],
    });

    const { data } = await exportDatabase(db, {
      includeLogs: false,
      version: "0.0.0",
      provider: "turso",
      includeMedia: true,
    });

    expect(data.media).toHaveLength(1);
    const blob = data.media[0]!.blob_data;
    expect(typeof blob).toBe("string");
    // base64 of 0x89,0x50,0x4e,0x47,0x0d is "iVBORw0="
    expect(blob).toBe("iVBORw0=");
  });
});
