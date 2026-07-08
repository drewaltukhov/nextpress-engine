import { describe, it, expect } from "vitest";
import { DbStorage } from "@core-plugins/media/storage/db";
import type { DbClient } from "@core/db/client";
import type { MediaPutData } from "@core-plugins/media/storage/types";

type ExecuteCall = { sql: string; args: unknown[] };

function mockDb(): { db: DbClient; calls: ExecuteCall[] } {
  const calls: ExecuteCall[] = [];
  const db = {
    execute: async (q: { sql: string; args: unknown[] }) => {
      calls.push({ sql: q.sql, args: q.args });
      return { rows: [], rowsAffected: 1, lastInsertRowid: undefined } as unknown as Awaited<
        ReturnType<DbClient["execute"]>
      >;
    },
  } as unknown as DbClient;
  return { db, calls };
}

function fixture(overrides: Partial<MediaPutData> = {}): MediaPutData {
  return {
    id: "uuid-1",
    tenantId: 1,
    filename: "cat.webp",
    mime: "image/webp",
    sizeBytes: 1234,
    width: 800,
    height: 600,
    uploadedBy: "user-1",
    bytes: new Uint8Array([1, 2, 3]),
    thumb: { bytes: new Uint8Array([9, 9]), mime: "image/webp" },
    medium: { bytes: new Uint8Array([8, 8]), mime: "image/webp" },
    ...overrides,
  };
}

describe("DbStorage", () => {
  it("id is 'db'", () => {
    expect(new DbStorage().id).toBe("db");
  });

  it("available() is always true", () => {
    expect(new DbStorage().available()).toBe(true);
  });

  it("put() emits an INSERT into media with storage_backend='db' and storage_ref mirroring id", async () => {
    const { db, calls } = mockDb();
    const result = await new DbStorage().put(db, fixture());

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toMatch(/INSERT INTO media/);
    expect(calls[0].sql).toMatch(/'db'/);
    // storage_ref column position (13th non-literal arg — id, tenant_id, filename,
    // mime, size, w, h, blob, thumb, thumb_mime, medium, medium_mime, storage_ref)
    expect(calls[0].args[12]).toBe("uuid-1");
    expect(result).toEqual({ ref: "uuid-1", thumbMime: "image/webp", mediumMime: "image/webp" });
  });

  it("put() with no thumb writes NULLs for thumb_data + thumb_mime", async () => {
    const { db, calls } = mockDb();
    const result = await new DbStorage().put(db, fixture({ thumb: null }));

    expect(calls[0].args[8]).toBeNull(); // thumb_data
    expect(calls[0].args[9]).toBeNull(); // thumb_mime
    expect(result.thumbMime).toBeNull();
  });

  it("put() with no medium writes NULLs for medium_data + medium_mime", async () => {
    const { db, calls } = mockDb();
    const result = await new DbStorage().put(db, fixture({ medium: null }));

    expect(calls[0].args[10]).toBeNull(); // medium_data
    expect(calls[0].args[11]).toBeNull(); // medium_mime
    expect(result.mediumMime).toBeNull();
  });

  it("put() writes the original bytes into blob_data", async () => {
    const { db, calls } = mockDb();
    await new DbStorage().put(db, fixture());
    expect(calls[0].args[7]).toBeInstanceOf(Uint8Array); // blob_data
    expect(calls[0].args[7]).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("remove() emits the existing DELETE shape", async () => {
    const { db, calls } = mockDb();
    await new DbStorage().remove(db, "uuid-1", "uuid-1", true);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toBe("DELETE FROM media WHERE id = ? AND tenant_id = 1");
    expect(calls[0].args).toEqual(["uuid-1"]);
  });
});
