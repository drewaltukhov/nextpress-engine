import { sqliteTable, text, integer, uniqueIndex, index, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "@core-plugins/users/schema/users";
import { topics } from "@core-plugins/topics/schema/topics";

export const posts = sqliteTable(
  "posts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: integer("tenant_id").notNull().default(1),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    contentJson: text("content_json"),
    excerpt: text("excerpt"),
    /** Media URL chosen via MediaPickerInput; doubles as og:image fallback. */
    featuredImage: text("featured_image"),
    status: text("status").notNull().default("draft"),
    publishedAt: text("published_at"),
    /** 'standalone' | 'pillar' | 'spike' — drives URL shape and grouping. */
    postKind: text("post_kind").notNull().default("standalone"),
    /** Self-FK; meaningful only when post_kind='spike'. Service forces NULL otherwise. */
    parentId: integer("parent_id"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    seoOgImage: text("seo_og_image"),
    seoCanonical: text("seo_canonical"),
    seoRobots: text("seo_robots").notNull().default("index,follow"),
    /** Per-post opt-out from /sitemap.xml. Stored as 0/1 in SQLite. */
    seoExcludeFromSitemap: integer("seo_exclude_from_sitemap", { mode: "boolean" })
      .notNull()
      .default(false),
    schemaTypes: text("schema_types").notNull().default("[]"),
    /** ISO timestamp when the post was moved to trash; NULL = live. */
    trashedAt: text("trashed_at"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    // NULL = use built-in template for this kind ("single-post" for
    // standalone/spike, "single-pillar" for pillar). Otherwise the slug
    // of a custom theme_data row whose parent_template matches the kind.
    // No FK — see migration 003 for rationale.
    template: text("template"),
  },
  (t) => ({
    slugRootUnique: uniqueIndex("posts_slug_root_unique")
      .on(t.tenantId, t.slug)
      .where(sql`${t.trashedAt} IS NULL AND ${t.parentId} IS NULL`),
    slugChildUnique: uniqueIndex("posts_slug_child_unique")
      .on(t.tenantId, t.parentId, t.slug)
      .where(sql`${t.trashedAt} IS NULL AND ${t.parentId} IS NOT NULL`),
    statusUpdatedIdx: index("posts_status_updated_idx").on(t.tenantId, t.status, t.updatedAt),
    authorIdx: index("posts_author_idx").on(t.tenantId, t.createdBy),
    parentIdx: index("posts_parent_idx")
      .on(t.tenantId, t.parentId)
      .where(sql`${t.parentId} IS NOT NULL`),
    kindIdx: index("posts_kind_idx").on(t.tenantId, t.postKind, t.status, t.updatedAt),
    trashedIdx: index("posts_trashed_idx")
      .on(t.tenantId, t.trashedAt)
      .where(sql`${t.trashedAt} IS NOT NULL`),
  }),
);

export const postsTopics = sqliteTable(
  "posts_topics",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.postId, t.topicId] }),
    topicIdx: index("posts_topics_topic_idx").on(t.topicId),
  }),
);

export type PostRow = typeof posts.$inferSelect;
export type NewPostRow = typeof posts.$inferInsert;
export type PostTopicRow = typeof postsTopics.$inferSelect;

export const POST_STATUSES = ["draft", "published"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const POST_KINDS = ["standalone", "pillar", "spike"] as const;
export type PostKind = (typeof POST_KINDS)[number];

export const POST_ROBOTS = [
  "index,follow",
  "noindex,follow",
  "index,nofollow",
  "noindex,nofollow",
] as const;
export type PostRobots = (typeof POST_ROBOTS)[number];
