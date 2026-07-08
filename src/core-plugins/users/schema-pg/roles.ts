import { pgTable, text, integer, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const roles = pgTable("roles", {
  slug: text("slug").primaryKey(),
  label: text("label").notNull(),
  // Postgres TEXT[] mapped to JSON array of permission strings.
  permissions: jsonb("permissions")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  sessionMaxAgeDays: integer("session_max_age_days"),       // null = use site_settings default
  // Permissions that require fresh credential (sudo / step-up). Plugins extend this list.
  requireStepUp: jsonb("require_step_up")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`)
});

export type RoleRow = typeof roles.$inferSelect;
