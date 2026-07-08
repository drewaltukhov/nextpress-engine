import { pgTable, text, integer, primaryKey, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { roles } from "./roles";

export const userRoles = pgTable(
  "user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleSlug: text("role_slug")
      .notNull()
      .references(() => roles.slug),
    tenantId: integer("tenant_id").notNull().default(1)
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.roleSlug, t.tenantId] }),
    roleIdx: index("user_roles_role_idx").on(t.roleSlug),
    tenantUserIdx: index("user_roles_tenant_user_idx").on(t.tenantId, t.userId)
  })
);

export type UserRoleRow = typeof userRoles.$inferSelect;
