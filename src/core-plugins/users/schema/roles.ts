import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const roles = sqliteTable("roles", {
  slug: text("slug").primaryKey(),
  label: text("label").notNull(),
  // Postgres TEXT[] mapped to JSON array of permission strings.
  permissions: text("permissions", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`('[]')`),
  sessionMaxAgeDays: integer("session_max_age_days"),       // null = use site_settings default
  // Permissions that require fresh credential (sudo / step-up). Plugins extend this list.
  requireStepUp: text("require_step_up", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`('[]')`)
});

export type RoleRow = typeof roles.$inferSelect;
