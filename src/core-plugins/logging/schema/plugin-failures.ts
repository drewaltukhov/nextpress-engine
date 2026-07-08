import { sqliteTable, integer, text, index, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const pluginFailures = sqliteTable(
  "plugin_failures",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pluginSlug: text("plugin_slug").notNull(),
    phase: text("phase").notNull(),
    hookName: text("hook_name"),
    errorMessage: text("error_message").notNull(),
    errorClass: text("error_class"),
    errorStack: text("error_stack"),
    context: text("context", { mode: "json" }).notNull().default(sql`('{}')`),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`)
  },
  (t) => ({
    phaseCheck: check(
      "plugin_failures_phase_check",
      sql`${t.phase} IN ('boot','migrate','register','hook','route')`
    ),
    recentIdx: index("plugin_failures_recent_idx").on(t.pluginSlug, t.createdAt)
  })
);

export type PluginFailureRow = typeof pluginFailures.$inferSelect;
