import type { DbClient } from "@core/db/client";
import { R2Storage } from "./storage/r2";

/**
 * Storage backend migration.
 *
 * Moves media rows between the `db` and `r2` backends one batch at a time.
 * Each row's bytes get copied to the new backend, the row's `storage_backend`
 * / `storage_ref` / blob columns get updated atomically (best-effort — see
 * orphan handling below), and the source-side objects are cleaned up.
 *
 * The flow is driven from the admin UI in tight client-side loops: each call
 * processes up to `batchSize` rows and returns per-row outcomes plus the
 * remaining work. The UI keeps calling until `remaining.count` hits zero,
 * surfacing a progress bar + per-row error list as it goes.
 *
 * Orphan handling:
 *  - DB→R2: write to R2 first, then UPDATE. If UPDATE fails after R2 wrote,
 *    the R2 object becomes an orphan (logged; no automatic cleanup). The row
 *    keeps its DB-backend state so the migration is "retryable" on the next
 *    batch — it'll PUT to R2 again under a new collision-suffixed key, the
 *    first attempt's bytes stay leaked. Acceptable for a personal site.
 *  - R2→DB: fetch from R2, then UPDATE with bytes inline, then delete R2
 *    objects. If UPDATE fails, R2 objects stay (still valid; row stays r2).
 *    If delete fails, row is now db-backed and R2 has leaked objects (logged).
 */

export interface BackendStats {
  count: number;
  totalBytes: number;
}

export interface MigrationStats {
  db: BackendStats;
  r2: BackendStats;
}

export interface MigrationItemResult {
  id: string;
  filename: string;
  ok: boolean;
  error?: string;
  /** Bytes processed for this row (size_bytes of the original). */
  bytesProcessed: number;
}

export interface MigrationBatchResult {
  items: MigrationItemResult[];
  /** Remaining work on the SOURCE backend after this batch — drives the UI's progress bar. */
  remaining: BackendStats;
}

export async function getMigrationStats(db: DbClient): Promise<MigrationStats> {
  const res = await db.execute({
    sql: `SELECT storage_backend, COUNT(*) AS n, COALESCE(SUM(size_bytes), 0) AS bytes
          FROM media
          WHERE tenant_id = 1
          GROUP BY storage_backend`,
    args: [],
  });
  let dbStats: BackendStats = { count: 0, totalBytes: 0 };
  let r2Stats: BackendStats = { count: 0, totalBytes: 0 };
  for (const row of res.rows) {
    const s = { count: Number(row.n), totalBytes: Number(row.bytes) };
    if (String(row.storage_backend) === "r2") r2Stats = s;
    else if (String(row.storage_backend) === "db") dbStats = s;
  }
  return { db: dbStats, r2: r2Stats };
}

async function getBackendStats(db: DbClient, backend: "db" | "r2"): Promise<BackendStats> {
  const res = await db.execute({
    sql: `SELECT COUNT(*) AS n, COALESCE(SUM(size_bytes), 0) AS bytes
          FROM media
          WHERE tenant_id = 1 AND storage_backend = ?`,
    args: [backend],
  });
  const row = res.rows[0];
  return {
    count: row ? Number(row.n) : 0,
    totalBytes: row ? Number(row.bytes) : 0,
  };
}

/** Coerce a libSQL/PG blob column value into a Uint8Array, or null. */
function bytesFromBlob(value: unknown): Uint8Array | null {
  if (value == null) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Buffer.isBuffer(value)) return new Uint8Array(value);
  if (Array.isArray(value)) return new Uint8Array(value);
  return null;
}

export async function migrateBatchDbToR2(
  db: DbClient,
  batchSize: number
): Promise<MigrationBatchResult> {
  const r2 = new R2Storage();
  if (!r2.available()) {
    throw new Error(
      "R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and NEXT_PUBLIC_R2_PUBLIC_URL, then restart."
    );
  }

  const limit = Math.max(1, Math.min(100, batchSize));
  const res = await db.execute({
    sql: `SELECT id, filename, mime, size_bytes, uploaded_at,
                 blob_data, thumb_data, thumb_mime, medium_data, medium_mime
          FROM media
          WHERE tenant_id = 1 AND storage_backend = 'db'
          ORDER BY uploaded_at ASC, id ASC
          LIMIT ?`,
    args: [limit],
  });

  const items: MigrationItemResult[] = [];

  for (const row of res.rows) {
    const id = String(row.id);
    const filename = String(row.filename);
    const sizeBytes = Number(row.size_bytes ?? 0);

    try {
      const originalBytes = bytesFromBlob(row.blob_data);
      if (!originalBytes) throw new Error("image data is missing from the row");

      const thumb =
        row.thumb_data && row.thumb_mime
          ? {
              bytes: bytesFromBlob(row.thumb_data) ?? new Uint8Array(0),
              mime: String(row.thumb_mime),
            }
          : null;
      const medium =
        row.medium_data && row.medium_mime
          ? {
              bytes: bytesFromBlob(row.medium_data) ?? new Uint8Array(0),
              mime: String(row.medium_mime),
            }
          : null;

      const uploadedAt = row.uploaded_at ? new Date(String(row.uploaded_at)) : new Date();

      const { ref, thumbMime, mediumMime } = await r2.writeBytesOnly({
        bytes: originalBytes,
        mime: String(row.mime),
        filename,
        thumb,
        medium,
        uploadedAt: isNaN(uploadedAt.getTime()) ? new Date() : uploadedAt,
      });

      await db.execute({
        sql: `UPDATE media
              SET storage_backend = 'r2',
                  storage_ref = ?,
                  blob_data = NULL,
                  thumb_data = NULL,
                  thumb_mime = ?,
                  medium_data = NULL,
                  medium_mime = ?
              WHERE id = ? AND tenant_id = 1`,
        args: [ref, thumbMime, mediumMime, id],
      });

      items.push({ id, filename, ok: true, bytesProcessed: sizeBytes });
    } catch (err) {
      items.push({
        id,
        filename,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        bytesProcessed: 0,
      });
    }
  }

  const remaining = await getBackendStats(db, "db");
  return { items, remaining };
}

export async function migrateBatchR2ToDb(
  db: DbClient,
  batchSize: number
): Promise<MigrationBatchResult> {
  const r2 = new R2Storage();
  if (!r2.available()) {
    throw new Error("R2 storage is not configured. Set R2_* env vars first.");
  }

  const limit = Math.max(1, Math.min(100, batchSize));
  const res = await db.execute({
    sql: `SELECT id, filename, mime, size_bytes, storage_ref, thumb_mime, medium_mime
          FROM media
          WHERE tenant_id = 1 AND storage_backend = 'r2'
          ORDER BY uploaded_at ASC, id ASC
          LIMIT ?`,
    args: [limit],
  });

  const items: MigrationItemResult[] = [];

  for (const row of res.rows) {
    const id = String(row.id);
    const filename = String(row.filename);
    const sizeBytes = Number(row.size_bytes ?? 0);

    try {
      const ref = String(row.storage_ref);
      const hasThumb = row.thumb_mime != null;
      const hasMedium = row.medium_mime != null;

      const bytes = await r2.getBytes(ref);
      if (!bytes) throw new Error(`R2 object missing: ${ref}`);

      let thumbBytes: Uint8Array | null = null;
      let thumbMime: string | null = null;
      if (hasThumb) {
        const thumbKey = ref.replace(/\.[^./]+$/, "-thumb.webp");
        thumbBytes = await r2.getBytes(thumbKey);
        if (thumbBytes) thumbMime = String(row.thumb_mime);
        // If thumb is gone from R2 but row says it had one, we silently drop it —
        // the read path falls back to the original, same as DB rows with NULL thumb_data.
      }
      let mediumBytes: Uint8Array | null = null;
      let mediumMime: string | null = null;
      if (hasMedium) {
        const mediumKey = ref.replace(/\.[^./]+$/, "-medium.webp");
        mediumBytes = await r2.getBytes(mediumKey);
        if (mediumBytes) mediumMime = String(row.medium_mime);
      }

      // postgres-js requires Buffer (not Uint8Array) for bytea writes — without
      // this wrap, the column gets serialized as text and lands as garbage on
      // Supabase. Buffer.from on a Uint8Array is a zero-copy view in Node ≥ 4.
      const blobBuffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const thumbBuffer = thumbBytes
        ? Buffer.from(thumbBytes.buffer, thumbBytes.byteOffset, thumbBytes.byteLength)
        : null;
      const mediumBuffer = mediumBytes
        ? Buffer.from(mediumBytes.buffer, mediumBytes.byteOffset, mediumBytes.byteLength)
        : null;

      await db.execute({
        sql: `UPDATE media
              SET storage_backend = 'db',
                  storage_ref = ?,
                  blob_data = ?,
                  thumb_data = ?,
                  thumb_mime = ?,
                  medium_data = ?,
                  medium_mime = ?
              WHERE id = ? AND tenant_id = 1`,
        args: [id, blobBuffer, thumbBuffer, thumbMime, mediumBuffer, mediumMime, id],
      });

      // Verify the bytea write actually landed at the right size before we
      // delete the R2 source objects. A driver-level type mismatch can silently
      // write 0 bytes to bytea columns (e.g. passing Uint8Array instead of
      // Buffer on some postgres-js versions); without this guard, the R2
      // cleanup that follows would orphan the only copy.
      const verify = await db.execute({
        sql: `SELECT
                COALESCE(LENGTH(blob_data), 0) AS blob_len,
                COALESCE(LENGTH(thumb_data), 0) AS thumb_len,
                COALESCE(LENGTH(medium_data), 0) AS medium_len
              FROM media WHERE id = ? AND tenant_id = 1`,
        args: [id],
      });
      const written = verify.rows[0];
      const blobLen = written ? Number(written.blob_len) : 0;
      const thumbLen = written ? Number(written.thumb_len) : 0;
      const mediumLen = written ? Number(written.medium_len) : 0;
      const blobMismatch = blobLen !== blobBuffer.byteLength;
      const thumbMismatch = thumbBuffer != null && thumbLen !== thumbBuffer.byteLength;
      const mediumMismatch = mediumBuffer != null && mediumLen !== mediumBuffer.byteLength;
      if (blobMismatch || thumbMismatch || mediumMismatch) {
        // Roll the row back to its R2-backed state so the file stays viewable
        // while the user retries. R2 objects are still in place — we only
        // delete them after this verification passes.
        await db.execute({
          sql: `UPDATE media
                SET storage_backend = 'r2',
                    storage_ref = ?,
                    blob_data = NULL,
                    thumb_data = NULL,
                    medium_data = NULL
                WHERE id = ? AND tenant_id = 1`,
          args: [ref, id],
        });
        const why = blobMismatch
          ? `blob_data length ${blobLen} ≠ expected ${blobBuffer.byteLength}`
          : thumbMismatch
            ? `thumb_data length ${thumbLen} ≠ expected ${thumbBuffer!.byteLength}`
            : `medium_data length ${mediumLen} ≠ expected ${mediumBuffer!.byteLength}`;
        throw new Error(`DB write verification failed: ${why}. Row reverted to R2.`);
      }

      // Best-effort R2 cleanup. Failure here leaves orphans but doesn't roll back
      // the migration (the bytes are now safely in the DB AND verified).
      r2.deleteObjects(ref, hasThumb, hasMedium).catch((err) => {
        console.warn(`migrateBatchR2ToDb: cleanup failed for ${id}:`, err);
      });

      items.push({ id, filename, ok: true, bytesProcessed: sizeBytes });
    } catch (err) {
      items.push({
        id,
        filename,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        bytesProcessed: 0,
      });
    }
  }

  const remaining = await getBackendStats(db, "r2");
  return { items, remaining };
}
