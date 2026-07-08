import { pgTable, text, integer, serial, timestamp, uuid, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "@core-plugins/users/schema-pg/users";

export const topics = pgTable(
  "topics",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull().default(1),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    postCount: integer("post_count").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
