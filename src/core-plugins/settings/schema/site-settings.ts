import { sqliteTable, text, integer, index, primaryKey, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "@core-plugins/users/schema/users";

export const siteSettings = sqliteTable(
  "site_settings",
  {
    tenantId: integer("tenant_id").notNull().default(1),
    key: text("key").notNull(),
    value: text("value", { mode: "json" }).notNull(),          // JSONB in spec, JSON text in SQLite
    autoload: integer("autoload", { mode: "boolean" }).notNull().default(false),
    scope: text("scope").notNull().default("private"),         // 'public' | 'private'
    encrypted: integer("encrypted", { mode: "boolean" }).notNull().default(false),
    updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`)
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.key] }),
    autoloadIdx: index("site_settings_autoload_idx")
      .on(t.tenantId)
      .where(sql`${t.autoload} = 1`),
    scopeCheck: check("site_settings_scope_check", sql`${t.scope} IN ('public','private')`)
  })
);

export type SiteSettingRow = typeof siteSettings.$inferSelect;
