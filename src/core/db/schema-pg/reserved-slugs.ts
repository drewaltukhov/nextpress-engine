import { pgTable, text, integer, timestamp, primaryKey, index } from "drizzle-orm/pg-core";

export const reservedSlugs = pgTable(
  "reserved_slugs",
  {
    slug: text("slug").notNull(),
    tenantId: integer("tenant_id").notNull().default(1),
    source: text("source").notNull(),
    reason: text("reason").notNull(),
    addedBy: text("added_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.slug] }),
    sourceIdx: index("reserved_slugs_source_idx").on(t.source)
  })
);

export type ReservedSlugRow = typeof reservedSlugs.$inferSelect;
