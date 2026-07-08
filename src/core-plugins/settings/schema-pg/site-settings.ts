import { pgTable, text, integer, boolean, jsonb, timestamp, index, primaryKey, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "@core-plugins/users/schema-pg/users";

export const siteSettings = pgTable(
  "site_settings",
  {
    tenantId: integer("tenant_id").notNull().default(1),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),          // JSONB in spec, JSON text in SQLite
    autoload: boolean("autoload").notNull().default(false),
    scope: text("scope").notNull().default("private"),         // 'public' | 'private'
    encrypted: boolean("encrypted").notNull().default(false),
    updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.key] }),
    autoloadIdx: index("site_settings_autoload_idx")
      .on(t.tenantId)
      .where(sql`${t.autoload} = true`),
    scopeCheck: check("site_settings_scope_check", sql`${t.scope} IN ('public','private')`)
  })
);

export type SiteSettingRow = typeof siteSettings.$inferSelect;
