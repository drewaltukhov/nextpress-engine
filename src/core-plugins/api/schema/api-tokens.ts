import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "@core-plugins/users/schema/users";

export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: integer("tenant_id").notNull().default(1),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    prefix: text("prefix").notNull(),                          // first 8 chars of token, e.g. "npp_a3f9"
    scopes: text("scopes", { mode: "json" }).notNull().default(sql`('[]')`),  // JSON string[]
    allowedOrigins: text("allowed_origins", { mode: "json" }), // JSON string[] of CIDRs, null = any
    rateLimitPerMinute: integer("rate_limit_per_minute"),       // null = use site default (60)
    expiresAt: text("expires_at"),
    lastUsedAt: text("last_used_at"),
    lastUsedIp: text("last_used_ip"),
    revokedAt: text("revoked_at"),
    revokedBy: text("revoked_by").references(() => users.id, { onDelete: "set null" }),
    revokedReason: text("revoked_reason"),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" })
  },
  (t) => ({
    hashUnique: uniqueIndex("api_tokens_hash_unique").on(t.tokenHash),
    activeIdx: index("api_tokens_active_idx")
      .on(t.tokenHash)
      .where(sql`${t.revokedAt} IS NULL`),
    userIdx: index("api_tokens_user_idx").on(t.userId, t.tenantId)
  })
);

export type ApiTokenRow = typeof apiTokens.$inferSelect;
export type NewApiTokenRow = typeof apiTokens.$inferInsert;
