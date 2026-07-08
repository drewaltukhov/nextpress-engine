/**
 * Mega-menu service — CRUD over `menu_item_mega_panels`.
 *
 * Each row picks one of the registered layouts (`layouts/index.ts`) and
 * carries that layout's config blob plus a width preference. The service
 * stores config as JSON; the layout's own `parseConfig()` hardens it on
 * read.
 *
 * Save and delete invalidate the existing menus cache so the public
 * NavMenu renderer picks up changes on next render.
 */
import type { DbClient } from "@core/db/client";
import { invalidateMenusCache } from "@core-plugins/menus/service";
import { getLayout, type WidthMode } from "./layouts";

export interface MegaPanelDetail {
  menuItemId: number;
  layoutId: string;
  /** Raw, un-parsed JSON from the DB. The caller (admin form, public
   *  renderer) hands this to the layout's parseConfig() to type it. */
  config: unknown;
  widthMode: WidthMode;
  updatedAt: string;
}

interface SaveInput {
  layoutId: string;
  config: unknown;
  widthMode: WidthMode;
}

interface SaveOpts {
  /** Reserved for future audit-log integration. */
  updatedBy?: string | null;
}

function parseConfigJson(raw: unknown): unknown {
  if (raw == null) return {};
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

function parseWidthMode(raw: unknown): WidthMode {
  return raw === "container" ? "container" : "full";
}

export async function getPanel(
  db: DbClient,
  menuItemId: number,
): Promise<MegaPanelDetail | null> {
  const res = await db.execute({
    sql: `SELECT menu_item_id, layout_id, config, width_mode, updated_at
            FROM menu_item_mega_panels
           WHERE menu_item_id = ?
           LIMIT 1`,
    args: [menuItemId],
  });
  const row = res.rows[0];
  if (!row) return null;
  return {
    menuItemId: Number(row.menu_item_id),
    layoutId: String(row.layout_id),
    config: parseConfigJson(row.config),
    widthMode: parseWidthMode(row.width_mode),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Upsert a panel for the given menu_item_id. Validates the layoutId
 * against the registry — unknown ids are rejected so we don't store
 * dangling references.
 */
export async function savePanel(
  db: DbClient,
  menuItemId: number,
  input: SaveInput,
  _opts: SaveOpts = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!getLayout(input.layoutId)) {
    return { ok: false, error: `Unknown layout: ${input.layoutId}` };
  }
  const widthMode = parseWidthMode(input.widthMode);
  const json = JSON.stringify(input.config ?? {});

  await db.execute({
    sql: `INSERT INTO menu_item_mega_panels (menu_item_id, layout_id, config, width_mode, updated_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(menu_item_id) DO UPDATE
            SET layout_id = excluded.layout_id,
                config = excluded.config,
                width_mode = excluded.width_mode,
                updated_at = CURRENT_TIMESTAMP`,
    args: [menuItemId, input.layoutId, json, widthMode],
  });
  invalidateMenusCache();
  return { ok: true };
}

export async function deletePanel(db: DbClient, menuItemId: number): Promise<void> {
  await db.execute({
    sql: `DELETE FROM menu_item_mega_panels WHERE menu_item_id = ?`,
    args: [menuItemId],
  });
  invalidateMenusCache();
}

/**
 * Bulk-fetch every panel that belongs to items in the given menu. The
 * public NavMenu renderer calls this once per render to attach panels
 * without N+1 lookups.
 */
export async function getPanelsByMenu(
  db: DbClient,
  menuId: number,
): Promise<Map<number, { layoutId: string; config: unknown; widthMode: WidthMode }>> {
  const res = await db.execute({
    sql: `SELECT p.menu_item_id, p.layout_id, p.config, p.width_mode
            FROM menu_item_mega_panels p
            JOIN menu_items i ON i.id = p.menu_item_id
           WHERE i.menu_id = ?`,
    args: [menuId],
  });
  const map = new Map<number, { layoutId: string; config: unknown; widthMode: WidthMode }>();
  for (const row of res.rows) {
    map.set(Number(row.menu_item_id), {
      layoutId: String(row.layout_id),
      config: parseConfigJson(row.config),
      widthMode: parseWidthMode(row.width_mode),
    });
  }
  return map;
}
