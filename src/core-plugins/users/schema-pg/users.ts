import { pgTable, text, integer, uuid, jsonb, timestamp, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: integer("tenant_id").notNull().default(1),
    email: text("email").notNull(),
    emailVerifiedAt: text("email_verified_at"),
    displayName: text("display_name").notNull(),
    fullName: text("full_name"),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    timezone: text("timezone").notNull().default("UTC"),
    locale: text("locale").notNull().default("en"),
    lastLoginAt: text("last_login_at"),
    lockoutUntil: text("lockout_until"),
    lockoutAttemptCount: integer("lockout_attempt_count").notNull().default(0),
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("active"),
    deletedAt: text("deleted_at"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    // Partial unique — soft-deleted emails are reusable. Matches the
    // duplicate guard in createUser (WHERE deleted_at IS NULL).
    activeEmailUnique: uniqueIndex("users_active_email_unique")
      .on(t.tenantId, t.email)
      .where(sql`${t.deletedAt} IS NULL`),
    lockedIdx: index("users_locked_idx").on(t.lockoutUntil).where(sql`${t.lockoutUntil} IS NOT NULL`),
    statusCheck: check("users_status_check", sql`${t.status} IN ('active','invited','disabled')`)
  })
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
