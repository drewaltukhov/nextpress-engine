import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const reservedSlugs = sqliteTable(
  "reserved_slugs",
  {
    slug: text("slug").notNull(),
    tenantId: integer("tenant_id").notNull().default(1),
    source: text("source").notNull(),
    reason: text("reason").notNull(),
    addedBy: text("added_by"),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`)
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.slug] }),
    sourceIdx: index("reserved_slugs_source_idx").on(t.source)
  })
);

export type ReservedSlugRow = typeof reservedSlugs.$inferSelect;
