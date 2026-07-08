import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const plugins = sqliteTable("plugins", {
  slug: text("slug").primaryKey(),
  version: text("version").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  settings: text("settings", { mode: "json" }).notNull().default(sql`('{}')`),
  failureCount: integer("failure_count").notNull().default(0),
  installedAt: text("installed_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`)
});

export type PluginRow = typeof plugins.$inferSelect;
export type NewPluginRow = typeof plugins.$inferInsert;
