import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

/**
 * Single-row table used as an advisory lock for the migration runner.
 * Acquired via INSERT OR IGNORE; released via DELETE on completion.
 */
export const migrationLock = sqliteTable("migration_lock", {
  id: integer("id").primaryKey(),
  lockedAt: text("locked_at").notNull(),
  owner: text("owner").notNull()
});
