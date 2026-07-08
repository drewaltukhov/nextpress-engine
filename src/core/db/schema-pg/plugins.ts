import { pgTable, text, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";

export const plugins = pgTable("plugins", {
  slug: text("slug").primaryKey(),
  version: text("version").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  failureCount: integer("failure_count").notNull().default(0),
  installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export type PluginRow = typeof plugins.$inferSelect;
export type NewPluginRow = typeof plugins.$inferInsert;
