import { createClient, type Client, type Config } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { LibSqlFacadeOnPg } from "./libsql-on-pg-facade";
import { readEnv } from "@core/env";

export interface DbClientConfig {
  databaseUrl: string;
  authToken: string | undefined;
}

/**
 * Type alias used across the codebase for "a libSQL-shaped client."
 *
 * Phase 1 = always a real `@libsql/client` Client.
 * Phase 2 = under Supabase mode, `createDbClient` returns a `LibSqlFacadeOnPg`
 * that implements the same surface (`.execute`, `.batch`, `.executeMultiple`,
 * `.close`, …) — cast to `Client` at the boundary. The facade is structurally
 * compatible for the patterns NextPress uses; advanced libSQL features (typed
 * Transaction objects, sync() metadata, etc.) are NOT implemented and will
 * throw if invoked. Surface those at runtime and convert that call site to
 * `await dbAdmin()` if needed.
 */
export type DbClient = Client;

function ensureParentDir(databaseUrl: string): void {
  if (!databaseUrl.startsWith("file:")) return;
  const path = databaseUrl.slice("file:".length);
  if (path.startsWith(":memory:") || path.length === 0) return;
  const absParent = dirname(resolve(path));
  try {
    mkdirSync(absParent, { recursive: true });
  } catch (err) {
    // Serverless filesystems (Vercel/Lambda/Cloud Run/etc.) reject mkdir
    // outside /tmp. The default fallback in env.ts is file:./.local/dev.db,
    // which is fine for local dev but unusable in production. Surface a
    // useful error instead of the opaque ENOENT.
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EROFS" || code === "EACCES" || code === "ENOENT") {
      throw new Error(
        `NextPress: cannot create database directory at ${absParent} (${code}). ` +
        `On serverless platforms (Vercel, AWS Lambda, etc.) the local file ` +
        `fallback won't work — set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to ` +
        `a remote Turso database. See .env.example for the full variable list.`
      );
    }
    throw err;
  }
}

/** Sync promise — uses globalThis to survive Turbopack hot-reload */
const SYNC_KEY = "__nextpress_sync_promise__" as const;
function getSyncPromise(): Promise<void> | null {
  return (globalThis as unknown as Record<string, Promise<void> | null>)[SYNC_KEY] ?? null;
}
function setSyncPromise(p: Promise<void>): void {
  (globalThis as unknown as Record<string, Promise<void>>)[SYNC_KEY] = p;
}

/**
 * Create a libSQL-shaped client. Two backends:
 *
 *   - Turso (libSQL): real `@libsql/client` Client.
 *     When TURSO_LOCAL_REPLICA is set alongside a remote Turso URL, an
 *     embedded replica is created: reads hit the local SQLite file (instant),
 *     writes go to remote and sync back.
 *
 *   - Supabase (Postgres): a `LibSqlFacadeOnPg` that implements the same
 *     interface (`.execute`, `.batch`, …) but routes calls through a
 *     postgres-js pool connected via `DATABASE_URL`. Lets the existing 580
 *     call sites work unchanged against Supabase — Phase 2.
 */
export function createDbClient(config: DbClientConfig): DbClient {
  const env = readEnv();

  if (env.provider === "supabase") {
    if (!env.databaseUrlAdmin) {
      throw new Error(
        "createDbClient: provider=supabase but DATABASE_URL is missing. " +
          "Set DATABASE_URL in .env.local — see development_docs/supabase/setup.md."
      );
    }
    // Cast — the facade implements the libSQL Client surface NextPress uses,
    // but doesn't strictly implement every advanced overload. See the
    // DbClient type comment above.
    return new LibSqlFacadeOnPg({ url: env.databaseUrlAdmin }) as unknown as DbClient;
  }

  const localReplica = process.env.TURSO_LOCAL_REPLICA?.trim();
  const isRemote = config.databaseUrl.startsWith("libsql://") || config.databaseUrl.startsWith("https://");

  if (isRemote && localReplica) {
    const localUrl = localReplica.startsWith("file:") ? localReplica : `file:${localReplica}`;
    ensureParentDir(localUrl);
    const replicaConfig: Config = {
      url: localUrl,
      syncUrl: config.databaseUrl,
      authToken: config.authToken,
      syncInterval: 60,
    };
    const client = createClient(replicaConfig);
    // Kick off initial sync once — callers must await ensureSync() before first query
    if (!getSyncPromise()) {
      setSyncPromise(client.sync().then(() => {}));
    }
    return client;
  }

  ensureParentDir(config.databaseUrl);
  return createClient({
    url: config.databaseUrl,
    authToken: config.authToken,
  });
}

/**
 * Await the initial replica sync. Call this once before the first query
 * in any server component or action that might run before sync completes.
 * No-op when not using an embedded replica.
 */
export async function ensureSync(): Promise<void> {
  const p = getSyncPromise();
  if (p) await p;
}

// DbClient is exported at the top of this file as a union of libSQL Client +
// the Phase 2 facade. Keep this default export name stable so existing
// `import type { DbClient } from "@core/db/client"` lines keep working.
