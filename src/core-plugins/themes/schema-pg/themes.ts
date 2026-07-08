import { pgTable, text, serial, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

/**
 * Per-theme Puck data for shared parts (Header, Footer, Sidebar)
 * and template inner zones (Single Page, Single Post, Topic Archive,
 * 404). Themes' seed migrations `INSERT OR IGNORE` default rows; the
 * theme builder UPDATEs them in place.
 *
 * Active theme tracking lives in the existing `settings` table under
 * the key `theme.active_slug`, not here — see the themes service.
 */
export const themeData = pgTable(
  "theme_data",
  {
    id: serial("id").primaryKey(),
    themeSlug: text("theme_slug").notNull(),
    kind: text("kind").notNull(),       // 'part' | 'template'
    name: text("name").notNull(),
    puckData: text("puck_data").notNull(),  // JSON blob (Puck Data)
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
