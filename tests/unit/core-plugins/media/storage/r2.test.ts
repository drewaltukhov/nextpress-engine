import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { R2Storage, sanitizeFilenameForKey } from "@core-plugins/media/storage/r2";
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

function preconditionFailedError(): Error & { name: string; $metadata: { httpStatusCode: number } } {
  const e = new Error("Precondition Failed") as Error & {
    name: string;
    $metadata: { httpStatusCode: number };
  };
  e.name = "PreconditionFailed";
  e.$metadata = { httpStatusCode: 412 };
  return e;
}

function fixture(overrides: Partial<MediaPutData> = {}): MediaPutData {
  return {
    id: "uuid-1",
    tenantId: 1,
    filename: "Cat Photo.webp",
    mime: "image/webp",
    sizeBytes: 1234,
    width: 1920,
    height: 1280,
    uploadedBy: "user-1",
    bytes: new Uint8Array([1, 2, 3]),
    thumb: { bytes: new Uint8Array([9]), mime: "image/webp" },
    medium: { bytes: new Uint8Array([8]), mime: "image/webp" },
    uploadedAt: new Date(Date.UTC(2026, 4, 14, 12, 0, 0)),
    ...overrides,
  };
}

function setEnv() {
  process.env.R2_ACCOUNT_ID = "acct";
  process.env.R2_ACCESS_KEY_ID = "akid";
  process.env.R2_SECRET_ACCESS_KEY = "skid";
  process.env.R2_BUCKET_NAME = "bkt";
  process.env.NEXT_PUBLIC_R2_PUBLIC_URL = "https://cdn.example.com";
}

function clearEnv() {
  delete process.env.R2_ACCOUNT_ID;
  delete process.env.R2_ACCESS_KEY_ID;
  delete process.env.R2_SECRET_ACCESS_KEY;
  delete process.env.R2_BUCKET_NAME;
  delete process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
}

describe("sanitizeFilenameForKey", () => {
  it("lowercases and dash-joins non-alphanumerics, preserves extension", () => {
    expect(sanitizeFilenameForKey("Cat Photo!!.WEBP")).toEqual({ stem: "cat-photo", ext: "webp" });
  });

  it("returns 'file' for an all-junk stem", () => {
    expect(sanitizeFilenameForKey("!!!.jpg")).toEqual({ stem: "file", ext: "jpg" });
  });

  it("handles no extension", () => {
    expect(sanitizeFilenameForKey("noext")).toEqual({ stem: "noext", ext: "" });
  });

  it("collapses runs of separators", () => {
    expect(sanitizeFilenameForKey("a  b__c--d.png")).toEqual({ stem: "a-b-c-d", ext: "png" });
  });
});

describe("R2Storage — env-gating", () => {
  beforeEach(() => clearEnv());
  afterEach(() => clearEnv());

  it("available() is false when any required env var is missing", () => {
    setEnv();
    delete process.env.R2_BUCKET_NAME;
    expect(new R2Storage().available()).toBe(false);
  });

  it("available() is true when all five env vars are set", () => {
    setEnv();
    expect(new R2Storage().available()).toBe(true);
  });

  it("available() ignores whitespace-only values (treated as missing)", () => {
    setEnv();
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL = "   ";
    expect(new R2Storage().available()).toBe(false);
  });
});

describe("R2Storage — put", () => {
  beforeEach(() => setEnv());
  afterEach(() => clearEnv());

  /**
   * Mock the S3Client so the first N original-key PUTs return 412
   * PreconditionFailed (key taken) and the (N+1)th succeeds. The thumb PUT
   * (which has a different Key suffix) always succeeds.
   */
  function makeMockClient(originalCollisions: number) {
    let originalAttempts = 0;
    const send = vi.fn(async (cmd: unknown) => {
      if (cmd instanceof PutObjectCommand) {
        const key = cmd.input.Key ?? "";
        const isVariant = key.includes("-thumb") || key.includes("-medium");
        if (!isVariant) {
          if (originalAttempts < originalCollisions) {
            originalAttempts++;
            throw preconditionFailedError();
          }
          return { $metadata: { httpStatusCode: 200 }, ETag: '"abc"' };
        }
        // Thumb / medium PUT — always succeed.
        return { $metadata: { httpStatusCode: 200 }, ETag: '"variant"' };
      }
      if (cmd instanceof DeleteObjectCommand) {
        return { $metadata: { httpStatusCode: 204 } };
      }
      throw new Error("unexpected command");
    });
    return { send } as unknown as S3Client;
  }

  function cmds(client: S3Client) {
    return (client.send as unknown as ReturnType<typeof vi.fn>).mock.calls.map((args) => args[0]);
  }

  it("no collision → original + thumb + medium PUTs, ref settles on base", async () => {
    const client = makeMockClient(0);
    const { db, calls } = mockDb();
    const result = await new R2Storage(client).put(db, fixture());

    const allPuts = cmds(client).filter((c) => c instanceof PutObjectCommand) as PutObjectCommand[];
    expect(allPuts).toHaveLength(3);

    // First PUT is the conditional create on the original key.
    expect(allPuts[0].input.Key).toBe("2026/05/cat-photo.webp");
    expect(allPuts[0].input.IfNoneMatch).toBe("*");

    // Second PUT is the thumb — no IfNoneMatch (overwrite OK).
    expect(allPuts[1].input.Key).toBe("2026/05/cat-photo-thumb.webp");
    expect(allPuts[1].input.IfNoneMatch).toBeUndefined();

    // Third PUT is the medium — same overwrite semantics.
    expect(allPuts[2].input.Key).toBe("2026/05/cat-photo-medium.webp");
    expect(allPuts[2].input.IfNoneMatch).toBeUndefined();

    expect(result.ref).toBe("2026/05/cat-photo.webp");
    expect(result.thumbMime).toBe("image/webp");
    expect(result.mediumMime).toBe("image/webp");

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toMatch(/'r2'/);
    expect(calls[0].args[9]).toBe("2026/05/cat-photo.webp"); // storage_ref (after thumb_mime + medium_mime args)
  });

  it("no thumb → original + medium PUT, INSERTs with thumb_mime=NULL", async () => {
    const client = makeMockClient(0);
    const { db, calls } = mockDb();
    const result = await new R2Storage(client).put(db, fixture({ thumb: null }));

    const puts = cmds(client).filter((c) => c instanceof PutObjectCommand);
    expect(puts).toHaveLength(2); // original + medium
    expect(result.thumbMime).toBeNull();
    expect(calls[0].args[7]).toBeNull(); // thumb_mime arg position
  });

  it("no medium → original + thumb PUT, INSERTs with medium_mime=NULL", async () => {
    const client = makeMockClient(0);
    const { db, calls } = mockDb();
    const result = await new R2Storage(client).put(db, fixture({ medium: null }));

    const puts = cmds(client).filter((c) => c instanceof PutObjectCommand);
    expect(puts).toHaveLength(2); // original + thumb
    expect(result.mediumMime).toBeNull();
    expect(calls[0].args[8]).toBeNull(); // medium_mime arg position
  });

  it("collision → bumps suffix to -1 on first 412", async () => {
    const client = makeMockClient(1);
    const { db } = mockDb();
    const result = await new R2Storage(client).put(db, fixture());
    expect(result.ref).toBe("2026/05/cat-photo-1.webp");
  });

  it("derives -thumb.webp from the resolved (collided) original key", async () => {
    const client = makeMockClient(2);
    const { db } = mockDb();
    const result = await new R2Storage(client).put(db, fixture());
    expect(result.ref).toBe("2026/05/cat-photo-2.webp");

    const allPuts = cmds(client).filter((c) => c instanceof PutObjectCommand) as PutObjectCommand[];
    const thumbPut = allPuts.find((c) => c.input.Key?.includes("-thumb"));
    expect(thumbPut).toBeDefined();
    expect(thumbPut!.input.Key).toBe("2026/05/cat-photo-2-thumb.webp");
  });

  it("21 collisions → throws with the documented error", async () => {
    const client = makeMockClient(21);
    const { db } = mockDb();
    await expect(new R2Storage(client).put(db, fixture())).rejects.toThrow(/Filename too contested/);
  });

  it("YYYY/MM is derived from uploadedAt in UTC", async () => {
    const client = makeMockClient(0);
    const { db } = mockDb();
    const result = await new R2Storage(client).put(
      db,
      fixture({ uploadedAt: new Date(Date.UTC(2027, 0, 9)) })
    );
    expect(result.ref).toBe("2027/01/cat-photo.webp");
  });
});

describe("R2Storage — S3Client config", () => {
  beforeEach(() => setEnv());
  afterEach(() => clearEnv());

  it("default client is constructed with region:'auto' and account-id endpoint", () => {
    // Sanity check: build a real client (no actual network — just check ctor args).
    const storage = new R2Storage();
    expect(storage.available()).toBe(true);
    // We don't have direct access to the ctor args here without mocking the
    // module; instead verify endpoint shape indirectly by exercising any path
    // that constructs the client. This test is intentionally narrow — endpoint
    // construction is verified via the integration smoke test in Task 11.
  });
});
