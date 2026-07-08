/**
 * Settings registry — define, get, set site settings.
 *
 * Plugins call `defineSettings()` at boot to register their settings with
 * metadata (Zod schema, defaults, group, encryption flag). `getSetting()`
 * and `setSetting()` read/write the DB with validation and caching.
 *
 * Autoloaded settings are cached in memory at boot via `loadAutoloadCache()`.
 */
import { unstable_cache, updateTag } from "next/cache";
import type { DbClient } from "@core/db/client";
import { cacheOrFallback } from "@core/caching/with-fallback";
import type { ZodSchema } from "zod";
import { encrypt, decrypt, type EncryptedPayload } from "./crypto";

export const SETTINGS_CACHE_TAG = "nextpress:settings";

function getRuntimeDb(): DbClient {
  const fn = (globalThis as unknown as Record<string, (() => DbClient) | undefined>)["__nextpress_db_accessor__"];
  if (!fn) throw new Error("DB accessor not initialised — boot hasn't run");
  return fn();
}

// ---------------------------------------------------------------------------
// Registry types
// ---------------------------------------------------------------------------

export interface SettingDefinition {
  key: string;
  group: string;
  label: string;
  description?: string;
  schema: ZodSchema;
  defaultValue: unknown;
  scope: "public" | "private";
  encrypted?: boolean;
  permission?: string;
  stepUpRequired?: boolean;
  /** Pretty labels for `z.enum([...])` values. The settings UI uses
   *  these to render a dropdown. Missing keys fall back to the raw
   *  enum token. Ignored on non-enum schemas. */
  optionLabels?: Record<string, string>;
}

// Pin both maps to globalThis so Turbopack hot-reload doesn't drop them.
// Module-level Maps get re-created when next/turbopack re-evaluates this
// file in dev — which empties the definitions map *between* boot and the
// next setSetting() call, so `def?.encrypted` falls back to false and
// secrets land in the DB as plaintext flagged encrypted=1.
const DEFS_KEY = "__nextpress_setting_defs__" as const;
const AUTOLOAD_KEY = "__nextpress_setting_autoload__" as const;

function definitions(): Map<string, SettingDefinition> {
  const g = globalThis as unknown as Record<string, Map<string, SettingDefinition> | undefined>;
  if (!g[DEFS_KEY]) g[DEFS_KEY] = new Map();
  return g[DEFS_KEY]!;
}

function autoloadCache(): Map<string, unknown> {
  const g = globalThis as unknown as Record<string, Map<string, unknown> | undefined>;
  if (!g[AUTOLOAD_KEY]) g[AUTOLOAD_KEY] = new Map();
  return g[AUTOLOAD_KEY]!;
}

// ---------------------------------------------------------------------------
// Process-scoped bulk cache (Supabase mode optimization)
// ---------------------------------------------------------------------------
// `getSetting()` was the hottest read in profiling: ~79 individual queries
// per home-page render. Each query is a separate Postgres round-trip under
// the libSQL-on-pg facade, and at WAN distance that's hundreds of ms each.
//
// This cache bulk-loads every site_settings row for the tenant in one query
// the first time any non-autoloaded key is requested, then serves subsequent
// lookups from memory until the TTL expires. Stale reads are acceptable —
// settings change rarely, and writes invalidate the bulk cache.
const BULK_KEY = "__nextpress_setting_bulk__" as const;
const BULK_AT_KEY = "__nextpress_setting_bulk_at__" as const;
const BULK_INFLIGHT_KEY = "__nextpress_setting_bulk_inflight__" as const;
const BULK_TTL_MS = 5 * 60_000;

interface BulkRow {
  value: string;
  encrypted: boolean;
}

function bulkCache(): Map<string, BulkRow> | null {
  const g = globalThis as unknown as Record<string, Map<string, BulkRow> | null | undefined>;
  return g[BULK_KEY] ?? null;
}
function setBulkCache(map: Map<string, BulkRow> | null): void {
  (globalThis as unknown as Record<string, Map<string, BulkRow> | null>)[BULK_KEY] = map;
  (globalThis as unknown as Record<string, number>)[BULK_AT_KEY] = map ? Date.now() : 0;
}
function bulkCacheAge(): number {
  const g = globalThis as unknown as Record<string, number | undefined>;
  return Date.now() - (g[BULK_AT_KEY] ?? 0);
}
function bulkInflight(): Promise<void> | null {
  const g = globalThis as unknown as Record<string, Promise<void> | null | undefined>;
  return g[BULK_INFLIGHT_KEY] ?? null;
}
function setBulkInflight(p: Promise<void> | null): void {
  const g = globalThis as unknown as Record<string, Promise<void> | null>;
  g[BULK_INFLIGHT_KEY] = p;
}

/**
 * Invalidate both the in-process Map and the Next.js data cache for settings.
 * Called by setSetting / deleteSetting / boot-time autoload-cache reset.
 *
 * `updateTag` is the Next 16 "purge tag" API — only valid inside a Server
 * Action, so we swallow throws from boot/test/script callers (the in-process
 * clear above is enough for those contexts).
 */
export function invalidateSettingsBulkCache(): void {
  setBulkCache(null);
  try {
    updateTag(SETTINGS_CACHE_TAG);
  } catch {
    // non-Server-Action context — in-process clear is enough
  }
}

const loadAllSettingsCached = unstable_cache(
  (): Promise<Array<{ key: string; value: string; encrypted: boolean }>> =>
    loadAllSettingsRaw(getRuntimeDb()),
  ["nextpress", "settings-all", "v1"],
  { tags: [SETTINGS_CACHE_TAG], revalidate: 300 },
);

async function loadAllSettingsRaw(db: DbClient): Promise<Array<{ key: string; value: string; encrypted: boolean }>> {
  const result = await db.execute({
    sql: "SELECT key, value, encrypted FROM site_settings WHERE tenant_id = 1",
    args: [],
  });
  return result.rows.map((row) => ({
    key: String(row.key),
    value: String(row.value),
    encrypted: Number(row.encrypted) === 1,
  }));
}

async function ensureBulkCache(db: DbClient): Promise<void> {
  if (bulkCache() && bulkCacheAge() < BULK_TTL_MS) return;
  // Concurrent callers share one fetch.
  let p = bulkInflight();
  if (!p) {
    p = (async () => {
      const rows = await cacheOrFallback(
        () => loadAllSettingsCached(),
        () => loadAllSettingsRaw(db),
      );
      const next = new Map<string, BulkRow>();
      for (const row of rows) {
        next.set(row.key, { value: row.value, encrypted: row.encrypted });
      }
      setBulkCache(next);
    })().finally(() => setBulkInflight(null));
    setBulkInflight(p);
  }
  await p;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register one or more setting definitions. Called by plugins at boot.
 */
export function defineSettings(defs: SettingDefinition[]): void {
  for (const def of defs) {
    definitions().set(def.key, def);
  }
}

/**
 * Get a registered definition by key.
 */
export function getDefinition(key: string): SettingDefinition | undefined {
  return definitions().get(key);
}

/**
 * List all registered definitions, optionally filtered by group.
 */
export function listDefinitions(group?: string): SettingDefinition[] {
  const all = Array.from(definitions().values());
  if (!group) return all;
  return all.filter((d) => d.group === group);
}

/**
 * List distinct group names.
 */
export function listGroups(): string[] {
  return [...new Set(Array.from(definitions().values()).map((d) => d.group))];
}

// ---------------------------------------------------------------------------
// Autoload cache
// ---------------------------------------------------------------------------

/**
 * Load all autoloaded settings into memory. Call once at app boot.
 */
export async function loadAutoloadCache(db: DbClient, secret?: string): Promise<void> {
  autoloadCache().clear();
  const rows = await db.execute({
    sql: "SELECT key, value, encrypted FROM site_settings WHERE tenant_id = 1 AND autoload = 1",
    args: []
  });
  for (const row of rows.rows) {
    const key = String(row.key);
    const isEncrypted = Number(row.encrypted) === 1;
    const raw = String(row.value);

    if (isEncrypted && secret) {
      try {
        const payload = JSON.parse(raw) as EncryptedPayload;
        const decrypted = decrypt(payload, secret);
        autoloadCache().set(key, JSON.parse(decrypted));
      } catch {
        // Decryption failure — skip, will fall through to DB on read
      }
    } else {
      try {
        autoloadCache().set(key, JSON.parse(raw));
      } catch {
        autoloadCache().set(key, raw);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Get / Set
// ---------------------------------------------------------------------------

/**
 * Read a setting value. Checks autoload cache first, then DB. Returns the
 * definition's defaultValue if no row exists.
 */
export async function getSetting<T = unknown>(
  db: DbClient,
  key: string,
  secret?: string
): Promise<T> {
  // 1. Check autoload cache
  if (autoloadCache().has(key)) {
    return autoloadCache().get(key) as T;
  }

  // 2. Bulk cache — single query loads every row for the tenant; subsequent
  //    keys served from memory until the TTL expires. Cuts ~80 settings reads
  //    per page render to 1.
  await ensureBulkCache(db);
  const cached = bulkCache()!.get(key);

  if (!cached) {
    // 3. Fall back to definition default
    const def = definitions().get(key);
    if (def) return def.defaultValue as T;
    return undefined as T;
  }

  const isEncrypted = cached.encrypted;
  const raw = cached.value;

  if (isEncrypted && secret) {
    try {
      const payload = JSON.parse(raw) as EncryptedPayload;
      const decrypted = decrypt(payload, secret);
      return JSON.parse(decrypted) as T;
    } catch {
      return undefined as T;
    }
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as T;
  }
}

/**
 * Write a setting value. Validates against the Zod schema if a definition
 * exists. Encrypts if the definition specifies `encrypted: true`.
 */
export async function setSetting(
  db: DbClient,
  key: string,
  value: unknown,
  opts: { updatedBy?: string | null; secret?: string } = {}
): Promise<void> {
  const def = definitions().get(key);

  // Validate with Zod schema if defined
  if (def?.schema) {
    def.schema.parse(value);
  }

  const scope = def?.scope ?? "private";
  const autoload = def ? (autoloadCache().has(key) || false) : false;
  const isEncrypted = def?.encrypted ?? false;

  // Guard against silently writing plaintext into a row that's already
  // flagged encrypted=1. If the definition isn't loaded (e.g. plugin
  // boot didn't run yet) we'd fall through to the else branch below and
  // corrupt the row — a fresh read would then JSON.parse the plaintext
  // as an EncryptedPayload, fail, and return undefined. Refuse instead.
  if (!isEncrypted) {
    // Prefer the bulk cache when present — saves a round-trip for every write.
    let existingEncrypted: boolean | null = null;
    const fromCache = bulkCache()?.get(key);
    if (fromCache) {
      existingEncrypted = fromCache.encrypted;
    } else {
      const existing = await db.execute({
        sql: "SELECT encrypted FROM site_settings WHERE tenant_id = 1 AND key = ? LIMIT 1",
        args: [key]
      });
      const row = existing.rows[0];
      existingEncrypted = row ? Number(row.encrypted) === 1 : null;
    }
    if (existingEncrypted === true) {
      throw new Error(
        `setSetting(${key}): existing row is encrypted, but no encrypted definition is loaded for this key. ` +
        `Refusing to overwrite ciphertext with plaintext. This usually means the settings plugin hasn't booted ` +
        `(definitions map empty) — make sure bootEngine() ran before the write.`
      );
    }
  }
  if (isEncrypted && !opts.secret) {
    throw new Error(
      `setSetting(${key}): definition requires encryption but no secret was passed. ` +
      `Pass opts.secret = process.env.AUTH_SECRET.`
    );
  }

  let dbValue: string;
  if (isEncrypted && opts.secret) {
    const payload = encrypt(JSON.stringify(value), opts.secret);
    dbValue = JSON.stringify(payload);
  } else {
    dbValue = JSON.stringify(value);
  }

  // ON CONFLICT must sync the `encrypted` column so a row seeded as
  // encrypted=0 with a placeholder gets flipped to encrypted=1 the moment
  // a real secret is written through this path. Without this, getSetting
  // skips the decrypt branch and returns the raw payload object — which
  // breaks any caller that expects a string back.
  const sql = `INSERT INTO site_settings (tenant_id, key, value, autoload, scope, encrypted, updated_by, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (tenant_id, key) DO UPDATE SET
          value = excluded.value,
          encrypted = excluded.encrypted,
          updated_by = excluded.updated_by,
          updated_at = CURRENT_TIMESTAMP`;
  const args = [key, dbValue, autoload ? 1 : 0, scope, isEncrypted ? 1 : 0, opts.updatedBy ?? null];

  try {
    await db.execute({ sql, args });
  } catch (err) {
    // FK constraint failure (stale JWT user ID after restore) — retry without updated_by
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("FOREIGN KEY") && opts.updatedBy) {
      const retryArgs = [...args];
      retryArgs[5] = null; // updated_by
      await db.execute({ sql, args: retryArgs });
    } else {
      throw err;
    }
  }

  // Update autoload cache if this key is autoloaded
  if (autoload) {
    autoloadCache().set(key, value);
  }
  // Invalidate the bulk read cache so the next read sees the fresh value.
  invalidateSettingsBulkCache();
}

/**
 * Delete a setting. Primarily for testing / cleanup.
 */
export async function deleteSetting(db: DbClient, key: string): Promise<void> {
  await db.execute({
    sql: "DELETE FROM site_settings WHERE tenant_id = 1 AND key = ?",
    args: [key]
  });
  autoloadCache().delete(key);
  invalidateSettingsBulkCache();
}

/** Reset registry (for testing). */
export function _resetRegistry(): void {
  definitions().clear();
  autoloadCache().clear();
  invalidateSettingsBulkCache();
}
