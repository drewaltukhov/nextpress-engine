/**
 * DB client instances.
 *
 * Two distinct shapes co-exist during the phased Supabase rollout:
 *
 *   1. `db()` — synchronous, returns the libSQL `Client`.
 *      Preserves the existing API for all 580+ call sites that currently use sync `db()`.
 *      In Supabase mode, `db()` throws a clear upgrade-path error — those callers must
 *      migrate to `dbAdmin()` / `dbPublic()` in subsequent phases.
 *
 *   2. `dbAdmin()` / `dbPublic()` — promise-based singletons returning Drizzle-wrapped
 *      Postgres clients (Supabase mode only). New code uses these.
 *
 * The promise-based singletons memoize the **init Promise** (not the resolved client) so
 * concurrent callers under serverless cold-start swarms share one initialization. Pattern
 * mirrors `src/core/boot.ts`'s `bootPromise` (lines 14-52).
 */
import { createDbClient, ensureSync, type DbClient } from "./client";
import { createPgDb } from "./client-pg";
import { readEnv } from "@core/env";
import type { DbAdminClient, DbPublicClient } from "./types";

const SYNC_KEY = "__nextpress_db_sync__" as const;
const ADMIN_PROMISE_KEY = "__nextpress_db_admin_promise__" as const;
const PUBLIC_PROMISE_KEY = "__nextpress_db_public_promise__" as const;

/**
 * globalThis-exposed accessor for `db()`. The reason: leaf modules (cache
 * loaders inside core-plugins/{settings,menus,…}) need to read the sync
 * client, but a static `import { db } from "@core/db/instance"` drags the
 * `postgres` package into client bundles via barrel re-exports. Reading
 * via globalThis decouples those leaves from this module's static graph.
 *
 * Set as a side-effect of this module loading. Boot always touches this
 * module first (via `bootEngine()` import chain), so by the time any
 * service-layer cache loader fires the accessor is in place.
 */
const DB_ACCESSOR_KEY = "__nextpress_db_accessor__" as const;
(globalThis as unknown as Record<string, () => DbClient>)[DB_ACCESSOR_KEY] = () => db();

function getStored<T>(key: string): T | null {
  return (globalThis as unknown as Record<string, T | undefined>)[key] ?? null;
}
function setStored<T>(key: string, value: T): void {
  (globalThis as unknown as Record<string, T>)[key] = value;
}

/**
 * Synchronous client for the existing 580+ call sites in the codebase.
 *
 * Phase 1: under Supabase mode, threw a clear "use dbAdmin/dbPublic" error.
 * Phase 2: under Supabase mode, returns a `LibSqlFacadeOnPg` instance that
 * implements the libSQL `Client` interface (`.execute`, `.batch`, …) but
 * routes every call to a postgres-js pool. The existing call sites keep
 * working unchanged; only SQL constructs the facade can't translate (a
 * small known set — see `libsql-on-pg-facade.ts`) need per-site Drizzle
 * conversion when discovered at runtime.
 *
 * Returns the same singleton instance on subsequent calls.
 */
export function db(): DbClient {
  let cached = getStored<DbClient>(SYNC_KEY);
  if (!cached) {
    const env = readEnv();
    cached = createDbClient({ databaseUrl: env.databaseUrl, authToken: env.authToken });
    setStored(SYNC_KEY, cached);
  }
  return cached;
}

async function initAdmin(): Promise<DbAdminClient> {
  const env = readEnv();
  if (env.provider !== "supabase") {
    throw new Error(
      "NextPress: dbAdmin() is only available in Supabase mode. " +
        "For Turso, use the synchronous db() instead."
    );
  }
  return createPgDb({ url: env.databaseUrlAdmin! });
}

async function initPublic(): Promise<DbPublicClient> {
  const env = readEnv();
  if (env.provider !== "supabase") {
    throw new Error(
      "NextPress: dbPublic() is only available in Supabase mode. " +
        "For Turso (no role separation), use the synchronous db() instead."
    );
  }
  // The runtime client is the full pg Drizzle instance; the public connection
  // uses the `nextpress_public` Postgres role (Postgres-level grant-based wall).
  // The TS return type `DbPublicClient` narrows to read-only methods at compile
  // time — defense in depth: compile-time wall + runtime grants.
  return createPgDb({ url: env.databaseUrlPublic! }) as unknown as DbPublicClient;
}

/**
 * Promise-based singleton for the admin Drizzle client.
 * Memoizes the init promise so concurrent callers share one initialization.
 */
export function dbAdmin(): Promise<DbAdminClient> {
  let p = getStored<Promise<DbAdminClient>>(ADMIN_PROMISE_KEY);
  if (!p) {
    p = initAdmin();
    setStored(ADMIN_PROMISE_KEY, p);
  }
  return p;
}

/**
 * Promise-based singleton for the public-role Drizzle client.
 * Memoizes the init promise so concurrent callers share one initialization.
 */
export function dbPublic(): Promise<DbPublicClient> {
  let p = getStored<Promise<DbPublicClient>>(PUBLIC_PROMISE_KEY);
  if (!p) {
    p = initPublic();
    setStored(PUBLIC_PROMISE_KEY, p);
  }
  return p;
}

export { ensureSync };
