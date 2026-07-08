import { randomUUID } from "node:crypto";
import type { DbClient } from "@core/db/client";
import { getSetting } from "@core-plugins/settings/registry";
import { readImageDimensions } from "./dimensions";
import { compactToWebp, generateMedium, generateThumbnail, resizeOriginal } from "./resize";
import { DbStorage } from "./storage/db";
import { R2Storage } from "./storage/r2";
import type { MediaStorage, StorageBackendId } from "./storage/types";

export interface MediaSummary {
  id: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  uploadedBy: string | null;
  uploadedAt: string;
  /** Which backend wrote this row's bytes — drives URL construction at render time. */
  storageBackend: StorageBackendId;
  /** Backend-specific ref. For db: mirrors id. For r2: the object key. */
  storageRef: string;
  /** True iff a thumb was generated and stored for this row. Drives the variant-fallback in getMediaPublicUrl. */
  hasThumb: boolean;
  /** True iff a medium (≤1280px) variant was generated and stored. Drives the variant-fallback in getMediaPublicUrl. */
  hasMedium: boolean;
  /**
   * Short hash of storage_backend + storage_ref. Embedded as `?v=` in public
   * URLs by getMediaPublicUrl so that a backend migration busts cached
   * responses without requiring viewers to hard-refresh.
   */
  contentVersion: string;
}

/**
 * Short, sync, non-cryptographic hash (djb2 → base36) used to version media URLs.
 * Stable per (storage_backend, storage_ref) tuple — changes when migration
 * flips the backend or the ref, identical otherwise. Not security-relevant.
 */
export function computeContentVersion(storageBackend: string, storageRef: string): string {
  const input = `${storageBackend}:${storageRef}`;
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h * 33) ^ input.charCodeAt(i)) >>> 0;
  }
  return h.toString(36).slice(0, 8);
}

export interface MediaSettings {
  allowedMimeTypes: string[];
  maxFileSizeMb: number;
  convertToWebp: boolean;
  storageBackend: StorageBackendId;
}

export async function readMediaSettings(db: DbClient): Promise<MediaSettings> {
  const [allowed, maxMb, convert, backend] = await Promise.all([
    getSetting<string[]>(db, "media.allowed_mime_types"),
    getSetting<number>(db, "media.max_file_size_mb"),
    getSetting<boolean>(db, "media.convert_to_webp"),
    getSetting<StorageBackendId>(db, "media.storage_backend"),
  ]);
  return {
    allowedMimeTypes: Array.isArray(allowed) && allowed.length > 0
      ? allowed
      : ["image/jpeg", "image/png", "image/webp"],
    maxFileSizeMb: typeof maxMb === "number" && maxMb > 0 ? maxMb : 5,
    convertToWebp: typeof convert === "boolean" ? convert : true,
    storageBackend: backend === "r2" ? "r2" : "db",
  };
}

/**
 * Pick the active storage driver based on `media.storage_backend`.
 * R2 selection requires `R2Storage.available()` — caller checks the returned
 * driver's `available()` to decide whether to proceed or refuse the upload.
 */
export function getActiveStorage(backend: StorageBackendId): MediaStorage {
  return backend === "r2" ? new R2Storage() : new DbStorage();
}

export interface UploadInput {
  filename: string;
  mime: string;
  bytes: Buffer;
  uploadedBy: string | null;
}

export interface UploadResult {
  ok: true;
  media: MediaSummary;
}

export interface UploadFailure {
  ok: false;
  error: string;
}

/**
 * Sanitize a filename so it's safe to store and serve. Strips path separators,
 * NULs, control chars; trims length; preserves the extension.
 */
function sanitizeFilename(raw: string): string {
  const trimmed = raw.trim().replace(/[/\\\x00-\x1F]/g, "_").slice(0, 200);
  return trimmed.length > 0 ? trimmed : "file";
}

export async function uploadMedia(
  db: DbClient,
  input: UploadInput,
  settings: MediaSettings
): Promise<UploadResult | UploadFailure> {
  // Reject oversize uploads before re-encoding so we don't burn CPU on
  // files we'd discard anyway. The check uses the *uploaded* size, not
  // the post-conversion size — the limit is on what the user sent.
  const maxBytes = settings.maxFileSizeMb * 1024 * 1024;
  if (input.bytes.byteLength > maxBytes) {
    return {
      ok: false,
      error: `File exceeds ${settings.maxFileSizeMb} MB limit`,
    };
  }

  let mime = input.mime;
  let bytes: Buffer | Uint8Array = input.bytes;
  let filename = input.filename;

  // Auto-compact JPEG / BMP → WebP. Skipped silently if conversion fails
  // or the user's allow-list excludes WebP (in which case we'd reject the
  // result below anyway, so leaving the original gives a clearer error).
  if (
    settings.convertToWebp &&
    (mime === "image/jpeg" || mime === "image/bmp") &&
    settings.allowedMimeTypes.includes("image/webp")
  ) {
    const compressed = await compactToWebp(input.bytes);
    if (compressed) {
      mime = "image/webp";
      bytes = compressed.data;
      filename = filename.replace(/\.(jpe?g|bmp)$/i, ".webp");
    }
  }

  if (!settings.allowedMimeTypes.includes(mime)) {
    return {
      ok: false,
      error: `${mime} is not in the allowed list (${settings.allowedMimeTypes.join(", ")})`,
    };
  }

  // Cap the original at 1920px longest edge to keep storage + bandwidth
  // bounded. SVG-skip because vector content has nothing to resample. Failure
  // is silent — the pre-resize buffer is used.
  if (mime !== "image/svg+xml") {
    const resized = await resizeOriginal(bytes, mime);
    if (resized) bytes = resized.data;
  }

  // Pick the active storage backend. R2 selection that lacks env is treated
  // as a hard error here (no silent fallback to DB) so the admin sees the
  // config mismatch immediately.
  const backend = getActiveStorage(settings.storageBackend);
  if (backend.id === "r2" && !backend.available()) {
    return {
      ok: false,
      error:
        "R2 storage is enabled but R2 credentials are missing or incomplete. Update env or switch storage to Database in Media → Settings.",
    };
  }

  const id = randomUUID();
  filename = sanitizeFilename(filename);
  const dims = readImageDimensions(bytes);

  // Generate variants in parallel. SVG is vector and doesn't need either
  // (the original IS already crisp at any size). Failures are silent — the
  // row goes in without that variant's data/mime and the read path falls
  // back to the original.
  const [thumb, medium] = mime === "image/svg+xml"
    ? [null, null]
    : await Promise.all([generateThumbnail(bytes), generateMedium(bytes)]);

  let put;
  try {
    put = await backend.put(db, {
      id,
      tenantId: 1,
      filename,
      mime,
      sizeBytes: bytes.byteLength,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      uploadedBy: input.uploadedBy,
      bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
      thumb: thumb ? { bytes: new Uint8Array(thumb.data), mime: thumb.mime } : null,
      medium: medium ? { bytes: new Uint8Array(medium.data), mime: medium.mime } : null,
    });
  } catch (err) {
    // Backend put failed — usually an R2 SDK error (auth, network, bucket
    // misconfig). Surface the actual message so the admin can debug instead
    // of seeing an opaque "Unexpected end of JSON input" from the route's
    // unhandled crash.
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `${backend.id === "r2" ? "R2 upload failed" : "Upload failed"}: ${message}`,
    };
  }

  return {
    ok: true,
    media: {
      id,
      filename,
      mime,
      sizeBytes: bytes.byteLength,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      altText: null,
      uploadedBy: input.uploadedBy,
      uploadedAt: new Date().toISOString(),
      storageBackend: backend.id,
      storageRef: put.ref,
      hasThumb: put.thumbMime !== null,
      hasMedium: put.mediumMime !== null,
      contentVersion: computeContentVersion(backend.id, put.ref),
    },
  };
}

export interface ListMediaInput {
  page?: number;
  pageSize?: number;
  /** Case-insensitive substring filter on filename. Empty/whitespace = no filter. */
  search?: string;
}

export interface ListMediaResult {
  rows: MediaSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listMedia(db: DbClient, input: ListMediaInput = {}): Promise<ListMediaResult> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 24));
  const offset = (page - 1) * pageSize;

  const search = (input.search ?? "").trim();
  const filter = search
    ? { sql: " AND LOWER(filename) LIKE ?", arg: `%${search.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%` }
    : null;
  const filterClause = filter?.sql ?? "";
  const filterArgs = filter ? [filter.arg] : [];
  const escapeClause = filter ? " ESCAPE '\\'" : "";

  const [countRes, rowsRes] = await Promise.all([
    db.execute({
      sql: `SELECT COUNT(*) AS n FROM media WHERE tenant_id = 1${filterClause}${escapeClause}`,
      args: filterArgs,
    }),
    db.execute({
      sql: `SELECT id, filename, mime, size_bytes, width, height, alt_text,
                   uploaded_by, uploaded_at,
                   storage_backend, storage_ref, thumb_mime, medium_mime
            FROM media
            WHERE tenant_id = 1${filterClause}${escapeClause}
            ORDER BY uploaded_at DESC
            LIMIT ? OFFSET ?`,
      args: [...filterArgs, pageSize, offset],
    }),
  ]);

  const total = Number(countRes.rows[0]?.n ?? 0);
  const rows: MediaSummary[] = rowsRes.rows.map((r) => rowToSummary(r));

  return { rows, total, page, pageSize };
}

/** Map a raw libSQL/PG result row to the typed MediaSummary shape. */
function rowToSummary(r: Record<string, unknown>): MediaSummary {
  const storageBackend: StorageBackendId = String(r.storage_backend) === "r2" ? "r2" : "db";
  const storageRef = r.storage_ref ? String(r.storage_ref) : String(r.id);
  return {
    id: String(r.id),
    filename: String(r.filename),
    mime: String(r.mime),
    sizeBytes: Number(r.size_bytes),
    width: r.width !== null && r.width !== undefined ? Number(r.width) : null,
    height: r.height !== null && r.height !== undefined ? Number(r.height) : null,
    altText: r.alt_text ? String(r.alt_text) : null,
    uploadedBy: r.uploaded_by ? String(r.uploaded_by) : null,
    uploadedAt: String(r.uploaded_at),
    storageBackend,
    storageRef,
    hasThumb: r.thumb_mime !== null && r.thumb_mime !== undefined,
    hasMedium: r.medium_mime !== null && r.medium_mime !== undefined,
    contentVersion: computeContentVersion(storageBackend, storageRef),
  };
}

export interface MediaBlob {
  data: Uint8Array;
  mime: string;
  filename: string;
  sizeBytes: number;
}

export async function getMediaBlob(db: DbClient, id: string): Promise<MediaBlob | null> {
  const res = await db.execute({
    sql: `SELECT mime, filename, size_bytes, blob_data, storage_backend
          FROM media
          WHERE id = ? AND tenant_id = 1
          LIMIT 1`,
    args: [id],
  });
  const row = res.rows[0];
  if (!row) return null;

  const backend = String(row.storage_backend);
  if (backend !== "db") {
    // Plugin storage backends — not yet implemented. Once `api.media.registerStorage()`
    // ships, this branch dispatches to the registered backend's get() method.
    return null;
  }

  const data = row.blob_data;
  if (!(data instanceof Uint8Array) && !(data instanceof ArrayBuffer) && !Array.isArray(data) && !Buffer.isBuffer(data)) {
    return null;
  }

  // libSQL returns blob columns as Uint8Array; normalize.
  const bytes = Buffer.isBuffer(data)
    ? new Uint8Array(data)
    : data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : Array.isArray(data)
        ? new Uint8Array(data)
        : data;

  return {
    data: bytes,
    mime: String(row.mime),
    filename: String(row.filename),
    sizeBytes: Number(row.size_bytes),
  };
}

export async function getMediaById(db: DbClient, id: string): Promise<MediaSummary | null> {
  const res = await db.execute({
    sql: `SELECT id, filename, mime, size_bytes, width, height, alt_text,
                 uploaded_by, uploaded_at,
                 storage_backend, storage_ref, thumb_mime, medium_mime
          FROM media
          WHERE id = ? AND tenant_id = 1
          LIMIT 1`,
    args: [id],
  });
  const r = res.rows[0];
  if (!r) return null;
  return rowToSummary(r);
}

/**
 * Read the medium (≤1280px WebP) variant. Falls back to the original blob
 * when no medium was generated (legacy rows pre-005_add_medium, SVGs, or
 * when sharp failed at upload).
 */
export async function getMediaMedium(db: DbClient, id: string): Promise<MediaBlob | null> {
  const res = await db.execute({
    sql: `SELECT mime, filename, size_bytes,
                 blob_data, medium_data, medium_mime, storage_backend
          FROM media
          WHERE id = ? AND tenant_id = 1
          LIMIT 1`,
    args: [id],
  });
  const row = res.rows[0];
  if (!row) return null;

  const backend = String(row.storage_backend);
  if (backend !== "db") return null; // future plugin storage handles its own variants

  // Prefer the medium variant; fall back to the original.
  const data = row.medium_data ?? row.blob_data;
  const mime = row.medium_data ? String(row.medium_mime ?? "image/webp") : String(row.mime);
  if (!(data instanceof Uint8Array) && !(data instanceof ArrayBuffer) && !Array.isArray(data) && !Buffer.isBuffer(data)) {
    return null;
  }
  const bytes = Buffer.isBuffer(data)
    ? new Uint8Array(data)
    : data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : Array.isArray(data)
        ? new Uint8Array(data)
        : data;

  return {
    data: bytes,
    mime,
    filename: String(row.filename),
    sizeBytes: bytes.byteLength,
  };
}

/**
 * Read the small WebP thumbnail. Falls back to the original blob when no
 * thumb was generated (older rows, SVGs, or when sharp failed at upload).
 */
export async function getMediaThumb(db: DbClient, id: string): Promise<MediaBlob | null> {
  const res = await db.execute({
    sql: `SELECT mime, filename, size_bytes,
                 blob_data, thumb_data, thumb_mime, storage_backend
          FROM media
          WHERE id = ? AND tenant_id = 1
          LIMIT 1`,
    args: [id],
  });
  const row = res.rows[0];
  if (!row) return null;

  const backend = String(row.storage_backend);
  if (backend !== "db") return null; // future plugin storage handles its own variants

  // Prefer the thumb; fall back to the original if a thumb was never generated.
  const data = row.thumb_data ?? row.blob_data;
  const mime = row.thumb_data ? String(row.thumb_mime ?? "image/webp") : String(row.mime);
  if (!(data instanceof Uint8Array) && !(data instanceof ArrayBuffer) && !Array.isArray(data) && !Buffer.isBuffer(data)) {
    return null;
  }
  const bytes = Buffer.isBuffer(data)
    ? new Uint8Array(data)
    : data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : Array.isArray(data)
        ? new Uint8Array(data)
        : data;

  return {
    data: bytes,
    mime,
    filename: String(row.filename),
    sizeBytes: bytes.byteLength,
  };
}

export async function deleteMedia(db: DbClient, id: string): Promise<{ ok: boolean }> {
  // Look up the row first so we know which backend owns the bytes — required
  // to dispatch R2 cleanup after the DELETE. Cost: one extra SELECT per
  // delete. For UI-driven single-row deletes this is fine; bulk delete in
  // actions.ts batches the lookup into the ownership check it already does.
  const row = await getMediaById(db, id);
  await db.execute({
    sql: "DELETE FROM media WHERE id = ? AND tenant_id = 1",
    args: [id],
  });
  if (row && row.storageBackend === "r2") {
    const r2 = new R2Storage();
    if (r2.available()) {
      // Best-effort: log on failure, don't bubble — the row is already gone
      // so the admin sees success; a leaked R2 object is far cheaper than a
      // failed delete that leaves the row in place.
      r2.deleteObjects(row.storageRef, row.hasThumb, row.hasMedium).catch((err) => {
        console.warn(`deleteMedia: R2 cleanup failed for ${id}:`, err);
      });
    } else {
      console.warn(
        `deleteMedia: row ${id} was R2-backed but R2 is not configured — R2 object orphaned at key '${row.storageRef}'.`
      );
    }
  }
  return { ok: true };
}
