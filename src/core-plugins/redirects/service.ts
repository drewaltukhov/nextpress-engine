/**
 * Redirects service — match, create, cycle-detect, hit-tracking.
 *
 * Redirect matching is path-only (no hostname). Active redirects with
 * unexpired `expires_at` are matched. Hit counts are bumped async.
 *
 * Cycle detection prevents chains longer than MAX_CHAIN_DEPTH hops.
 */
import { unstable_cache, updateTag } from "next/cache";
import type { DbClient } from "@core/db/client";
import { cacheOrFallback } from "@core/caching/with-fallback";
import { getSetting } from "@core-plugins/settings/registry";

function getRuntimeDb(): DbClient {
  const fn = (globalThis as unknown as Record<string, (() => DbClient) | undefined>)["__nextpress_db_accessor__"];
  if (!fn) throw new Error("DB accessor not initialised — boot hasn't run");
  return fn();
}

const REDIRECTS_CACHE_TAG = "nextpress:redirects";

const MAX_CHAIN_DEPTH = 5;

const AUTO_SETTING_BY_SOURCE: Record<
  "permalink_change" | "slug_change" | "media_rename",
  string
> = {
  permalink_change: "redirects.auto_on_permalink_change",
  slug_change: "redirects.auto_on_slug_change",
  media_rename: "redirects.auto_on_media_rename",
};

// ---------------------------------------------------------------------------
// Match result
// ---------------------------------------------------------------------------

export interface RedirectMatch {
  id: number;
  fromPath: string;
  toPath: string;
  status: number;           // 301, 302, 307, 308, 410
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

// ─── Process-scoped active-redirects cache ─────────────────────────────────
// The proxy calls matchRedirect on every public-path request. Bulk-load all
// active rows once + serve lookups from memory. Mutations invalidate.
const REDIRECT_CACHE_KEY = "__nextpress_redirects_cache__" as const;
const REDIRECT_CACHE_AT_KEY = "__nextpress_redirects_cache_at__" as const;
const REDIRECT_CACHE_INFLIGHT_KEY = "__nextpress_redirects_cache_inflight__" as const;
const REDIRECT_CACHE_TTL_MS = 5 * 60_000;

interface CachedRedirect {
  id: number;
  fromPath: string;
  toPath: string;
  status: number;
  expiresAt: string | null;
}

function redirectCache(): Map<string, CachedRedirect> | null {
  return (globalThis as unknown as Record<string, Map<string, CachedRedirect> | null | undefined>)[REDIRECT_CACHE_KEY] ?? null;
}
function setRedirectCache(map: Map<string, CachedRedirect> | null): void {
  (globalThis as unknown as Record<string, Map<string, CachedRedirect> | null>)[REDIRECT_CACHE_KEY] = map;
  (globalThis as unknown as Record<string, number>)[REDIRECT_CACHE_AT_KEY] = map ? Date.now() : 0;
}
function redirectCacheAge(): number {
  return Date.now() - ((globalThis as unknown as Record<string, number | undefined>)[REDIRECT_CACHE_AT_KEY] ?? 0);
}
function redirectCacheInflight(): Promise<void> | null {
  return (globalThis as unknown as Record<string, Promise<void> | null | undefined>)[REDIRECT_CACHE_INFLIGHT_KEY] ?? null;
}
function setRedirectCacheInflight(p: Promise<void> | null): void {
  (globalThis as unknown as Record<string, Promise<void> | null>)[REDIRECT_CACHE_INFLIGHT_KEY] = p;
}

export function invalidateRedirectsCache(): void {
  setRedirectCache(null);
  try {
    updateTag(REDIRECTS_CACHE_TAG);
  } catch {
    // non-Server-Action context — in-process clear is enough
  }
}

async function loadActiveRedirectsRaw(db: DbClient): Promise<CachedRedirect[]> {
  const r = await db.execute({
    sql: `SELECT id, from_path, to_path, status, expires_at
          FROM redirects
          WHERE tenant_id = 1 AND active = 1`,
    args: [],
  });
  return r.rows.map((row) => ({
    id: Number(row.id),
    fromPath: String(row.from_path),
    toPath: String(row.to_path),
    status: Number(row.status),
    expiresAt: row.expires_at != null ? String(row.expires_at) : null,
  }));
}

const loadActiveRedirectsCached = unstable_cache(
  (): Promise<CachedRedirect[]> => loadActiveRedirectsRaw(getRuntimeDb()),
  ["nextpress", "redirects-active", "v1"],
  { tags: [REDIRECTS_CACHE_TAG], revalidate: 300 },
);

async function ensureRedirectCache(db: DbClient): Promise<Map<string, CachedRedirect>> {
  const existing = redirectCache();
  if (existing && redirectCacheAge() < REDIRECT_CACHE_TTL_MS) return existing;
  let p = redirectCacheInflight();
  if (!p) {
    p = (async () => {
      const rows = await cacheOrFallback(
        () => loadActiveRedirectsCached(),
        () => loadActiveRedirectsRaw(db),
      );
      const map = new Map<string, CachedRedirect>();
      for (const row of rows) map.set(row.fromPath, row);
      setRedirectCache(map);
    })().finally(() => setRedirectCacheInflight(null));
    setRedirectCacheInflight(p);
  }
  await p;
  return redirectCache()!;
}

/**
 * Find an active redirect for `path`. Returns null if no match.
 */
export async function matchRedirect(
  db: DbClient,
  path: string,
  now: Date = new Date()
): Promise<RedirectMatch | null> {
  const cache = await ensureRedirectCache(db);
  const cached = cache.get(path);
  if (!cached) return null;
  // Expiry is rare — check in memory rather than re-query.
  if (cached.expiresAt && cached.expiresAt <= now.toISOString()) return null;
  return {
    id: cached.id,
    fromPath: cached.fromPath,
    toPath: cached.toPath,
    status: cached.status,
  };
}

export interface CreateRedirectInput {
  fromPath: string;
  toPath: string;
  status?: number;
  source?: "manual" | "permalink_change" | "slug_change" | "media_rename";
  createdBy?: string | null;
  notes?: string | null;
  expiresAt?: string | null;
}

/**
 * Create a redirect. Validates no cycle is introduced.
 * Throws if a cycle longer than MAX_CHAIN_DEPTH is detected.
 */
export async function createRedirect(
  db: DbClient,
  input: CreateRedirectInput
): Promise<number> {
  const status = input.status ?? 301;
  const source = input.source ?? "manual";

  // Cycle detection: follow the chain from toPath
  await validateNoCycle(db, input.toPath, input.fromPath);

  const result = await db.execute({
    sql: `INSERT INTO redirects
            (tenant_id, from_path, to_path, status, source, created_by, notes, expires_at)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (tenant_id, from_path) DO UPDATE SET
            to_path = excluded.to_path,
            status = excluded.status,
            source = excluded.source,
            notes = excluded.notes,
            expires_at = excluded.expires_at`,
    args: [
      input.fromPath,
      input.toPath,
      status,
      source,
      input.createdBy ?? null,
      input.notes ?? null,
      input.expiresAt ?? null
    ]
  });

  invalidateRedirectsCache();
  return Number(result.lastInsertRowid);
}

/**
 * Convenience for auto-created redirects (slug/permalink changes).
 * Always 301, no expiration.
 */
export async function createAutoRedirect(
  db: DbClient,
  opts: {
    fromPath: string;
    toPath: string;
    source: "permalink_change" | "slug_change" | "media_rename";
    createdBy?: string | null;
  }
): Promise<void> {
  // Skip if from === to (no-op rename)
  if (opts.fromPath === opts.toPath) return;

  // Honor the per-source admin toggle. Default-on if unset, and tolerate
  // settings reads failing entirely (missing table / pre-boot test env) —
  // auto-redirect creation must never break the calling save path.
  let enabled: boolean | undefined;
  let status = 301;
  try {
    enabled = await getSetting<boolean>(db, AUTO_SETTING_BY_SOURCE[opts.source]);
    status = (await getSetting<number>(db, "redirects.default_status")) ?? 301;
  } catch {
    // Settings unavailable — fall through with defaults.
  }
  if (enabled === false) return;

  try {
    // The new live URL (toPath) might still have a stale inbound redirect
    // from an earlier rename — e.g. renaming /foo → /bar → /foo leaves
    // (/foo → /bar) intercepting what is now a valid page. Drop any
    // active redirect FROM the new URL first; this also unblocks
    // createRedirect's cycle detection from firing on the legitimate
    // reverse rename.
    await db.execute({
      sql: `DELETE FROM redirects WHERE tenant_id = 1 AND from_path = ? AND active = 1`,
      args: [opts.toPath],
    });
    invalidateRedirectsCache();

    await createRedirect(db, {
      fromPath: opts.fromPath,
      toPath: opts.toPath,
      status,
      source: opts.source,
      createdBy: opts.createdBy
    });
  } catch {
    // Auto-redirect creation failures must not break the save path.
    // Cycle detection or uniqueness violations are swallowed.
  }
}

/**
 * Bump hit_count and last_hit_at. Fire-and-forget.
 */
export async function bumpHitCount(db: DbClient, redirectId: number): Promise<void> {
  try {
    await db.execute({
      sql: "UPDATE redirects SET hit_count = hit_count + 1, last_hit_at = CURRENT_TIMESTAMP WHERE id = ?",
      args: [redirectId]
    });
  } catch {
    // Hit tracking must not break the redirect path.
  }
}

/**
 * Toggle a redirect's active flag without deleting it.
 */
export async function setRedirectActive(
  db: DbClient,
  redirectId: number,
  active: boolean
): Promise<void> {
  await db.execute({
    sql: "UPDATE redirects SET active = ? WHERE id = ?",
    args: [active ? 1 : 0, redirectId]
  });
  invalidateRedirectsCache();
}

/**
 * Deactivate a redirect without deleting it.
 */
export async function deactivateRedirect(db: DbClient, redirectId: number): Promise<void> {
  await setRedirectActive(db, redirectId, false);
}

/**
 * Delete a redirect permanently.
 */
export async function deleteRedirect(db: DbClient, redirectId: number): Promise<void> {
  await db.execute({
    sql: "DELETE FROM redirects WHERE id = ?",
    args: [redirectId]
  });
  invalidateRedirectsCache();
}

// ---------------------------------------------------------------------------
// Cycle detection
// ---------------------------------------------------------------------------

export class RedirectCycleError extends Error {
  constructor(chain: string[]) {
    super(`Redirect cycle detected (${chain.length} hops): ${chain.join(" → ")}`);
    this.name = "RedirectCycleError";
  }
}

/**
 * Follow the redirect chain from `startPath` up to MAX_CHAIN_DEPTH hops.
 * Throws RedirectCycleError if the chain leads back to `originalFrom`
 * or exceeds the max depth.
 */
export async function validateNoCycle(
  db: DbClient,
  startPath: string,
  originalFrom: string
): Promise<void> {
  const chain = [originalFrom];
  let current = startPath;

  for (let i = 0; i < MAX_CHAIN_DEPTH; i++) {
    const row = await db.execute({
      sql: `SELECT to_path FROM redirects
            WHERE tenant_id = 1 AND from_path = ? AND active = 1
            LIMIT 1`,
      args: [current]
    });

    if (row.rows.length === 0) return;  // chain ends cleanly

    const next = String(row.rows[0]!.to_path);
    chain.push(current);

    if (next === originalFrom) {
      chain.push(next);
      throw new RedirectCycleError(chain);
    }

    current = next;
  }

  // Chain exceeds max depth
  chain.push(current);
  throw new RedirectCycleError(chain);
}

// ---------------------------------------------------------------------------
// Admin list query
// ---------------------------------------------------------------------------

export type RedirectSource = "manual" | "permalink_change" | "slug_change" | "media_rename";

export interface RedirectListItem {
  id: number;
  fromPath: string;
  toPath: string;
  status: number;
  source: RedirectSource;
  hitCount: number;
  lastHitAt: string | null;
  active: boolean;
  notes: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface RedirectListFilters {
  search?: string;
  source?: RedirectSource;
}

/**
 * List all redirects (admin view). Supports substring search on from/to and
 * exact source match. Newest first. Returns the full set — pagination can be
 * added when site totals warrant it.
 */
export async function listRedirects(
  db: DbClient,
  filters: RedirectListFilters = {}
): Promise<RedirectListItem[]> {
  const clauses: string[] = ["tenant_id = 1"];
  const args: (string | number)[] = [];

  if (filters.search && filters.search.trim()) {
    clauses.push("(from_path LIKE ? OR to_path LIKE ?)");
    const pattern = `%${filters.search.trim()}%`;
    args.push(pattern, pattern);
  }
  if (filters.source) {
    clauses.push("source = ?");
    args.push(filters.source);
  }

  const result = await db.execute({
    sql: `SELECT id, from_path, to_path, status, source, hit_count,
                 last_hit_at, active, notes, expires_at, created_at
          FROM redirects
          WHERE ${clauses.join(" AND ")}
          ORDER BY created_at DESC`,
    args,
  });

  return result.rows.map((r) => ({
    id: Number(r.id),
    fromPath: String(r.from_path),
    toPath: String(r.to_path),
    status: Number(r.status),
    source: String(r.source) as RedirectSource,
    hitCount: Number(r.hit_count),
    lastHitAt: r.last_hit_at ? String(r.last_hit_at) : null,
    active: Number(r.active) === 1,
    notes: r.notes ? String(r.notes) : null,
    expiresAt: r.expires_at ? String(r.expires_at) : null,
    createdAt: String(r.created_at),
  }));
}
