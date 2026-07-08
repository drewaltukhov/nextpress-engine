import { pgTable, text, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const sessionRevocations = pgTable(
  "session_revocations",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }).notNull().defaultNow(),
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
