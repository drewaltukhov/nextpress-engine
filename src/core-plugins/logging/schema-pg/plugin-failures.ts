import { pgTable, serial, text, jsonb, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const pluginFailures = pgTable(
  "plugin_failures",
  {
    id: serial("id").primaryKey(),
    pluginSlug: text("plugin_slug").notNull(),
    phase: text("phase").notNull(),
    hookName: text("hook_name"),
    errorMessage: text("error_message").notNull(),
    errorClass: text("error_class"),
    errorStack: text("error_stack"),
    context: jsonb("context").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
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
