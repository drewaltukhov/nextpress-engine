import { pgTable, text, integer, serial, timestamp, uuid, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core";
import { users } from "@core-plugins/users/schema-pg/users";
import { media } from "@core-plugins/media/schema-pg/media";

export const galleries = pgTable(
  "galleries",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull().default(1),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    coverMediaId: text("cover_media_id").references(() => media.id, { onDelete: "set null" }),
    itemCount: integer("item_count").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex("galleries_slug_unique").on(t.tenantId, t.slug),
    updatedIdx: index("galleries_updated_idx").on(t.tenantId, t.updatedAt),
  }),
);

export const galleryItems = pgTable(
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
