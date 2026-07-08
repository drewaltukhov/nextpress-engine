import { pgTable, serial, integer, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const failedLogins = pgTable(
  "failed_logins",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull().default(1),
    email: text("email"),
    ipAddress: text("ip_address").notNull(),  // libSQL has no INET; store textual representation
    reason: text("reason").notNull(),
    geo: jsonb("geo").notNull().default(sql`'{}'::jsonb`),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    ipIdx: index("failed_logins_ip_idx").on(t.ipAddress, t.createdAt),
    emailIdx: index("failed_logins_email_idx").on(t.email, t.createdAt).where(sql`${t.email} IS NOT NULL`)
  })
);

export type FailedLoginRow = typeof failedLogins.$inferSelect;
