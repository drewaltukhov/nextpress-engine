import { describe, it, expect, beforeEach } from "vitest";
import { freshTestDb } from "../../helpers/test-db";
import { acquireLock, releaseLock, ensureLockTable } from "@core/migrate/lock";
import type { DbClient } from "@core/db/client";

describe("migration lock", () => {
  let db: DbClient;

  beforeEach(async () => {
    db = freshTestDb();
    await ensureLockTable(db);
  });

  it("acquires the lock when none is held", async () => {
    const result = await acquireLock(db, { staleMs: 5_000, owner: "test-1" });
    expect(result.acquired).toBe(true);
  });

  it("rejects a second acquire while the first is fresh", async () => {
    await acquireLock(db, { staleMs: 5_000, owner: "test-1" });
    const result = await acquireLock(db, { staleMs: 5_000, owner: "test-2" });
    expect(result.acquired).toBe(false);
    expect(result.heldBy).toBe("test-1");
  });

  it("steals a stale lock", async () => {
    await acquireLock(db, { staleMs: 5_000, owner: "test-1" });
    await db.execute({
      sql: "UPDATE migration_lock SET locked_at = ? WHERE id = 1",
      args: [new Date(Date.now() - 60_000).toISOString()]
    });
    const result = await acquireLock(db, { staleMs: 5_000, owner: "test-2" });
    expect(result.acquired).toBe(true);
  });

  it("releaseLock removes the row", async () => {
    await acquireLock(db, { staleMs: 5_000, owner: "test-1" });
    await releaseLock(db);
    const rows = await db.execute("SELECT * FROM migration_lock");
    expect(rows.rows.length).toBe(0);
  });
});
