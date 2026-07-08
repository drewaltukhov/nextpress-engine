import { pgTable, text, jsonb, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const userOauthAccounts = pgTable(
  "user_oauth_accounts",
  {
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    profile: jsonb("profile").notNull().default(sql`'{}'::jsonb`),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
    userIdx: index("user_oauth_accounts_user_idx").on(t.userId)
  })
);

export type UserOauthAccountRow = typeof userOauthAccounts.$inferSelect;
