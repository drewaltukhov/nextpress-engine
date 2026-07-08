"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { auditLog } from "@core-plugins/logging";
import { resolveUserId } from "@core/auth/resolve-user";
import { getEffectivePermissions, hasPermission } from "@core-plugins/users/permissions";
import {
  listMenus,
  getMenu,
  createMenu,
  updateMenu,
  deleteMenu,
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
  moveMenuItem,
  MenuSlugConflictError,
  MenuNotFoundError,
  type MenuListItem,
  type MenuDetail,
  type CreateMenuInput,
  type UpdateMenuInput,
  type CreateMenuItemInput,
  type UpdateMenuItemInput,
} from "@core-plugins/menus";
import { getPost, listPosts } from "@core-plugins/posts";

export type SaveResult = { ok: true; id?: number } | { ok: false; error: string };

async function commonGuard(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const perms = await getEffectivePermissions(db(), session.user.roles ?? []);
  if (!hasPermission(perms, "menus.manage")) {
    return { ok: false, error: "You don't have permission to manage menus" };
  }
  const writeable = await assertWriteable(db());
  if (!writeable.ok) return { ok: false, error: writeable.error! };
  const userId = await resolveUserId(db(), session.user);
  return { ok: true, userId };
}

function errorMessage(err: unknown): string {
  if (err instanceof MenuSlugConflictError) return err.message;
  if (err instanceof MenuNotFoundError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

export async function getMenusList(): Promise<MenuListItem[]> {
  return listMenus(db());
}

export async function getMenuDetail(id: number): Promise<MenuDetail | null> {
  return getMenu(db(), id);
}

export async function createMenuAction(input: CreateMenuInput): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  let id: number;
  try {
    id = await createMenu(db(), input);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
  try {
    await auditLog(db(), {
      actorUserId: guard.userId,
      action: "menus.created",
      targetType: "menu",
      targetId: String(id),
      diff: { name: input.name, slug: input.slug, location: input.location },
    });
  } catch {}
  revalidatePath("/admin/menus");
  return { ok: true, id };
}

export async function updateMenuAction(id: number, input: UpdateMenuInput): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  // System menus ("primary", "footer") are looked up by location by the
  // theme — silently strip a location-change attempt so the row in the
  // DB stays in sync with the theme contract even if a stale client
  // form posts the field. Name + style remain editable.
  let safeInput: UpdateMenuInput = input;
  if (input.location !== undefined && (await isSystemMenu(id))) {
    const rest = { ...input };
    delete rest.location;
    safeInput = rest;
  }
  try {
    await updateMenu(db(), id, safeInput);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
  try {
    await auditLog(db(), {
      actorUserId: guard.userId,
      action: "menus.updated",
      targetType: "menu",
      targetId: String(id),
      diff: input,
    });
  } catch {}
  revalidatePath("/admin/menus");
  revalidatePath(`/admin/menus/${id}/edit`);
  return { ok: true, id };
}

// Reserved menu locations the system seeds at setup and refuses to
// delete. Themes look up menus by these location strings, so removing
// the row leaves the public site rendering empty navs. Detecting by
// LOCATION (not slug) catches pre-existing menus whose slugs were
// auto-derived from names (e.g. "Main Menu" → slug "main-menu",
// location "primary"). Editing items / style / name is still allowed
// — only deletion + location-edit are blocked.
const SYSTEM_MENU_LOCATIONS: readonly string[] = ["primary", "footer"];

async function isSystemMenu(id: number): Promise<boolean> {
  const r = await db().execute({
    sql: `SELECT location FROM menus WHERE id = ? AND tenant_id = 1 LIMIT 1`,
    args: [id],
  });
  const location = r.rows[0]?.location;
  return typeof location === "string" && SYSTEM_MENU_LOCATIONS.includes(location);
}

export async function deleteMenuAction(id: number): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  if (await isSystemMenu(id)) {
    return {
      ok: false,
      error: "This is a reserved system menu (primary / footer) — it can't be deleted.",
    };
  }
  try {
    await deleteMenu(db(), id);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
  try {
    await auditLog(db(), {
      actorUserId: guard.userId,
      action: "menus.deleted",
      targetType: "menu",
      targetId: String(id),
    });
  } catch {}
  revalidatePath("/admin/menus");
  return { ok: true };
}

export async function addMenuItemAction(
  menuId: number,
  input: CreateMenuItemInput,
): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  let id: number;
  try {
    id = await addMenuItem(db(), menuId, input);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
  try {
    await auditLog(db(), {
      actorUserId: guard.userId,
      action: "menus.item_added",
      targetType: "menu",
      targetId: String(menuId),
      diff: { itemId: id, ...input },
    });
  } catch {}
  revalidatePath(`/admin/menus/${menuId}/edit`);
  return { ok: true, id };
}

/**
 * Add a pillar to the menu as a root item AND each of its published
 * spikes as child items under it — one click in the dialog produces a
 * whole topic-cluster subtree. The underlying rows are all `item_type
 * = 'post'` (pillars + spikes both live in `posts`), so the public
 * renderer reads them via its existing post-join path with no schema
 * change.
 */
export async function addPillarWithSpikesAction(
  menuId: number,
  pillarId: number,
  options: { target?: "_self" | "_blank" } = {},
): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;

  const pillar = await getPost(db(), pillarId);
  if (!pillar) {
    return { ok: false, error: "Pillar not found" };
  }
  if (pillar.postKind !== "pillar") {
    return { ok: false, error: "Selected post isn't a pillar" };
  }
  if (pillar.status !== "published" || pillar.trashedAt) {
    return { ok: false, error: "Pick a published pillar" };
  }

  const target = options.target === "_blank" ? "_blank" : "_self";

  // Pillar first — get its id so the spikes can hang under it.
  let pillarItemId: number;
  try {
    pillarItemId = await addMenuItem(db(), menuId, {
      label: pillar.title,
      itemType: "post",
      referenceId: pillar.id,
      target,
    });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  // Spikes — published children of the pillar in publish order. Each
  // becomes a child menu item; addMenuItem assigns sequential
  // positions within the parent automatically.
  const spikes = await listPosts(db(), {
    status: "published",
    kind: "spike",
    pillarId: pillar.id,
    view: "live",
  });
  let spikeFailures = 0;
  for (const spike of spikes) {
    try {
      await addMenuItem(db(), menuId, {
        parentId: pillarItemId,
        label: spike.title,
        itemType: "post",
        referenceId: spike.id,
        target,
      });
    } catch {
      // Skip an individual spike rather than rolling back — the
      // pillar root is already valuable on its own and partial
      // success is better than dropping the whole subtree.
      spikeFailures += 1;
    }
  }

  try {
    await auditLog(db(), {
      actorUserId: guard.userId,
      action: "menus.pillar_added",
      targetType: "menu",
      targetId: String(menuId),
      diff: {
        pillarId,
        pillarItemId,
        spikeCount: spikes.length - spikeFailures,
      },
    });
  } catch {}

  revalidatePath(`/admin/menus/${menuId}/edit`);
  return { ok: true, id: pillarItemId };
}

export async function updateMenuItemAction(
  menuId: number,
  itemId: number,
  input: UpdateMenuItemInput,
): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  try {
    await updateMenuItem(db(), itemId, input);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
  try {
    await auditLog(db(), {
      actorUserId: guard.userId,
      action: "menus.item_updated",
      targetType: "menu",
      targetId: String(menuId),
      diff: { itemId, ...input },
    });
  } catch {}
  revalidatePath(`/admin/menus/${menuId}/edit`);
  return { ok: true, id: itemId };
}

export async function deleteMenuItemAction(
  menuId: number,
  itemId: number,
): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  try {
    await deleteMenuItem(db(), itemId);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
  try {
    await auditLog(db(), {
      actorUserId: guard.userId,
      action: "menus.item_deleted",
      targetType: "menu",
      targetId: String(menuId),
      diff: { itemId },
    });
  } catch {}
  revalidatePath(`/admin/menus/${menuId}/edit`);
  return { ok: true };
}

export async function moveMenuItemAction(
  menuId: number,
  itemId: number,
  to: { parentId: number | null; position: number },
): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  try {
    await moveMenuItem(db(), itemId, to);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
  revalidatePath(`/admin/menus/${menuId}/edit`);
  return { ok: true, id: itemId };
}
