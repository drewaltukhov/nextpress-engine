import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "@core-plugins/users/schema/users";

export const pages = sqliteTable(
  "pages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: integer("tenant_id").notNull().default(1),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    contentJson: text("content_json"),
    excerpt: text("excerpt"),
    status: text("status").notNull().default("draft"),
    publishedAt: text("published_at"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    seoOgImage: text("seo_og_image"),
    seoCanonical: text("seo_canonical"),
    seoRobots: text("seo_robots").notNull().default("index,follow"),
    /** Per-page opt-out from /sitemap.xml. Stored as 0/1 in SQLite. */
    seoExcludeFromSitemap: integer("seo_exclude_from_sitemap", { mode: "boolean" })
      .notNull()
      .default(false),
    schemaTypes: text("schema_types").notNull().default("[]"),
    /** ISO timestamp when the page was moved to trash; NULL = live. The
     *  unique slug index is partial (excludes trashed rows) so a slug
     *  can be reused the moment a page is trashed. */
    trashedAt: text("trashed_at"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    // NULL = use built-in `single-page` template. Otherwise the slug of
    // a custom theme_data row whose parent_template = 'single-page'.
    // No FK — see migration 005 for rationale.
    template: text("template"),
  },
  (t) => ({
    slugUnique: uniqueIndex("pages_slug_unique")
      .on(t.tenantId, t.slug)
      .where(sql`${t.trashedAt} IS NULL`),
    statusUpdatedIdx: index("pages_status_updated_idx").on(t.tenantId, t.status, t.updatedAt),
    authorIdx: index("pages_author_idx").on(t.tenantId, t.createdBy),
    trashedIdx: index("pages_trashed_idx")
      .on(t.tenantId, t.trashedAt)
      .where(sql`${t.trashedAt} IS NOT NULL`),
  }),
);

export type PageRow = typeof pages.$inferSelect;
export type NewPageRow = typeof pages.$inferInsert;

export const PAGE_STATUSES = ["draft", "published"] as const;
export type PageStatus = (typeof PAGE_STATUSES)[number];

export const PAGE_ROBOTS = [
  "index,follow",
  "noindex,follow",
  "index,nofollow",
  "noindex,nofollow",
] as const;
export type PageRobots = (typeof PAGE_ROBOTS)[number];
