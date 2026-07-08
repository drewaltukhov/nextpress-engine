"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { getEffectivePermissions, hasPermission } from "@core-plugins/users/permissions";
import { auditLog } from "@core-plugins/logging";
import { listPosts } from "@core-plugins/posts";
import { listTopics } from "@core-plugins/topics";
import {
  savePanel,
  deletePanel,
  type WidthMode,
} from "@core-plugins/mega-menu";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function authorizeMenusUpdate(): Promise<{ ok: true; userId: string | null } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const perms = await getEffectivePermissions(db(), session.user.roles ?? []);
  if (!hasPermission(perms, "menus.manage")) return { ok: false, error: "Forbidden" };
  return { ok: true, userId: String(session.user.id) };
}

/**
 * Validate the menu_item belongs to the menu in the URL AND is top-level
 * (parent_id IS NULL) AND exists. Returns null when any check fails so
 * the caller can 404. Centralizing the check keeps the URL guard
 * identical between page load and save action.
 */
async function loadTopLevelItem(
  menuId: number,
  itemId: number,
): Promise<{ id: number; menuId: number; label: string } | null> {
  const res = await db().execute({
    sql: `SELECT id, menu_id, label FROM menu_items
           WHERE id = ? AND menu_id = ? AND parent_id IS NULL
           LIMIT 1`,
    args: [itemId, menuId],
  });
  const r = res.rows[0];
  if (!r) return null;
  return { id: Number(r.id), menuId: Number(r.menu_id), label: String(r.label) };
}

export { loadTopLevelItem };

export interface PostOption {
  id: number;
  title: string;
  /** Public slug. Combined with parentSlug for spikes, this lets the
   *  client build the canonical public URL without a round-trip. */
  slug: string;
  /** 'pillar' | 'spike' | 'standalone' — drives picker grouping. */
  kind: "pillar" | "spike" | "standalone";
  /** Spikes carry their parent pillar's id so the picker can group them
   *  under it. Null for pillars and standalones. */
  parentId: number | null;
}
export interface TopicOption { id: number; name: string }
/** Pillars carry their slug so the multi-section "fill from pillar"
 *  button can build `/<pillarSlug>/<spikeSlug>` links client-side. */
export interface PillarOption { id: number; title: string; slug: string }

/** Picker options for the editor — posts to choose featured from, topics
 *  to filter recent grids by, pillars to filter recent grids by parent.
 *  Loaded once when the editor mounts. */
export async function loadEditorPickerOptions(): Promise<{
  posts: PostOption[];
  topics: TopicOption[];
  pillars: PillarOption[];
}> {
  const actor = await authorizeMenusUpdate();
  if (!actor.ok) return { posts: [], topics: [], pillars: [] };
  const [posts, topics] = await Promise.all([
    listPosts(db(), { status: "published", view: "live" }),
    listTopics(db()),
  ]);
  return {
    posts: posts.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      kind: p.postKind === "pillar" ? "pillar" : p.postKind === "spike" ? "spike" : "standalone",
      parentId: p.postKind === "spike" ? (p.parentId ?? null) : null,
    })),
    topics: topics.map((t) => ({ id: t.id, name: t.name })),
    pillars: posts
      .filter((p) => p.postKind === "pillar")
      .map((p) => ({ id: p.id, title: p.title, slug: p.slug })),
  };
}

export interface SavePanelInput {
  layoutId: string;
  config: unknown;
  widthMode: WidthMode;
}

export async function savePanelAction(
  menuId: number,
  itemId: number,
  input: SavePanelInput,
): Promise<ActionResult> {
  const actor = await authorizeMenusUpdate();
  if (!actor.ok) return { ok: false, error: actor.error };
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };

  const item = await loadTopLevelItem(menuId, itemId);
  if (!item) return { ok: false, error: "Menu item not found" };

  const result = await savePanel(db(), itemId, input);
  if (!result.ok) return { ok: false, error: result.error };

  try {
    await auditLog(db(), {
      actorUserId: actor.userId,
      action: "mega-menu.panel.save",
      targetType: "menu_item",
      targetId: String(itemId),
      diff: { menuId, itemLabel: item.label, layoutId: input.layoutId, widthMode: input.widthMode },
    });
  } catch { /* audit non-fatal */ }

  revalidatePath(`/admin/menus/${menuId}/edit`);
  // The mega panel is pre-rendered into every theme-served public route
  // (homepage, posts, pages…) — revalidating the layout drops the cached
  // panel JSX so config changes (toggles, links, layout swap) actually
  // surface on the next public request.
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deletePanelAction(
  menuId: number,
  itemId: number,
): Promise<ActionResult> {
  const actor = await authorizeMenusUpdate();
  if (!actor.ok) return { ok: false, error: actor.error };
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };

  const item = await loadTopLevelItem(menuId, itemId);
  if (!item) return { ok: false, error: "Menu item not found" };

  await deletePanel(db(), itemId);

  try {
    await auditLog(db(), {
      actorUserId: actor.userId,
      action: "mega-menu.panel.delete",
      targetType: "menu_item",
      targetId: String(itemId),
      diff: { menuId, itemLabel: item.label },
    });
  } catch { /* audit non-fatal */ }

  revalidatePath(`/admin/menus/${menuId}/edit`);
  // The mega panel is pre-rendered into every theme-served public route
  // (homepage, posts, pages…) — revalidating the layout drops the cached
  // panel JSX so config changes (toggles, links, layout swap) actually
  // surface on the next public request.
  revalidatePath("/", "layout");
  return { ok: true };
}
