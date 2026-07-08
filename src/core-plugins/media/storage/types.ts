import type { DbClient } from "@core/db/client";

/**
 * Storage abstraction for the media plugin.
 *
 * A media row's bytes can live in two places today:
 *   - `db` — original blob + thumb blob in the `media` table (default, always available)
 *   - `r2` — original + thumb as objects in Cloudflare R2 (env-gated, opt-in)
 *
 * The active backend is chosen at upload time from the `media.storage_backend`
 * site setting. The row itself records which backend wrote it (`storage_backend`
 * column), so reads route per-row — existing DB rows keep working after a flip
 * to R2, and vice versa.
 *
 * Why the `'plugin:<slug>'` convention from `schema/media.ts:6-11` is NOT used here:
 * that namespacing is reserved for third-party storage plugins registered through
 * the future `api.media.registerStorage()` extension point. R2 is being added as a
 * built-in second backend in the media core-plugin itself, so it uses the bare
 * `'r2'` literal consistent with the existing `'db'` precedent.
 */

export type StorageBackendId = "db" | "r2";

/**
 * Full row data handed to `MediaStorage.put`. The driver writes both the bytes
 * (to its own substrate — DB blob columns or R2 objects) AND the `media` row
 * INSERT atomically, so service.ts doesn't have to branch on backend after
 * the put returns.
 */
export interface MediaPutData {
  id: string;
  tenantId: number;
  filename: string;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  uploadedBy: string | null;
  /** Resized + WebP-converted original bytes — what the user will see when fetching the "original" variant. */
  bytes: Uint8Array;
  /** Thumb bytes + mime, or null when no thumb exists (SVG, generation failed). */
  thumb: { bytes: Uint8Array; mime: string } | null;
  /** Medium (≤1280px) bytes + mime, or null when no medium was generated (SVG, small source). */
  medium: { bytes: Uint8Array; mime: string } | null;
  /** Defaults to "now". Used to derive the YYYY/MM folder for R2 keys. */
  uploadedAt?: Date;
}

export interface MediaPutResult {
  /**
   * Backend-specific identifier persisted to `media.storage_ref`.
   *  - `db` backend: the row id (mirrors `media.id` for backward compatibility).
   *  - `r2` backend: the R2 object key for the original (e.g. `2026/05/cat-photo.webp`).
   */
  ref: string;
  /**
   * The thumb's MIME when a thumb was generated and stored, otherwise `null`.
   * This value is written to `media.thumb_mime` and serves as the "has thumb"
   * flag at render time. The R2 thumb key is NOT persisted — it is derived
   * deterministically from `ref` by `getMediaPublicUrl` when needed.
   */
  thumbMime: string | null;
  /**
   * The medium variant's MIME when generated and stored, otherwise `null`.
   * Same role as `thumbMime` — written to `media.medium_mime` and acts as the
   * "has medium" flag at render time.
   */
  mediumMime: string | null;
}

export interface MediaUrlInput {
  /** The media row's id (uuid). The single source of truth for public URLs. */
  id: string;
  /** Whether a thumb exists; drives the variant-fallback in getMediaPublicUrl. */
  hasThumb: boolean;
  /** Whether a medium variant exists; drives the variant-fallback in getMediaPublicUrl. */
  hasMedium?: boolean;
  variant: "original" | "thumb" | "medium";
  /**
   * Short hash derived from `storage_backend + ':' + storage_ref` (server-side,
   * stored as `contentVersion` on MediaSummary / GalleryItem / etc.). Appended
   * to URLs as `?v=<hash>` so that a migration which changes the backing
   * storage also changes the URL — busting browser/CDN caches automatically
   * without requiring viewers to hard-refresh. Stable for the steady state;
   * changes only when the row's backend or ref changes.
   */
  contentVersion: string;
}

export interface MediaStorage {
  readonly id: StorageBackendId;
  /**
   * Persist a media row: write bytes to this backend's substrate (DB blob columns
   * or R2 objects) and INSERT the `media` row in one operation. The returned
   * `ref` is what's persisted to `media.storage_ref`; `thumbMime` to `media.thumb_mime`.
   */
  put(db: DbClient, data: MediaPutData): Promise<MediaPutResult>;
  /**
   * Delete the row + its backing bytes. The driver is responsible for both the
   * `media` row DELETE and any out-of-band object cleanup (R2 deletes).
   */
  remove(db: DbClient, id: string, ref: string, hasThumb: boolean, hasMedium?: boolean): Promise<void>;
  /** Whether this backend is usable right now (e.g. env present). UI uses this to shade the toggle. */
  available(): boolean;
}
