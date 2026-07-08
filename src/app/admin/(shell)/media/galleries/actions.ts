"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { resolveUserId } from "@core/auth/resolve-user";
import { auditLog } from "@core-plugins/logging";
import { getEffectivePermissions, hasPermission } from "@core-plugins/users/permissions";
import {
  listGalleries,
  getGallery,
  createGallery,
  updateGallery,
  deleteGallery,
  addItemsToGallery,
  removeItemFromGallery,
  reorderGalleryItems,
  setGalleryItemCaption,
  GallerySlugConflictError,
  GallerySlugReservedError,
  GalleryNotFoundError,
  type GalleryListItem,
  type GalleryDetail,
} from "@core-plugins/galleries";

export type SaveResult = { ok: true; id?: number } | { ok: false; error: string };

/**
 * Galleries are gated by the `galleries.manage` permission. Admin's `*`
 * covers it; editor gets it from migration 006 on the users plugin; custom
 * roles can grant it via /admin/roles.
 */
async function requireManageUserId(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const roles = session.user.roles ?? [];
  const perms = await getEffectivePermissions(db(), roles);
  if (!hasPermission(perms, "galleries.manage")) {
    return { ok: false, error: "You don't have permission to manage galleries" };
  }
  const userId = await resolveUserId(db(), session.user);
  return { ok: true, userId };
}

async function commonGuard(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const guard = await requireManageUserId();
  if (!guard.ok) return guard;
  const writeable = await assertWriteable(db());
  if (!writeable.ok) return { ok: false, error: writeable.error! };
  return guard;
}

export async function getGalleries(): Promise<GalleryListItem[]> {
  return listGalleries(db());
}

export async function getGalleryDetail(id: number): Promise<GalleryDetail | null> {
  return getGallery(db(), id);
}

export interface GalleryFormInput {
  name: string;
  slug: string;        // empty string = derive from name
  description: string;
}

export async function createGalleryAction(input: GalleryFormInput): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;

  let id: number;
  try {
    id = await createGallery(db(), {
      name: input.name,
      slug: input.slug.trim() || undefined,
      description: input.description,
      createdBy: guard.userId,
    });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  try {
    await auditLog(db(), {
      actorUserId: guard.userId,
      action: "galleries.created",
      targetType: "gallery",
      targetId: String(id),
      diff: {
        name: input.name.trim(),
        slug: input.slug.trim() || undefined,
        description: input.description.trim() || null,
      },
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/media");
  return { ok: true, id };
}

export interface GalleryUpdateInput {
  name?: string;
  slug?: string;
  description?: string | null;
}

export async function updateGalleryAction(id: number, input: GalleryUpdateInput): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;

  try {
    await updateGallery(db(), id, input);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  try {
    await auditLog(db(), {
      actorUserId: guard.userId,
      action: "galleries.updated",
      targetType: "gallery",
      targetId: String(id),
      diff: input,
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/media");
  revalidatePath(`/admin/media/galleries/${id}`);
  return { ok: true, id };
}

export async function deleteGalleryAction(id: number): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;

  try {
    await deleteGallery(db(), id);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  try {
    await auditLog(db(), {
      actorUserId: guard.userId,
      action: "galleries.deleted",
      targetType: "gallery",
      targetId: String(id),
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/media");
  return { ok: true };
}

export async function addItemsAction(
  galleryId: number,
  mediaIds: string[],
): Promise<
  | { ok: true; inserted: number; gallery: GalleryDetail }
  | { ok: false; error: string }
> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;

  let inserted: number;
  try {
    inserted = await addItemsToGallery(db(), galleryId, mediaIds);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  if (inserted > 0) {
    try {
      await auditLog(db(), {
        actorUserId: guard.userId,
        action: "galleries.itemsAdded",
        targetType: "gallery",
        targetId: String(galleryId),
        diff: { count: inserted, mediaIds },
      });
    } catch { /* audit non-fatal */ }
  }

  // Re-read the gallery so the client can replace local state with a
  // canonical view (joined media rows + new cover_media_id when the
  // gallery was previously empty). Cheaper than letting the client
  // refetch separately + avoids a router.refresh() race against local
  // optimistic state.
  const gallery = await getGallery(db(), galleryId);
  if (!gallery) return { ok: false, error: "Gallery not found" };

  revalidatePath("/admin/media");
  revalidatePath(`/admin/media/galleries/${galleryId}`);
  return { ok: true, inserted, gallery };
}

export async function removeItemAction(galleryId: number, mediaId: string): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;

  try {
    await removeItemFromGallery(db(), galleryId, mediaId);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  try {
    await auditLog(db(), {
      actorUserId: guard.userId,
      action: "galleries.itemRemoved",
      targetType: "gallery",
      targetId: String(galleryId),
      diff: { mediaId },
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/media");
  revalidatePath(`/admin/media/galleries/${galleryId}`);
  return { ok: true };
}

export async function reorderItemsAction(galleryId: number, orderedIds: string[]): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;

  try {
    await reorderGalleryItems(db(), galleryId, orderedIds);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  // Reorders are noisy in the audit feed if logged per-drop. Skipping the
  // audit row here and counting on the next save (caption / cover / member
  // change) to reflect the latest state.

  revalidatePath(`/admin/media/galleries/${galleryId}`);
  return { ok: true };
}

export async function setItemCaptionAction(
  galleryId: number,
  mediaId: string,
  caption: string,
): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;

  try {
    await setGalleryItemCaption(db(), galleryId, mediaId, caption);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  revalidatePath(`/admin/media/galleries/${galleryId}`);
  return { ok: true };
}

export async function setCoverAction(galleryId: number, mediaId: string): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;

  try {
    await updateGallery(db(), galleryId, { coverMediaId: mediaId });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  try {
    await auditLog(db(), {
      actorUserId: guard.userId,
      action: "galleries.coverChanged",
      targetType: "gallery",
      targetId: String(galleryId),
      diff: { coverMediaId: mediaId },
    });
  } catch { /* audit non-fatal */ }

  revalidatePath("/admin/media");
  revalidatePath(`/admin/media/galleries/${galleryId}`);
  return { ok: true };
}

function errorMessage(err: unknown): string {
  if (err instanceof GallerySlugConflictError) return err.message;
  if (err instanceof GallerySlugReservedError) return err.message;
  if (err instanceof GalleryNotFoundError) return err.message;
  return err instanceof Error ? err.message : "Save failed";
}
