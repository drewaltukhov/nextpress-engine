import postgres, { type Sql } from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as pgSchema from "./schema-pg";

export interface PgClientConfig {
  url: string;
  /** Pool max — keep low on Vercel serverless (each function = its own process). */
  max?: number;
  /** Idle timeout in seconds — keep short on Vercel so cold pools recycle fast. */
  idleTimeout?: number;
  /** Connect timeout in seconds. */
  connectTimeout?: number;
}

/**
 * Create a postgres-js Sql pool. The default settings are tuned for Phase 1's
 * role-separated connections, which use Supabase's direct DB host
 * (db.<project_ref>.supabase.co:5432) — NOT the Supavisor pooler — because
 * Supavisor authenticates only the built-in `postgres` user.
 *
 * **`prepare: false`** is still required: leaves the door open to swap back to
 * Supavisor for the superuser path (e.g. migrations) without behavior changes.
 *
 * **`max: 4`** instead of 10: each connection here is a real Postgres backend
 * (no Supavisor multiplexing). On Vercel serverless with up to 1000 concurrent
 * functions × 2 pools × 4 each = 8000 connections in the worst case — still
 * a lot, but it gives at least 10× headroom over Supabase's free-tier limit
 * (60). Tune up per-deployment if observability shows the pool is the
 * bottleneck on writes.
 *
 * `ssl: "require"` matches Supabase's default. Avoid `{ rejectUnauthorized: false }`
 * unless a specific cert issue forces it — it's a security regression.
 */
function makePool(config: PgClientConfig): Sql {
  return postgres(config.url, {
    max: config.max ?? 4,
    idle_timeout: config.idleTimeout ?? 30,
    connect_timeout: config.connectTimeout ?? 30,
    prepare: false,
    ssl: "require"
  });
}

/**
 * Create a Drizzle-wrapped Postgres client with the shared pg schema.
 * Callers should pass the connection string for the role they want
 * (e.g., `DATABASE_URL` for admin, `DATABASE_URL_PUBLIC` for public reads).
 */
export function createPgDb(config: PgClientConfig): PostgresJsDatabase<typeof pgSchema> {
  const sql = makePool(config);
  return drizzle(sql, { schema: pgSchema });
}

export type { Sql };
