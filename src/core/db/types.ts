import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as pgSchema from "./schema-pg";

/**
 * Full Drizzle interface for the Supabase admin path.
 * Used by `dbAdmin()` (connects as the `nextpress_admin` Postgres role).
 */
export type DbAdminClient = PostgresJsDatabase<typeof pgSchema>;

/**
 * Narrowed Drizzle interface for the Supabase public path.
 * Used by `dbPublic()` (connects as the `nextpress_public` Postgres role).
 *
 * Compile-time wall: only read operations exposed.
 *   `.insert` / `.update` / `.delete` / `.execute` are statically removed —
 *   `dbPublic().insert(plugins).values(...)` errors at TypeScript compile time.
 *
 * Runtime backstop: the `nextpress_public` role has no DML grants in Postgres,
 * so the same call would also raise `permission denied` at the database.
 * Defense in depth — compile-time wall + runtime grants.
 */
export type DbPublicClient = Pick<DbAdminClient, "select" | "$with" | "query">;
