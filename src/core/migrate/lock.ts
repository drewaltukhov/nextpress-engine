import type { DbClient } from "@core/db/client";
import { drizzle as drizzleLibSql } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { migrationLock } from "@core/db/schema/migration-lock";

export interface AcquireOptions {
  staleMs: number;
  owner: string;
}

export interface AcquireResult {
  acquired: boolean;
  heldBy?: string;
  lockedAt?: string;
}

/**
 * Idempotently create the migration_lock table.
 * Kept as raw CREATE TABLE IF NOT EXISTS for bootstrap-time compatibility:
 * Drizzle migrations create this table, but tests and the migrator's
 * own bootstrap path may run before any migration has executed.
 */
export async function ensureLockTable(db: DbClient): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS migration_lock (
      id        INTEGER PRIMARY KEY,
      locked_at TEXT NOT NULL,
      owner     TEXT NOT NULL
    )
  `);
}

const LOCK_ID = 1;

export async function acquireLock(db: DbClient, opts: AcquireOptions): Promise<AcquireResult> {
  const now = new Date().toISOString();
  const orm = drizzleLibSql(db);

  // Atomic acquire via INSERT ... ON CONFLICT DO NOTHING (libSQL maps to OR IGNORE)
  const insertResult = await orm
    .insert(migrationLock)
    .values({ id: LOCK_ID, lockedAt: now, owner: opts.owner })
    .onConflictDoNothing();
  // drizzle-orm/libsql exposes rowsAffected through its result shape
  const rowsAffected = (insertResult as unknown as { rowsAffected?: number }).rowsAffected ?? 0;
  if (rowsAffected === 1) {
    return { acquired: true };
  }

  const existing = await orm
    .select({ lockedAt: migrationLock.lockedAt, owner: migrationLock.owner })
    .from(migrationLock)
    .where(eq(migrationLock.id, LOCK_ID));
  const row = existing[0];
  const heldBy = String(row?.owner ?? "unknown");
  const lockedAt = String(row?.lockedAt ?? "");

  const ageMs = Date.now() - new Date(lockedAt).getTime();
  if (Number.isFinite(ageMs) && ageMs > opts.staleMs) {
    await orm
      .update(migrationLock)
      .set({ lockedAt: now, owner: opts.owner })
      .where(eq(migrationLock.id, LOCK_ID));
    return { acquired: true, heldBy: `stolen-from:${heldBy}`, lockedAt: now };
  }

  return { acquired: false, heldBy, lockedAt };
}

export async function releaseLock(db: DbClient): Promise<void> {
  await drizzleLibSql(db).delete(migrationLock).where(eq(migrationLock.id, LOCK_ID));
}
