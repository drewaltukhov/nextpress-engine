import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Per-theme Puck data for shared parts (Header, Footer, Sidebar)
 * and template inner zones (Single Page, Single Post, Topic Archive,
 * 404). Themes' seed migrations `INSERT OR IGNORE` default rows; the
 * theme builder UPDATEs them in place.
 *
 * Active theme tracking lives in the existing `settings` table under
 * the key `theme.active_slug`, not here — see the themes service.
 */
export const themeData = sqliteTable(
  "theme_data",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    themeSlug: text("theme_slug").notNull(),
    kind: text("kind").notNull(),       // 'part' | 'template'
    name: text("name").notNull(),
    puckData: text("puck_data").notNull(),  // JSON blob (Puck Data)
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedBy: text("updated_by"),
    // --- new in 002_custom_templates ---
    // NULL for built-ins; one of CLONEABLE_TEMPLATE_IDS for custom rows.
    parentTemplate: text("parent_template"),
    // NULL for built-ins; user-entered label for custom rows.
    displayName: text("display_name"),
  },
  (t) => ({
    slugKindNameUnique: uniqueIndex("theme_data_slug_kind_name_unique").on(
      t.themeSlug,
      t.kind,
      t.name,
    ),
    themeParentIdx: index("theme_data_theme_parent_idx").on(
      t.themeSlug,
      t.parentTemplate,
    ),
  }),
);

export type ThemeDataRow = typeof themeData.$inferSelect;
export type NewThemeDataRow = typeof themeData.$inferInsert;

export type ThemeDataKind = "part" | "template";
export const THEME_DATA_KINDS = ["part", "template"] as const;
