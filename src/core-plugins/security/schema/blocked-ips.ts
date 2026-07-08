import { sqliteTable, text, integer, index, primaryKey, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "@core-plugins/users/schema/users";

export const blockedIps = sqliteTable(
  "blocked_ips",
  {
    ipAddress: text("ip_address").notNull(),
    tenantId: integer("tenant_id").notNull().default(1),
    reason: text("reason").notNull(),
    blockedUntil: text("blocked_until"),             // ISO 8601; null = permanent
    blockedBy: text("blocked_by").references(() => users.id, { onDelete: "set null" }),
    attemptCount: integer("attempt_count"),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`)
  },
  (t) => ({
    pk: primaryKey({ columns: [t.ipAddress, t.tenantId] }),
    // libSQL forbids non-deterministic functions (like CURRENT_TIMESTAMP) in
    // partial-index WHERE clauses, so this stays a full index and queries
    // filter by `blocked_until` at read time.
    activeIdx: index("blocked_ips_active_idx").on(t.tenantId, t.ipAddress),
    reasonCheck: check(
      "blocked_ips_reason_check",
      sql`${t.reason} IN ('auto:brute_force','auto:scanner','manual','admin_blocked')`
    )
  })
);

export type BlockedIpRow = typeof blockedIps.$inferSelect;
export type NewBlockedIpRow = typeof blockedIps.$inferInsert;
