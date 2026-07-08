import { pgTable, text, timestamp, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const userEmailTokens = pgTable(
  "user_email_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),     // SHA-256 of issued token
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),             // 'verify_email' | 'reset_password' | 'invite'
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    purposeCheck: check(
      "user_email_tokens_purpose_check",
      sql`${t.purpose} IN ('verify_email','reset_password','invite')`
    ),
    userIdx: index("user_email_tokens_user_idx").on(t.userId),
    expiresIdx: index("user_email_tokens_expires_idx").on(t.expiresAt)
  })
);

export type UserEmailTokenRow = typeof userEmailTokens.$inferSelect;
export type EmailTokenPurpose = "verify_email" | "reset_password" | "invite";
