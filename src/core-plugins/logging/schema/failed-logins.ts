import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const failedLogins = sqliteTable(
  "failed_logins",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: integer("tenant_id").notNull().default(1),
    email: text("email"),
    ipAddress: text("ip_address").notNull(),  // libSQL has no INET; store textual representation
    reason: text("reason").notNull(),
    geo: text("geo", { mode: "json" }).notNull().default(sql`('{}')`),
    userAgent: text("user_agent"),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`)
  },
  (t) => ({
    ipIdx: index("failed_logins_ip_idx").on(t.ipAddress, t.createdAt),
    emailIdx: index("failed_logins_email_idx").on(t.email, t.createdAt).where(sql`${t.email} IS NOT NULL`)
  })
);

export type FailedLoginRow = typeof failedLogins.$inferSelect;
