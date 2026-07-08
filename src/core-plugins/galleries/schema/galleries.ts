import { sqliteTable, text, integer, uniqueIndex, index, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "@core-plugins/users/schema/users";
import { media } from "@core-plugins/media/schema/media";

export const galleries = sqliteTable(
  "galleries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: integer("tenant_id").notNull().default(1),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    coverMediaId: text("cover_media_id").references(() => media.id, { onDelete: "set null" }),
    itemCount: integer("item_count").notNull().default(0),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    slugUnique: uniqueIndex("galleries_slug_unique").on(t.tenantId, t.slug),
    updatedIdx: index("galleries_updated_idx").on(t.tenantId, t.updatedAt),
  }),
);

export const galleryItems = sqliteTable(
  "gallery_items",
  {
    galleryId: integer("gallery_id")
      .notNull()
      .references(() => galleries.id, { onDelete: "cascade" }),
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    caption: text("caption"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.galleryId, t.mediaId] }),
    positionIdx: index("gallery_items_position_idx").on(t.galleryId, t.position),
  }),
);

export type GalleryRow = typeof galleries.$inferSelect;
export type NewGalleryRow = typeof galleries.$inferInsert;
export type GalleryItemRow = typeof galleryItems.$inferSelect;
