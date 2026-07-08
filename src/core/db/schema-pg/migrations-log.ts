import { pgTable, text, integer, timestamp, primaryKey, index } from "drizzle-orm/pg-core";

export const migrationsLog = pgTable(
  "migrations_log",
  {
    pluginSlug: text("plugin_slug").notNull(),
    migrationName: text("migration_name").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
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
