import { sqliteTable, text, integer, blob, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "@core-plugins/users/schema/users";

/**
 * Media library — uploaded images/files.
 *
 * Storage abstraction: rows always carry `storage_backend` + `storage_ref`.
 * For the shipped `db` backend, `blob_data` holds the bytes and `storage_ref`
 * mirrors `id`. Future plugin backends (vercel-blob, S3, etc.) populate
 * `storage_backend = 'plugin:<slug>'`, `storage_ref = <plugin's ref>`, and
 * leave `blob_data` NULL — no schema migration needed when those land.
 */
export const media = sqliteTable(
  "media",
  {
    id: text("id").primaryKey(),
    tenantId: integer("tenant_id").notNull().default(1),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    altText: text("alt_text"),
    blobData: blob("blob_data"),
    thumbData: blob("thumb_data"),
    thumbMime: text("thumb_mime"),
    mediumData: blob("medium_data"),
    mediumMime: text("medium_mime"),
    storageBackend: text("storage_backend").notNull().default("db"),
    storageRef: text("storage_ref").notNull(),
    uploadedBy: text("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    uploadedAt: text("uploaded_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    tenantUploadedIdx: index("media_tenant_uploaded_idx").on(t.tenantId, t.uploadedAt),
    uploadedByIdx: index("media_uploaded_by_idx").on(t.uploadedBy),
  })
);

export type MediaRow = typeof media.$inferSelect;
