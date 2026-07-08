import { pgTable, text, integer, serial, boolean, timestamp, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "@core-plugins/users/schema-pg/users";

export const redirects = pgTable(
  "redirects",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull().default(1),
    fromPath: text("from_path").notNull(),
    toPath: text("to_path").notNull(),
    status: integer("status").notNull().default(301),
    source: text("source").notNull().default("manual"),
    hitCount: integer("hit_count").notNull().default(0),
    lastHitAt: text("last_hit_at"),
    active: boolean("active").notNull().default(true),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: text("expires_at"),
    notes: text("notes")
  },
  (t) => ({
    pathUnique: uniqueIndex("redirects_path_unique").on(t.tenantId, t.fromPath),
    activeIdx: index("redirects_active_idx")
      .on(t.tenantId, t.fromPath)
      .where(sql`${t.active} = true`),
    statusCheck: check("redirects_status_check", sql`${t.status} IN (301, 302, 307, 308, 410)`),
    sourceCheck: check("redirects_source_check", sql`${t.source} IN ('manual','permalink_change','slug_change','media_rename')`)
  })
);

export type RedirectRow = typeof redirects.$inferSelect;
export type NewRedirectRow = typeof redirects.$inferInsert;
