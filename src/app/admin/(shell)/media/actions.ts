"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { resolveUserId } from "@core/auth/resolve-user";
import { auditLog } from "@core-plugins/logging";
import { setSetting } from "@core-plugins/settings/registry";
import { getEffectivePermissions, hasPermission } from "@core-plugins/users/permissions";
import { R2Storage } from "@core-plugins/media/storage/r2";
import {
  listMedia,
  deleteMedia,
  readMediaSettings,
  type MediaSettings,
  type ListMediaResult,
} from "@core-plugins/media/service";
import {
  getMigrationStats,
  migrateBatchDbToR2,
  migrateBatchR2ToDb,
  type MigrationStats,
  type MigrationBatchResult,
} from "@core-plugins/media/migrate";

export type SaveResult = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Permissions matrix — sourced from the `roles.permissions` table.
//
// Actions mapped to permission strings:
//   media.add                upload new media
//   media.delete             delete any media (admins/editors typically)
//   settings.media.update    edit the Settings tab — admin-only by convention
//
// Owners can always delete their own uploads (no permission required).
// Read access is gated by auth only — anyone in the admin shell can browse.
// ---------------------------------------------------------------------------

interface MediaActor {
  ok: true;
  userId: string | null;
  /** Permission set (union across the user's roles), with wildcard support. */
  can: (action: string) => boolean;
}

async function actorFromSession(): Promise<MediaActor | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const userId = await resolveUserId(db(), session.user);
  const roles = (session.user.roles ?? []) as string[];
  const perms = await getEffectivePermissions(db(), roles);
  return {
    ok: true,
    userId,
    can: (action) => hasPermission(perms, action),
  };
}

// ---------------------------------------------------------------------------
// Permissions snapshot — used by the page server-component to gate UI
// ---------------------------------------------------------------------------

export interface MediaPermissions {
  userId: string | null;
  canUpload: boolean;
  canDeleteAny: boolean;
  canEditSettings: boolean;
  canManageGalleries: boolean;
}

export async function getMediaPermissions(): Promise<MediaPermissions> {
  const actor = await actorFromSession();
  if (!actor.ok) {
    return {
      userId: null,
      canUpload: false,
      canDeleteAny: false,
      canEditSettings: false,
      canManageGalleries: false,
    };
  }
  return {
    userId: actor.userId,
    canUpload: actor.can("media.add"),
    canDeleteAny: actor.can("media.delete"),
    canEditSettings: actor.can("settings.media.update"),
    canManageGalleries: actor.can("galleries.manage"),
  };
}

// ---------------------------------------------------------------------------
// Read settings + library
// ---------------------------------------------------------------------------

export async function getMediaSettings(): Promise<MediaSettings> {
  return readMediaSettings(db());
}

export async function getLibrary(page: number = 1, search: string = ""): Promise<ListMediaResult> {
  return listMedia(db(), { page, search });
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteFile(id: string): Promise<SaveResult> {
  const actor = await actorFromSession();
  if (!actor.ok) return { ok: false, error: actor.error };
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };

  // Admins + editors can delete anything. Other roles must own the row.
  // Read the filename here too so we can stamp it into the audit log —
  // bare UUIDs in the activity feed aren't useful, the filename is.
  const row = await db().execute({
    sql: "SELECT uploaded_by, filename FROM media WHERE id = ? AND tenant_id = 1 LIMIT 1",
    args: [id],
  });
  if (row.rows.length === 0) {
    return { ok: false, error: "Media not found" };
  }
  const uploadedBy = row.rows[0].uploaded_by ? String(row.rows[0].uploaded_by) : null;
  const filename = row.rows[0].filename ? String(row.rows[0].filename) : null;
  const isOwner = !!actor.userId && uploadedBy === actor.userId;

  if (!actor.can("media.delete") && !isOwner) {
    return { ok: false, error: "You can only delete media you uploaded" };
  }

  await deleteMedia(db(), id);

  try {
    await auditLog(db(), {
      actorUserId: actor.userId,
      action: "media.delete",
      targetType: "media",
      targetId: id,
      // `fileName` is the key the logs UI's buildDetails() picks up; mediaId
      // stays in for traceability when filenames aren't unique.
      diff: { fileName: filename, mediaId: id },
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/media");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Bulk delete
// ---------------------------------------------------------------------------

export interface BulkDeleteResult {
  ok: boolean;
  deleted: number;
  errors: { id: string; error: string }[];
}

export async function deleteFiles(ids: string[]): Promise<BulkDeleteResult> {
  const actor = await actorFromSession();
  if (!actor.ok) return { ok: false, deleted: 0, errors: ids.map((id) => ({ id, error: actor.error })) };
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, deleted: 0, errors: ids.map((id) => ({ id, error: guard.error! })) };

  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, deleted: 0, errors: [{ id: "(none)", error: "No items selected" }] };
  }

  // Pull every candidate row in one round-trip — used for ownership-check
  // AND to capture R2 refs so we can clean up R2 objects after the bulk
  // DELETE for any r2-backed rows in the selection.
  const placeholders = ids.map(() => "?").join(",");
  const rows = await db().execute({
    sql: `SELECT id, uploaded_by, filename, storage_backend, storage_ref, thumb_mime
          FROM media WHERE id IN (${placeholders}) AND tenant_id = 1`,
    args: ids,
  });

  const allowed: string[] = [];
  const filenames = new Map<string, string>();
  const r2Refs: { id: string; ref: string; hasThumb: boolean }[] = [];
  const errors: { id: string; error: string }[] = [];
  const seen = new Set<string>();

  for (const r of rows.rows) {
    const id = String(r.id);
    seen.add(id);
    const uploadedBy = r.uploaded_by ? String(r.uploaded_by) : null;
    const isOwner = !!actor.userId && uploadedBy === actor.userId;
    if (actor.can("media.delete") || isOwner) {
      allowed.push(id);
      if (r.filename) filenames.set(id, String(r.filename));
      if (String(r.storage_backend) === "r2" && r.storage_ref) {
        r2Refs.push({
          id,
          ref: String(r.storage_ref),
          hasThumb: r.thumb_mime != null,
        });
      }
    } else {
      errors.push({ id, error: "You can only delete media you uploaded" });
    }
  }
  for (const id of ids) {
    if (!seen.has(id)) errors.push({ id, error: "Media not found" });
  }

  if (allowed.length > 0) {
    const delPlaceholders = allowed.map(() => "?").join(",");
    await db().execute({
      sql: `DELETE FROM media WHERE id IN (${delPlaceholders}) AND tenant_id = 1`,
      args: allowed,
    });

    // R2 cleanup runs after the bulk DELETE so the rows are already gone
    // from the admin's perspective. Best-effort: log on failure, don't bubble.
    if (r2Refs.length > 0) {
      const r2 = new R2Storage();
      if (r2.available()) {
        for (const { id, ref, hasThumb } of r2Refs) {
          r2.deleteObjects(ref, hasThumb).catch((err) => {
            console.warn(`deleteFiles: R2 cleanup failed for ${id}:`, err);
          });
        }
      } else {
        console.warn(
          `deleteFiles: ${r2Refs.length} r2-backed row(s) deleted but R2 is not configured — objects orphaned.`
        );
      }
    }

    try {
      await auditLog(db(), {
        actorUserId: actor.userId,
        action: "media.delete",
        targetType: "media",
        targetId: allowed.join(","),
        diff: {
          count: allowed.length,
          fileNames: allowed.map((id) => filenames.get(id) ?? id),
        },
      });
    } catch { /* audit non-fatal */ }
  }

  revalidatePath("/admin/media");
  return { ok: errors.length === 0, deleted: allowed.length, errors };
}

// ---------------------------------------------------------------------------
// Save settings (admin-only)
// ---------------------------------------------------------------------------

export interface SaveSettingsInput {
  allowedMimeTypes: string[];
  maxFileSizeMb: number;
  convertToWebp: boolean;
  storageBackend: "db" | "r2";
}

export async function saveSettings(input: SaveSettingsInput): Promise<SaveResult> {
  const actor = await actorFromSession();
  if (!actor.ok) return { ok: false, error: actor.error };
  if (!actor.can("settings.media.update")) {
    return { ok: false, error: "Only administrators can change media settings" };
  }
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };

  if (!Array.isArray(input.allowedMimeTypes) || input.allowedMimeTypes.length === 0) {
    return { ok: false, error: "At least one allowed type is required" };
  }
  if (
    !Number.isFinite(input.maxFileSizeMb) ||
    input.maxFileSizeMb < 1 ||
    input.maxFileSizeMb > 100
  ) {
    return { ok: false, error: "Max file size must be between 1 and 100 MB" };
  }
  if (typeof input.convertToWebp !== "boolean") {
    return { ok: false, error: "convertToWebp must be a boolean" };
  }
  if (input.storageBackend !== "db" && input.storageBackend !== "r2") {
    return { ok: false, error: "Storage backend must be 'db' or 'r2'" };
  }

  const opts = { updatedBy: actor.userId };

  try {
    await setSetting(db(), "media.allowed_mime_types", input.allowedMimeTypes, opts);
    await setSetting(db(), "media.max_file_size_mb", Math.round(input.maxFileSizeMb), opts);
    await setSetting(db(), "media.convert_to_webp", input.convertToWebp, opts);
    await setSetting(db(), "media.storage_backend", input.storageBackend, opts);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: actor.userId,
      action: "settings.changed",
      targetType: "settings",
      targetId: "media",
      diff: {
        allowedMimeTypes: input.allowedMimeTypes,
        maxFileSizeMb: input.maxFileSizeMb,
        convertToWebp: input.convertToWebp,
        storageBackend: input.storageBackend,
      },
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/media");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Storage migration (admin-only) — move media bytes between backends, one
// batch at a time. The client UI calls runMigrationBatch in a tight loop
// until `remaining.count` hits zero, surfacing a progress bar + per-row
// errors as it goes.
// ---------------------------------------------------------------------------

export async function getMediaMigrationStats(): Promise<MigrationStats | { error: string }> {
  const actor = await actorFromSession();
  if (!actor.ok) return { error: actor.error };
  if (!actor.can("settings.media.update")) {
    return { error: "Only administrators can view storage migration stats" };
  }
  return getMigrationStats(db());
}

export type MigrationDirection = "db_to_r2" | "r2_to_db";

export async function runMigrationBatch(
  direction: MigrationDirection,
  batchSize: number = 5
): Promise<MigrationBatchResult | { error: string }> {
  const actor = await actorFromSession();
  if (!actor.ok) return { error: actor.error };
  if (!actor.can("settings.media.update")) {
    return { error: "Only administrators can run storage migrations" };
  }
  const guard = await assertWriteable(db());
  if (!guard.ok) return { error: guard.error! };

  try {
    const result =
      direction === "db_to_r2"
        ? await migrateBatchDbToR2(db(), batchSize)
        : await migrateBatchR2ToDb(db(), batchSize);

    const okCount = result.items.filter((i) => i.ok).length;
    const failCount = result.items.length - okCount;
    void auditLog(db(), {
      actorUserId: actor.userId,
      action: "media.migrate",
      targetType: "media",
      targetId: direction,
      diff: { direction, batchSize, succeeded: okCount, failed: failCount },
    }).catch(() => {});

    revalidatePath("/admin/media");
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Migration failed" };
  }
}
