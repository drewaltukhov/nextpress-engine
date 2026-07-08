import { pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Single-row table used as an advisory lock for the migration runner.
 * Acquired via INSERT ... ON CONFLICT DO NOTHING; released via DELETE on completion.
 */
export const migrationLock = pgTable("migration_lock", {
  id: integer("id").primaryKey(),
  lockedAt: timestamp("locked_at", { withTimezone: true }).notNull(),
  owner: text("owner").notNull()
});

export type MigrationLockRow = typeof migrationLock.$inferSelect;
