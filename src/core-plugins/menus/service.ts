/**
 * Menus service — CRUD on menus + items, plus a render-side
 * `getMenuByLocation` that fetches a menu and assembles its items tree
 * with resolved URLs for content-typed items.
 *
 * URL resolution for non-custom item types:
 *   - page     → `/${pages.slug}`
 *   - post     → `/${posts.slug}`  (pillar/standalone)
 *                `/${parent.slug}/${posts.slug}` (spike)
 *   - topic    → `/topics/${topics.slug}`
 *
 * Item-level `url` (when set on a non-custom item) overrides the resolved
 * URL — same convenience the picker offers in the admin UI.
 *
 * Position is dense + 0-based per (menu_id, parent_id) sibling group.
 * Move operations reflow positions in a single transaction.
 */
import { unstable_cache, updateTag } from "next/cache";
import type { DbClient } from "@core/db/client";
import { cacheOrFallback } from "@core/caching/with-fallback";
import { normalizeSlug } from "@core/slugs/normalize";

// Reads the sync DB client from globalThis to avoid a static import of
// `@core/db/instance` (which pulls in `postgres` and breaks client bundles
// that import this module via the menus barrel).
function getRuntimeDb(): DbClient {
  const fn = (globalThis as unknown as Record<string, (() => DbClient) | undefined>)["__nextpress_db_accessor__"];
  if (!fn) throw new Error("DB accessor not initialised — boot hasn't run");
  return fn();
}
import {
  MENU_ITEM_TYPES,
  MENU_ITEM_TARGETS,
  MENU_STYLES,
  type MenuItemType,
  type MenuItemTarget,
  type MenuStyle,
} from "./schema/menus";

const MENUS_CACHE_TAG = "nextpress:menus";

export class MenuSlugConflictError extends Error {
  constructor(slug: string) {
    super(`A menu with slug "${slug}" already exists`);
    this.name = "MenuSlugConflictError";
  }
}

export class MenuNotFoundError extends Error {
  constructor(id: number) {
    super(`Menu #${id} not found`);
    this.name = "MenuNotFoundError";
  }
}

export class MenuItemNotFoundError extends Error {
  constructor(id: number) {
    super(`Menu item #${id} not found`);
    this.name = "MenuItemNotFoundError";
  }
}

export interface MenuListItem {
  id: number;
  slug: string;
  name: string;
  location: string | null;
  /** Global render style — see MENU_STYLES. Defaults to "dropdowns"
   *  for any row written before the column existed. */
  style: MenuStyle;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MenuItemDetail {
  id: number;
  menuId: number;
  parentId: number | null;
  position: number;
  label: string;
  itemType: MenuItemType;
  referenceId: number | null;
  /** Either the user-set url (custom items, or override) OR the resolved
   *  URL for content items. Always populated for live menus — admin views
   *  may surface the raw stored url separately. */
  url: string;
  /** The raw `url` column as stored (may be null for content items with
   *  no override). Useful in the admin edit UI. */
  rawUrl: string | null;
  target: MenuItemTarget;
  cssClasses: string | null;
}

export interface MenuDetail extends MenuListItem {
  items: MenuItemDetail[];
}

function isItemType(s: string): s is MenuItemType {
  return (MENU_ITEM_TYPES as readonly string[]).includes(s);
}

function isItemTarget(s: string): s is MenuItemTarget {
  return (MENU_ITEM_TARGETS as readonly string[]).includes(s);
}

function isMenuStyle(s: string): s is MenuStyle {
  return (MENU_STYLES as readonly string[]).includes(s);
}

function rowToListItem(row: Record<string, unknown>): MenuListItem {
  const styleRaw = row.style != null ? String(row.style) : "dropdowns";
  return {
    id: Number(row.id),
    slug: String(row.slug),
    name: String(row.name),
    location: row.location != null ? String(row.location) : null,
    style: isMenuStyle(styleRaw) ? styleRaw : "dropdowns",
    itemCount: Number(row.item_count ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

// ─── Process-scoped menu cache ─────────────────────────────────────────────
// Public renderers call `getMenuByLocation` / `getMenuBySlug` multiple times
// per page (theme header + footer + sidebar widgets). Each call hits two
// queries (the menu row + its items). Bulk-load every menu and its items
// once, then serve subsequent lookups from memory. TTL bounds staleness;
// mutations invalidate explicitly so admin edits appear immediately.
const MENU_CACHE_KEY = "__nextpress_menu_cache__" as const;
const MENU_CACHE_AT_KEY = "__nextpress_menu_cache_at__" as const;
const MENU_CACHE_INFLIGHT_KEY = "__nextpress_menu_cache_inflight__" as const;
const MENU_CACHE_TTL_MS = 5 * 60_000;

interface MenuCachePayload {
  byId: Map<number, MenuDetail>;
  bySlug: Map<string, MenuDetail>;
  byLocation: Map<string, MenuDetail>;
  list: MenuListItem[];
}

function menuCache(): MenuCachePayload | null {
  const g = globalThis as unknown as Record<string, MenuCachePayload | null | undefined>;
  return g[MENU_CACHE_KEY] ?? null;
}
function setMenuCache(payload: MenuCachePayload | null): void {
  (globalThis as unknown as Record<string, MenuCachePayload | null>)[MENU_CACHE_KEY] = payload;
  (globalThis as unknown as Record<string, number>)[MENU_CACHE_AT_KEY] = payload ? Date.now() : 0;
}
function menuCacheAge(): number {
  return Date.now() - ((globalThis as unknown as Record<string, number | undefined>)[MENU_CACHE_AT_KEY] ?? 0);
}
function menuCacheInflight(): Promise<void> | null {
  return (globalThis as unknown as Record<string, Promise<void> | null | undefined>)[MENU_CACHE_INFLIGHT_KEY] ?? null;
}
function setMenuCacheInflight(p: Promise<void> | null): void {
  (globalThis as unknown as Record<string, Promise<void> | null>)[MENU_CACHE_INFLIGHT_KEY] = p;
}

export function invalidateMenusCache(): void {
  setMenuCache(null);
  try {
    updateTag(MENUS_CACHE_TAG);
  } catch {
    // non-Server-Action context — in-process clear is enough
  }
}

interface MenuRowsCachePayload {
  menus: Record<string, unknown>[];
  items: Record<string, unknown>[];
}

async function loadMenuRowsRaw(client: DbClient): Promise<MenuRowsCachePayload> {
  const menus = await client.execute({
    sql: `SELECT m.id, m.slug, m.name, m.location, m.style, m.created_at, m.updated_at,
                 (SELECT COUNT(*) FROM menu_items WHERE menu_id = m.id) AS item_count
            FROM menus m
           WHERE m.tenant_id = 1
        ORDER BY m.name COLLATE NOCASE ASC`,
    args: [],
  });
  const items = await client.execute({
    sql: `SELECT i.id, i.menu_id, i.parent_id, i.position, i.label,
                 i.item_type, i.reference_id, i.url, i.target, i.css_classes,
                 pg.slug AS page_slug,
                 ps.slug AS post_slug, ps.post_kind AS post_kind, ps.parent_id AS post_parent_id,
                 ps_parent.slug AS post_parent_slug,
                 tp.slug AS topic_slug
            FROM menu_items i
            LEFT JOIN pages pg
              ON i.item_type = 'page'  AND pg.id = i.reference_id AND pg.trashed_at IS NULL
            LEFT JOIN posts ps
              ON i.item_type = 'post'  AND ps.id = i.reference_id AND ps.trashed_at IS NULL
            LEFT JOIN posts ps_parent
              ON ps_parent.id = ps.parent_id
            LEFT JOIN topics tp
              ON i.item_type = 'topic' AND tp.id = i.reference_id
        ORDER BY i.menu_id, (i.parent_id IS NOT NULL), i.parent_id, i.position`,
    args: [],
  });
  return {
    menus: menus.rows.map((r) => ({ ...r })),
    items: items.rows.map((r) => ({ ...r })),
  };
}

const loadMenuRowsCached = unstable_cache(
  (): Promise<MenuRowsCachePayload> => loadMenuRowsRaw(getRuntimeDb()),
  ["nextpress", "menus-bulk", "v1"],
  { tags: [MENUS_CACHE_TAG], revalidate: 300 },
);

async function ensureMenuCache(db: DbClient): Promise<MenuCachePayload> {
  const existing = menuCache();
  if (existing && menuCacheAge() < MENU_CACHE_TTL_MS) return existing;
  let p = menuCacheInflight();
  if (!p) {
    p = (async () => {
      const { menus, items } = await cacheOrFallback(
        () => loadMenuRowsCached(),
        () => loadMenuRowsRaw(db),
      );
      const itemsByMenu = new Map<number, MenuItemDetail[]>();
      for (const row of items) {
        const menuId = Number(row.menu_id);
        const itemType = String(row.item_type);
        const target = String(row.target);
        const rawUrl = row.url != null ? String(row.url) : null;
        const resolvedUrl = resolveItemUrl(itemType, rawUrl, row);
        const detail: MenuItemDetail = {
          id: Number(row.id),
          menuId,
          parentId: row.parent_id != null ? Number(row.parent_id) : null,
          position: Number(row.position),
          label: String(row.label),
          itemType: isItemType(itemType) ? itemType : "custom",
          referenceId: row.reference_id != null ? Number(row.reference_id) : null,
          url: resolvedUrl,
          rawUrl,
          target: isItemTarget(target) ? target : "_self",
          cssClasses: row.css_classes != null ? String(row.css_classes) : null,
        };
        const list = itemsByMenu.get(menuId) ?? [];
        list.push(detail);
        itemsByMenu.set(menuId, list);
      }

      const list: MenuListItem[] = [];
      const byId = new Map<number, MenuDetail>();
      const bySlug = new Map<string, MenuDetail>();
      const byLocation = new Map<string, MenuDetail>();

      for (const row of menus) {
        const listItem = rowToListItem(row);
        list.push(listItem);
        const detail: MenuDetail = { ...listItem, items: itemsByMenu.get(listItem.id) ?? [] };
        byId.set(detail.id, detail);
        bySlug.set(detail.slug, detail);
        if (detail.location) byLocation.set(detail.location, detail);
      }
      setMenuCache({ byId, bySlug, byLocation, list });
    })().finally(() => setMenuCacheInflight(null));
    setMenuCacheInflight(p);
  }
  await p;
  return menuCache()!;
}

export async function listMenus(db: DbClient): Promise<MenuListItem[]> {
  const cache = await ensureMenuCache(db);
  return cache.list;
}

export async function getMenu(db: DbClient, id: number): Promise<MenuDetail | null> {
  const cache = await ensureMenuCache(db);
  return cache.byId.get(id) ?? null;
}

export async function getMenuBySlug(
  db: DbClient,
  slug: string,
): Promise<MenuDetail | null> {
  const cache = await ensureMenuCache(db);
  return cache.bySlug.get(slug) ?? null;
}

export async function getMenuByLocation(
  db: DbClient,
  location: string,
): Promise<MenuDetail | null> {
  const cache = await ensureMenuCache(db);
  return cache.byLocation.get(location) ?? null;
}

function resolveItemUrl(
  itemType: string,
  rawUrl: string | null,
  row: Record<string, unknown>,
): string {
  if (rawUrl && rawUrl.trim().length > 0) return rawUrl;
  if (itemType === "page" && row.page_slug != null) {
    return `/${String(row.page_slug)}`;
  }
  if (itemType === "post" && row.post_slug != null) {
    if (String(row.post_kind) === "spike" && row.post_parent_slug != null) {
      return `/${String(row.post_parent_slug)}/${String(row.post_slug)}`;
    }
    return `/${String(row.post_slug)}`;
  }
  if (itemType === "topic" && row.topic_slug != null) {
    return `/topics/${String(row.topic_slug)}`;
  }
  return "#";
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export interface CreateMenuInput {
  name: string;
  slug?: string;            // empty/undefined → derive from name
  location?: string | null;
}

export async function createMenu(db: DbClient, input: CreateMenuInput): Promise<number> {
  const name = input.name.trim();
  if (name.length === 0) throw new Error("Menu name is required");
  const candidate = (input.slug && input.slug.trim().length > 0
    ? input.slug
    : normalizeSlug(name)) || normalizeSlug(name);
  const slug = candidate.length > 0 ? candidate : `menu-${Date.now()}`;
  const location = input.location?.trim() || null;

  const conflict = await db.execute({
    sql: `SELECT id FROM menus WHERE tenant_id = 1 AND slug = ? LIMIT 1`,
    args: [slug],
  });
  if (conflict.rows.length > 0) throw new MenuSlugConflictError(slug);

  const r = await db.execute({
    sql: `INSERT INTO menus (tenant_id, slug, name, location) VALUES (1, ?, ?, ?) RETURNING id`,
    args: [slug, name, location],
  });
  invalidateMenusCache();
  return Number(r.rows[0]?.id);
}

export interface UpdateMenuInput {
  name?: string;
  slug?: string;
  location?: string | null;
  style?: MenuStyle;
}

export async function updateMenu(
  db: DbClient,
  id: number,
  input: UpdateMenuInput,
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length === 0) throw new Error("Menu name cannot be empty");
    sets.push("name = ?");
    args.push(name);
  }
  if (input.slug !== undefined) {
    const slug = normalizeSlug(input.slug);
    if (slug.length === 0) throw new Error("Menu slug cannot be empty");
    const conflict = await db.execute({
      sql: `SELECT id FROM menus WHERE tenant_id = 1 AND slug = ? AND id != ? LIMIT 1`,
      args: [slug, id],
    });
    if (conflict.rows.length > 0) throw new MenuSlugConflictError(slug);
    sets.push("slug = ?");
    args.push(slug);
  }
  if (input.location !== undefined) {
    const loc = input.location?.trim() || null;
    sets.push("location = ?");
    args.push(loc);
  }
  if (input.style !== undefined) {
    if (!isMenuStyle(input.style)) {
      throw new Error(`Invalid menu style: ${input.style}`);
    }
    sets.push("style = ?");
    args.push(input.style);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = CURRENT_TIMESTAMP");
  args.push(id);

  await db.execute({
    sql: `UPDATE menus SET ${sets.join(", ")} WHERE tenant_id = 1 AND id = ?`,
    args,
  });
  invalidateMenusCache();
}

export async function deleteMenu(db: DbClient, id: number): Promise<void> {
  await db.execute({
    sql: `DELETE FROM menus WHERE tenant_id = 1 AND id = ?`,
    args: [id],
  });
  invalidateMenusCache();
}

export interface CreateMenuItemInput {
  parentId?: number | null;
  label: string;
  itemType: MenuItemType;
  referenceId?: number | null;
  url?: string | null;
  target?: MenuItemTarget;
  cssClasses?: string | null;
}

export async function addMenuItem(
  db: DbClient,
  menuId: number,
  input: CreateMenuItemInput,
): Promise<number> {
  const label = input.label.trim();
  if (label.length === 0) throw new Error("Menu item label is required");
  const itemType: MenuItemType = isItemType(input.itemType) ? input.itemType : "custom";
  const target: MenuItemTarget = input.target && isItemTarget(input.target) ? input.target : "_self";
  const parentId = input.parentId ?? null;
  const referenceId = itemType === "custom" ? null : (input.referenceId ?? null);
  const rawUrl = (input.url ?? "").trim() || null;
  if (itemType === "custom" && !rawUrl) {
    throw new Error("Custom menu items require a URL");
  }

  const max = await db.execute({
    sql: `SELECT COALESCE(MAX(position), -1) AS max_pos FROM menu_items
           WHERE menu_id = ? AND ${parentId == null ? "parent_id IS NULL" : "parent_id = ?"}`,
    args: parentId == null ? [menuId] : [menuId, parentId],
  });
  const nextPos = Number(max.rows[0]?.max_pos ?? -1) + 1;

  const r = await db.execute({
    sql: `INSERT INTO menu_items
            (menu_id, parent_id, position, label, item_type, reference_id, url, target, css_classes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    args: [
      menuId,
      parentId,
      nextPos,
      label,
      itemType,
      referenceId,
      rawUrl,
      target,
      input.cssClasses?.trim() || null,
    ],
  });
  await touchMenu(db, menuId);
  return Number(r.rows[0]?.id);
}

export interface UpdateMenuItemInput {
  label?: string;
  itemType?: MenuItemType;
  referenceId?: number | null;
  url?: string | null;
  target?: MenuItemTarget;
  cssClasses?: string | null;
}

export async function updateMenuItem(
  db: DbClient,
  id: number,
  input: UpdateMenuItemInput,
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  if (input.label !== undefined) {
    const label = input.label.trim();
    if (label.length === 0) throw new Error("Menu item label cannot be empty");
    sets.push("label = ?"); args.push(label);
  }
  if (input.itemType !== undefined) {
    if (!isItemType(input.itemType)) throw new Error(`Invalid item_type: ${input.itemType}`);
    sets.push("item_type = ?"); args.push(input.itemType);
    if (input.itemType === "custom") {
      sets.push("reference_id = NULL");
    }
  }
  if (input.referenceId !== undefined) {
    sets.push("reference_id = ?"); args.push(input.referenceId);
  }
  if (input.url !== undefined) {
    const u = (input.url ?? "").trim() || null;
    sets.push("url = ?"); args.push(u);
  }
  if (input.target !== undefined) {
    if (!isItemTarget(input.target)) throw new Error(`Invalid target: ${input.target}`);
    sets.push("target = ?"); args.push(input.target);
  }
  if (input.cssClasses !== undefined) {
    sets.push("css_classes = ?"); args.push(input.cssClasses?.trim() || null);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = CURRENT_TIMESTAMP");
  args.push(id);

  await db.execute({
    sql: `UPDATE menu_items SET ${sets.join(", ")} WHERE id = ?`,
    args,
  });
  await touchMenuOfItem(db, id);
}

export async function deleteMenuItem(db: DbClient, id: number): Promise<void> {
  // touchMenu before delete so we still know which menu to bump.
  await touchMenuOfItem(db, id);
  await db.execute({
    sql: `DELETE FROM menu_items WHERE id = ?`,
    args: [id],
  });
}

/**
 * Move an item to a new (parent, position) within the same menu.
 * Reflows sibling positions on both source and destination groups so
 * positions stay dense and 0-based. parentId=null moves to the top
 * level. Position out of range is clamped to the end of the destination.
 */
export async function moveMenuItem(
  db: DbClient,
  id: number,
  to: { parentId: number | null; position: number },
): Promise<void> {
  const current = await db.execute({
    sql: `SELECT id, menu_id, parent_id, position FROM menu_items WHERE id = ? LIMIT 1`,
    args: [id],
  });
  const cur = current.rows[0];
  if (!cur) throw new MenuItemNotFoundError(id);
  const menuId = Number(cur.menu_id);
  const oldParent = cur.parent_id != null ? Number(cur.parent_id) : null;
  const newParent = to.parentId;

  // Detach the row by giving it a sentinel position; reflow siblings on
  // the source side so removal closes the gap, then reflow the destination
  // and insert there.
  await db.execute({
    sql: `UPDATE menu_items SET position = -1 WHERE id = ?`,
    args: [id],
  });

  await reflowSiblings(db, menuId, oldParent);

  const dest = await db.execute({
    sql: `SELECT id FROM menu_items
           WHERE menu_id = ? AND ${newParent == null ? "parent_id IS NULL" : "parent_id = ?"}
             AND id != ?
        ORDER BY position`,
    args: newParent == null ? [menuId, id] : [menuId, newParent, id],
  });
  const ids = dest.rows.map((r) => Number(r.id));
  const insertAt = Math.max(0, Math.min(to.position, ids.length));
  ids.splice(insertAt, 0, id);

  for (let i = 0; i < ids.length; i++) {
    await db.execute({
      sql: `UPDATE menu_items SET position = ?, parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [i, newParent, ids[i]],
    });
  }
  await touchMenu(db, menuId);
}

async function reflowSiblings(
  db: DbClient,
  menuId: number,
  parentId: number | null,
): Promise<void> {
  const r = await db.execute({
    sql: `SELECT id FROM menu_items
           WHERE menu_id = ? AND ${parentId == null ? "parent_id IS NULL" : "parent_id = ?"}
             AND position >= 0
        ORDER BY position`,
    args: parentId == null ? [menuId] : [menuId, parentId],
  });
  const ids = r.rows.map((row) => Number(row.id));
  for (let i = 0; i < ids.length; i++) {
    await db.execute({
      sql: `UPDATE menu_items SET position = ? WHERE id = ?`,
      args: [i, ids[i]],
    });
  }
}

async function touchMenu(db: DbClient, menuId: number): Promise<void> {
  await db.execute({
    sql: `UPDATE menus SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    args: [menuId],
  });
  invalidateMenusCache();
}

async function touchMenuOfItem(db: DbClient, itemId: number): Promise<void> {
  const r = await db.execute({
    sql: `SELECT menu_id FROM menu_items WHERE id = ? LIMIT 1`,
    args: [itemId],
  });
  const menuId = r.rows[0]?.menu_id;
  if (menuId != null) await touchMenu(db, Number(menuId));
}
