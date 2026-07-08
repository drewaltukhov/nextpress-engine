import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Mega-menu panels — pre-built React layout selected per top-level menu
 * item. Storage shape:
 *
 *   menu_item_id   FK (CASCADE) → menu_items.id, primary key
 *   layout_id      one of the registered LayoutDef ids ('editorial', …)
 *   config         layout-specific JSON, parsed/defaulted by the layout's
 *                  parseConfig() at read time
 *   width_mode     'full' (100vw under the nav) | 'container' (theme
 *                  container width)
 *
 * The previous v1 shape used a freeform Puck tree (`puck_data`); the
 * pivot to a layout registry replaced it. See migration 002.
 */
export const menuItemMegaPanels = sqliteTable(
  "menu_item_mega_panels",
  {
    menuItemId: integer("menu_item_id").primaryKey(),
    layoutId: text("layout_id").notNull().default("editorial"),
    config: text("config").notNull().default("{}"),
    widthMode: text("width_mode").notNull().default("full"),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    updatedIdx: index("mega_panels_updated_idx").on(t.updatedAt),
  }),
);

export type MegaPanelRow = typeof menuItemMegaPanels.$inferSelect;
export type NewMegaPanelRow = typeof menuItemMegaPanels.$inferInsert;
