import { pgTable, integer, jsonb, text, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * PG mirror of the libSQL `menu_item_mega_panels` schema. Used by the
 * Supabase adapter via the libSQL-on-PG facade.
 */
export const menuItemMegaPanels = pgTable(
  "menu_item_mega_panels",
  {
    menuItemId: integer("menu_item_id").primaryKey(),
    layoutId: text("layout_id").notNull().default("editorial"),
    config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
    widthMode: text("width_mode").notNull().default("full"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    updatedIdx: index("mega_panels_updated_idx").on(t.updatedAt),
  }),
);

export type MegaPanelRow = typeof menuItemMegaPanels.$inferSelect;
export type NewMegaPanelRow = typeof menuItemMegaPanels.$inferInsert;
