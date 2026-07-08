/**
 * Plugin data cache — stale-while-revalidate pattern.
 *
 * Plugins register a fetcher and a TTL. On read:
 * - If fresh cache exists → return immediately
 * - If stale cache exists → return stale, kick off background refresh
 * - If no cache → fetch synchronously (first load only)
 *
 * Cache lives in-memory (survives across requests in the same process)
 * with an optional DB-backed persistence layer so cache survives restarts.
 */

import type { DbClient } from "@core/db/client";
import { getSetting, setSetting } from "@core-plugins/settings/registry";

interface CacheEntry<T> {
  data: T;
  fetchedAt: number; // epoch ms
}

interface CacheRegistration<T> {
  key: string;
  ttlMs: number;
  fetcher: () => Promise<T | null>;
  /** Settings key for DB persistence (optional) */
  settingsDataKey?: string;
  settingsTimestampKey?: string;
}

// Pin all three maps to globalThis so every module instance (Next.js + Turbopack
// can hand out different copies of this module to different parts of the graph)
// shares the same registrations + cache state. Without this, an eager
// `registerCache()` call from boot.ts wouldn't be visible to the route that
// later imports `getCached` — the route sees an empty Map and returns null.
// Same fix shape we use for the settings registry and DB singleton.
const MEM_KEY = "__nextpress_cache_memory__" as const;
const REGS_KEY = "__nextpress_cache_registrations__" as const;
const INFLIGHT_KEY = "__nextpress_cache_inflight__" as const;

function memoryCache(): Map<string, CacheEntry<unknown>> {
  const g = globalThis as unknown as Record<string, Map<string, CacheEntry<unknown>> | undefined>;
  if (!g[MEM_KEY]) g[MEM_KEY] = new Map();
  return g[MEM_KEY]!;
}

function registrations(): Map<string, CacheRegistration<unknown>> {
  const g = globalThis as unknown as Record<string, Map<string, CacheRegistration<unknown>> | undefined>;
  if (!g[REGS_KEY]) g[REGS_KEY] = new Map();
  return g[REGS_KEY]!;
}

function inflightRefreshes(): Map<string, Promise<void>> {
  const g = globalThis as unknown as Record<string, Map<string, Promise<void>> | undefined>;
  if (!g[INFLIGHT_KEY]) g[INFLIGHT_KEY] = new Map();
  return g[INFLIGHT_KEY]!;
}

/**
 * Register a plugin's cache entry. Call this at plugin boot.
 */
export function registerCache<T>(reg: CacheRegistration<T>): void {
  registrations().set(reg.key, reg as CacheRegistration<unknown>);
}

/**
 * Read from cache with stale-while-revalidate semantics.
 *
 * - Fresh → return immediately
 * - Stale → return stale data, refresh in background
 * - Empty → fetch synchronously, cache, return
 */
export async function getCached<T>(
  key: string,
  db?: DbClient
): Promise<T | null> {
  const reg = registrations().get(key);
  if (!reg) return null;

  const now = Date.now();
  const mem = memoryCache().get(key) as CacheEntry<T> | undefined;

  // Fresh in-memory cache
  if (mem && now - mem.fetchedAt < reg.ttlMs) {
    return mem.data;
  }

  // Stale in-memory cache — return it, refresh in background
  if (mem) {
    refreshInBackground(key, reg, db);
    return mem.data;
  }

  // No memory cache — try DB-persisted cache
  if (db && reg.settingsDataKey && reg.settingsTimestampKey) {
    const [dataJson, timestamp] = await Promise.all([
      getSetting<string>(db, reg.settingsDataKey),
      getSetting<string>(db, reg.settingsTimestampKey),
    ]);
    if (dataJson && timestamp) {
      try {
        const data = JSON.parse(dataJson) as T;
        const fetchedAt = new Date(timestamp).getTime();
        memoryCache().set(key, { data, fetchedAt });

        if (now - fetchedAt < reg.ttlMs) {
          return data; // Fresh from DB
        }
        // Stale from DB — return it, refresh in background
        refreshInBackground(key, reg, db);
        return data;
      } catch {
        // Corrupt, fall through to fetch
      }
    }
  }

  // No cache at all — synchronous fetch (first load only)
  try {
    const data = await reg.fetcher();
    if (data !== null) {
      memoryCache().set(key, { data, fetchedAt: now });
      persistToDb(key, reg, data, db);
    }
    return data as T | null;
  } catch {
    return null;
  }
}

/**
 * Invalidate a cache entry (e.g. when settings change).
 */
export function invalidateCache(key: string): void {
  memoryCache().delete(key);
}

/** Background refresh — deduped so multiple reads don't fire multiple fetches */
function refreshInBackground<T>(
  key: string,
  reg: CacheRegistration<T>,
  db?: DbClient
): void {
  if (inflightRefreshes().has(key)) return;

  const promise = (async () => {
    try {
      const data = await reg.fetcher();
      if (data !== null) {
        memoryCache().set(key, { data, fetchedAt: Date.now() });
        persistToDb(key, reg, data, db);
      }
    } catch {
      // Background refresh failure is silent
    } finally {
      inflightRefreshes().delete(key);
    }
  })();

  inflightRefreshes().set(key, promise);
}

/** Persist to DB settings (fire-and-forget) */
function persistToDb<T>(
  key: string,
  reg: CacheRegistration<T>,
  data: T,
  db?: DbClient
): void {
  if (!db || !reg.settingsDataKey || !reg.settingsTimestampKey) return;
  const now = new Date().toISOString().replace("T", " ").replace("Z", "");
  Promise.all([
    setSetting(db, reg.settingsDataKey, JSON.stringify(data)),
    setSetting(db, reg.settingsTimestampKey, now),
  ]).catch(() => {});
}
