import { sqliteTable, text, primaryKey, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const userOauthAccounts = sqliteTable(
  "user_oauth_accounts",
  {
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    profile: text("profile", { mode: "json" }).notNull().default(sql`('{}')`),
    linkedAt: text("linked_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    lastSeenAt: text("last_seen_at").notNull().default(sql`(CURRENT_TIMESTAMP)`)
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
    userIdx: index("user_oauth_accounts_user_idx").on(t.userId)
  })
);

export type UserOauthAccountRow = typeof userOauthAccounts.$inferSelect;
