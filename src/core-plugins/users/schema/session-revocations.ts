import { sqliteTable, text, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const sessionRevocations = sqliteTable(
  "session_revocations",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    revokedAt: text("revoked_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    reason: text("reason").notNull()
  },
  (t) => ({
    reasonCheck: check(
      "session_revocations_reason_check",
      sql`${t.reason} IN ('password_change','admin_disabled','suspicious_activity','manual','role_demotion')`
    )
  })
);

export type SessionRevocationRow = typeof sessionRevocations.$inferSelect;
export type RevocationReason =
  | "password_change"
  | "admin_disabled"
  | "suspicious_activity"
  | "manual"
  | "role_demotion";
