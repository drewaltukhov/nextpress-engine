import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Navigation menus + their items. Each menu has an optional `location`
 * label (e.g. "primary", "footer-1", "sidebar") that themes' `<NavMenu>`
 * block uses to look up which menu to render where.
 *
 * Items reference content (page/post/topic) by id, OR carry a custom URL.
 * `parent_id` gives the tree shape; `position` orders siblings under the
 * same parent. The service layer keeps `position` dense + 0-based.
 */
export const menus = sqliteTable(
  "menus",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: integer("tenant_id").notNull().default(1),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    location: text("location"),
    /** Global per-menu render mode — see MENU_STYLES. */
    style: text("style").notNull().default("dropdowns"),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    slugUnique: uniqueIndex("menus_slug_unique").on(t.tenantId, t.slug),
    locationIdx: index("menus_location_idx").on(t.tenantId, t.location),
  }),
);

export const menuItems = sqliteTable(
  "menu_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    menuId: integer("menu_id").notNull().references(() => menus.id, { onDelete: "cascade" }),
    // Self-referencing FK is enforced in the SQL migration; Drizzle's
    // self-reference helper trips a circular type — same pattern Posts
    // uses for its self-FK on `parent_id`.
    parentId: integer("parent_id"),
    position: integer("position").notNull().default(0),
    label: text("label").notNull(),
    itemType: text("item_type").notNull(),     // 'custom' | 'page' | 'post' | 'topic'
    referenceId: integer("reference_id"),       // pages.id / posts.id / topics.id when item_type != 'custom'
    url: text("url"),                            // 'custom' uses this; others may override
    target: text("target").notNull().default("_self"),
    cssClasses: text("css_classes"),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    menuPosIdx: index("menu_items_menu_idx").on(t.menuId, t.position),
    parentPosIdx: index("menu_items_parent_idx").on(t.parentId, t.position),
  }),
);

export type MenuRow = typeof menus.$inferSelect;
export type NewMenuRow = typeof menus.$inferInsert;
export type MenuItemRow = typeof menuItems.$inferSelect;
export type NewMenuItemRow = typeof menuItems.$inferInsert;

export type MenuItemType = "custom" | "page" | "post" | "topic";
export const MENU_ITEM_TYPES = ["custom", "page", "post", "topic"] as const;

export type MenuItemTarget = "_self" | "_blank";
export const MENU_ITEM_TARGETS = ["_self", "_blank"] as const;

/** Global per-menu render style. Persisted in the `style` column on
 *  `menus` and threaded through to NavMenu via puck metadata. */
export type MenuStyle = "top-level-only" | "dropdowns" | "mega";
export const MENU_STYLES = ["top-level-only", "dropdowns", "mega"] as const;
