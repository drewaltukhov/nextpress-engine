import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "@core-plugins/users/schema/users";

export const topics = sqliteTable(
  "topics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: integer("tenant_id").notNull().default(1),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    postCount: integer("post_count").notNull().default(0),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    // NULL = use built-in `topic-archive` template. Otherwise the slug
    // of a custom theme_data row (kind='template') whose parent_template
    // = 'topic-archive'. No FK — see migration 002 for rationale.
    template: text("template"),
  },
  (t) => ({
    slugUnique: uniqueIndex("topics_slug_unique").on(t.tenantId, t.slug),
    nameIdx: index("topics_name_idx").on(t.tenantId, t.name),
  }),
);

export type TopicRow = typeof topics.$inferSelect;
export type NewTopicRow = typeof topics.$inferInsert;
