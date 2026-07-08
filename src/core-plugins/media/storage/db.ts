import type { DbClient } from "@core/db/client";
import type { MediaPutData, MediaPutResult, MediaStorage } from "./types";

/**
 * Database-backed media storage.
 *
 * The default backend. Bytes live in the `media` table's `blob_data`,
 * `thumb_data`, and `medium_data` columns; `storage_ref` mirrors the row id;
 * `thumb_mime` / `medium_mime` carry the "has variant" signals (NULL when no
 * variant of that kind was generated).
 *
 * This is a thin wrapper around the same INSERT/DELETE that the media plugin
 * has done since day one — extracted into a driver so the upload path can
 * stay backend-agnostic.
 */
export class DbStorage implements MediaStorage {
  readonly id = "db" as const;

  async put(db: DbClient, data: MediaPutData): Promise<MediaPutResult> {
    await db.execute({
      sql: `INSERT INTO media
            (id, tenant_id, filename, mime, size_bytes, width, height,
             blob_data, thumb_data, thumb_mime, medium_data, medium_mime,
             storage_backend, storage_ref, uploaded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'db', ?, ?)`,
      args: [
        data.id,
        data.tenantId,
        data.filename,
        data.mime,
        data.sizeBytes,
        data.width,
        data.height,
        data.bytes,
        data.thumb?.bytes ?? null,
        data.thumb?.mime ?? null,
        data.medium?.bytes ?? null,
        data.medium?.mime ?? null,
        data.id,
        data.uploadedBy,
      ],
    });

    return {
      ref: data.id,
      thumbMime: data.thumb?.mime ?? null,
      mediumMime: data.medium?.mime ?? null,
    };
  }

  async remove(db: DbClient, id: string, _ref: string, _hasThumb: boolean, _hasMedium?: boolean): Promise<void> {
    await db.execute({
      sql: "DELETE FROM media WHERE id = ? AND tenant_id = 1",
      args: [id],
    });
  }

  available(): boolean {
    return true;
  }
}
