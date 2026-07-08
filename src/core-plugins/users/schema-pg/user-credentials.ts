import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

export const userCredentials = pgTable("user_credentials", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  algo: text("algo").notNull().default("argon2id"),
  mustReset: boolean("must_reset").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export type UserCredentialsRow = typeof userCredentials.$inferSelect;
