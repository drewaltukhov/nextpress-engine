import { pgTable, text, integer, timestamp, index, customType } from "drizzle-orm/pg-core";
import { users } from "@core-plugins/users/schema-pg/users";

const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

/**
 * Media library — uploaded images/files.
 *
 * Storage abstraction: rows always carry `storage_backend` + `storage_ref`.
 * For the shipped `db` backend, `blob_data` holds the bytes and `storage_ref`
 * mirrors `id`. Future plugin backends (vercel-blob, S3, etc.) populate
 * `storage_backend = 'plugin:<slug>'`, `storage_ref = <plugin's ref>`, and
 * leave `blob_data` NULL — no schema migration needed when those land.
 */
export const media = pgTable(
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
    blobData: bytea("blob_data"),
    thumbData: bytea("thumb_data"),
    thumbMime: text("thumb_mime"),
    mediumData: bytea("medium_data"),
    mediumMime: text("medium_mime"),
    storageBackend: text("storage_backend").notNull().default("db"),
    storageRef: text("storage_ref").notNull(),
    uploadedBy: text("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantUploadedIdx: index("media_tenant_uploaded_idx").on(t.tenantId, t.uploadedAt),
    uploadedByIdx: index("media_uploaded_by_idx").on(t.uploadedBy),
  })
);

export type MediaRow = typeof media.$inferSelect;
