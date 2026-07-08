import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "@core-plugins/users/schema/users";

export const allowedIps = sqliteTable(
  "allowed_ips",
  {
    ipCidr: text("ip_cidr").notNull(),               // e.g. '203.0.113.0/24' or '10.0.0.1/32'
    tenantId: integer("tenant_id").notNull().default(1),
    label: text("label").notNull(),                   // 'office', 'vpn', etc.
    notes: text("notes"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`)
  },
  (t) => ({
    pk: primaryKey({ columns: [t.ipCidr, t.tenantId] })
  })
);

export type AllowedIpRow = typeof allowedIps.$inferSelect;
export type NewAllowedIpRow = typeof allowedIps.$inferInsert;
