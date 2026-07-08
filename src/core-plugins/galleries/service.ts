/**
 * Galleries service — named, ordered sets of media.
 *
 * `item_count` and `cover_media_id` are denormalized for the list view.
 * They're maintained app-side (not via triggers) so the writes go through
 * the same DB client and the audit log can stamp who did what. Every
 * mutation that changes membership also bumps `updated_at`.
 *
 * Slugs go through `normalizeSlug` and check the global `reserved_slugs`
 * registry — same guard as topics / users / pages. The slug is unique per
 * tenant, not globally, so the same slug can exist in another tenant.
 */
import type { DbClient } from "@core/db/client";
import { normalizeSlug } from "@core/slugs/normalize";
import { isSlugReserved } from "@core/slugs/registry";
import type { MediaSummary } from "@core-plugins/media/service";
import { computeContentVersion } from "@core-plugins/media/service";

export class GallerySlugConflictError extends Error {
  constructor(slug: string) {
    super(`A gallery with slug "${slug}" already exists`);
    this.name = "GallerySlugConflictError";
  }
}

export class GallerySlugReservedError extends Error {
  constructor(slug: string) {
    super(`Slug "${slug}" is reserved and can't be used as a gallery`);
    this.name = "GallerySlugReservedError";
  }
}

export class GalleryNotFoundError extends Error {
  constructor(id: number) {
    super(`Gallery ${id} not found`);
    this.name = "GalleryNotFoundError";
  }
}

export interface GalleryListItem {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  coverMediaId: string | null;
  /** Cover media's backend — null when there's no cover. */
  coverStorageBackend: "db" | "r2" | null;
  /** Cover media's storage_ref — null when there's no cover. */
  coverStorageRef: string | null;
  /** Whether the cover media has a thumb variant available. */
  coverHasThumb: boolean;
  /** Cover media's content-version hash for cache-busting after storage migration. */
  coverContentVersion: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GalleryItem {
  mediaId: string;
  position: number;
  caption: string | null;
  filename: string;
  mime: string;
  altText: string | null;
  width: number | null;
  height: number | null;
  /** Storage backend of this gallery item — drives URL construction. */
  storageBackend: "db" | "r2";
  storageRef: string;
  hasThumb: boolean;
  /** Whether this gallery item has a medium (≤1280px) variant — drives carousel-slide URL building. */
  hasMedium: boolean;
  /** Content-version hash for cache-busting after storage migration. */
  contentVersion: string;
}

export interface GalleryDetail extends GalleryListItem {
  items: GalleryItem[];
}

export interface CreateGalleryInput {
  name: string;
  slug?: string;
  description?: string | null;
  createdBy?: string | null;
}

export interface UpdateGalleryInput {
  name?: string;
  slug?: string;
  description?: string | null;
  coverMediaId?: string | null;
}

const MAX_NAME = 100;
const MAX_DESCRIPTION = 1000;
const MAX_SLUG = 100;
const MAX_CAPTION = 500;

function rowToListItem(row: Record<string, unknown>): GalleryListItem {
  const coverMediaId = row.cover_media_id != null ? String(row.cover_media_id) : null;
  const coverBackendRaw = row.cover_storage_backend != null ? String(row.cover_storage_backend) : null;
  const coverStorageBackend: "db" | "r2" | null = coverBackendRaw === "r2" ? "r2" : coverMediaId ? "db" : null;
  const coverStorageRef = row.cover_storage_ref != null ? String(row.cover_storage_ref) : coverMediaId;
  return {
    id: Number(row.id),
    name: String(row.name),
    slug: String(row.slug),
    description: row.description != null ? String(row.description) : null,
    coverMediaId,
    coverStorageBackend,
    coverStorageRef,
    coverHasThumb: row.cover_thumb_mime != null,
    coverContentVersion:
      coverStorageBackend && coverStorageRef
        ? computeContentVersion(coverStorageBackend, coverStorageRef)
        : "",
    itemCount: Number(row.item_count),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

// `item_count` and `cover_media_id` are denormalized but write-only sources
// of truth — cascade deletes on `media` bypass the app paths that maintain
// them, leaving the columns stale. Compute both live on read so callers
// always see truth even after a media row was removed via the library:
//   - item_count → COUNT(gallery_items) for this gallery
//   - cover     → COALESCE(stored cover, first item by position)
// The COALESCE on cover also handles the FK SET NULL case (cover got
// cascade-cleared) by promoting whatever's left.
//
// The cover's storage backend / ref / thumb_mime are fetched alongside so the
// list renderer can build a URL via getMediaPublicUrl without a second query.
const SELECT_GALLERY_FIELDS = `
  g.id, g.name, g.slug, g.description,
  COALESCE(
    g.cover_media_id,
    (SELECT gi.media_id FROM gallery_items gi
     WHERE gi.gallery_id = g.id
     ORDER BY gi.position ASC, gi.media_id ASC
     LIMIT 1)
  ) AS cover_media_id,
  (SELECT m.storage_backend FROM media m WHERE m.id = COALESCE(
    g.cover_media_id,
    (SELECT gi.media_id FROM gallery_items gi
     WHERE gi.gallery_id = g.id
     ORDER BY gi.position ASC, gi.media_id ASC
     LIMIT 1)
  ) AND m.tenant_id = 1) AS cover_storage_backend,
  (SELECT m.storage_ref FROM media m WHERE m.id = COALESCE(
    g.cover_media_id,
    (SELECT gi.media_id FROM gallery_items gi
     WHERE gi.gallery_id = g.id
     ORDER BY gi.position ASC, gi.media_id ASC
     LIMIT 1)
  ) AND m.tenant_id = 1) AS cover_storage_ref,
  (SELECT m.thumb_mime FROM media m WHERE m.id = COALESCE(
    g.cover_media_id,
    (SELECT gi.media_id FROM gallery_items gi
     WHERE gi.gallery_id = g.id
     ORDER BY gi.position ASC, gi.media_id ASC
     LIMIT 1)
  ) AND m.tenant_id = 1) AS cover_thumb_mime,
  (SELECT COUNT(*) FROM gallery_items gi WHERE gi.gallery_id = g.id) AS item_count,
  g.created_at, g.updated_at
`;

export async function listGalleries(db: DbClient): Promise<GalleryListItem[]> {
  const r = await db.execute({
    sql: `SELECT ${SELECT_GALLERY_FIELDS}
          FROM galleries g
          WHERE g.tenant_id = 1
          ORDER BY g.updated_at DESC, g.id DESC`,
    args: [],
  });
  return r.rows.map(rowToListItem);
}

export async function getGallery(db: DbClient, id: number): Promise<GalleryDetail | null> {
  const headRes = await db.execute({
    sql: `SELECT ${SELECT_GALLERY_FIELDS}
          FROM galleries g
          WHERE g.tenant_id = 1 AND g.id = ?
          LIMIT 1`,
    args: [id],
  });
  const head = headRes.rows[0];
  if (!head) return null;

  const itemsRes = await db.execute({
    sql: `SELECT gi.media_id, gi.position, gi.caption,
                 m.filename, m.mime, m.alt_text, m.width, m.height,
                 m.storage_backend, m.storage_ref, m.thumb_mime, m.medium_mime
          FROM gallery_items gi
          JOIN media m ON m.id = gi.media_id AND m.tenant_id = 1
          WHERE gi.gallery_id = ?
          ORDER BY gi.position ASC, gi.media_id ASC`,
    args: [id],
  });

  const items: GalleryItem[] = itemsRes.rows.map((r) => {
    const storageBackend: "db" | "r2" = String(r.storage_backend) === "r2" ? "r2" : "db";
    const storageRef = r.storage_ref ? String(r.storage_ref) : String(r.media_id);
    return {
      mediaId: String(r.media_id),
      position: Number(r.position),
      caption: r.caption != null ? String(r.caption) : null,
      filename: String(r.filename),
      mime: String(r.mime),
      altText: r.alt_text != null ? String(r.alt_text) : null,
      width: r.width != null ? Number(r.width) : null,
      height: r.height != null ? Number(r.height) : null,
      storageBackend,
      storageRef,
      hasThumb: r.thumb_mime != null,
      hasMedium: r.medium_mime != null,
      contentVersion: computeContentVersion(storageBackend, storageRef),
    };
  });

  return { ...rowToListItem(head), items };
}

async function slugExists(db: DbClient, slug: string, exceptId?: number): Promise<boolean> {
  const r = await db.execute({
    sql: exceptId
      ? "SELECT 1 FROM galleries WHERE tenant_id = 1 AND slug = ? AND id != ? LIMIT 1"
      : "SELECT 1 FROM galleries WHERE tenant_id = 1 AND slug = ? LIMIT 1",
    args: exceptId ? [slug, exceptId] : [slug],
  });
  return r.rows.length > 0;
}

export async function createGallery(db: DbClient, input: CreateGalleryInput): Promise<number> {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");
  if (name.length > MAX_NAME) throw new Error(`Name must be at most ${MAX_NAME} characters`);

  const description = input.description?.trim() || null;
  if (description && description.length > MAX_DESCRIPTION) {
    throw new Error(`Description must be at most ${MAX_DESCRIPTION} characters`);
  }

  const requestedSlug = input.slug?.trim() || name;
  const slug = normalizeSlug(requestedSlug);
  if (!slug) throw new Error("Slug must contain at least one alphanumeric character");
  if (slug.length > MAX_SLUG) throw new Error(`Slug must be at most ${MAX_SLUG} characters`);
  if (await isSlugReserved(db, slug)) throw new GallerySlugReservedError(slug);
  if (await slugExists(db, slug)) throw new GallerySlugConflictError(slug);

  const r = await db.execute({
    sql: `INSERT INTO galleries (tenant_id, name, slug, description, created_by)
          VALUES (1, ?, ?, ?, ?)
          RETURNING id`,
    args: [name, slug, description, input.createdBy ?? null],
  });
  return Number(r.rows[0]?.id);
}

export async function updateGallery(
  db: DbClient,
  id: number,
  input: UpdateGalleryInput,
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Name is required");
    if (name.length > MAX_NAME) throw new Error(`Name must be at most ${MAX_NAME} characters`);
    sets.push("name = ?");
    args.push(name);
  }

  if (input.slug !== undefined) {
    const slug = normalizeSlug(input.slug);
    if (!slug) throw new Error("Slug must contain at least one alphanumeric character");
    if (slug.length > MAX_SLUG) throw new Error(`Slug must be at most ${MAX_SLUG} characters`);
    if (await isSlugReserved(db, slug)) throw new GallerySlugReservedError(slug);
    if (await slugExists(db, slug, id)) throw new GallerySlugConflictError(slug);
    sets.push("slug = ?");
    args.push(slug);
  }

  if (input.description !== undefined) {
    const description = input.description?.trim() || null;
    if (description && description.length > MAX_DESCRIPTION) {
      throw new Error(`Description must be at most ${MAX_DESCRIPTION} characters`);
    }
    sets.push("description = ?");
    args.push(description);
  }

  if (input.coverMediaId !== undefined) {
    if (input.coverMediaId !== null) {
      // Cover must be a member of this gallery — keeps the denormalization sane.
      const r = await db.execute({
        sql: "SELECT 1 FROM gallery_items WHERE gallery_id = ? AND media_id = ? LIMIT 1",
        args: [id, input.coverMediaId],
      });
      if (r.rows.length === 0) {
        throw new Error("Cover image must be an item already in this gallery");
      }
    }
    sets.push("cover_media_id = ?");
    args.push(input.coverMediaId);
  }

  if (sets.length === 0) return;

  sets.push("updated_at = CURRENT_TIMESTAMP");
  args.push(id);

  await db.execute({
    sql: `UPDATE galleries SET ${sets.join(", ")} WHERE tenant_id = 1 AND id = ?`,
    args,
  });
}

export async function deleteGallery(db: DbClient, id: number): Promise<void> {
  // gallery_items rows cascade via FK; media rows are left alone.
  await db.execute({
    sql: "DELETE FROM galleries WHERE tenant_id = 1 AND id = ?",
    args: [id],
  });
}

/**
 * Append the given media items to the end of the gallery in the order
 * supplied. Existing members are skipped silently (no duplicates). Returns
 * the number of rows actually inserted.
 *
 * Auto-picks the first inserted row as cover when the gallery has none yet
 * — matches the "defer the cover picker, derive from first item" call
 * Drew made when scoping #22.
 */
export async function addItemsToGallery(
  db: DbClient,
  galleryId: number,
  mediaIds: string[],
): Promise<number> {
  if (mediaIds.length === 0) return 0;

  // Validate the gallery exists up-front so we don't insert items into a
  // hole the cover-update step will fail on later.
  const head = await db.execute({
    sql: "SELECT id, cover_media_id FROM galleries WHERE tenant_id = 1 AND id = ? LIMIT 1",
    args: [galleryId],
  });
  if (head.rows.length === 0) throw new GalleryNotFoundError(galleryId);
  const currentCover = head.rows[0].cover_media_id != null ? String(head.rows[0].cover_media_id) : null;

  // Find the current max position so appends don't collide.
  const maxRes = await db.execute({
    sql: "SELECT COALESCE(MAX(position), -1) AS max_pos FROM gallery_items WHERE gallery_id = ?",
    args: [galleryId],
  });
  let nextPos = Number(maxRes.rows[0]?.max_pos ?? -1) + 1;

  // Existing membership check — skip dupes without surfacing an error.
  const placeholders = mediaIds.map(() => "?").join(",");
  const existingRes = await db.execute({
    sql: `SELECT media_id FROM gallery_items
          WHERE gallery_id = ? AND media_id IN (${placeholders})`,
    args: [galleryId, ...mediaIds],
  });
  const existing = new Set(existingRes.rows.map((r) => String(r.media_id)));

  // Confirm media rows exist + belong to this tenant before insert. Anything
  // missing is dropped silently — clients shouldn't be sending stale ids,
  // but if they do we'd rather skip than 500.
  const validRes = await db.execute({
    sql: `SELECT id FROM media WHERE tenant_id = 1 AND id IN (${placeholders})`,
    args: mediaIds,
  });
  const valid = new Set(validRes.rows.map((r) => String(r.id)));

  let inserted = 0;
  let firstInserted: string | null = null;
  for (const mediaId of mediaIds) {
    if (existing.has(mediaId) || !valid.has(mediaId)) continue;
    await db.execute({
      sql: `INSERT INTO gallery_items (gallery_id, media_id, position, caption)
            VALUES (?, ?, ?, NULL)`,
      args: [galleryId, mediaId, nextPos++],
    });
    inserted++;
    if (firstInserted === null) firstInserted = mediaId;
  }

  if (inserted > 0) {
    const coverUpdate = currentCover === null && firstInserted !== null;
    await db.execute({
      sql: coverUpdate
        ? `UPDATE galleries
             SET item_count = item_count + ?,
                 cover_media_id = ?,
                 updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = 1 AND id = ?`
        : `UPDATE galleries
             SET item_count = item_count + ?,
                 updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = 1 AND id = ?`,
      args: coverUpdate ? [inserted, firstInserted, galleryId] : [inserted, galleryId],
    });
  }

  return inserted;
}

export async function removeItemFromGallery(
  db: DbClient,
  galleryId: number,
  mediaId: string,
): Promise<void> {
  const head = await db.execute({
    sql: "SELECT cover_media_id FROM galleries WHERE tenant_id = 1 AND id = ? LIMIT 1",
    args: [galleryId],
  });
  if (head.rows.length === 0) throw new GalleryNotFoundError(galleryId);
  const currentCover = head.rows[0].cover_media_id != null ? String(head.rows[0].cover_media_id) : null;

  const del = await db.execute({
    sql: "DELETE FROM gallery_items WHERE gallery_id = ? AND media_id = ?",
    args: [galleryId, mediaId],
  });
  if (del.rowsAffected === 0) return;

  // If we just removed the cover, promote the next-position item (or NULL
  // when the gallery is now empty).
  let coverUpdate = "";
  const args: (string | number | null)[] = [galleryId];
  if (currentCover === mediaId) {
    const replacement = await db.execute({
      sql: `SELECT media_id FROM gallery_items
            WHERE gallery_id = ?
            ORDER BY position ASC, media_id ASC
            LIMIT 1`,
      args: [galleryId],
    });
    const newCover = replacement.rows[0]?.media_id != null ? String(replacement.rows[0].media_id) : null;
    coverUpdate = ", cover_media_id = ?";
    args.unshift(newCover);
  }

  await db.execute({
    sql: `UPDATE galleries
            SET item_count = MAX(item_count - 1, 0)${coverUpdate},
                updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = 1 AND id = ?`,
    args,
  });
}

/**
 * Replace the gallery's positions with the given ordering. Any media id in
 * `orderedIds` that isn't currently a member is skipped. Items not present
 * in the list keep their existing positions (callers should always pass the
 * full ordering — partial reorders are unsupported).
 */
export async function reorderGalleryItems(
  db: DbClient,
  galleryId: number,
  orderedIds: string[],
): Promise<void> {
  if (orderedIds.length === 0) return;

  // Validate gallery + load current membership in one round-trip apiece.
  const head = await db.execute({
    sql: "SELECT id FROM galleries WHERE tenant_id = 1 AND id = ? LIMIT 1",
    args: [galleryId],
  });
  if (head.rows.length === 0) throw new GalleryNotFoundError(galleryId);

  const memberRes = await db.execute({
    sql: "SELECT media_id FROM gallery_items WHERE gallery_id = ?",
    args: [galleryId],
  });
  const members = new Set(memberRes.rows.map((r) => String(r.media_id)));

  let pos = 0;
  for (const mediaId of orderedIds) {
    if (!members.has(mediaId)) continue;
    await db.execute({
      sql: "UPDATE gallery_items SET position = ? WHERE gallery_id = ? AND media_id = ?",
      args: [pos++, galleryId, mediaId],
    });
  }

  await db.execute({
    sql: "UPDATE galleries SET updated_at = CURRENT_TIMESTAMP WHERE tenant_id = 1 AND id = ?",
    args: [galleryId],
  });
}

export async function setGalleryItemCaption(
  db: DbClient,
  galleryId: number,
  mediaId: string,
  caption: string | null,
): Promise<void> {
  const trimmed = caption?.trim() || null;
  if (trimmed && trimmed.length > MAX_CAPTION) {
    throw new Error(`Caption must be at most ${MAX_CAPTION} characters`);
  }
  await db.execute({
    sql: "UPDATE gallery_items SET caption = ? WHERE gallery_id = ? AND media_id = ?",
    args: [trimmed, galleryId, mediaId],
  });
  await db.execute({
    sql: "UPDATE galleries SET updated_at = CURRENT_TIMESTAMP WHERE tenant_id = 1 AND id = ?",
    args: [galleryId],
  });
}

// Re-exported so the admin layer doesn't have to import from media/service
// just to render gallery items.
export type { MediaSummary };
