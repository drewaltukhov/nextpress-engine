import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { DbClient } from "@core/db/client";

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

// Real Sharp produces real bytes — use a tiny synthetic image so resizeOriginal
// has something legitimate to operate on.
import sharp from "sharp";
async function tinyWebp(): Promise<Buffer> {
  return sharp({
    create: { width: 100, height: 100, channels: 3, background: "#fff" },
  })
    .webp({ quality: 80 })
    .toBuffer();
}

describe("uploadMedia — backend selection", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    for (const k of [
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
      "NEXT_PUBLIC_R2_PUBLIC_URL",
    ]) {
      delete process.env[k];
    }
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses DbStorage when settings.storageBackend === 'db' (no R2 env required)", async () => {
    const { uploadMedia } = await import("@core-plugins/media/service");
    const { db, calls } = mockDb();
    const bytes = await tinyWebp();
    const result = await uploadMedia(
      db,
      { filename: "test.webp", mime: "image/webp", bytes, uploadedBy: "u1" },
      {
        allowedMimeTypes: ["image/webp"],
        maxFileSizeMb: 5,
        convertToWebp: true,
        storageBackend: "db",
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.media.storageBackend).toBe("db");
    expect(result.media.storageRef).toBe(result.media.id); // mirrors id for db backend
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toMatch(/'db'/);
  });

  it("refuses with a clear error when storageBackend='r2' but env is missing", async () => {
    const { uploadMedia } = await import("@core-plugins/media/service");
    const { db, calls } = mockDb();
    const bytes = await tinyWebp();
    const result = await uploadMedia(
      db,
      { filename: "test.webp", mime: "image/webp", bytes, uploadedBy: "u1" },
      {
        allowedMimeTypes: ["image/webp"],
        maxFileSizeMb: 5,
        convertToWebp: true,
        storageBackend: "r2",
      }
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toMatch(/^R2 storage is enabled/);
    expect(result.error).toMatch(/Media → Settings/);
    expect(calls).toHaveLength(0); // no row inserted
  });
});

describe("uploadMedia — resize integration", () => {
  it("calls resizeOriginal on raster inputs (no Sharp throw for the synthetic image)", async () => {
    const resize = await import("@core-plugins/media/resize");
    const spy = vi.spyOn(resize, "resizeOriginal");

    const { uploadMedia } = await import("@core-plugins/media/service");
    const { db } = mockDb();
    const bytes = await tinyWebp();
    await uploadMedia(
      db,
      { filename: "test.webp", mime: "image/webp", bytes, uploadedBy: null },
      {
        allowedMimeTypes: ["image/webp"],
        maxFileSizeMb: 5,
        convertToWebp: true,
        storageBackend: "db",
      }
    );

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.any(Object), "image/webp");
    spy.mockRestore();
  });

  it("skips resizeOriginal for SVG uploads", async () => {
    const resize = await import("@core-plugins/media/resize");
    const spy = vi.spyOn(resize, "resizeOriginal");

    const { uploadMedia } = await import("@core-plugins/media/service");
    const { db } = mockDb();
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'
    );
    await uploadMedia(
      db,
      { filename: "test.svg", mime: "image/svg+xml", bytes: svg, uploadedBy: null },
      {
        allowedMimeTypes: ["image/svg+xml"],
        maxFileSizeMb: 5,
        convertToWebp: true,
        storageBackend: "db",
      }
    );

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
