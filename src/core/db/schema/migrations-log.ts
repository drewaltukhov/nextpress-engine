import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const migrationsLog = sqliteTable(
  "migrations_log",
  {
    pluginSlug: text("plugin_slug").notNull(),
    migrationName: text("migration_name").notNull(),
    appliedAt: text("applied_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    appliedBy: text("applied_by"),
    executionMs: integer("execution_ms"),
    checksum: text("checksum").notNull()
  },
  (t) => ({
    pk: primaryKey({ columns: [t.pluginSlug, t.migrationName] }),
    appliedAtIdx: index("migrations_log_applied_at_idx").on(t.appliedAt)
  })
);

export type MigrationLogRow = typeof migrationsLog.$inferSelect;
