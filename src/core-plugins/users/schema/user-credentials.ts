import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const userCredentials = sqliteTable("user_credentials", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  algo: text("algo").notNull().default("argon2id"),
  mustReset: integer("must_reset", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`)
});

export type UserCredentialsRow = typeof userCredentials.$inferSelect;
